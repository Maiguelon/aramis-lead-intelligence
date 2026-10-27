/** Manual fictional analysis only. No CRM or email side effects and no automatic replay. */
export function prepareAiPilot(config, bundles, nowIso, requestFor) {
  const base = { status: 'blocked', reason: 'invalid_mode', step: 'stopped', generationCalls: 0, apiAttempts: 0,
    tokenUsage: { input: 0, output: 0 }, crmWritesPerformed: false, emailSent: false };
  if (!['preview', 'live'].includes(config?.mode)) return base;
  if (![config.researchModel, config.qualificationModel].every(model =>
    typeof model === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(model))) {
    return { ...base, reason: 'invalid_model_configuration' };
  }
  const bundle = bundles[config.fixture];
  const expectedId = { basic: 'pilot-ai-001', public_company: 'pilot-ai-public-company-001' }[config.fixture];
  if (!bundle?.fictional || !expectedId || bundle.intake?.id !== expectedId || bundle.intake.sourceForm !== 'demo'
    || bundle.intake.email !== 'leadops-ai-pilot@example.test') {
    return { ...base, reason: 'only_committed_fictional_input_allowed' };
  }
  const intake = JSON.parse(JSON.stringify(bundle.intake));
  if (intake.consent?.contact !== true || !intake.consent.noticeVersion) {
    return { ...base, status: 'rejected', reason: 'explicit_consent_required' };
  }
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return { ...base, reason: 'invalid_receiver_time' };
  intake.consent.recordedAt = now.toISOString();
  let body;
  try { body = requestFor('research', { model: config.researchModel, intake }); }
  catch { return { ...base, reason: 'invalid_model_configuration' }; }
  const state = { ...base, intake, fixture: config.fixture, qualificationModel: config.qualificationModel,
    researchModel: config.researchModel, searchEnabled: Boolean(body.tools) };
  if (config.mode === 'preview') {
    return { ...state, status: 'preview', reason: 'no_api_calls', outboundContext: JSON.parse(body.input) };
  }
  if (config.confirmPaidDemo !== 'YES_RUN_AI_DEMO') {
    return { ...state, reason: 'review_preview_then_confirm_ai_demo' };
  }
  return { ...state, status: 'awaiting_research', reason: 'ready', step: 'research', request: { body } };
}

export function advanceAiPilot(state, response, requestFor, decode) {
  const next = { ...state, request: undefined, step: 'stopped', status: 'manual_review', reason: 'invalid_pilot_state' };
  if (!['research', 'qualification'].includes(state.step)) return next;
  next.apiAttempts = state.apiAttempts + 1;
  const httpStatus = response?.statusCode;
  if (httpStatus !== 200 || response?.error) {
    let status = 'manual_review';
    let reason = 'openai_request_failed';
    if (httpStatus === 401 || httpStatus === 403) { status = 'configuration_needed'; reason = 'openai_credential_or_permission'; }
    else if (httpStatus === 429 && response.body?.error?.code === 'insufficient_quota') { status = 'configuration_needed'; reason = 'api_quota_unavailable'; }
    else if (httpStatus === 429 || httpStatus >= 500) { status = 'retry_later'; reason = 'openai_provider_or_rate_limit'; }
    return { ...next, status, reason, httpStatus: Number.isInteger(httpStatus) ? httpStatus : null, failedStep: state.step };
  }
  const usage = response.body.usage || {};
  const safeTokens = value => Number.isInteger(value) && value >= 0 && value <= 1000000 ? value : 0;
  next.generationCalls = state.generationCalls + 1;
  next.tokenUsage = { input: state.tokenUsage.input + safeTokens(usage.input_tokens),
    output: state.tokenUsage.output + safeTokens(usage.output_tokens) };
  let analysis;
  try { analysis = decode(state.step, response.body, state.research); }
  catch (error) {
    return { ...next, reason: 'invalid_or_unsupported_analysis', failedStep: state.step,
      validationCode: /^[a-z_]{1,80}$/.test(error?.code || '') ? error.code : 'invalid_output' };
  }
  if (state.step === 'qualification') {
    return { ...next, status: 'complete', reason: 'two_validated_ai_analyses', qualification: analysis };
  }
  next.research = analysis;
  try {
    next.request = { body: requestFor('qualification', {
      model: state.qualificationModel, intake: state.intake, research: analysis,
    }) };
  } catch { return { ...next, reason: 'invalid_model_configuration' }; }
  return { ...next, status: 'awaiting_qualification', reason: 'ready', step: 'qualification' };
}

export function summarizeAiPilot(state) {
  const summary = { status: state.status, reason: state.reason, fixture: state.fixture,
    analysisMode: 'openai_live', generationCalls: state.generationCalls, apiAttempts: state.apiAttempts, tokenUsage: state.tokenUsage,
    crmWritesPerformed: false, emailSent: false, automaticProspectContact: false };
  for (const field of ['research', 'qualification', 'httpStatus', 'failedStep', 'validationCode']) {
    if (state[field] !== undefined) summary[field] = state[field];
  }
  if (state.status === 'preview') {
    summary.analysisMode = 'preview';
    summary.outboundContext = state.outboundContext;
    summary.searchEnabled = state.searchEnabled;
  }
  return summary;
}
