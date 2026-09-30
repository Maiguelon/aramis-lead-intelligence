import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgents } from '../src/openai-agents.mjs';
import { FileLedger } from '../src/file-ledger.mjs';
import { MemoryLedger, processSubmission } from '../src/pipeline.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/footer-valid.json', import.meta.url), 'utf8'));

function harness({ ledger = new MemoryLedger(), agents = createAgents(), failNote = null, failTask = null,
  failMail = null } = {}) {
  const contacts = new Map();
  const notes = [];
  const tasks = [];
  const alerts = [];
  const hubspot = {
    async ensureContact(intake) {
      if (contacts.has(intake.identityKey)) return { contact: contacts.get(intake.identityKey), created: false };
      const contact = { id: String(100 + contacts.size) };
      contacts.set(intake.identityKey, contact);
      return { contact, created: true };
    },
    async createIntakeNote(contactId, value) {
      if (failNote) { const error = failNote; failNote = null; throw error; }
      const note = { id: String(200 + notes.length), contactId, value };
      notes.push(note);
      return note;
    },
    async createReviewTask(contactId, value) {
      if (failTask) { const error = failTask; failTask = null; throw error; }
      const task = { id: String(300 + tasks.length), contactId, value };
      tasks.push(task);
      return task;
    },
  };
  const mailer = { async send(card) {
    if (failMail) { const error = failMail; failMail = null; throw error; }
    alerts.push(card);
    return { id: `alert-${alerts.length}` };
  } };
  const run = (input = raw) => processSubmission(input, {
    ledger, hubspot, agents, mailer, portalId: '123', now: () => new Date('2026-09-30T15:00:00Z'),
  });
  return { run, ledger, contacts, notes, tasks, alerts };
}

test('consent gate prevents CRM, agent and email effects', async () => {
  let agentCalls = 0;
  const h = harness({ agents: { async research() { agentCalls++; throw new Error('unexpected'); } } });
  const denied = await h.run({ ...raw, consentimiento_contacto: false });
  assert.equal(denied.status, 'rejected');
  assert.deepEqual(denied.effects, []);
  assert.equal(agentCalls, 0);
  assert.equal(h.contacts.size + h.notes.length + h.tasks.length + h.alerts.length, 0);
});

test('one submission produces one contact, note, task and card; exact replay does nothing', async () => {
  const h = harness();
  const first = await h.run();
  const repeat = await h.run();
  assert.equal(first.status, 'complete');
  assert.equal(first.analysisMode, 'offline_stub');
  assert.equal(repeat.status, 'duplicate');
  assert.equal(h.contacts.size, 1);
  assert.equal(h.notes.length, 1);
  assert.equal(h.tasks.length, 1);
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0].html, /Revisión humana obligatoria/);
});

test('returning person reuses contact but records distinct inquiry and review task', async () => {
  const h = harness();
  assert.equal((await h.run()).status, 'complete');
  const second = await h.run({ ...raw, submission_id: 'demo-footer-002', mensaje: 'Ahora necesito una página web' });
  assert.equal(second.status, 'complete');
  assert.equal(h.contacts.size, 1);
  assert.equal(h.notes.length, 2);
  assert.equal(h.tasks.length, 2);
  assert.equal(h.alerts.length, 2);
});

test('429 after contact and before task is retryable, with no duplicate note', async () => {
  const h = harness({ failTask: Object.assign(new Error('rate limited'), { code: 'hubspot_http_error', status: 429, retryable: true }) });
  const first = await h.run();
  assert.equal(first.status, 'retryable_failure');
  assert.equal(first.retryable, true);
  assert.equal(h.notes.length, 1);
  const replay = await h.run();
  assert.equal(replay.status, 'complete');
  assert.equal(h.notes.length, 1);
  assert.equal(h.tasks.length, 1);
  assert.equal(h.alerts.length, 1);
});

test('uncertain write outcome stops automatic replay for manual reconciliation', async () => {
  const h = harness({ failTask: Object.assign(new Error('timeout'), { code: 'hubspot_network_error', retryable: true }) });
  assert.equal((await h.run()).status, 'manual_review');
  const replay = await h.run();
  assert.equal(replay.status, 'manual_review');
  assert.match(replay.reason, /task_unknown/);
  assert.equal(h.notes.length, 1);
  assert.equal(h.tasks.length, 0);
});

test('agent outage degrades to explicitly labelled manual assessment', async () => {
  const agents = { async research() { throw Object.assign(new Error('offline'), { code: 'openai_network_error' }); } };
  const h = harness({ agents });
  const result = await h.run();
  assert.equal(result.status, 'complete');
  assert.equal(result.analysisMode, 'manual_fallback');
  assert.equal(result.qualification.fit, 'insufficient_information');
  assert.match(h.alerts[0].html, /Análisis automático no disponible/);
});

test('email timeout is not blindly retried after task exists', async () => {
  const h = harness({ failMail: new Error('SMTP timeout') });
  assert.equal((await h.run()).status, 'manual_review');
  assert.equal((await h.run()).reason, 'alert_unknown_needs_reconciliation');
  assert.equal(h.tasks.length, 1);
  assert.equal(h.alerts.length, 0);
});

test('file ledger survives a new instance and keeps only technical IDs', async () => {
  const testRoot = fileURLToPath(new URL('../.tmp/', import.meta.url));
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(join(testRoot, 'leadops-ledger-'));
  const path = join(directory, 'ledger.json');
  const first = new FileLedger(path);
  await first.save('abc', { state: 'pending', effects: { contactId: '1' } });
  assert.equal((await new FileLedger(path).get('abc')).effects.contactId, '1');
  const saved = await readFile(path, 'utf8');
  assert.doesNotMatch(saved, /lucia@example\.test/);
});
