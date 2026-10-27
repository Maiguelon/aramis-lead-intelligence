import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const mode = option('--mode') || 'preview';
const fixture = option('--fixture') || 'basic';
const researchModel = option('--research-model') || 'gpt-5.4-mini';
const qualificationModel = option('--qualification-model') || 'gpt-5.4-mini';
if (!['preview', 'live'].includes(mode) || !['basic', 'public_company'].includes(fixture)) throw Error('Invalid AI pilot mode or fixture');
if (![researchModel, qualificationModel].every(model => /^[A-Za-z0-9_.:-]{1,120}$/.test(model))) throw Error('Invalid model identifier');
if (mode === 'live' && !args.includes('--confirm-paid-demo')) throw Error('Live AI calls require --confirm-paid-demo');

const root = new URL('../', import.meta.url);
const directory = new URL('.local/n8n/leadops-verification/', root);
const expected = JSON.parse(await readFile(new URL('n8n/leadops-openai-pilot.json', root), 'utf8'));
const db = new DatabaseSync(fileURLToPath(new URL('.local/n8n/database.sqlite', root)), { readOnly: true });
let prepared;
let credential;
try {
  const row = db.prepare('SELECT id, name, active, nodes, connections, settings, pinData FROM workflow_entity WHERE id = ?').get(expected.id);
  prepared = row ? { ...row, nodes: JSON.parse(row.nodes), connections: JSON.parse(row.connections),
    settings: JSON.parse(row.settings || '{}'), pinData: JSON.parse(row.pinData || '{}') } : structuredClone(expected);
  if (prepared.active || Object.keys(prepared.pinData).length || prepared.nodes.length !== expected.nodes.length
    || !isDeepStrictEqual(prepared.connections, expected.connections)) throw Error('Saved AI graph requires review');
  const normalize = node => {
    const parameters = structuredClone(node.parameters);
    if (node.type === 'n8n-nodes-base.code') parameters.mode ??= 'runOnceForAllItems';
    if (node.type === 'n8n-nodes-base.httpRequest') parameters.contentType ??= 'json';
    if (node.id === 'ai-pilot-config') {
      for (const field of parameters.assignments.assignments) field.value = '';
    }
    return parameters;
  };
  for (const node of prepared.nodes) {
    const source = expected.nodes.find(item => item.id === node.id);
    if (!source || source.type !== node.type || source.typeVersion !== node.typeVersion || source.name !== node.name
      || !isDeepStrictEqual(normalize(source), normalize(node))) throw Error('Saved AI logic changed; preserve local edits');
  }
  const credentials = db.prepare('SELECT id, name, type FROM credentials_entity WHERE type = ?').all('openAiApi');
  if (credentials.length !== 1) throw Error('Select the intended OpenAI credential in n8n first');
  credential = { id: credentials[0].id, name: credentials[0].name };
} finally { db.close(); }
await mkdir(directory, { recursive: true });
await writeFile(new URL(`ai-pilot-before-${Date.now()}.json`, directory), JSON.stringify(prepared, null, 2) + '\n');
for (const node of prepared.nodes) {
  if (node.type === 'n8n-nodes-base.httpRequest') node.credentials = { openAiApi: credential };
  if (node.id === 'ai-pilot-config') {
    const values = { mode, fixture, researchModel, qualificationModel,
      confirmPaidDemo: mode === 'live' ? 'YES_RUN_AI_DEMO' : '' };
    for (const field of node.parameters.assignments.assignments) field.value = values[field.name];
  }
}
prepared.active = false;
await writeFile(new URL('ai-pilot-ready.json', directory), JSON.stringify(prepared, null, 2) + '\n');
console.log(JSON.stringify({ mode, fixture, credentialReferenceBound: true, credentialValuesRead: false }));
