import { readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { TALLY_VERSION } from '../src/tally.mjs';

// Read-only recovery/verification. Never re-run draft creation to retrieve metadata.
const form = JSON.parse(await readFile(new URL('../.local/tally-created-form.json', import.meta.url), 'utf8'));
if (!/^[A-Za-z0-9_-]{3,80}$/.test(form.formId || '')) throw Error('Intended Tally form required');
const db = new DatabaseSync(new URL('../.local/n8n/database.sqlite', import.meta.url), { readOnly: true });
let credential;
try {
  const matches = db.prepare('SELECT id,name FROM credentials_entity WHERE type=? AND name=?').all('httpBearerAuth', 'Tally — LeadOps');
  if (matches.length !== 1) throw Error('Tally credential selection requires review');
  credential = { id: matches[0].id, name: matches[0].name };
} finally { db.close(); }
const nodes = [{ id: 'start', name: 'Inicio', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} }];
for (const [index, [id, name, suffix]] of [['form', 'Leer formulario', ''], ['questions', 'Leer preguntas', '/questions'],
  ['submissions', 'Leer envíos de prueba', '/submissions?filter=completed&limit=100&page=1']].entries()) {
  nodes.push({ id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [(index + 1) * 240, 0],
    credentials: { httpBearerAuth: credential }, parameters: { method: 'GET', url: `https://api.tally.so/forms/${form.formId}${suffix}`,
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth', sendHeaders: true,
      headerParameters: { parameters: [{ name: 'tally-version', value: TALLY_VERSION }] },
      options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } } });
}
const connections = Object.fromEntries(nodes.slice(0, -1).map((node, index) => [node.name, { main: [[{ node: nodes[index + 1].name, type: 'main', index: 0 }]] }]));
await writeFile(new URL('../.local/n8n/leadops-verification/tally-readback-ready.json', import.meta.url), JSON.stringify({
  id: 'aramis-tally-readback', name: 'Aramis LeadOps — Tally verificación de solo lectura', active: false, nodes, connections,
  settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
}, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, readOnly: true, credentialValuesRead: false }));
