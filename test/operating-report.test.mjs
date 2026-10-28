import test from 'node:test';
import assert from 'node:assert/strict';
import { operatingReport, renderOperatingReport } from '../src/operating-report.mjs';

test('operational counts distinguish events, contacts, uncertain work and accepted email', () => {
  const rows = [
    { event_key: 'a', state: 'complete', contact_id: '1', task_id: '11', alert_id: 'x', analysis_mode: 'openai_live', source_channel: 'portfolio', fit: 'possible_fit' },
    { event_key: 'b', state: 'complete', contact_id: '1', task_id: '12', alert_id: 'y', analysis_mode: 'manual_fallback', source_channel: 'portfolio', fit: 'insufficient_information' },
    { event_key: 'c', state: 'alert_unknown', contact_id: '2', task_id: '13' },
  ];
  const report = operatingReport(rows);
  assert.equal(report.events, 3); assert.equal(report.uniqueContacts, 2);
  assert.equal(report.completed, 2); assert.equal(report.needsReconciliation, 1);
  assert.equal(report.internalEmailsAccepted, 2); assert.equal(report.tasksCreated, 3);
  assert.equal(report.manualFallbacks, 1); assert.equal(report.duplicateKeys, 0);
  assert.match(report.limits.join(' '), /not inbox delivery/);
  const html = renderOperatingReport(report, rows, '123');
  assert.match(html, /record\/0-1\/1/); assert.match(html, /utm_source=/);
  assert.match(html, /no mide ventas/);
});

test('report escapes operational values and rejects non-numeric portal links', () => {
  const rows = [{ event_key: 'a', state: '<script>bad</script>', contact_id: '../invalid' }];
  const report = operatingReport(rows);
  assert.doesNotMatch(renderOperatingReport(report, rows, '123'), /<script>/);
  assert.throws(() => renderOperatingReport(report, rows, 'bad'));
});

test('a rejected Tally entry does not inflate uncertain writes or contact counts', () => {
  const report = operatingReport([{ event_key: 'a', state: 'rejected' }]);
  assert.equal(report.rejected, 1); assert.equal(report.needsReconciliation, 0); assert.equal(report.uniqueContacts, 0);
});
