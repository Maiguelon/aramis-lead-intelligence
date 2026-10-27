/** Fixed fictional-contact transport test. No CRM writes or AI calls. */
export function prepareMailPilot(config, bundle, render, requestFor) {
  const base = { status: 'blocked', reason: 'invalid_mode', crmWritesPerformed: false, aiCallsPerformed: false };
  if (!['preview', 'send'].includes(config?.mode)) return base;
  const intake = bundle?.intake;
  if (bundle?.fictional !== true || intake?.id !== 'pilot-crm-001' || intake.sourceForm !== 'demo'
    || intake.email !== 'leadops-crm-pilot@example.com') return { ...base, reason: 'only_committed_fictional_input_allowed' };
  if (intake.consent?.contact !== true || !intake.consent.noticeVersion) return { ...base, status: 'rejected', reason: 'explicit_consent_required' };
  let card;
  try {
    card = render({ intake, research: bundle.research, qualification: bundle.qualification,
      portalId: config.portalId || '123456', contactId: config.contactId || '10000' });
  } catch { return { ...base, reason: 'invalid_crm_link' }; }
  card.subject = `[PRUEBA] ${card.subject}`.slice(0, 180);
  card.html = card.html.replace(/(<body[^>]*>)/, '$1<p style="background:#fff1cb;padding:12px"><strong>Prueba de entrega interna.</strong> Datos ficticios y análisis simulado.</p>');
  card.text = `PRUEBA DE ENTREGA INTERNA. Datos ficticios y análisis simulado.\n${card.text}`;
  const state = { ...base, card, destination: config.to || '', sender: config.from || '' };
  if (config.mode === 'preview') return { ...state, status: 'preview', reason: 'no_email_sent' };
  if (config.confirmInternalSend !== 'YES_SEND_INTERNAL_DEMO' || !/^\d+$/.test(config.portalId || '')
    || !/^\d+$/.test(config.contactId || '')) return { ...state, reason: 'review_card_then_confirm_internal_demo' };
  try { return { ...state, status: 'awaiting_send', reason: 'ready', request: requestFor(card, config) }; }
  catch (error) { return { ...state, reason: /^[a-z_]{1,80}$/.test(error?.code || '') ? error.code : 'invalid_mail_configuration' }; }
}

export function summarizeMailPilot(state, response, summarizeResponse) {
  if (state.status !== 'awaiting_send') {
    return { status: state.status, reason: state.reason, destination: state.destination,
      crmWritesPerformed: false, aiCallsPerformed: false, emailAccepted: false,
      ...(state.status === 'preview' ? { card: state.card } : {}) };
  }
  const result = summarizeResponse(response);
  return { ...result, destination: state.destination, crmWritesPerformed: false, aiCallsPerformed: false,
    emailAccepted: result.status === 'accepted', analysisMode: 'fixture_stub' };
}
