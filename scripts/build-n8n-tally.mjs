import { readFile, writeFile } from 'node:fs/promises';
import { nativeTallyCode, TALLY_VERSION } from '../src/tally.mjs';
import { nativeLedgerRecord, LEDGER_COLUMNS } from '../src/native-ledger.mjs';
import { integratedSummary } from '../src/integrated-flow.mjs';
import { nativeReviewCardCode } from '../src/review-card.mjs';
import { resendRequest } from '../src/resend.mjs';

// Reuse the reviewed CRM/AI/mail state machine, replacing only its closed-demo intake.
const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-integrated.json', import.meta.url), 'utf8'));
const removed = new Set(['Entrada demo local', 'Capturar entrada API', 'Formulario demo', 'Leer consentimiento del formulario',
  'Validar consentimiento y demo', '¿Mostrar resultado del formulario?', 'Resultado del formulario', 'Alcance y operación']);
workflow.nodes = workflow.nodes.filter(node => !removed.has(node.name));
for (const name of Object.keys(workflow.connections)) if (removed.has(name)) delete workflow.connections[name];
const add = node => workflow.nodes.push(node);
const link = (a, b) => { workflow.connections[a] = { main: [[{ node: b, type: 'main', index: 0 }]] }; };
const code = (id, name, jsCode, position) => add({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForAllItems', jsCode } });
const gate = (id, name, status, yes, no, position) => {
  add({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position, parameters: {
    conditions: { combinator: 'and', options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id, leftValue: '={{ $json.status }}', rightValue: status, operator: { type: 'string', operation: 'equals' } }] }, options: {} } });
  workflow.connections[name] = { main: [[{ node: yes, type: 'main', index: 0 }], [{ node: no, type: 'main', index: 0 }]] };
};
add({ id: 'tally-schedule', name: 'Consultar cada cinco minutos', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.3,
  position: [-700, -100], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } });
add({ id: 'tally-webhook', name: 'Prueba local del sondeo', type: 'n8n-nodes-base.webhook', typeVersion: 2.1,
  webhookId: 'b50f95bc-cbd0-4da1-9145-dfdb0c081f77', position: [-700, 100], parameters: { httpMethod: 'POST', path: 'aramis-leadops-poll',
    responseMode: 'lastNode', responseData: 'firstEntryJson', options: {} } });
const config = workflow.nodes.find(node => node.name === 'Configuración local');
config.parameters.includeOtherFields = false;
const values = { enabled: 'false', processingMode: 'inspect', confirm: '', tableId: '', portalId: '', ownerId: '', from: '', to: '',
  model: 'gpt-5.4-mini', mapping: '{}' };
config.parameters.assignments.assignments = Object.entries(values).map(([name, value]) => ({ id: `tally-config-${name}`, name, value, type: 'string' }));
code('tally-config-check', 'Comprobar configuración Tally', `const config=$input.first().json;
if(!['webhook','trigger'].includes($mode) || config.enabled!=='true') return [{json:{status:'blocked',reason:'tally_processing_disabled'}}];
let mapping; try {mapping=JSON.parse(config.mapping);} catch {return [{json:{status:'blocked',reason:'tally_mapping_required'}}];}
if(!/^[A-Za-z0-9_-]{3,80}$/.test(mapping.formId||'') || !mapping.acceptFrom || !Number.isFinite(Date.parse(mapping.acceptFrom))) return [{json:{status:'blocked',reason:'tally_mapping_required'}}];
return [{json:{status:'read',mapping}}];`, [-200, 0]);
gate('tally-read-gate', '¿Consultar respuestas?', 'read', 'Tally · recuperar pendientes', 'Resultado operativo', [30, -100]);
add({ id: 'tally-fetch', name: 'Tally · recuperar pendientes', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  position: [250, -300], retryOnFail: true, maxTries: 2, waitBetweenTries: 1500, onError: 'continueRegularOutput', parameters: {
    method: 'GET', url: '={{ "https://api.tally.so/forms/" + $json.mapping.formId + "/submissions" }}',
    authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', sendQuery: true,
    queryParameters: { parameters: [{ name: 'filter', value: 'completed' }, { name: 'limit', value: '100' },
      { name: 'startDate', value: '={{ $json.mapping.acceptFrom }}' }] },
    sendHeaders: true, headerParameters: { parameters: [{ name: 'tally-version', value: TALLY_VERSION }] },
    options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
      pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'qs', name: 'page', value: '={{ $pageCount + 1 }}' }] },
        paginationCompleteWhen: 'other', completeExpression: '={{ $response.statusCode !== 200 || $response.body.hasMore !== true }}',
        limitPagesFetched: true, maxRequests: 10, requestInterval: 750 } } },
  } });
code('tally-pages-check', 'Comprobar respuesta de Tally', `const pages=$input.all().map(item=>item.json);
if(pages.some(page=>page.statusCode!==200 || page.error)) throw Error('tally_read_failed_no_writes');
return [{json:{status:'snapshot',pages}}];`, [480, -300]);
add({ id: 'tally-ledger-all', name: 'Leer registro de eventos', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
  alwaysOutputData: true, position: [710, -300], parameters: { resource: 'row', operation: 'get',
    dataTableId: { __rl: true, mode: 'id', value: '={{ $("Configuración local").first().json.tableId }}' }, returnAll: true } });
code('tally-prepare', 'Preparar consulta Tally', `${nativeTallyCode()}
const config=$('Configuración local').first().json;
const selection=selectTallySubmission($('Comprobar respuesta de Tally').first().json.pages,$input.all().map(i=>i.json),JSON.parse(config.mapping),new Date().toISOString(),config.processingMode);
return [{json:prepareTallyFrame(selection,config,new Date().toISOString(),$mode)}];`, [940, -300]);
gate('tally-rejection-gate', '¿Registrar entrada descartada?', 'record_rejection', 'Preparar rechazo', '¿Entrada aceptada?', [1170, -300]);
code('tally-rejection-record', 'Preparar rechazo', `const record=${nativeLedgerRecord.toString()}; const frame=$input.first().json;
frame.ledgerRow=record(frame); return [{json:frame}];`, [1400, -600]);
const rejection = structuredClone(workflow.nodes.find(node => node.name === 'Persistir · contacto'));
rejection.id = 'tally-rejection-save'; rejection.name = 'Guardar rechazo sin datos personales'; rejection.position = [1630, -600];
add(rejection);
code('tally-rejection-result', 'Rechazo registrado', `const frame=$('Preparar rechazo').first().json;
return [{json:{status:frame.ledgerState,reason:frame.reason,eventKey:frame.intake.fingerprint,effects:false}}];`, [1860, -600]);
workflow.nodes.find(node => node.name === 'Resolver duplicado o entrada nueva').parameters.jsCode = workflow.nodes.find(node => node.name === 'Resolver duplicado o entrada nueva').parameters.jsCode
  .replaceAll('Validar consentimiento y demo', 'Preparar consulta Tally');
workflow.nodes.find(node => node.name === 'Estado · contacto').parameters.jsCode = workflow.nodes.find(node => node.name === 'Estado · contacto').parameters.jsCode
  .replace("propertyName: 'email', value: frame.intake.email", "propertyName: frame.intake.email ? 'email' : 'phone', value: frame.intake.email || frame.intake.phone");
workflow.nodes.find(node => node.name === 'Estado · correo').parameters.jsCode = `const record=${nativeLedgerRecord.toString()};
${nativeReviewCardCode()}
const mailRequest=${resendRequest.toString()}; const frame=$input.first().json;
const card=renderReviewCard({...frame,portalId:frame.config.portalId,contactId:frame.ids.contact});
if(frame.fictional) {card.subject='[DEMO TALLY] '+card.subject.slice(0,165);card.text='PRUEBA FICTICIA. '+card.text;card.html='<p>PRUEBA FICTICIA desde Tally.</p>'+card.html;}
frame.request=mailRequest(card,{from:frame.config.from,to:frame.config.to});frame.ledgerRow=record(frame);return [{json:frame}];`;
workflow.nodes.find(node => node.name === 'Resultado operativo').parameters.jsCode = `const summarize=${integratedSummary.toString()};const frame=$input.first().json;
return [{json:{...summarize(frame),eventKey:frame.intake?.fingerprint||frame.eventKey||null,fictional:frame.fictional===true}}];`;
for (const [a, b] of [['Consultar cada cinco minutos', 'Configuración local'], ['Prueba local del sondeo', 'Configuración local'],
  ['Configuración local', 'Comprobar configuración Tally'], ['Comprobar configuración Tally', '¿Consultar respuestas?'],
  ['Tally · recuperar pendientes', 'Comprobar respuesta de Tally'], ['Comprobar respuesta de Tally', 'Leer registro de eventos'],
  ['Leer registro de eventos', 'Preparar consulta Tally'], ['Preparar consulta Tally', '¿Registrar entrada descartada?'],
  ['Preparar rechazo', rejection.name], [rejection.name, 'Rechazo registrado'], ['Rechazo registrado', 'Resultado para API'],
  ['Resultado operativo', 'Resultado para API']]) link(a, b);
add({ id: 'tally-guide', name: 'Guía Tally', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-700, -600],
  parameters: { width: 800, height: 360, content: '## Captura online → proceso local\nSondeo cada cinco minutos, un envío por ejecución, hasta 10 páginas de 100 respuestas. Si el límite deja páginas pendientes se bloquea visiblemente.\n\nExportación deshabilitada y sin credenciales. inspect: solo lectura. pilot: solo email @example.com y mensaje PRUEBA FICTICIA:. live: requiere configuración local y confirmación explícita.\n\nConcurrencia de producción = 1. Modo manual/CLI bloqueado. Una escritura incierta exige conciliación; no se repite. No contacta prospectos, no crea campañas ni acuerdos.\n\nLas respuestas se guardan en Tally con la PC apagada. Usar POST local /webhook/aramis-leadops-poll para una comprobación sin esperar al horario.' } });
workflow.id = 'aramis-leadops-tally'; workflow.name = 'Aramis LeadOps — Tally → revisión humana'; workflow.active = false;
await writeFile(new URL('../n8n/leadops-tally.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
