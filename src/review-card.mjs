import { contactRecordUrl, nativeContactUrlCode } from './hubspot.mjs';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function row(label, value) {
  return `<tr><th align="left" style="padding:6px 12px 6px 0">${escapeHtml(label)}</th><td>${escapeHtml(value || 'No informado')}</td></tr>`;
}

const LABELS = {
  high_fit: 'Buen encaje sugerido', possible_fit: 'Encaje posible',
  low_fit: 'Bajo encaje sugerido', insufficient_information: 'Información insuficiente',
};

/** Internal alert only; never send this card to a prospect. */
export function renderReviewCard({ intake, research, qualification, portalId, contactId }) {
  const url = contactRecordUrl(portalId, contactId);
  const facts = research.externalFacts.map(item => {
    const safeUrl = /^https:\/\//i.test(item.source) ? item.source : null;
    return `<li>${escapeHtml(item.fact)}${item.confidence ? ` (certeza ${escapeHtml(item.confidence)})` : ''}${safeUrl ? ` — <a href="${escapeHtml(safeUrl)}">fuente</a>` : ' — fuente no verificada'}</li>`;
  }).join('');
  const content = `<!doctype html><html lang="es"><body style="font-family:Lato,Arial,sans-serif;color:#1b2a41;max-width:620px;margin:auto">
    <div style="background:#1b2a41;color:#fff;padding:18px 22px;border-bottom:5px solid #f4b943"><h1 style="margin:0;font-size:21px">Nueva consulta · revisar</h1></div>
    <div style="padding:20px;border:1px solid #d9e2ed">
      <p style="background:#fff1cb;padding:10px"><strong>Revisión humana obligatoria.</strong> La calificación es una recomendación, no una decisión.</p>
      <h2 style="font-size:18px">${escapeHtml(LABELS[qualification.fit] || 'Sin calificar')} · certeza ${escapeHtml(qualification.certainty)}</h2>
      <p>${escapeHtml(qualification.rationale)}</p>
      <table>${row('Persona', intake.name)}${row('Email', intake.email)}${row('Teléfono', intake.phone)}${row('Empresa', intake.company)}${row('Origen', intake.sourceForm)}${row('UTM', [intake.utm.utm_source, intake.utm.utm_medium, intake.utm.utm_campaign].join(' / '))}</table>
      <h3>Resumen</h3><p>${escapeHtml(research.summary)}</p>
      ${research.identity ? `<h3>Identidad profesional</h3><p>${escapeHtml(research.identity.status)} · certeza ${escapeHtml(research.identity.confidence)}. ${escapeHtml(research.identity.rationale)}</p>` : ''}
      ${research.sourceChecks?.some(item => item.status !== 'consulted') ? `<p>Fuentes sin verificar: ${research.sourceChecks.filter(item => item.status !== 'consulted').map(item => escapeHtml(item.url) + ' (' + escapeHtml(item.status) + ')').join('; ')}</p>` : ''}
      <h3>Faltantes</h3><p>${escapeHtml(qualification.missingInformation.join(', ') || 'Ninguno señalado')}</p>
      ${facts ? `<h3>Fuentes públicas</h3><ul>${facts}</ul>` : '<p>No hubo hallazgos públicos verificados.</p>'}
      <p><a href="${url}" style="background:#8b2634;color:#fff;padding:11px 16px;display:inline-block;text-decoration:none">Abrir contacto en HubSpot</a></p>
      <small>ID de entrada: ${escapeHtml(intake.id)} · Consentimiento para responder registrado; no implica permiso para campañas.</small>
    </div></body></html>`;
  return {
    deliveryKey: `leadops-review/${intake.fingerprint}`,
    subject: `[LeadOps] Revisar ${intake.name || intake.email || intake.phone || intake.id}`.replace(/[\r\n]+/g, ' ').slice(0, 180),
    html: content,
    text: `Revisión humana obligatoria. ${LABELS[qualification.fit] || 'Sin calificar'}; certeza ${qualification.certainty}. ${research.summary}\nAbrir en HubSpot: ${url}`,
  };
}

export function nativeReviewCardCode() {
  return [nativeContactUrlCode(), escapeHtml.toString(), row.toString(),
    `const LABELS = ${JSON.stringify(LABELS)};`, renderReviewCard.toString()].join('\n');
}
