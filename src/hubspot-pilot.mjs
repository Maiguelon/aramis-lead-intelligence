/** A bounded manual CRM smoke test; not the production intake/recovery ledger. */
export function prepareCrmPilot(config, bundle, nowIso, requestFor) {
  const mode = config?.mode || 'preview';
  const state = { status: 'blocked', reason: 'invalid_mode', mode, step: 'stopped', effects: [],
    ids: {}, analysisMode: 'fixture_stub' };
  if (!['preview', 'check', 'write'].includes(mode)) return state;
  const intake = JSON.parse(JSON.stringify(bundle?.intake || {}));
  if (bundle?.fictional !== true || intake.id !== 'pilot-crm-001'
    || intake.sourceForm !== 'demo' || intake.email !== 'leadops-crm-pilot@example.com') {
    return { ...state, reason: 'only_the_committed_fictional_fixture_is_allowed' };
  }
  if (intake.consent?.contact !== true || !intake.consent.noticeVersion) {
    return { ...state, status: 'rejected', reason: 'explicit_consent_required' };
  }
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return { ...state, reason: 'invalid_receiver_time' };
  intake.consent.recordedAt = now.toISOString();
  const portalId = String(config.portalId || '').trim();
  const ownerId = String(config.ownerId || '').trim() || null;
  if (ownerId !== null && !/^\d+$/.test(ownerId)) return { ...state, reason: 'invalid_owner_id' };
  Object.assign(state, { intake, research: bundle.research, qualification: bundle.qualification,
    portalId, ownerId, dueAt: new Date(now.getTime() + 86400000).toISOString() });
  if (mode === 'preview') {
    return { ...state, status: 'preview', reason: 'no_network_or_crm_writes',
      proposedContact: requestFor('create_contact', { intake, ownerId }).body.properties };
  }
  if (mode === 'write' && (config.confirmFictionalWrites !== 'YES_CREATE_DEMO_RECORDS' || !/^\d+$/.test(portalId))) {
    return { ...state, reason: 'review_preview_then_confirm_writes_and_portal_id' };
  }
  return { ...state, status: 'awaiting_search', reason: 'ready', step: 'search',
    request: requestFor('search_contact', { propertyName: 'email', value: intake.email }) };
}

export function advanceCrmPilot(state, response, requestFor) {
  const statusCode = Number.isInteger(response?.statusCode) ? response.statusCode : null;
  const next = { ...state, request: undefined, effects: [...state.effects], ids: { ...state.ids },
    step: 'stopped', status: 'blocked', reason: 'provider_error' };
  if (state.step === 'search') {
    if (response?.error || statusCode !== 200 || !Array.isArray(response.body?.results)) {
      return { ...next, reason: statusCode === 401 ? 'invalid_credential'
        : statusCode === 403 ? 'missing_contact_read_permission' : 'contact_search_failed' };
    }
    const matches = response.body.results;
    if (state.mode === 'check') return { ...next, status: 'connected_read_only', reason: 'contact_search_succeeded', matches: matches.length };
    if (state.mode !== 'write') return { ...next, reason: 'write_mode_required' };
    if (matches.length || response.body.total > 0) {
      // No activity creation on an existing record: a partially completed run needs reconciliation.
      return { ...next, status: 'manual_review', reason: 'existing_contact_no_writes' };
    }
    return { ...next, status: 'awaiting_contact', reason: 'ready', step: 'contact',
      request: requestFor('create_contact', { intake: state.intake, ownerId: state.ownerId }) };
  }
  if (!['contact', 'note', 'task'].includes(state.step) || state.mode !== 'write') {
    return { ...next, reason: 'invalid_pilot_state' };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ...next, status: 'configuration_needed', reason: statusCode === 401
      ? 'invalid_credential' : 'missing_crm_write_permission',
      httpStatus: statusCode, rejectedByProvider: true, failedStep: state.step };
  }
  const id = String(response?.body?.id || '');
  if (response?.error || ![200, 201].includes(statusCode) || !/^\d+$/.test(id)) {
    return { ...next, status: 'manual_review', reason: `${state.step}_write_requires_reconciliation`,
      uncertainEffect: state.step };
  }
  next.ids[state.step] = id;
  next.effects.push(`${state.step}_created`);
  if (state.step === 'task') return { ...next, status: 'complete', reason: 'fictional_crm_smoke_test_complete' };
  const step = state.step === 'contact' ? 'note' : 'task';
  return { ...next, status: `awaiting_${step}`, reason: 'ready', step,
    request: requestFor(step === 'note' ? 'create_note' : 'create_task', {
      contactId: next.ids.contact, intake: state.intake, research: state.research,
      qualification: state.qualification, dueAt: state.dueAt, ownerId: state.ownerId,
    }) };
}

export function summarizeCrmPilot(state) {
  const summary = { status: state.status, reason: state.reason, effects: state.effects,
    analysisMode: 'fixture_stub', ids: state.ids, automaticProspectContact: false };
  if (state.rejectedByProvider) {
    Object.assign(summary, { httpStatus: state.httpStatus, rejectedByProvider: true, failedStep: state.failedStep });
  }
  if (state.status === 'preview') {
    summary.proposedContact = state.proposedContact;
    summary.proposedActivities = ['Una nota ficticia con trazabilidad', 'Una tarea abierta de revisión humana'];
    summary.nextStep = 'Use check to test read access. Review the preview before selecting write and confirming demo writes.';
  }
  if (state.ids.contact && /^\d+$/.test(state.portalId)) {
    summary.contactUrl = `https://app.hubspot.com/contacts/${state.portalId}/record/0-1/${state.ids.contact}`;
  }
  return summary;
}
