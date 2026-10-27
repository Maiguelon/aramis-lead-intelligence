export const DEMO_SCENARIOS = {
  'Consulta web': 'new', 'Vuelve el mismo contacto': 'returning',
  'Información incompleta': 'incomplete', 'Servicio fuera de oferta': 'low_fit',
  'Empresa pública (Aramis)': 'public_company',
};
export const DEMO_CONSENT = 'Autorizo procesar esta consulta ficticia y enviar la tarjeta interna de prueba.';

export function demoFormInput(input, scenarios, consentText) {
  return { entryKind: 'form', inbound: { body: {
    scenario: Object.hasOwn(scenarios, input?.Escenario) ? scenarios[input.Escenario] : '',
    consent: Array.isArray(input?.Consentimiento) && input.Consentimiento.length === 1 && input.Consentimiento[0] === consentText,
  } } };
}

export function renderDemoResult(summary, portalId) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const labels = { complete: 'Consulta lista para revisión', duplicate: 'Entrada ya procesada',
    rejected: 'Entrada detenida', manual_review: 'Requiere revisión operativa',
    preview: 'Demo deshabilitada', blocked: 'Ejecución bloqueada', retryable_no_write: 'Lectura pendiente' };
  const fits = { high_fit: 'Buen encaje sugerido', possible_fit: 'Encaje posible', low_fit: 'Bajo encaje sugerido', insufficient_information: 'Información insuficiente' };
  const certainties = { high: 'alta', medium: 'media', low: 'baja' };
  const analysis = { openai_live: 'Análisis real con IA', manual_fallback: 'Revisión personal; análisis automático no disponible' };
  const scenarios = { new: 'Consulta web', returning: 'Vuelve el mismo contacto', incomplete: 'Información incompleta', low_fit: 'Servicio fuera de oferta', public_company: 'Empresa pública (Aramis)' };
  const explanation = summary.status === 'complete'
    ? 'HubSpot conserva la nota y la tarea. La tarjeta interna fue aceptada por el servicio de correo; su entrega se verifica en Resend.'
    : summary.status === 'duplicate' ? 'Este evento ya estaba completado. No se volvieron a ejecutar los agentes, crear actividades ni enviar el correo.'
      : summary.status === 'rejected' ? 'No se procesó esta entrada. Sin consentimiento explícito no se consulta la IA, no se escribe en HubSpot y no se envía correo.'
        : 'Revisar el estado de la ejecución y los registros de los proveedores antes de repetir una operación.';
  const crm = /^\d+$/.test(String(portalId)) && /^\d+$/.test(String(summary.contactId || ''))
    ? `<a class="primary" href="https://app.hubspot.com/contacts/${portalId}/record/0-1/${summary.contactId}?utm_source=app_12360546_mcp&amp;utm_medium=ai_agent&amp;utm_campaign=fetch" target="_blank" rel="noreferrer">Abrir contacto en HubSpot ↗</a>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LeadOps · Resultado</title><style>body{font:16px Arial,sans-serif;background:#f4f6f8;color:#1b2a41;margin:0;padding:40px 20px}.card{max-width:700px;margin:auto;background:white;border:1px solid #dce3eb;border-radius:14px;overflow:hidden}header{padding:28px;background:#1b2a41;color:white;border-bottom:5px solid #f4b943}header small{color:#f4b943;letter-spacing:2px}h1{font-size:28px;margin:14px 0 0}main{padding:28px;line-height:1.6}.notice{padding:14px;background:#fff1cb}.primary{background:#8b2634;color:#fff!important;padding:12px 18px;display:inline-block;border-radius:5px;text-decoration:none}a{color:#8b2634}dt{font-size:13px;color:#63718a}dd{margin:2px 0 14px}footer{margin-top:28px;font-size:13px;color:#63718a}</style></head><body><article class="card"><header><small>ARAMIS / LEADOPS</small><h1>${esc(labels[summary.status] || 'Resultado operativo')}</h1></header><main><p>${esc(explanation)}</p><p class="notice"><strong>Demostración con datos ficticios.</strong> Una persona valida la evidencia y decide el siguiente paso comercial.</p><dl><dt>Escenario</dt><dd>${esc(scenarios[summary.scenario] || 'No aceptado')}</dd><dt>Análisis</dt><dd>${esc(analysis[summary.analysisMode] || 'No ejecutado')}</dd><dt>Encaje sugerido / certeza</dt><dd>${esc(fits[summary.fit] || 'Sin calificar')} / ${esc(certainties[summary.certainty] || 'Sin evaluar')}</dd></dl>${crm}<p><a href="/form/aramis-leadops">Volver a la demo</a></p><footer>Sin contacto automático al prospecto. Los escenarios tienen identificadores estables: repetir uno permite demostrar el control de duplicados.</footer></main></article></body></html>`;
}
