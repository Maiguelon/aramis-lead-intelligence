import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-tally.json', import.meta.url), 'utf8'));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));

test('Tally export is disabled, credential-free, with bounded pagination and complete graph', () => {
  assert.equal(workflow.active, false);
  assert.equal(nodes.size, workflow.nodes.length);
  for (const [source, branches] of Object.entries(workflow.connections)) {
    assert.ok(nodes.has(source), source);
    for (const edges of branches.main) for (const edge of edges) assert.ok(nodes.has(edge.node), edge.node);
  }
  for (const node of workflow.nodes) {
    assert.equal(node.credentials, undefined);
    if (node.type === 'n8n-nodes-base.code') assert.doesNotThrow(() => new Function('$input', '$', '$mode', 'require', node.parameters.jsCode));
    if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters.method !== 'GET' && node.id !== 'integrated-search') assert.notEqual(node.retryOnFail, true, node.name);
  }
  const config = nodes.get('Configuración local').parameters.assignments.assignments;
  assert.equal(config.find(field => field.name === 'enabled').value, 'false');
  assert.equal(config.find(field => field.name === 'processingMode').value, 'inspect');
  const pagination = nodes.get('Tally · recuperar pendientes').parameters.options.pagination.pagination;
  assert.equal(pagination.maxRequests, 10);
  assert.equal(pagination.limitPagesFetched, true);
});

test('native Tally intake rejects manual execution before querying providers', () => {
  const run = new Function('$input', '$mode', nodes.get('Comprobar configuración Tally').parameters.jsCode);
  const [result] = run({ first: () => ({ json: { enabled: 'true', mapping: '{}' } }) }, 'manual');
  assert.equal(result.json.status, 'blocked');
});
