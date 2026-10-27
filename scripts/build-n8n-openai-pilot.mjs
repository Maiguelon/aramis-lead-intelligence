import { readFile, writeFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { nativeAgentCode } from '../src/openai-agents.mjs';
import { prepareAiPilot, advanceAiPilot, summarizeAiPilot } from '../src/openai-pilot.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/ai-pilot.json', import.meta.url), 'utf8'));
const normalized = input => normalizeIntake(input, { receivedAt: '2026-10-27T00:00:00Z' }).intake;
const bundles = {
  basic: { fictional: true, intake: normalized(raw) },
  public_company: { fictional: true, intake: normalized({ ...raw, submission_id: 'pilot-ai-public-company-001',
    empresa: 'Aramis Agency', empresa_web: 'https://aramis.agency/' }) },
};
const code = (id, name, jsCode, x, y) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode } });
const gate = (id, name, expected, x, y) => ({ id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2,
  position: [x, y], parameters: { conditions: { combinator: 'and',
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: `${id}-condition`, leftValue: '={{ $json.status }}', rightValue: expected,
      operator: { type: 'string', operation: 'equals' } }] }, options: {} } });
const http = (id, name, x, y) => ({ id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  position: [x, y], retryOnFail: false, onError: 'continueRegularOutput', parameters: {
    method: 'POST', url: 'https://api.openai.com/v1/responses', authentication: 'predefinedCredentialType',
    nodeCredentialType: 'openAiApi', sendBody: true, contentType: 'json', specifyBody: 'json',
    jsonBody: '={{ $json.request.body }}', options: { timeout: 90000,
      response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
  } });
const transition = (id, name, previous, x, y) => code(id, name,
  `${nativeAgentCode()}\nconst advance = ${advanceAiPilot.toString()};\nreturn [{ json: advance($(${JSON.stringify(previous)}).first().json, $input.first().json, openAiRequest, decodeAgentResponse) }];`, x, y);

const nodes = [
  { id: 'ai-pilot-start', name: 'Ejecutar prueba IA', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
    position: [100, 300], parameters: {} },
  { id: 'ai-pilot-config', name: 'Modo y modelos IA', type: 'n8n-nodes-base.set', typeVersion: 3.4,
    position: [330, 300], parameters: { assignments: { assignments: [
      { id: 'ai-mode', name: 'mode', value: 'preview', type: 'string' },
      { id: 'ai-fixture', name: 'fixture', value: 'basic', type: 'string' },
      { id: 'ai-research-model', name: 'researchModel', value: 'gpt-5.4-mini', type: 'string' },
      { id: 'ai-qualification-model', name: 'qualificationModel', value: 'gpt-5.4-mini', type: 'string' },
      { id: 'ai-confirm', name: 'confirmPaidDemo', value: '', type: 'string' },
    ] }, options: {} } },
  code('ai-pilot-prepare', 'Preparar prueba IA',
    `${nativeAgentCode()}\nconst prepare = ${prepareAiPilot.toString()};\nreturn [{ json: prepare($input.first().json, ${JSON.stringify(bundles)}, new Date().toISOString(), openAiRequest) }];`, 570, 300),
  gate('ai-research-gate', '¿Ejecutar resumen e investigación?', 'awaiting_research', 810, 300),
  http('ai-research-request', 'Agente 1 · resumen e investigación', 1050, 200),
  transition('ai-research-check', 'Validar investigación y fuentes', 'Preparar prueba IA', 1300, 200),
  gate('ai-qualification-gate', '¿Ejecutar calificación?', 'awaiting_qualification', 1550, 200),
  http('ai-qualification-request', 'Agente 2 · encaje y certeza', 1800, 100),
  transition('ai-qualification-check', 'Validar calificación humana', 'Validar investigación y fuentes', 2050, 100),
  code('ai-pilot-summary', 'Resumen de prueba IA',
    `const summarize = ${summarizeAiPilot.toString()};\nreturn $input.all().map(item => ({ json: summarize(item.json) }));`, 2300, 450),
  { id: 'ai-pilot-guide', name: 'Guía de prueba IA', type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [300, -100], parameters: { width: 660, height: 300, content:
      '## Dos análisis con datos ficticios\n**preview**: muestra el contexto que saldría hacia OpenAI; no llama a la API.\n\n**live**: requiere confirmPaidDemo=YES_RUN_AI_DEMO y la credencial OpenAI en ambos nodos HTTP. Consume tokens de la API.\n\n**basic**: consulta ficticia sin empresa, sin búsqueda web.\n**public_company**: misma consulta ficticia, usando información pública de Aramis Agency; solicita un máximo de tres llamadas de búsqueda/apertura de páginas.\n\nEncaje y certeza son recomendaciones. Revisión humana siempre obligatoria. Sin HubSpot ni envío de correos. Sin reintentos automáticos; una repetición puede generar nuevos cargos. No publicar.' } },
];
const target = node => [{ node, type: 'main', index: 0 }];
const connections = {};
const link = (from, to) => { connections[from] = { main: [target(to)] }; };
link('Ejecutar prueba IA', 'Modo y modelos IA');
link('Modo y modelos IA', 'Preparar prueba IA');
link('Preparar prueba IA', '¿Ejecutar resumen e investigación?');
connections['¿Ejecutar resumen e investigación?'] = { main: [target('Agente 1 · resumen e investigación'), target('Resumen de prueba IA')] };
link('Agente 1 · resumen e investigación', 'Validar investigación y fuentes');
link('Validar investigación y fuentes', '¿Ejecutar calificación?');
connections['¿Ejecutar calificación?'] = { main: [target('Agente 2 · encaje y certeza'), target('Resumen de prueba IA')] };
link('Agente 2 · encaje y certeza', 'Validar calificación humana');
link('Validar calificación humana', 'Resumen de prueba IA');
const workflow = { id: 'aramis-openai-pilot', name: 'Aramis LeadOps — dos agentes IA (preview por defecto)',
  active: false, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {}, tags: [] };
await writeFile(new URL('../n8n/leadops-openai-pilot.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
