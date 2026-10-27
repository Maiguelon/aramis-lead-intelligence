import { writeFile } from 'node:fs/promises';
import { operatingReport, renderOperatingReport } from '../src/operating-report.mjs';

const nodes = [
  { id: 'report-trigger', name: 'Abrir reporte', type: 'n8n-nodes-base.webhook', typeVersion: 2.1,
    position: [0, 0], webhookId: '7ee4d41d-3473-478e-821d-84f4dff2da0d', parameters: {
      httpMethod: 'GET', path: 'aramis-leadops-report', responseMode: 'responseNode', options: {} } },
  { id: 'report-config', name: 'Configuración de lectura', type: 'n8n-nodes-base.set', typeVersion: 3.4,
    position: [250, 0], parameters: { assignments: { assignments: [
      { id: 'report-table', name: 'tableId', value: '', type: 'string' },
      { id: 'report-portal', name: 'portalId', value: '', type: 'string' },
    ] }, options: {} } },
  { id: 'report-rows', name: 'Leer eventos', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1,
    alwaysOutputData: true, position: [500, 0], parameters: { resource: 'row', operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: '={{ $json.tableId }}' }, returnAll: true,
      matchType: 'allConditions', filters: { conditions: [] } } },
  { id: 'report-render', name: 'Preparar vista operativa', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [750, 0], parameters: { mode: 'runOnceForAllItems', jsCode: `const reportFor = ${operatingReport.toString()};
const render = ${renderOperatingReport.toString()};
const rows = $input.all().map(item => item.json).filter(row => row.event_key);
return [{ json: { html: render(reportFor(rows), rows, $('Configuración de lectura').first().json.portalId) } }];` } },
  { id: 'report-response', name: 'Mostrar reporte', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4,
    position: [1000, 0], parameters: { respondWith: 'text', responseBody: '={{ $json.html }}', options: {
      responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } } } },
];
const connections = Object.fromEntries(nodes.slice(0, -1).map((node, index) => [node.name, {
  main: [[{ node: nodes[index + 1].name, type: 'main', index: 0 }]],
}]));
await writeFile(new URL('../n8n/leadops-operating-report.json', import.meta.url), JSON.stringify({
  id: 'aramis-leadops-report', name: 'Aramis LeadOps — reporte operativo (solo lectura)',
  active: false, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
}, null, 2) + '\n');
