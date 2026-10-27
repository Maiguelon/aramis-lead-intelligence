import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { LEDGER_COLUMNS, LEDGER_NAME } from '../src/native-ledger.mjs';
import { resendRequest } from '../src/resend.mjs';

const root = new URL('../', import.meta.url);
const directory = new URL('.local/n8n/leadops-verification/', root);
const expected = JSON.parse(await readFile(new URL('n8n/leadops-integrated.json', root), 'utf8'));
const operations = JSON.parse(await readFile(new URL('.local/leadops-config.json', root), 'utf8'));
if (Object.keys(operations).some(key => !['portalId', 'ownerId', 'from', 'to', 'model'].includes(key))) throw Error('Unexpected private configuration field; never store tokens here');
if (![operations.portalId, operations.ownerId].every(value => /^\d+$/.test(String(value)))) throw Error('Invalid CRM configuration');
resendRequest({ deliveryKey: `leadops-review/${'a'.repeat(64)}`, subject: 'Configuration check', html: '<p>Check</p>', text: 'Check' }, operations);
const db = new DatabaseSync(fileURLToPath(new URL('.local/n8n/database.sqlite', root)), { readOnly: true });
let prepared, tableId, bindings;
try {
  const row = db.prepare('SELECT id, name, active, nodes, connections, settings, pinData FROM workflow_entity WHERE id=?').get(expected.id);
  prepared = row ? { ...row, nodes: JSON.parse(row.nodes), connections: JSON.parse(row.connections),
    settings: JSON.parse(row.settings || '{}'), pinData: JSON.parse(row.pinData || '{}') } : structuredClone(expected);
  if (row && process.argv.includes('--reviewed-rebuild')) {
    const previous = JSON.parse(await readFile(new URL('integrated-ready.json', directory), 'utf8'));
    if (prepared.active || !isDeepStrictEqual(prepared.nodes, previous.nodes)
      || !isDeepStrictEqual(prepared.connections, previous.connections) || Object.keys(prepared.pinData).length) {
      throw Error('Saved workflow changed since the last prepared export; preserve it for review');
    }
    await mkdir(directory, { recursive: true });
    await writeFile(new URL(`integrated-reviewed-before-${Date.now()}.json`, directory), JSON.stringify(prepared, null, 2) + '\n');
    prepared = structuredClone(expected);
  }
  if (prepared.active || Object.keys(prepared.pinData).length || prepared.nodes.length !== expected.nodes.length
    || !isDeepStrictEqual(prepared.connections, expected.connections)) throw Error('Preserve saved graph; deactivate and review before preparation');
  const normalize = node => {
    const parameters = structuredClone(node.parameters);
    if (node.type === 'n8n-nodes-base.code') parameters.mode ??= 'runOnceForAllItems';
    if (node.type === 'n8n-nodes-base.httpRequest') parameters.contentType ??= 'json';
    if (node.id === 'integrated-config') for (const field of parameters.assignments.assignments) field.value = '';
    return parameters;
  };
  for (const node of prepared.nodes) {
    const original = expected.nodes.find(item => item.id === node.id);
    if (!original || original.name !== node.name || original.type !== node.type || original.typeVersion !== node.typeVersion
      || !isDeepStrictEqual(normalize(original), normalize(node))) throw Error('Preserve saved logic changes');
  }
  const credential = (type, name = null) => {
    const rows = name ? db.prepare('SELECT id,name FROM credentials_entity WHERE type=? AND name=?').all(type, name)
      : db.prepare('SELECT id,name FROM credentials_entity WHERE type=?').all(type);
    if (rows.length !== 1) throw Error('Credential selection requires review');
    return { id: rows[0].id, name: rows[0].name };
  };
  bindings = { crm: credential('httpBearerAuth', 'Bearer Auth account'), ai: credential('openAiApi'),
    mail: credential('httpBearerAuth', 'Resend — LeadOps') };
  if (bindings.crm.id === bindings.mail.id) throw Error('Separate provider credentials required');
  const tables = db.prepare('SELECT id FROM data_table WHERE name=?').all(LEDGER_NAME);
  if (tables.length !== 1) throw Error('Create the unique intended event table first');
  tableId = tables[0].id;
  const columns = db.prepare('SELECT name,type FROM data_table_column WHERE dataTableId=?').all(tableId);
  if (columns.length !== LEDGER_COLUMNS.length || !LEDGER_COLUMNS.every(column => columns.some(item => item.name === column.name && item.type === column.type))) throw Error('Event table schema requires review');
} finally { db.close(); }
await mkdir(directory, { recursive: true });
await writeFile(new URL(`integrated-before-${Date.now()}.json`, directory), JSON.stringify(prepared, null, 2) + '\n');
for (const node of prepared.nodes) {
  if (node.type === 'n8n-nodes-base.httpRequest') {
    const provider = node.id.includes('-mail-http') ? 'mail' : ['integrated-research', 'integrated-qualification'].includes(node.id) ? 'ai' : 'crm';
    node.credentials = { [provider === 'ai' ? 'openAiApi' : 'httpBearerAuth']: bindings[provider] };
  }
  if (node.id === 'integrated-config') {
    const values = { enabled: 'true', confirm: 'YES_RUN_FICTIONAL_LEADOPS', tableId,
      ...operations, model: operations.model || 'gpt-5.4-mini' };
    for (const field of node.parameters.assignments.assignments) field.value = String(values[field.name] || '');
  }
}
prepared.active = false;
await writeFile(new URL('integrated-ready.json', directory), JSON.stringify(prepared, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, fictionalInputsOnly: true, separateProviderCredentialsBound: true, credentialValuesRead: false }));
