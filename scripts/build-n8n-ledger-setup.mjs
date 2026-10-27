import { writeFile } from 'node:fs/promises';
import { LEDGER_COLUMNS, LEDGER_NAME } from '../src/native-ledger.mjs';

const workflow = { id: 'aramis-leadops-ledger-setup', name: 'Aramis LeadOps — preparar registro de eventos', active: false,
  nodes: [
    { id: 'ledger-setup-start', name: 'Preparar registro', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [100, 300], parameters: {} },
    { id: 'ledger-setup-table', name: 'Crear o reutilizar tabla técnica', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [400, 300], parameters: {
      resource: 'table', operation: 'create', tableName: LEDGER_NAME, columns: { column: LEDGER_COLUMNS }, options: { createIfNotExists: true } } },
    { id: 'ledger-setup-summary', name: 'Verificar esquema del registro', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, 300], parameters: { mode: 'runOnceForAllItems',
      jsCode: `const expected = ${JSON.stringify(LEDGER_COLUMNS)};\nconst table = $input.first().json;\nconst actual = table.columns || [];\nconst matches = actual.length === expected.length && expected.every(column => actual.some(item => item.name === column.name && item.type === column.type));\nreturn [{ json: { status: matches ? 'ready' : 'schema_requires_review', tableId: table.id, tableName: table.name, columnsMatched: matches, columnCount: actual.length, executionMode: $mode, crmWritesPerformed: false, emailSent: false } }];` } },
  ], connections: {
    'Preparar registro': { main: [[{ node: 'Crear o reutilizar tabla técnica', type: 'main', index: 0 }]] },
    'Crear o reutilizar tabla técnica': { main: [[{ node: 'Verificar esquema del registro', type: 'main', index: 0 }]] },
  }, settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
};
await writeFile(new URL('../n8n/leadops-ledger-setup.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
