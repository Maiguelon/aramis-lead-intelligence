import { createHash } from 'node:crypto';
import { normalizeIntake, nativeIntakeCode } from './intake.mjs';

export const TALLY_VERSION = '2025-02-01';
export const CONSENT_VERSION = 'aramis-contacto-2026-10-v1';
export const CONSENT_TEXT = 'Autorizo a Aramis a guardar los datos de esta consulta, revisar información profesional pública relacionada y contactarme para responderla. Puedo solicitar acceso o eliminación escribiendo a hola@aramis.agency. No me suscribe a campañas.';
export const TALLY_FIELDS = ['nombre', 'contacto', 'empresa', 'empresa_web', 'redes', 'mensaje',
  'consentimiento_contacto', 'source_form', 'source_url', 'plan',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/** Question IDs are bound during setup, never inferred from editable display labels. */
export function mapTallySubmission(submission, config, receivedAt) {
  const stop = (status, reason) => ({ status, reason, intake: null });
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(config?.formId || '')
    || !config.questions || !config.noticeVersion || !Object.hasOwn(config, 'consentAnswer')) {
    return stop('blocked', 'tally_mapping_required');
  }
  const ids = Object.values(config.questions);
  if (!['nombre', 'contacto', 'consentimiento_contacto'].every(key => typeof config.questions[key] === 'string')
    || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    return stop('blocked', 'tally_mapping_invalid');
  }
  const expected = config.consentAnswer;
  if (!(expected === true || (Array.isArray(expected) && expected.length === 1
    && typeof expected[0] === 'string' && expected[0].trim()))) return stop('blocked', 'tally_consent_mapping_invalid');
  if (submission?.formId !== config.formId || !/^[A-Za-z0-9_-]{3,100}$/.test(submission?.id || '')) {
    return stop('blocked', 'tally_source_mismatch');
  }
  if (submission.isCompleted !== true) return stop('rejected', 'tally_submission_incomplete');
  const submittedAt = typeof submission.submittedAt === 'string' ? Date.parse(submission.submittedAt) : NaN;
  const receipt = Date.parse(receivedAt);
  if (!Number.isFinite(submittedAt) || !Number.isFinite(receipt) || submittedAt > receipt + 300000) {
    return stop('manual_review', 'tally_timestamp_invalid');
  }
  if (config.acceptFrom && submittedAt < Date.parse(config.acceptFrom)) return stop('rejected', 'tally_predates_notice');
  if (!Array.isArray(submission.responses)) return stop('manual_review', 'tally_responses_invalid');
  const answers = new Map();
  for (const response of submission.responses) {
    if (typeof response?.questionId !== 'string' || answers.has(response.questionId)
      || (response.formId && response.formId !== config.formId)
      || (response.submissionId && response.submissionId !== submission.id)) return stop('manual_review', 'tally_responses_invalid');
    answers.set(response.questionId, response.answer);
  }
  const consent = answers.get(config.questions.consentimiento_contacto);
  if (JSON.stringify(consent) !== JSON.stringify(expected)) return stop('rejected', 'contact_consent_not_explicit');
  const raw = Object.fromEntries(TALLY_FIELDS.filter(key => key !== 'consentimiento_contacto')
    .map(key => [key, typeof answers.get(config.questions[key]) === 'string' ? answers.get(config.questions[key]) : '']));
  raw.source_form ||= 'footer';
  raw.submission_id = `tally:${config.formId}:${submission.id}`;
  raw.consentimiento_contacto = true;
  raw.consentimiento_texto_version = config.noticeVersion;
  const result = normalizeIntake(raw, { receivedAt: new Date(submittedAt).toISOString() });
  if (result.intake) {
    // Browser-supplied source_form must not alter event identity or bypass deduplication.
    result.intake.fingerprint = tallyEventKey(config.formId, submission.id);
    result.intake.provider = 'tally';
  }
  return result;
}

export function tallyEventKey(formId, submissionId) {
  return createHash('sha256').update(`tally:${formId}:${submissionId}`).digest('hex');
}

/** Full snapshots only. Incomplete/ambiguous pagination must never look like an empty inbox. */
export function selectTallySubmission(pages, rows, config, receivedAt) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 10) return { status: 'blocked', reason: 'tally_pages_invalid' };
  const submissions = [], seen = new Set();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]?.body || pages[index];
    if (page.page !== index + 1 || !Array.isArray(page.submissions) || typeof page.hasMore !== 'boolean'
      || page.hasMore !== (index < pages.length - 1)) return { status: 'blocked', reason: 'tally_snapshot_incomplete' };
    for (const submission of page.submissions) {
      if (submission.formId !== config.formId || !/^[A-Za-z0-9_-]{3,100}$/.test(submission.id || '') || seen.has(submission.id)) {
        return { status: 'blocked', reason: 'tally_snapshot_ambiguous' };
      }
      seen.add(submission.id); submissions.push(submission);
    }
  }
  const ledger = new Map();
  for (const row of rows) {
    if (!row?.event_key) continue;
    if (ledger.has(row.event_key)) return { status: 'blocked', reason: 'duplicate_ledger_keys' };
    ledger.set(row.event_key, row);
  }
  submissions.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)) || a.id.localeCompare(b.id));
  for (const submission of submissions) {
    const eventKey = tallyEventKey(config.formId, submission.id);
    const prior = ledger.get(eventKey);
    if (prior && (prior.state !== 'retryable_no_write' || !Number.isInteger(prior.attempts) || prior.attempts >= 3)) continue;
    const mapped = mapTallySubmission(submission, config, receivedAt);
    return { ...mapped, eventKey, prior: prior || null };
  }
  return { status: 'idle', reason: 'no_pending_submissions' };
}

export function nativeTallyCode() {
  return `${nativeIntakeCode()}\nconst TALLY_FIELDS = ${JSON.stringify(TALLY_FIELDS)};\n${[tallyEventKey, mapTallySubmission, selectTallySubmission].map(fn => fn.toString()).join('\n')}`;
}
