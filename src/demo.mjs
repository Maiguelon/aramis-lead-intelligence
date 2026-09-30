import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createAgents } from './openai-agents.mjs';
import { MemoryLedger, processSubmission } from './pipeline.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'demo-output');
const fixture = async name => JSON.parse(await readFile(join(root, 'fixtures', `${name}.json`), 'utf8'));

/** Fake CRM, deliberately in-memory. Nothing leaves this computer. */
class DemoHubSpot {
  contacts = new Map(); notes = []; tasks = [];
  async ensureContact(intake) {
    const existing = this.contacts.get(intake.identityKey);
    if (existing) return { contact: existing, created: false };
    const contact = { id: String(10000 + this.contacts.size), identityKey: intake.identityKey };
    this.contacts.set(intake.identityKey, contact);
    return { contact, created: true };
  }
  async createIntakeNote(contactId, value) {
    const note = { id: String(20000 + this.notes.length), contactId, submissionId: value.intake.id,
      fit: value.qualification.fit, certainty: value.qualification.certainty };
    this.notes.push(note);
    return note;
  }
  async createReviewTask(contactId, value) {
    const task = { id: String(30000 + this.tasks.length), contactId,
      submissionId: value.intake.id, status: 'NOT_STARTED', dueAt: value.dueAt };
    this.tasks.push(task);
    return task;
  }
}

const crm = new DemoHubSpot();
const ledger = new MemoryLedger();
const agents = createAgents({ mode: 'stub' });
const cards = [];
const mailer = { async send(card) { cards.push(card); return { id: `demo-mail-${cards.length}` }; } };
const options = { crm, ledger, agents, mailer, portalId: '123456', now: () => new Date('2026-09-30T15:00:00Z') };
const run = raw => processSubmission(raw, { ledger, hubspot: crm, agents, mailer,
  portalId: options.portalId, now: options.now });

const footer = await fixture('footer-valid');
const plan = await fixture('plan-valid');
const denied = await fixture('no-consent');
const cases = [
  ['footer-valid', footer],
  ['duplicate-repeat', footer],
  ['returning-person', { ...footer, submission_id: 'demo-footer-002', mensaje: 'Ahora necesito una página web.' }],
  ['plan-valid', plan],
  ['no-consent', denied],
];

const results = [];
for (const [name, raw] of cases) {
  const result = await run(raw);
  results.push({ case: name, status: result.status, reason: result.reason,
    effects: result.effects, contactId: result.contactId || null,
    fit: result.qualification?.fit || null, certainty: result.qualification?.certainty || null });
}

await mkdir(output, { recursive: true });
for (const [index, card] of cards.entries()) await writeFile(join(output, `card-${index + 1}.html`), card.html);
const report = { mode: 'FICTIONAL OFFLINE DEMO — no real HubSpot, AI, Formspree or email calls',
  cases: results, counts: { contacts: crm.contacts.size, notes: crm.notes.length,
    openReviewTasks: crm.tasks.length, internalCards: cards.length },
  tasks: crm.tasks, notes: crm.notes };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report }, null, 2));
