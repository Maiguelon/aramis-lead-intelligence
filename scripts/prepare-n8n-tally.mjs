import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { LEDGER_COLUMNS, LEDGER_NAME } from '../src/native-ledger.mjs';
import { mapTallySubmission } from '../src/tally.mjs';
import { resendRequest } from '../src/resend.mjs';

const root = new URL('../', import.meta.url);
const directory = new URL('.local/n8n/leadops-verification/', root);
const workflow = JSON.parse(await readFile(new URL('n8n/leadops-tally.json', root), 'utf8'));
const operations = JSON.parse(await readFile(new URL('.local/leadops-config.json', root), 'utf8'));
const mapping = JSON.parse(await readFile(new URL('.local/tally-config.json', root), 'utf8'));
if (Object.keys(operations).some(key => !['portalId', 'ownerId', 'from', 'to', 'model'].includes(key))
  || Object.keys(mapping).some(key => !['formId', 'questions', 'consentAnswer', 'noticeVersion', 'acceptFrom'].includes(key))) throw Error('Unexpected configuration; never put keys in these files');
if (mapTallySubmission(null, mapping, new Date().toISOString()).reason !== 'tally_source_mismatch') throw Error('Tally mapping requires review');
if (![operations.portalId, operations.ownerId].every(value => /^\d+$/.test(String(value)))) throw Error('Invalid CRM configuration');
resendRequest({ deliveryKey: `leadops-review/${'a'.repeat(64)}`, subject: 'Configuration check', html: '<p>Check</p>', text: 'Check' }, operations);
const mode = process.argv.includes('--pilot') ? 'pilot' : 'inspect';
const db = new DatabaseSync(fileURLToPath(new URL('.local/n8n/database.sqlite', root)), { readOnly: true });
try {
  const saved = db.prepare('SELECT active,nodes,connections FROM workflow_entity WHERE id=?').get(workflow.id);
  if (saved) {
    let previous;
    try { previous = JSON.parse(await readFile(new URL('tally-ready.json', directory), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; previous = workflow; }
    if (saved.active || !isDeepStrictEqual(JSON.parse(saved.nodes), previous.nodes)
      || !isDeepStrictEqual(JSON.parse(saved.connections), previous.connections)) throw Error('Deactivate and preserve saved graph changes before rebuilding');
    await writeFile(new URL(`tally-before-${Date.now()}.json`, directory), JSON.stringify(saved));
  }
  const credential = (type, name) => {
    const matches = name ? db.prepare('SELECT id,name FROM credentials_entity WHERE type=? AND name=?').all(type, name)
      : db.prepare('SELECT id,name FROM credentials_entity WHERE type=?').all(type);
    if (matches.length !== 1) throw Error('Provider credential selection requires review');
    return { id: matches[0].id, name: matches[0].name };
  };
  const bindings = { crm: credential('httpBearerAuth', 'Bearer Auth account'), ai: credential('openAiApi'),
    mail: credential('httpBearerAuth', 'Resend — LeadOps'), tally: credential('httpBearerAuth', 'Tally — LeadOps') };
  if (new Set(Object.values(bindings).map(value => value.id)).size !== 4) throw Error('Separate provider credentials required');
  const tables = db.prepare('SELECT id FROM data_table WHERE name=?').all(LEDGER_NAME);
  if (tables.length !== 1) throw Error('Intended event table missing or ambiguous');
  const tableId = tables[0].id;
  const columns = db.prepare('SELECT name,type FROM data_table_column WHERE dataTableId=?').all(tableId);
  if (columns.length !== LEDGER_COLUMNS.length || !LEDGER_COLUMNS.every(column => columns.some(value => value.name === column.name && value.type === column.type))) throw Error('Event table schema requires review');
  for (const node of workflow.nodes) {
    if (node.type === 'n8n-nodes-base.httpRequest') {
      const provider = node.id === 'tally-fetch' ? 'tally' : node.id === 'integrated-mail-http' ? 'mail'
        : ['integrated-research', 'integrated-qualification'].includes(node.id) ? 'ai' : 'crm';
      node.credentials = { [provider === 'ai' ? 'openAiApi' : 'httpBearerAuth']: bindings[provider] };
    }
    if (node.name === 'Configuración local') {
      const values = { enabled: 'true', processingMode: mode, confirm: '', tableId, ...operations, mapping: JSON.stringify(mapping) };
      for (const field of node.parameters.assignments.assignments) field.value = String(values[field.name] || '');
    }
  }
} finally { db.close(); }
await mkdir(directory, { recursive: true });
await writeFile(new URL('tally-ready.json', directory), JSON.stringify(workflow, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, mode, realInquiryWritesEnabled: false, credentialValuesRead: false }));
