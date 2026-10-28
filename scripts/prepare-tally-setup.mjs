import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { tallyFormBlueprint } from '../src/tally-form.mjs';
import { TALLY_VERSION } from '../src/tally.mjs';

// Creates a draft once, in the intended empty account. No key is read or exported.
const root = new URL('../', import.meta.url);
const blueprintPath = new URL('.local/tally-blueprint.json', root);
let blueprint;
try { blueprint = JSON.parse(await readFile(blueprintPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; blueprint = tallyFormBlueprint(); await writeFile(blueprintPath, JSON.stringify(blueprint, null, 2)); }
const db = new DatabaseSync(fileURLToPath(new URL('.local/n8n/database.sqlite', root)), { readOnly: true });
let credential;
try {
  const matches = db.prepare('SELECT id,name FROM credentials_entity WHERE type=? AND name=?').all('httpBearerAuth', 'Tally — LeadOps');
  if (matches.length !== 1) throw Error('Save the separate Tally — LeadOps credential in n8n first');
  credential = { id: matches[0].id, name: matches[0].name };
} finally { db.close(); }
const http = (id, name, method, url, position, body) => ({ id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position,
  credentials: { httpBearerAuth: credential }, parameters: { method, url, authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'tally-version', value: TALLY_VERSION }] },
    ...(body ? { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: JSON.stringify(body) } : {}),
    options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } } });
const nodes = [
  { id: 'start', name: 'Inicio manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
  http('list', 'Verificar cuenta vacía', 'GET', 'https://api.tally.so/forms?page=1&limit=10', [240, 0]),
  { id: 'guard', name: 'Evitar creación repetida', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 0], parameters: { jsCode:
    `const r=$input.first().json;
if(r.statusCode!==200 || !Array.isArray(r.body?.items) || r.body.items.length || r.body.hasMore || r.body.total!==0) throw Error('tally_account_not_empty_or_unavailable_review_before_creation');
return [{json:{ready:true}}];` } },
  http('create', 'Crear borrador Aramis', 'POST', 'https://api.tally.so/forms', [720, 0], blueprint.request),
  { id: 'verify', name: 'Confirmar borrador', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, 0], parameters: { jsCode:
    `const r=$input.first().json;
if(r.statusCode!==201 || r.body?.status!=='DRAFT' || !/^[A-Za-z0-9_-]{3,80}$/.test(r.body.id||'')) throw Error('draft_creation_uncertain_do_not_repeat');
return [{json:{formId:r.body.id,status:r.body.status}}];` } },
  http('questions', 'Leer preguntas del borrador', 'GET', '={{ "https://api.tally.so/forms/" + $json.formId + "/questions" }}', [1200, 0]),
];
const connections = {};
for (let i = 0; i < nodes.length - 1; i++) connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
const workflow = { id: 'aramis-tally-draft-setup', name: 'Aramis LeadOps — crear borrador Tally (una vez)', active: false, nodes, connections,
  settings: { executionOrder: 'v1' }, pinData: {}, tags: [] };
const directory = new URL('.local/n8n/leadops-verification/', root);
await mkdir(directory, { recursive: true });
await writeFile(new URL('tally-setup-ready.json', directory), JSON.stringify(workflow, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, createsDraftOnly: true, blocksIfAnyFormExists: true, credentialValuesRead: false }));
