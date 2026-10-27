/** Operational counts describe intake events, never conversion or commercial performance. */
export function operatingReport(rows, generatedAt = new Date().toISOString()) {
  const counts = key => Object.fromEntries([...new Set(rows.map(row => row[key] || 'unknown'))].sort()
    .map(value => [value, rows.filter(row => (row[key] || 'unknown') === value).length]));
  const uniqueKeys = new Set(rows.map(row => row.event_key));
  return { generatedAt, fictionalDemo: true, events: rows.length,
    duplicateKeys: rows.length - uniqueKeys.size,
    completed: rows.filter(row => row.state === 'complete').length,
    needsReconciliation: rows.filter(row => row.state !== 'complete' && row.state !== 'retryable_no_write').length,
    safeReadRetries: rows.filter(row => row.state === 'retryable_no_write').length,
    uniqueContacts: new Set(rows.map(row => row.contact_id).filter(Boolean)).size,
    tasksCreated: rows.filter(row => row.task_id).length,
    internalEmailsAccepted: rows.filter(row => row.alert_id).length,
    manualFallbacks: rows.filter(row => row.analysis_mode === 'manual_fallback').length,
    bySource: counts('source_channel'), byFit: counts('fit'), byCertainty: counts('certainty'),
    limits: ['Fictional demonstration; no measured sales or ROI.', 'Email IDs prove API acceptance, not inbox delivery or reading.',
      'Tasks created are not necessarily still open; check HubSpot.', 'Rejected inputs and duplicate deliveries do not create additional ledger rows.'] };
}

export function renderOperatingReport(report, rows, portalId) {
  if (!/^\d+$/.test(String(portalId))) throw Error('invalid_portal_id');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const utm = 'utm_source=app_12360546_mcp&utm_medium=ai_agent&utm_campaign=fetch';
  const recordLink = (kind, id) => {
    if (!/^\d+$/.test(String(id || ''))) return '—';
    const url = kind === 'contact' ? `https://app.hubspot.com/contacts/${portalId}/record/0-1/${id}?${utm}`
      : kind === 'task' ? `https://app.hubspot.com/tasks/${portalId}/view/all/task/${id}?${utm}`
        : `https://app.hubspot.com/contacts/${portalId}/objects/0-46/views/all/list?filters=${encodeURIComponent(JSON.stringify([{ property: 'hs_object_id', operator: 'EQ', value: String(id) }]))}&${utm}`;
    return `<a href="${esc(url)}" target="_blank" rel="noreferrer">${kind === 'contact' ? 'Contacto' : kind === 'task' ? 'Tarea' : 'Nota'} ↗</a>`;
  };
  const tiles = [['Entradas únicas', report.events], ['Completadas', report.completed], ['Contactos', report.uniqueContacts],
    ['Requieren conciliación', report.needsReconciliation], ['Revisión sin IA', report.manualFallbacks], ['Correos aceptados', report.internalEmailsAccepted]];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aramis LeadOps · Operación</title>
  <style>body{margin:0;background:#f4f6f8;color:#1b2a41;font:16px Arial,sans-serif}header{background:#1b2a41;color:white;border-bottom:5px solid #f4b943;padding:32px max(24px,calc((100vw - 1100px)/2))}main{max-width:1100px;margin:28px auto;padding:0 24px}h1{font-size:34px;margin:8px 0}h2{font-size:22px}small{color:#63718a}.tag{color:#f4b943;font-size:12px;letter-spacing:2px}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.tile,section{background:white;border:1px solid #dce3eb;border-radius:10px;padding:22px}.tile strong{display:block;font-size:32px;margin:12px 0 0}.tile span{font-size:14px}section{margin-top:22px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:14px 10px;text-align:left;border-bottom:1px solid #e5eaf0}a{color:#8b2634}nav a{display:inline-block;margin:10px 20px 0 0;color:#fff}.notice{border-left:4px solid #f4b943;padding-left:14px;line-height:1.6}.meta{display:flex;gap:32px;flex-wrap:wrap}.meta p{margin:8px 0}@media(max-width:700px){.tiles{grid-template-columns:repeat(2,1fr)}h1{font-size:27px}}</style></head>
  <body><header><div class="tag">ARAMIS / LEADOPS</div><h1>De la consulta a la revisión humana</h1><p>Vista operativa de la demo conectada · datos ficticios</p><nav><a href="http://localhost:5678/workflow/aramis-leadops-integrated">Abrir flujo n8n ↗</a><a href="http://localhost:5678/form/aramis-leadops">Probar formulario ↗</a></nav></header><main>
  <div class="tiles">${tiles.map(([label, value]) => `<div class="tile"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
  <section><h2>Seguimiento por entrada</h2><p class="notice">La IA recomienda encaje y certeza. Una persona valida la evidencia y decide el siguiente paso en HubSpot.</p><div class="scroll"><table><thead><tr><th>Entrada</th><th>Estado</th><th>Encaje / certeza</th><th>Análisis</th><th>HubSpot</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.event_key.slice(0, 10))}<br><small>${esc(row.source_channel)}</small></td><td>${esc(row.state)}</td><td>${esc(row.fit || 'pendiente')}<br><small>${esc(row.certainty || 'pendiente')}</small></td><td>${esc(row.analysis_mode || 'pendiente')}</td><td>${recordLink('contact', row.contact_id)}<br>${recordLink('note', row.note_id)} · ${recordLink('task', row.task_id)}</td></tr>`).join('')}</tbody></table></div></section>
  <section><h2>Lectura del reporte</h2><div class="meta"><div><strong>Fuente</strong>${Object.entries(report.bySource).map(([key, value]) => `<p>${esc(key)}: ${value}</p>`).join('')}</div><div><strong>Encaje sugerido</strong>${Object.entries(report.byFit).map(([key, value]) => `<p>${esc(key)}: ${value}</p>`).join('')}</div></div><p class="notice">Muestra técnica de portfolio: no mide ventas, conversión ni ROI. “Correo aceptado” es la respuesta de la API; la entrega se comprueba en Resend. Las tareas creadas pueden haberse cerrado después en HubSpot. Los rechazos y reenvíos duplicados se consultan en las ejecuciones de n8n.</p><small>Generado: ${esc(report.generatedAt)} · Muestra de portfolio.</small></section></main></body></html>`;
}
