export const LEDGER_NAME = 'aramis_leadops_events_v1';
export const LEDGER_COLUMNS = [
  ...['event_key', 'state', 'reason', 'contact_id', 'note_id', 'task_id', 'alert_id',
    'source_form', 'source_channel', 'fit', 'certainty', 'analysis_mode'].map(name => ({ name, type: 'string' })),
  { name: 'attempts', type: 'number' }, { name: 'received_at', type: 'date' },
];

/** A recovery/reporting record. Never persist names, addresses, messages or model output here. */
export function nativeLedgerRecord(frame) {
  const eventKey = frame?.intake?.fingerprint;
  if (!/^[a-f0-9]{64}$/.test(eventKey || '')) throw Error('invalid_event_key');
  const allowedStates = ['contact_unknown', 'analysis_unknown', 'note_unknown', 'task_unknown', 'alert_unknown',
    'complete', 'retryable_no_write', 'manual_review'];
  if (!allowedStates.includes(frame.ledgerState)) throw Error('invalid_ledger_state');
  if (typeof frame.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(frame.receivedAt)
    || Number.isNaN(new Date(frame.receivedAt).getTime())) throw Error('invalid_receipt_time');
  const id = value => value == null || value === '' ? '' : /^\d+$/.test(String(value)) ? String(value) : (() => { throw Error('invalid_effect_id'); })();
  const alertId = frame.ids?.alert || '';
  if (alertId && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(alertId)) throw Error('invalid_alert_id');
  const source = frame.intake.utm?.utm_source || 'unknown';
  return { event_key: eventKey, state: frame.ledgerState,
    reason: /^[a-z0-9_]{1,80}$/.test(frame.reason || '') ? frame.reason : 'needs_review',
    contact_id: id(frame.ids?.contact), note_id: id(frame.ids?.note), task_id: id(frame.ids?.task), alert_id: alertId,
    source_form: ['footer', 'plan_card', 'demo', 'manual'].includes(frame.intake.sourceForm) ? frame.intake.sourceForm : 'demo',
    source_channel: ['google', 'instagram', 'portfolio', 'unknown'].includes(source) ? source : 'other',
    fit: ['high_fit', 'possible_fit', 'low_fit', 'insufficient_information'].includes(frame.qualification?.fit) ? frame.qualification.fit : '',
    certainty: ['high', 'medium', 'low'].includes(frame.qualification?.certainty) ? frame.qualification.certainty : '',
    analysis_mode: ['openai_live', 'manual_fallback'].includes(frame.analysisMode) ? frame.analysisMode : '',
    attempts: Number.isInteger(frame.attempts) && frame.attempts > 0 ? frame.attempts : 1,
    received_at: new Date(frame.receivedAt).toISOString() };
}
