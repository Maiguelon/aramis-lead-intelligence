import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { LEDGER_NAME } from '../src/native-ledger.mjs';
import { operatingReport, renderOperatingReport } from '../src/operating-report.mjs';

const operations = JSON.parse(await readFile(new URL('../.local/leadops-config.json', import.meta.url), 'utf8'));
const db = new DatabaseSync(new URL('../.local/n8n/database.sqlite', import.meta.url), { readOnly: true });
let rows;
try {
  const tables = db.prepare('SELECT id FROM data_table WHERE name=?').all(LEDGER_NAME);
  if (tables.length !== 1 || !/^[A-Za-z0-9]+$/.test(tables[0].id)) throw Error('Select the intended unique event table');
  rows = db.prepare(`SELECT event_key,state,reason,contact_id,note_id,task_id,alert_id,source_form,source_channel,fit,certainty,analysis_mode,attempts,received_at FROM "data_table_user_${tables[0].id}" ORDER BY received_at`).all();
} finally { db.close(); }
const report = operatingReport(rows);
const output = new URL('../.local/reports/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('operating-report.json', output), JSON.stringify(report, null, 2) + '\n');
await writeFile(new URL('operating-report.html', output), renderOperatingReport(report, rows, operations.portalId));
console.log(JSON.stringify(report));
