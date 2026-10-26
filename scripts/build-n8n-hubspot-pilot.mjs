import { readFile, writeFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';
import { hubspotRequest } from '../src/hubspot-contract.mjs';
import { prepareCrmPilot, advanceCrmPilot, summarizeCrmPilot } from '../src/hubspot-pilot.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/hubspot-pilot.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw, { receivedAt: '2026-10-26T00:00:00Z' }).intake;
const research = researchStub(intake);
const bundle = { fictional: true, intake, research, qualification: qualifyStub(intake, research) };
const code = (id, name, jsCode, x, y) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode } });
const gate = (id, name, expected, x, y) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [x, y],
  parameters: { conditions: { combinator: 'and', options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: `${id}-condition`, leftValue: '={{ $json.status }}', rightValue: expected,
      operator: { type: 'string', operation: 'equals' } }] }, options: {} } });
const http = (id, name, x, y) => ({ id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  position: [x, y], retryOnFail: false, onError: 'continueRegularOutput', parameters: {
    method: 'POST', url: '={{ "https://api.hubapi.com" + $json.request.path }}',
    authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ $json.request.body }}',
    options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
  } });
const contractCode = `const requestFor = ${hubspotRequest.toString()};\n`;
const transition = (id, name, previous, x, y) => code(id, name,
  `${contractCode}const advance = ${advanceCrmPilot.toString()};\nreturn [{ json: advance($(${JSON.stringify(previous)}).first().json, $input.first().json, requestFor) }];`, x, y);

const nodes = [
  { id: 'pilot-start', name: 'Ejecutar prueba CRM', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [120, 300], parameters: {} },
  { id: 'pilot-config', name: 'Modo y portal', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [340, 300], parameters: {
    assignments: { assignments: [
      { id: 'pilot-mode', name: 'mode', value: 'preview', type: 'string' },
      { id: 'pilot-portal', name: 'portalId', value: '', type: 'string' },
      { id: 'pilot-owner', name: 'ownerId', value: '', type: 'string' },
      { id: 'pilot-confirm', name: 'confirmFictionalWrites', value: '', type: 'string' },
    ] }, options: {},
  } },
  code('pilot-prepare', 'Preparar prueba ficticia', `${contractCode}const prepare = ${prepareCrmPilot.toString()};\nreturn [{ json: prepare($input.first().json, ${JSON.stringify(bundle)}, new Date().toISOString(), requestFor) }];`, 570, 300),
  gate('pilot-search-gate', '¿Consultar CRM?', 'awaiting_search', 800, 300),
  http('pilot-search', 'HubSpot · buscar contacto', 1030, 200),
  transition('pilot-search-result', 'Evaluar búsqueda', 'Preparar prueba ficticia', 1260, 200),
  gate('pilot-contact-gate', '¿Crear contacto ficticio?', 'awaiting_contact', 1490, 200),
  http('pilot-contact', 'HubSpot · crear contacto', 1720, 100),
  transition('pilot-contact-result', 'Verificar contacto creado', 'Evaluar búsqueda', 1950, 100),
  gate('pilot-note-gate', '¿Crear nota?', 'awaiting_note', 2180, 100),
  http('pilot-note', 'HubSpot · crear nota', 2410, 0),
  transition('pilot-note-result', 'Verificar nota creada', 'Verificar contacto creado', 2640, 0),
  gate('pilot-task-gate', '¿Crear tarea?', 'awaiting_task', 2870, 0),
  http('pilot-task', 'HubSpot · crear tarea', 3100, -100),
  transition('pilot-task-result', 'Verificar tarea creada', 'Verificar nota creada', 3330, -100),
  code('pilot-summary', 'Resumen de prueba', `const summarize = ${summarizeCrmPilot.toString()};\nreturn $input.all().map(item => ({ json: summarize(item.json) }));`, 3560, 450),
  { id: 'pilot-guide', name: 'Guía del piloto', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [300, -100], parameters: {
    width: 650, height: 280, content: '## Prueba manual del contrato CRM\n**preview**: muestra el contacto y las actividades previstas; no usa credenciales ni llama a HubSpot.\n\n**check**: busca únicamente el email ficticio. Seleccionar Bearer Auth en el nodo de búsqueda.\n\n**write**: requiere portalId y confirmFictionalWrites=YES_CREATE_DEMO_RECORDS. Seleccionar la credencial en los cuatro nodos HTTP. Crea un contacto, una nota y una tarea solo si el contacto no existe.\n\nAnálisis simulado. Sin correos ni agente IA real. Ante una escritura incierta, revisar el CRM antes de cualquier repetición. No publicar; no es el flujo de producción.' } },
];

const connection = node => [{ node, type: 'main', index: 0 }];
const connections = {};
const link = (from, to) => { connections[from] = { main: [connection(to)] }; };
link('Ejecutar prueba CRM', 'Modo y portal');
link('Modo y portal', 'Preparar prueba ficticia');
link('Preparar prueba ficticia', '¿Consultar CRM?');
for (const [condition, yes] of [
  ['¿Consultar CRM?', 'HubSpot · buscar contacto'], ['¿Crear contacto ficticio?', 'HubSpot · crear contacto'],
  ['¿Crear nota?', 'HubSpot · crear nota'], ['¿Crear tarea?', 'HubSpot · crear tarea'],
]) connections[condition] = { main: [connection(yes), connection('Resumen de prueba')] };
link('HubSpot · buscar contacto', 'Evaluar búsqueda');
link('Evaluar búsqueda', '¿Crear contacto ficticio?');
link('HubSpot · crear contacto', 'Verificar contacto creado');
link('Verificar contacto creado', '¿Crear nota?');
link('HubSpot · crear nota', 'Verificar nota creada');
link('Verificar nota creada', '¿Crear tarea?');
link('HubSpot · crear tarea', 'Verificar tarea creada');
link('Verificar tarea creada', 'Resumen de prueba');

const workflow = { id: 'aramis-hubspot-crm-pilot', name: 'Aramis LeadOps — piloto CRM ficticio (preview por defecto)',
  active: false, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {}, tags: [] };
await writeFile(new URL('../n8n/leadops-hubspot-pilot.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
