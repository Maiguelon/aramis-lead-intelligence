/** Pure transitions shared by the native n8n flow and its tests. Credentials never enter these functions. */
export function prepareIntegratedInput(input, config, bundles, receivedAt, mode) {
  const body = input?.body || input;
  if (mode !== 'webhook') return { status: 'blocked', reason: 'production_webhook_required' };
  if (config.enabled !== 'true' || config.confirm !== 'YES_RUN_FICTIONAL_LEADOPS') {
    return { status: 'preview', reason: 'demo_not_enabled' };
  }
  if (body?.consent !== true) return { status: 'rejected', reason: 'contact_consent_not_explicit' };
  const scenario = typeof body.scenario === 'string' ? body.scenario : '';
  if (!Object.hasOwn(bundles, scenario)) return { status: 'rejected', reason: 'unknown_demo_scenario' };
  if (!/^\d+$/.test(config.portalId || '') || !/^\d+$/.test(config.ownerId || '')) {
    return { status: 'blocked', reason: 'crm_configuration_required' };
  }
  const intake = JSON.parse(JSON.stringify(bundles[scenario]));
  if (!intake.email?.endsWith('@example.com') || intake.sourceForm !== 'demo'
    || intake.consent?.contact !== true) throw Error('fictional_fixture_required');
  intake.consent.recordedAt = receivedAt;
  return { status: 'lookup', reason: 'consented_demo', intake, config, scenario,
    receivedAt, attempts: 1, ids: {}, analysisMode: 'openai_live', fictional: true };
}

export function decideIntegratedEvent(frame, rows) {
  const found = rows.filter(row => row?.event_key);
  if (found.length > 1) return { ...frame, status: 'manual_review', reason: 'duplicate_ledger_keys' };
  const prior = found[0];
  if (prior?.state === 'complete') return { ...frame, status: 'duplicate', reason: 'already_processed',
    analysisMode: prior.analysis_mode,
    qualification: { fit: prior.fit, certainty: prior.certainty },
    ids: { contact: prior.contact_id, note: prior.note_id, task: prior.task_id, alert: prior.alert_id } };
  if (prior && (prior.state !== 'retryable_no_write' || !Number.isInteger(prior.attempts) || prior.attempts >= 3)) {
    return { ...frame, status: 'manual_review', reason: 'prior_execution_requires_reconciliation',
      ids: { contact: prior.contact_id, note: prior.note_id, task: prior.task_id, alert: prior.alert_id } };
  }
  return { ...frame, status: 'search', reason: 'contact_lookup_started', ledgerState: 'contact_unknown',
    attempts: prior ? prior.attempts + 1 : 1 };
}

export function integratedFallback(frame, reason) {
  return { ...frame, analysisMode: 'manual_fallback',
    research: { summary: frame.intake.message.slice(0, 600), verifiedFacts: [], externalFacts: [],
      missingInformation: ['Validar personalmente la solicitud, presupuesto y plazo'], researchStatus: 'not_performed' },
    qualification: { fit: 'insufficient_information', certainty: 'low', signals: [],
      missingInformation: ['Análisis automático no disponible; revisar la solicitud original'],
      rationale: `Revisión personal necesaria (${reason}).`, humanReviewRequired: true } };
}

export function advanceIntegrated(stage, frame, response, api) {
  const next = JSON.parse(JSON.stringify(frame));
  delete next.request;
  const status = response?.statusCode;
  const good = !response?.error && Number.isInteger(status) && status >= 200 && status < 300;
  const body = response?.body;
  const uncertain = reason => ({ ...next, status: 'manual_review', reason });
  if (stage === 'search') {
    if (!good) return { ...next, status: 'retryable_no_write', ledgerState: 'retryable_no_write',
      reason: status === 429 ? 'crm_search_rate_limited' : 'crm_search_failed_before_writes' };
    if (!Array.isArray(body?.results) || !Number.isInteger(body.total) || body.total !== body.results.length) {
      return uncertain('invalid_or_truncated_contact_search');
    }
    if (body.results.length > 1) return uncertain('ambiguous_existing_contact');
    if (body.results.length === 1) {
      if (!/^\d+$/.test(String(body.results[0].id))) return uncertain('invalid_contact_id');
      next.ids.contact = String(body.results[0].id);
      next.contactCreated = false;
      return { ...next, status: 'analyze', reason: 'existing_contact_reused', ledgerState: 'analysis_unknown' };
    }
    return { ...next, status: 'create_contact', reason: 'contact_write_started',
      request: api.crm('create_contact', { intake: next.intake, ownerId: next.config.ownerId }) };
  }
  if (stage === 'research' || stage === 'qualification') {
    if (!good) return { ...api.fallback(next, `${stage}_unavailable`), status: 'write_note' };
    try {
      if (stage === 'research') {
        next.research = api.decode('research', body);
        return { ...next, status: 'qualify', request: { body: api.ai('qualification', {
          model: next.config.model, intake: next.intake, research: next.research }) } };
      }
      next.qualification = api.decode('qualification', body, next.research);
      return { ...next, status: 'write_note' };
    } catch { return { ...api.fallback(next, `${stage}_invalid`), status: 'write_note' }; }
  }
  if (stage === 'mail') {
    const receipt = api.mailReceipt(response);
    if (receipt.status !== 'accepted') return uncertain(receipt.reason);
    next.ids.alert = receipt.emailId;
    return { ...next, status: 'complete', reason: 'internal_card_accepted', ledgerState: 'complete' };
  }
  if (!['contact', 'note', 'task'].includes(stage)) throw Error('unknown_integrated_stage');
  if (!good || !/^\d+$/.test(String(body?.id || ''))) return uncertain(`${stage}_outcome_requires_reconciliation`);
  next.ids[stage] = String(body.id);
  if (stage === 'contact') return { ...next, contactCreated: true, status: 'analyze',
    reason: 'contact_created', ledgerState: 'analysis_unknown' };
  if (stage === 'note') return { ...next, status: 'write_task', reason: 'task_write_started', ledgerState: 'task_unknown' };
  return { ...next, status: 'send_mail', reason: 'internal_mail_started', ledgerState: 'alert_unknown' };
}

export function integratedSummary(frame) {
  return { status: frame.status, reason: frame.reason, scenario: frame.scenario || null,
    eventKey: frame.intake?.fingerprint || null, contactId: frame.ids?.contact || null,
    noteId: frame.ids?.note || null, taskId: frame.ids?.task || null, emailId: frame.ids?.alert || null,
    analysisMode: frame.analysisMode || null, fit: frame.qualification?.fit || null,
    certainty: frame.qualification?.certainty || null, humanReviewRequired: true,
    automaticProspectContact: false, fictional: true, deliveryConfirmed: false };
}
