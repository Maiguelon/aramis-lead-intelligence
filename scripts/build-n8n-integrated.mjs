import { readFile, writeFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { nativeAgentCode } from '../src/openai-agents.mjs';
import { hubspotRequest } from '../src/hubspot-contract.mjs';
import { nativeReviewCardCode } from '../src/review-card.mjs';
import { resendRequest, summarizeResendResponse } from '../src/resend.mjs';
import { LEDGER_COLUMNS, nativeLedgerRecord } from '../src/native-ledger.mjs';
import { prepareIntegratedInput, decideIntegratedEvent, advanceIntegrated, integratedFallback, integratedSummary } from '../src/integrated-flow.mjs';
import { DEMO_SCENARIOS, DEMO_CONSENT, demoFormInput, renderDemoResult } from '../src/demo-form.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/integrated-demo.json', import.meta.url), 'utf8'));
const normalize = value => normalizeIntake(value, { receivedAt: '2026-10-27T00:00:00Z' }).intake;
const bundles = {
  new: normalize(fixture),
  returning: normalize({ ...fixture, submission_id: 'portfolio-returning-001', mensaje: 'PRUEBA FICTICIA: vuelvo a consultar por la web. Sin contacto automático.' }),
  incomplete: normalize({ ...fixture, submission_id: 'portfolio-incomplete-001', email: 'leadops-incomplete@example.com', mensaje: 'PRUEBA FICTICIA: quisiera más información.' }),
  low_fit: normalize({ ...fixture, submission_id: 'portfolio-low-fit-001', email: 'leadops-low-fit@example.com', mensaje: 'PRUEBA FICTICIA: necesito un contador que haga mi declaración de impuestos.' }),
  public_company: normalize({ ...fixture, submission_id: 'portfolio-company-001', email: 'leadops-company@example.com', empresa: 'Aramis Agency', empresa_web: 'https://aramis.agency/' }),
};
const nodes = [], connections = {};
const edge = name => [{ node: name, type: 'main', index: 0 }];
const link = (a, b) => { connections[a] = { main: [edge(b)] }; };
const code = (id, name, jsCode, x, y) => {
  nodes.push({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode } });
  return name;
};
const gate = (id, name, status, yes, no, x, y) => {
  nodes.push({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [x, y], parameters: {
    conditions: { combinator: 'and', options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: `${id}-condition`, leftValue: '={{ $json.status }}', rightValue: status, operator: { type: 'string', operation: 'equals' } }] }, options: {} } });
  connections[name] = { main: [edge(yes), edge(no)] }; return name;
};
const table = (id, name, operation, x, y) => {
  nodes.push({ id, name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [x, y],
    ...(operation === 'get' ? { alwaysOutputData: true } : {}), parameters: {
      resource: 'row', operation, dataTableId: { __rl: true, mode: 'id', value: '={{ $("Configuración local").first().json.tableId }}' },
      matchType: 'allConditions', filters: { conditions: [{ keyName: 'event_key', condition: 'eq', keyValue: '={{ $json.intake.fingerprint }}' }] },
      ...(operation === 'get' ? { returnAll: false, limit: 2 } : { columns: { mappingMode: 'defineBelow',
        value: Object.fromEntries(LEDGER_COLUMNS.map(column => [column.name, `={{ $json.ledgerRow.${column.name} }}`])) }, options: {} }),
    } }); return name;
};
const checkpoint = (id, label, preparation, x, y) => {
  const before = code(`${id}-prepare`, `Estado · ${label}`, `const record = ${nativeLedgerRecord.toString()};
const frame = $input.first().json;
${preparation}
frame.ledgerRow = record(frame);
return [{ json: frame }];`, x, y);
  const save = table(`${id}-save`, `Persistir · ${label}`, 'upsert', x + 230, y);
  link(before, save); return { before, save };
};
const http = (id, name, provider, previous, x, y) => {
  const frame = `$(${JSON.stringify(previous)}).first().json`;
  const options = { timeout: provider === 'ai' ? 90000 : 15000,
    response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } };
  nodes.push({ id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y],
    retryOnFail: provider === 'search', ...(provider === 'search' ? { maxTries: 2, waitBetweenTries: 1000 } : {}),
    onError: 'continueRegularOutput', parameters: {
      method: 'POST', url: provider === 'ai' ? 'https://api.openai.com/v1/responses'
        : provider === 'mail' ? 'https://api.resend.com/emails' : `={{ "https://api.hubapi.com" + ${frame}.request.path }}`,
      ...(provider === 'ai' ? { authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi' }
        : { authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth' }),
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: `={{ ${frame}.request.body }}`,
      ...(provider === 'mail' ? { sendHeaders: true, headerParameters: { parameters: [
        { name: 'Idempotency-Key', value: `={{ ${frame}.request.headers['Idempotency-Key'] }}` } ] } } : {}), options,
    } }); return name;
};
const shared = `const crm = ${hubspotRequest.toString()};\n${nativeAgentCode()}\nconst fallback = ${integratedFallback.toString()};\nconst mailReceipt = ${summarizeResendResponse.toString()};\nconst advance = ${advanceIntegrated.toString()};`;
const advance = (id, name, stage, previous, x, y) => code(id, name,
  `${shared}\nreturn [{ json: advance(${JSON.stringify(stage)}, $(${JSON.stringify(previous)}).first().json, $input.first().json,
    { crm, ai: openAiRequest, decode: decodeAgentResponse, fallback, mailReceipt }) }];`, x, y);

nodes.push({ id: 'integrated-webhook', name: 'Entrada demo local', type: 'n8n-nodes-base.webhook', typeVersion: 2.1,
  webhookId: 'f644c753-52e3-46c6-92d1-c09cb6b1c17b', position: [0, 0], parameters: {
    httpMethod: 'POST', path: 'aramis-leadops-demo', responseMode: 'lastNode', responseData: 'firstEntryJson', options: {} } });
code('integrated-capture-api', 'Capturar entrada API', `return [{ json: { entryKind: 'api', inbound: { body: $input.first().json.body } } }];`, 0, 160);
nodes.push({ id: 'integrated-form', name: 'Formulario demo', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.3,
  webhookId: '94586984-e8d2-4c1b-a571-89fe6a0833fb', position: [-460, 350], parameters: {
    authentication: 'none', formTitle: 'Aramis LeadOps · Demo',
    formDescription: 'Probá el recorrido desde una consulta hasta su revisión en HubSpot. Todas las personas y solicitudes son ficticias. Elegí un escenario; repetirlo demuestra el control de duplicados. Sin marcar el consentimiento, la entrada se detiene.',
    formFields: { values: [
      { fieldLabel: 'Escenario', fieldType: 'dropdown', fieldOptions: { values: Object.keys(DEMO_SCENARIOS).map(option => ({ option })) }, requiredField: true },
      { fieldLabel: 'Consentimiento', fieldType: 'checkbox', fieldOptions: { values: [{ option: DEMO_CONSENT }] }, requiredField: false },
    ] }, responseMode: 'onReceived', options: { path: 'aramis-leadops', buttonLabel: 'Procesar demo', appendAttribution: true,
      customCss: ':root { --color-background: #f4f6f8; --color-card-bg: #ffffff; --color-header: #1b2a41; --color-submit-btn-bg: #8b2634; --color-submit-btn-text: #ffffff; --font-family: Arial, sans-serif; }' },
  } });
code('integrated-capture-form', 'Leer consentimiento del formulario', `const adapt = ${demoFormInput.toString()};
return [{ json: adapt($input.first().json, ${JSON.stringify(DEMO_SCENARIOS)}, ${JSON.stringify(DEMO_CONSENT)}) }];`, -230, 350);
nodes.push({ id: 'integrated-config', name: 'Configuración local', type: 'n8n-nodes-base.set', typeVersion: 3.4,
  position: [230, 0], parameters: { assignments: { assignments: Object.entries({ enabled: 'false', confirm: '', tableId: '',
    portalId: '', ownerId: '', from: '', to: '', model: 'gpt-5.4-mini' }).map(([name, value]) => ({ id: `config-${name}`, name, value, type: 'string' })) }, includeOtherFields: true, options: {} } });
code('integrated-intake', 'Validar consentimiento y demo', `const prepare = ${prepareIntegratedInput.toString()};
const input = $input.first().json;
const config = Object.fromEntries(['enabled','confirm','tableId','portalId','ownerId','from','to','model'].map(key => [key, input[key]]));
const frame = prepare(input.inbound, config, ${JSON.stringify(bundles)}, new Date().toISOString(), $mode);
frame.entryKind = input.entryKind;
return [{ json: frame }];`, 460, 0);
gate('integrated-consent-gate', '¿Entrada aceptada?', 'lookup', 'Consultar evento', 'Resultado operativo', 690, 0);
table('integrated-lookup', 'Consultar evento', 'get', 920, -100);
code('integrated-dedupe', 'Resolver duplicado o entrada nueva', `const decide = ${decideIntegratedEvent.toString()};
return [{ json: decide($('Validar consentimiento y demo').first().json, $input.all().map(item => item.json)) }];`, 1150, -100);
gate('integrated-event-gate', '¿Evento procesable?', 'search', 'Estado · contacto', 'Resultado operativo', 1380, -100);
const claim = checkpoint('integrated-claim', 'contacto', `const crm = ${hubspotRequest.toString()};
frame.request = crm('search_contact', { propertyName: 'email', value: frame.intake.email });`, 1610, -200);
http('integrated-search', 'HubSpot · buscar identidad', 'search', claim.before, 2070, -200);
advance('integrated-search-result', 'Resolver identidad CRM', 'search', claim.before, 2300, -200);
gate('integrated-read-retry', '¿Falló solo la lectura?', 'retryable_no_write', 'Estado · reintento seguro', '¿Crear contacto?', 2530, -200);
const retry = checkpoint('integrated-retry', 'reintento seguro', '', 2760, -450);
code('integrated-retry-result', 'Lectura pendiente', `return [{ json: $('Estado · reintento seguro').first().json }];`, 3220, -450);
gate('integrated-create-gate', '¿Crear contacto?', 'create_contact', 'HubSpot · registrar contacto', '¿Contacto confirmado?', 2760, -100);
http('integrated-contact', 'HubSpot · registrar contacto', 'crm', 'Resolver identidad CRM', 2990, -200);
advance('integrated-contact-result', 'Confirmar contacto', 'contact', 'Resolver identidad CRM', 3220, -200);
gate('integrated-analysis-gate', '¿Contacto confirmado?', 'analyze', 'Estado · análisis', 'Resultado operativo', 3450, 0);
const analysis = checkpoint('integrated-analysis', 'análisis', `${nativeAgentCode()}
frame.reason = 'analysis_started';
frame.request = { body: openAiRequest('research', { model: frame.config.model, intake: frame.intake }) };`, 0, 500);
http('integrated-research', 'Agente 1 · resumen y fuentes', 'ai', analysis.before, 460, 500);
advance('integrated-research-result', 'Comprobar evidencia', 'research', analysis.before, 690, 500);
gate('integrated-qualification-gate', '¿Calificar con IA?', 'qualify', 'Agente 2 · encaje y certeza', 'Preparar nota de revisión', 920, 500);
http('integrated-qualification', 'Agente 2 · encaje y certeza', 'ai', 'Comprobar evidencia', 1150, 400);
advance('integrated-qualification-result', 'Comprobar recomendación', 'qualification', 'Comprobar evidencia', 1380, 400);
code('integrated-analysis-ready', 'Preparar nota de revisión', `const crm = ${hubspotRequest.toString()};
const frame = $input.first().json;
if (frame.status !== 'write_note') throw Error('analysis_not_ready');
frame.ledgerState = 'note_unknown'; frame.reason = 'note_write_started';
frame.request = crm('create_note', { contactId: frame.ids.contact, intake: frame.intake, research: frame.research, qualification: frame.qualification });
return [{ json: frame }];`, 1610, 500);
const note = checkpoint('integrated-note', 'nota', '', 1840, 500);
http('integrated-note-http', 'HubSpot · guardar nota', 'crm', note.before, 2300, 500);
advance('integrated-note-result', 'Confirmar nota', 'note', note.before, 2530, 500);
gate('integrated-task-gate', '¿Nota confirmada?', 'write_task', 'Estado · tarea', 'Resultado operativo', 2760, 500);
const task = checkpoint('integrated-task', 'tarea', `const crm = ${hubspotRequest.toString()};
frame.request = crm('create_task', { contactId: frame.ids.contact, intake: frame.intake, ownerId: frame.config.ownerId,
  dueAt: new Date(Date.now() + 86400000).toISOString() });`, 0, 1000);
http('integrated-task-http', 'HubSpot · crear revisión humana', 'crm', task.before, 460, 1000);
advance('integrated-task-result', 'Confirmar tarea', 'task', task.before, 690, 1000);
gate('integrated-mail-gate', '¿Tarea confirmada?', 'send_mail', 'Estado · correo', 'Resultado operativo', 920, 1000);
const mail = checkpoint('integrated-mail', 'correo', `${nativeReviewCardCode()}
const mailRequest = ${resendRequest.toString()};
const card = renderReviewCard({ ...frame, portalId: frame.config.portalId, contactId: frame.ids.contact });
card.subject = '[DEMO] ' + card.subject.slice(0, 173);
card.html = card.html.replace('<h1', '<p>DEMOSTRACIÓN: persona y solicitud ficticias. Análisis ' + (frame.analysisMode === 'openai_live' ? 'real con IA' : 'no disponible; revisar personalmente') + '.</p><h1');
card.text = 'DEMOSTRACIÓN: persona y solicitud ficticias. ' + card.text;
frame.request = mailRequest(card, { from: frame.config.from, to: frame.config.to });`, 1150, 1000);
http('integrated-mail-http', 'Resend · tarjeta interna', 'mail', mail.before, 1610, 1000);
advance('integrated-mail-result', 'Confirmar aceptación del correo', 'mail', mail.before, 1840, 1000);
gate('integrated-complete-gate', '¿Correo aceptado?', 'complete', 'Estado · completado', 'Resultado operativo', 2070, 1000);
const complete = checkpoint('integrated-complete', 'completado', '', 2300, 1000);
code('integrated-complete-result', 'Recorrido completado', `return [{ json: $('Estado · completado').first().json }];`, 2760, 1000);
code('integrated-summary', 'Resultado operativo', `const summarize = ${integratedSummary.toString()};
const render = ${renderDemoResult.toString()};
const frame = $input.first().json;
const summary = summarize(frame);
if (frame.entryKind === 'form') summary.formHtml = render(summary, frame.config?.portalId);
return [{ json: summary }];`, 3450, 700);
gate('integrated-response-gate', '¿Mostrar resultado del formulario?', 'unused', 'Resultado del formulario', 'Resultado para API', 3680, 700);
nodes.at(-1).parameters.conditions.conditions[0].leftValue = '={{ typeof $json.formHtml }}';
nodes.at(-1).parameters.conditions.conditions[0].rightValue = 'string';
nodes.push({ id: 'integrated-form-end', name: 'Resultado del formulario', type: 'n8n-nodes-base.form', typeVersion: 2.3,
  position: [3910, 500], parameters: { operation: 'completion', respondWith: 'showText', responseText: '={{ $json.formHtml }}', options: {} } });
nodes.push({ id: 'integrated-response', name: 'Resultado para API', type: 'n8n-nodes-base.noOp', typeVersion: 1,
  position: [3910, 800], parameters: {} });
nodes.push({ id: 'integrated-guide', name: 'Alcance y operación', type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
  position: [0, -500], parameters: { width: 840, height: 340, content: '## LeadOps · demo conectada\nSolo localhost y escenarios ficticios cerrados. POST /webhook/aramis-leadops-demo con {"scenario":"new","consent":true}.\n\nEscenarios: new, returning, incomplete, low_fit, public_company. Consentimiento ausente o false: cero efectos.\n\nRequiere configuración privada, tres credenciales distintas, Data Table y concurrencia de producción = 1. El modo manual/CLI está bloqueado. La exportación pública viene deshabilitada.\n\nUn evento completado no repite IA, CRM ni correo. Una escritura incierta requiere conciliación humana. Revisión humana obligatoria; sin campañas ni contacto al prospecto. El sitio Aramis/Formspree todavía no alimenta este flujo.' } });
for (const [a, b] of [
  ['Entrada demo local', 'Capturar entrada API'], ['Capturar entrada API', 'Configuración local'],
  ['Formulario demo', 'Leer consentimiento del formulario'], ['Leer consentimiento del formulario', 'Configuración local'],
  ['Configuración local', 'Validar consentimiento y demo'], ['Validar consentimiento y demo', '¿Entrada aceptada?'],
  ['Consultar evento', 'Resolver duplicado o entrada nueva'], ['Resolver duplicado o entrada nueva', '¿Evento procesable?'],
  [claim.save, 'HubSpot · buscar identidad'], ['HubSpot · buscar identidad', 'Resolver identidad CRM'], ['Resolver identidad CRM', '¿Falló solo la lectura?'],
  [retry.save, 'Lectura pendiente'], ['Lectura pendiente', 'Resultado operativo'], ['HubSpot · registrar contacto', 'Confirmar contacto'], ['Confirmar contacto', '¿Contacto confirmado?'],
  [analysis.save, 'Agente 1 · resumen y fuentes'], ['Agente 1 · resumen y fuentes', 'Comprobar evidencia'], ['Comprobar evidencia', '¿Calificar con IA?'],
  ['Agente 2 · encaje y certeza', 'Comprobar recomendación'], ['Comprobar recomendación', 'Preparar nota de revisión'], ['Preparar nota de revisión', note.before],
  [note.save, 'HubSpot · guardar nota'], ['HubSpot · guardar nota', 'Confirmar nota'], ['Confirmar nota', '¿Nota confirmada?'],
  [task.save, 'HubSpot · crear revisión humana'], ['HubSpot · crear revisión humana', 'Confirmar tarea'], ['Confirmar tarea', '¿Tarea confirmada?'],
  [mail.save, 'Resend · tarjeta interna'], ['Resend · tarjeta interna', 'Confirmar aceptación del correo'], ['Confirmar aceptación del correo', '¿Correo aceptado?'],
  [complete.save, 'Recorrido completado'], ['Recorrido completado', 'Resultado operativo'], ['Resultado operativo', '¿Mostrar resultado del formulario?'],
]) link(a, b);
const workflow = { id: 'aramis-leadops-integrated', name: 'Aramis LeadOps — recorrido conectado (demo local)', active: false,
  nodes, connections, settings: { executionOrder: 'v1' }, pinData: {}, tags: [] };
await writeFile(new URL('../n8n/leadops-integrated.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
