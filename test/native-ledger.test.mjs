import test from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER_COLUMNS, nativeLedgerRecord } from '../src/native-ledger.mjs';

const frame = () => ({ intake: { fingerprint: 'a'.repeat(64), name: 'Private person', email: 'private@example.test',
  message: 'Do not persist this', sourceForm: 'footer', utm: { utm_source: 'google' } },
  receivedAt: '2026-10-27T00:00:00Z', ledgerState: 'contact_unknown', reason: 'contact_write_started', ids: {} });

test('native recovery row persists only bounded operational metadata', () => {
  const row = nativeLedgerRecord(frame());
  assert.deepEqual(Object.keys(row).sort(), LEDGER_COLUMNS.map(column => column.name).sort());
  assert.equal(row.event_key, 'a'.repeat(64));
  assert.equal(row.received_at, '2026-10-27T00:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(row), /Private person|private@example|Do not persist/);
});

test('recovery checkpoints keep confirmed IDs and uncertain next effect separately', () => {
  const input = frame();
  input.ledgerState = 'alert_unknown';
  input.ids = { contact: '101', note: '202', task: '303' };
  input.qualification = { fit: 'possible_fit', certainty: 'low' };
  input.analysisMode = 'manual_fallback';
  const row = nativeLedgerRecord(input);
  assert.equal(row.contact_id, '101');
  assert.equal(row.task_id, '303');
  assert.equal(row.alert_id, '');
  assert.equal(row.certainty, 'low');
  assert.equal(row.state, 'alert_unknown');
});

test('invalid event identity, effect IDs, timestamp or checkpoint fail closed', () => {
  for (const change of [{ intake: { fingerprint: 'unsafe' } }, { ledgerState: 'pending' },
    { ids: { contact: '../123' } }, { ids: { alert: 'not-an-email-receipt' } }, { receivedAt: 'tomorrow' }]) {
    assert.throws(() => nativeLedgerRecord({ ...frame(), ...change }));
  }
});
