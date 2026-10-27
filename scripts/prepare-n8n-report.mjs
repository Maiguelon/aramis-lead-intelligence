import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { LEDGER_NAME } from '../src/native-ledger.mjs';

const root = new URL('../', import.meta.url);
const flow = JSON.parse(await readFile(new URL('n8n/leadops-operating-report.json', root), 'utf8'));
const operations = JSON.parse(await readFile(new URL('.local/leadops-config.json', root), 'utf8'));
const db = new DatabaseSync(new URL('.local/n8n/database.sqlite', root), { readOnly: true });
let tableId;
try {
  const existing = db.prepare('SELECT id,active,nodes,connections FROM workflow_entity WHERE id=?').get(flow.id);
  if (existing) {
    if (existing.active || !process.argv.includes('--reviewed-rebuild')) throw Error('Deactivate and review existing report before replacement');
    const previous = JSON.parse(await readFile(new URL('.local/n8n/leadops-verification/report-ready.json', root), 'utf8'));
    if (!isDeepStrictEqual(JSON.parse(existing.nodes), previous.nodes)
      || !isDeepStrictEqual(JSON.parse(existing.connections), previous.connections)) throw Error('Preserve local report changes');
    await writeFile(new URL(`.local/n8n/leadops-verification/report-before-${Date.now()}.json`, root), JSON.stringify(previous, null, 2));
  }
  const tables = db.prepare('SELECT id FROM data_table WHERE name=?').all(LEDGER_NAME);
  if (tables.length !== 1) throw Error('Unique event table required');
  tableId = tables[0].id;
} finally { db.close(); }
if (!/^\d+$/.test(String(operations.portalId))) throw Error('Invalid CRM portal ID');
for (const field of flow.nodes.find(node => node.id === 'report-config').parameters.assignments.assignments) {
  field.value = String(field.name === 'tableId' ? tableId : operations.portalId);
}
await writeFile(new URL('.local/n8n/leadops-verification/report-ready.json', root), JSON.stringify(flow, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, readOnly: true, credentialsRequired: false }));
