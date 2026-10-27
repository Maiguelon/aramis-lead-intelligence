import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'preview';
if (!['preview', 'send'].includes(mode)) throw Error('Invalid mail pilot mode');
if (mode === 'send' && !args.includes('--confirm-internal-demo')) throw Error('Sending requires --confirm-internal-demo');
const root = new URL('../', import.meta.url);
const directory = new URL('.local/n8n/leadops-verification/', root);
const expected = JSON.parse(await readFile(new URL('n8n/leadops-mail-pilot.json', root), 'utf8'));
const operations = JSON.parse(await readFile(new URL('.local/mail-pilot-config.json', root), 'utf8'));
if (operations.key || operations.token || operations.apiKey) throw Error('Mail operations config must not contain credentials');
const db = new DatabaseSync(fileURLToPath(new URL('.local/n8n/database.sqlite', root)), { readOnly: true });
let prepared;
let credential;
try {
  const row = db.prepare('SELECT id, name, active, nodes, connections, settings, pinData FROM workflow_entity WHERE id = ?').get(expected.id);
  prepared = row ? { ...row, nodes: JSON.parse(row.nodes), connections: JSON.parse(row.connections),
    settings: JSON.parse(row.settings || '{}'), pinData: JSON.parse(row.pinData || '{}') } : structuredClone(expected);
  if (prepared.active || Object.keys(prepared.pinData).length || prepared.nodes.length !== expected.nodes.length
    || !isDeepStrictEqual(prepared.connections, expected.connections)) throw Error('Saved mail graph requires review');
  const normalize = node => {
    const parameters = structuredClone(node.parameters);
    if (node.type === 'n8n-nodes-base.code') parameters.mode ??= 'runOnceForAllItems';
    if (node.type === 'n8n-nodes-base.httpRequest') parameters.contentType ??= 'json';
    if (node.id === 'mail-config') for (const field of parameters.assignments.assignments) field.value = '';
    return parameters;
  };
  for (const node of prepared.nodes) {
    const source = expected.nodes.find(item => item.id === node.id);
    if (!source || source.name !== node.name || source.type !== node.type || source.typeVersion !== node.typeVersion
      || !isDeepStrictEqual(normalize(source), normalize(node))) throw Error('Preserve local mail workflow edits');
  }
  const credentials = db.prepare('SELECT id, name FROM credentials_entity WHERE type = ? AND name = ?').all('httpBearerAuth', 'Resend — LeadOps');
  if (credentials.length !== 1) throw Error('Save the separate Resend — LeadOps credential first; do not reuse the HubSpot Bearer');
  credential = { id: credentials[0].id, name: credentials[0].name };
} finally { db.close(); }
await mkdir(directory, { recursive: true });
await writeFile(new URL(`mail-before-${Date.now()}.json`, directory), JSON.stringify(prepared, null, 2) + '\n');
for (const node of prepared.nodes) {
  if (node.type === 'n8n-nodes-base.httpRequest') node.credentials = { httpBearerAuth: credential };
  if (node.id === 'mail-config') {
    const values = { mode, from: operations.from, to: operations.to,
      portalId: operations.portalId, contactId: operations.contactId,
      confirmInternalSend: mode === 'send' ? 'YES_SEND_INTERNAL_DEMO' : '' };
    for (const field of node.parameters.assignments.assignments) field.value = String(values[field.name] || '');
  }
}
prepared.active = false;
await writeFile(new URL('mail-pilot-ready.json', directory), JSON.stringify(prepared, null, 2) + '\n');
console.log(JSON.stringify({ mode, separateResendCredentialBound: true, credentialValuesRead: false }));
