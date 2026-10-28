import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mapTallySubmission, selectTallySubmission, nativeTallyCode, tallyEventKey } from '../src/tally.mjs';

const now = '2026-10-27T16:00:00Z';
const config = { formId: 'fakeForm', noticeVersion: 'test-v1', acceptFrom: '2026-10-27T00:00:00Z',
  consentAnswer: ['option-consent'], questions: { nombre: 'q1', contacto: 'q2', consentimiento_contacto: 'q3',
    source_form: 'q4', plan: 'q5', mensaje: 'q6' } };
const submission = (id = 'fake001', answer = ['option-consent']) => ({ id, formId: 'fakeForm', isCompleted: true,
  submittedAt: '2026-10-27T15:00:00Z', previewUrl: 'https://never-forward.test/private-token', responses: [
    { questionId: 'q1', answer: 'Persona ficticia' }, { questionId: 'q2', answer: 'DEMO@example.com' },
    { questionId: 'q3', answer }, { questionId: 'q4', answer: 'plan_card' },
    { questionId: 'q5', answer: JSON.stringify({ selections: { posts: 4, pagina: true }, precioMensual: 500 }) },
    { questionId: 'q6', answer: 'Consulta ficticia sobre una web' },
  ] });
const page = entries => ({ page: 1, hasMore: false, submissions: entries });

test('Tally binds stable IDs, trusted submission time and sanitized plan, omitting provider access links', () => {
  const result = mapTallySubmission(submission(), config, now);
  assert.equal(result.status, 'accepted');
  assert.equal(result.intake.email, 'demo@example.com');
  assert.equal(result.intake.consent.recordedAt, '2026-10-27T15:00:00.000Z');
  assert.deepEqual(result.intake.plan, { posts: 4, pagina: true });
  assert.ok(!JSON.stringify(result).includes('private-token'));
  const changedSource = submission(); changedSource.responses[3].answer = 'footer';
  assert.equal(mapTallySubmission(changedSource, config, now).intake.fingerprint, result.intake.fingerprint);
});

test('only the explicitly configured consent answer is accepted, never truthy strings or other choices', () => {
  for (const value of [false, 'true', 'yes', [], ['different'], ['option-consent', 'other'], null]) {
    assert.equal(mapTallySubmission(submission('fake001', value), config, now).status, 'rejected');
  }
  assert.equal(mapTallySubmission(submission(), { ...config, consentAnswer: 'true' }, now).status, 'blocked');
});

test('wrong form, duplicate answers, partial submissions and old notice evidence stop before effects', () => {
  assert.equal(mapTallySubmission({ ...submission(), formId: 'other' }, config, now).status, 'blocked');
  const duplicate = submission(); duplicate.responses.push(duplicate.responses[0]);
  assert.equal(mapTallySubmission(duplicate, config, now).status, 'manual_review');
  assert.equal(mapTallySubmission({ ...submission(), isCompleted: false }, config, now).status, 'rejected');
  assert.equal(mapTallySubmission({ ...submission(), submittedAt: '2026-10-26T12:00:00Z' }, config, now).reason, 'tally_predates_notice');
});

test('pending selection skips completed and uncertain writes, but permits bounded read retries', () => {
  const rows = [{ event_key: tallyEventKey('fakeForm', 'fake001'), state: 'complete' },
    { event_key: tallyEventKey('fakeForm', 'fake002'), state: 'contact_unknown' }];
  const result = selectTallySubmission([page([submission('fake003'), submission('fake002'), submission()])], rows, config, now);
  assert.equal(result.intake.id, 'tally:fakeForm:fake003');
  const retry = { event_key: result.eventKey, state: 'retryable_no_write', attempts: 2 };
  assert.equal(selectTallySubmission([page([submission('fake003')])], [retry], config, now).status, 'accepted');
  assert.equal(selectTallySubmission([page([submission('fake003')])], [{ ...retry, attempts: 3 }], config, now).status, 'idle');
});

test('truncated pages, duplicate snapshots and duplicate ledger keys are visible failures', () => {
  assert.equal(selectTallySubmission([{ ...page([]), hasMore: true }], [], config, now).reason, 'tally_snapshot_incomplete');
  assert.equal(selectTallySubmission([page([submission(), submission()])], [], config, now).reason, 'tally_snapshot_ambiguous');
  assert.equal(selectTallySubmission([page([])], [{ event_key: 'a' }, { event_key: 'a' }], config, now).reason, 'duplicate_ledger_keys');
});

test('native n8n adapter executes the exact same normalization and consent checks', () => {
  const native = new Function('require', `${nativeTallyCode()}; return mapTallySubmission;`)(createRequire(import.meta.url));
  assert.deepEqual(native(submission(), config, now), mapTallySubmission(submission(), config, now));
});
