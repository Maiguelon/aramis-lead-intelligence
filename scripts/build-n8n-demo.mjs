import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../n8n/', import.meta.url));
const code = (id, name, jsCode, x, y) => ({
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y],
  parameters: { mode: 'runOnceForAllItems', jsCode },
});

const scenarios = String.raw`
const footer = { submission_id: 'demo-footer-001', source_form: 'footer', nombre: 'Lucía Ríos', email: 'lucia@example.test', mensaje: 'Quisiera consultar por identidad visual para mi estudio.', consentimiento_contacto: true, consentimiento_texto_version: 'contact-v1', utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'brand-demo' };
const plan = { submission_id: 'demo-plan-001', source_form: 'plan_card', nombre: 'Mateo Vega', contacto: 'mateo@example.test', plan: JSON.stringify({ selections: { posts: 4, reels: 2, pagina: true } }), consentimiento_contacto: true, consentimiento_texto_version: 'contact-v1', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'services-demo' };
return [footer, footer, { ...footer, submission_id: 'demo-footer-002', mensaje: 'Ahora necesito una página web.' }, plan, { ...footer, submission_id: 'demo-denied-001', consentimiento_contacto: false }].map((json) => ({ json }));`;

const normalize = String.raw`
const seen = new Set();
return $input.all().map(({ json: raw }) => {
  const id = typeof raw.submission_id === 'string' ? raw.submission_id.trim() : '';
  const form = typeof raw.source_form === 'string' ? raw.source_form.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(id)) return { json: { status: 'manual_review', reason: 'invalid_submission_id' } };
  if (raw.consentimiento_contacto !== true || !raw.consentimiento_texto_version) return { json: { status: 'rejected', reason: 'contact_consent_not_explicit', submissionId: id } };
  const email = String(raw.email || raw.contacto || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { json: { status: 'manual_review', reason: 'missing_or_ambiguous_identity', submissionId: id } };
  const key = form + ':' + id;
  if (seen.has(key)) return { json: { status: 'duplicate', reason: 'already_processed', submissionId: id } };
  seen.add(key);
  let plan = null;
  try { plan = raw.plan ? JSON.parse(raw.plan) : null; } catch {}
  const request = String(raw.mensaje || '').slice(0, 2000);
  const services = [];
  if (/identidad|marca|branding|logo/i.test(request)) services.push('identidad_visual');
  if (/página|pagina|sitio|web/i.test(request) || plan?.selections?.pagina) services.push('pagina_web');
  if (/redes|social|reels|publicidad/i.test(request) || plan?.selections?.posts || plan?.selections?.reels) services.push('redes_sociales');
  return { json: { status: 'accepted', intake: { id, sourceForm: form, email, name: String(raw.nombre || '').slice(0, 160), message: request, serviceHints: services, utm: { source: raw.utm_source || 'unknown', medium: raw.utm_medium || 'unknown', campaign: raw.utm_campaign || 'unknown' }, consentNotice: raw.consentimiento_texto_version, consentAt: new Date().toISOString() } } };
});`;

const fakeCrm = String.raw`
const contacts = new Map();
return $input.all().map(({ json }) => {
  const { intake } = json;
  const existing = contacts.get(intake.email);
  const contactId = existing || String(10000 + contacts.size);
  if (!existing) contacts.set(intake.email, contactId);
  return { json: { ...json, crm: { mode: 'SIMULATED', contactId, contactCreated: !existing, noteId: 'note-' + intake.id, taskId: 'task-' + intake.id, taskStatus: 'NOT_STARTED' } } };
});`;

const research = String.raw`
return $input.all().map(({ json }) => {
  const { intake } = json;
  const summary = intake.message || 'Consulta sin detalle; revisar las selecciones del plan.';
  return { json: { ...json, research: { summary, verifiedFacts: intake.message ? [{ fact: intake.message, source: 'intake:message' }] : [], externalFacts: [], missingInformation: [ ...(intake.message ? [] : ['detalle de la necesidad']), 'presupuesto', 'plazo' ], researchStatus: 'not_performed' } } };
});`;

const qualify = String.raw`
return $input.all().map(({ json }) => {
  const { intake, research } = json;
  const hasService = intake.serviceHints.length > 0;
  const hasDetail = Boolean(intake.message);
  const fit = hasService && hasDetail ? 'high_fit' : hasService ? 'possible_fit' : 'insufficient_information';
  return { json: { ...json, qualification: { fit, certainty: hasService && hasDetail ? 'medium' : 'low', rationale: hasService ? 'La necesidad expresada coincide con servicios de Aramis; confirmar contexto antes de contactar.' : 'Faltan datos para evaluar el encaje.', missingInformation: research.missingInformation, signals: hasService ? [{ signal: intake.serviceHints.join(', '), source: intake.message ? 'intake:message' : 'intake:plan' }] : [], humanReviewRequired: true, mode: 'DETERMINISTIC STUB — no AI call' } } };
});`;

const card = String.raw`
const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
return $input.all().map(({ json }) => {
  const { intake, crm, research, qualification } = json;
  const html = '<div style="font-family:Arial;max-width:600px;color:#1b2a41"><h1 style="background:#1b2a41;color:white;padding:18px;border-bottom:5px solid #f4b943">LeadOps · revisión humana</h1><p><b>DEMO FICTICIA: no se envió correo ni se escribió en HubSpot.</b></p><p><b>Encaje:</b> ' + escape(qualification.fit) + ' · <b>Certeza:</b> ' + escape(qualification.certainty) + '</p><p>' + escape(qualification.rationale) + '</p><p><b>Persona:</b> ' + escape(intake.name) + ' (' + escape(intake.email) + ')</p><p><b>Resumen:</b> ' + escape(research.summary) + '</p><p><b>Faltantes:</b> ' + escape(qualification.missingInformation.join(', ')) + '</p><p><b>Fuente:</b> ' + escape(intake.sourceForm) + ' / ' + escape(intake.utm.source) + '</p><p><b>Contacto simulado:</b> ' + escape(crm.contactId) + ' · tarea abierta ' + escape(crm.taskId) + '</p></div>';
  return { json: { scenario: intake.id, status: 'review_ready', simulatedCrm: crm, qualification, cardHtml: html } };
});`;

const reject = String.raw`return $input.all().map(({ json }) => ({ json: { scenario: json.submissionId || 'unknown', status: json.status, reason: json.reason, effects: [] } }));`;

const nodes = [
  { id: 'leadops-manual', name: 'Ejecutar demo', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [160, 320], parameters: {} },
  code('leadops-scenarios', 'Cinco escenarios ficticios', scenarios, 360, 320),
  code('leadops-normalize', 'Consentimiento + normalización', normalize, 600, 320),
  { id: 'leadops-accepted', name: '¿Entrada aceptada?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [860, 320],
    parameters: { conditions: { combinator: 'and', options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'accepted-condition', leftValue: '={{ $json.status }}', rightValue: 'accepted', operator: { type: 'string', operation: 'equals' } }] }, options: {} } },
  code('leadops-crm', 'CRM simulado', fakeCrm, 1100, 220),
  code('leadops-research', 'Agente 1 · resumen simulado', research, 1330, 220),
  code('leadops-qualify', 'Agente 2 · encaje simulado', qualify, 1570, 220),
  code('leadops-card', 'Tarjeta de revisión', card, 1810, 220),
  code('leadops-reject', 'Rechazos y repetidos', reject, 1110, 480),
];

const connection = (node) => [{ node, type: 'main', index: 0 }];
const connections = {
  'Ejecutar demo': { main: [connection('Cinco escenarios ficticios')] },
  'Cinco escenarios ficticios': { main: [connection('Consentimiento + normalización')] },
  'Consentimiento + normalización': { main: [connection('¿Entrada aceptada?')] },
  '¿Entrada aceptada?': { main: [connection('CRM simulado'), connection('Rechazos y repetidos')] },
  'CRM simulado': { main: [connection('Agente 1 · resumen simulado')] },
  'Agente 1 · resumen simulado': { main: [connection('Agente 2 · encaje simulado')] },
  'Agente 2 · encaje simulado': { main: [connection('Tarjeta de revisión')] },
};

const workflow = { id: 'aramis-leadops-demo', name: 'Aramis LeadOps — demo ficticia (sin credenciales)', nodes, connections,
  settings: { executionOrder: 'v1' }, active: false, pinData: {}, tags: [] };
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'leadops-demo.json'), JSON.stringify(workflow, null, 2) + '\n');
