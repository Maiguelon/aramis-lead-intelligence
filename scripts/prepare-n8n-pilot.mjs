import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const mode = option('--mode') || 'preview';
const portalId = option('--portal-id');
const ownerId = option('--owner-id');
if (!['preview', 'check', 'write'].includes(mode)) throw new Error('Invalid pilot mode');
if (portalId && !/^\d+$/.test(portalId)) throw new Error('Invalid portal ID');
if (ownerId && !/^\d+$/.test(ownerId)) throw new Error('Invalid owner ID');
if (mode === 'write' && (!portalId || !args.includes('--confirm-fictitious-writes'))) {
  throw new Error('Write mode requires portal ID and --confirm-fictitious-writes');
}

const root = new URL('../', import.meta.url);
const privateDirectory = new URL('.local/n8n/leadops-verification/', root);
const expected = JSON.parse(await readFile(new URL('n8n/leadops-hubspot-pilot.json', root), 'utf8'));
const db = new DatabaseSync(fileURLToPath(new URL('.local/n8n/database.sqlite', root)), { readOnly: true });
let current;
let credential;
try {
  const row = db.prepare('SELECT id, name, active, nodes, connections, settings, pinData FROM workflow_entity WHERE id = ?').get(expected.id);
  if (!row) throw new Error('Import the public CRM pilot first');
  current = { ...row, nodes: JSON.parse(row.nodes), connections: JSON.parse(row.connections),
    settings: JSON.parse(row.settings || '{}'), pinData: JSON.parse(row.pinData || '{}') };
  if (current.active || Object.keys(current.pinData).length || !isDeepStrictEqual(current.connections, expected.connections)) {
    throw new Error('Pilot is active, pinned or its graph changed; inspect it first');
  }
  const normalize = node => {
    const parameters = structuredClone(node.parameters);
    if (node.type === 'n8n-nodes-base.code') parameters.mode ??= 'runOnceForAllItems';
    if (node.type === 'n8n-nodes-base.httpRequest') parameters.contentType ??= 'json';
    return parameters;
  };
  for (const node of current.nodes) {
    const source = expected.nodes.find(item => item.id === node.id && item.type === node.type);
    // The configuration node is deliberately operator-editable. Preserve all other logic.
    if (!source || (node.name !== 'Modo y portal' && !isDeepStrictEqual(normalize(node), normalize(source)))) {
      throw new Error('Pilot logic changed; do not overwrite local edits');
    }
  }
  if (current.nodes.length !== expected.nodes.length) throw new Error('Unexpected pilot nodes');
  const preflight = db.prepare('SELECT nodes FROM workflow_entity WHERE id = ?').get('aramis-hubspot-preflight');
  credential = JSON.parse(preflight?.nodes || '[]').find(node => node.name === 'Buscar contacto ficticio')?.credentials?.httpBearerAuth;
  const metadata = credential?.id && db.prepare('SELECT id, type FROM credentials_entity WHERE id = ?').get(credential.id);
  if (!metadata || metadata.type !== 'httpBearerAuth') throw new Error('Saved preflight Bearer credential not found');
  credential = { id: metadata.id, name: String(credential.name || 'LeadOps Bearer credential') };
} finally { db.close(); }

await mkdir(privateDirectory, { recursive: true });
// Snapshot only the workflow, never credential values or the credential table's encrypted data.
await writeFile(new URL(`pilot-before-${Date.now()}.json`, privateDirectory), JSON.stringify(current, null, 2) + '\n');
const prepared = structuredClone(current);
for (const node of prepared.nodes) {
  if (node.type === 'n8n-nodes-base.httpRequest') node.credentials = { httpBearerAuth: credential };
  if (node.name === 'Modo y portal') {
    const config = { mode, portalId, ownerId,
      confirmFictionalWrites: mode === 'write' ? 'YES_CREATE_DEMO_RECORDS' : '' };
    for (const field of node.parameters.assignments.assignments) field.value = config[field.name] ?? field.value;
  }
}
prepared.active = false;
await writeFile(new URL('pilot-ready.json', privateDirectory), JSON.stringify(prepared, null, 2) + '\n');

// One-off read-only metadata verification. v4 is still supported; this probe is not the
// production transport. Object creation continues to use the pinned date-based contract.
const metadataWorkflow = {
  id: 'aramis-hubspot-association-check', name: 'Aramis LeadOps — verificar asociaciones (solo lectura)', active: false,
  nodes: [
    { id: 'association-start', name: 'Verificar asociaciones', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [100, 200], parameters: {} },
    { id: 'association-plan', name: 'Asociaciones previstas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [340, 200], parameters: {
      mode: 'runOnceForAllItems', jsCode: "return [{ json: { from: 'notes', expectedTypeId: 202 } }, { json: { from: 'tasks', expectedTypeId: 204 } }];" } },
    { id: 'association-get', name: 'HubSpot · leer asociaciones', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [580, 200], retryOnFail: false, onError: 'continueRegularOutput', credentials: { httpBearerAuth: credential }, parameters: {
        method: 'GET', url: '={{ "https://api.hubapi.com/crm/v4/associations/" + $json.from + "/contacts/labels" }}',
        authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
        options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
      } },
    { id: 'association-result', name: 'Resultado de asociaciones', type: 'n8n-nodes-base.code', typeVersion: 2, position: [830, 200], parameters: {
      mode: 'runOnceForAllItems', jsCode: "const jobs = $('Asociaciones previstas').all(); return $input.all().map((item, index) => { const job = jobs[index].json; const response = item.json; const found = (response.body?.results || []).some(type => type.typeId === job.expectedTypeId && type.category === 'HUBSPOT_DEFINED'); return { json: { from: job.from, to: 'contacts', httpStatus: response.statusCode || null, expectedTypeId: job.expectedTypeId, verified: response.statusCode === 200 && found, crmWritesPerformed: false } }; });" } },
  ],
  connections: {
    'Verificar asociaciones': { main: [[{ node: 'Asociaciones previstas', type: 'main', index: 0 }]] },
    'Asociaciones previstas': { main: [[{ node: 'HubSpot · leer asociaciones', type: 'main', index: 0 }]] },
    'HubSpot · leer asociaciones': { main: [[{ node: 'Resultado de asociaciones', type: 'main', index: 0 }]] },
  }, settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
};
await writeFile(new URL('association-check.json', privateDirectory), JSON.stringify(metadataWorkflow, null, 2) + '\n');
console.log(JSON.stringify({ mode, credentialReferenceBound: true,
  privateDirectory: fileURLToPath(privateDirectory), credentialValuesRead: false }));
