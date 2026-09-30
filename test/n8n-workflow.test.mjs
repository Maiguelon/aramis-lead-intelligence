import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-demo.json', import.meta.url), 'utf8'));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));

function runCode(name, items) {
  const source = nodes.get(name).parameters.jsCode;
  return new Function('$input', source)({ all: () => items });
}

test('n8n demo graph references existing nodes and has no external side-effect node', () => {
  assert.equal(nodes.size, workflow.nodes.length);
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.filter(node => node.type === 'n8n-nodes-base.manualTrigger').length, 1);
  for (const branches of Object.values(workflow.connections)) {
    for (const outputs of branches.main) for (const edge of outputs) assert.ok(nodes.has(edge.node));
  }
  assert.ok(workflow.nodes.every(node => ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.code', 'n8n-nodes-base.if'].includes(node.type)));
});

test('native Code nodes process five fictional scenarios with a consent gate and separate analyses', () => {
  const raw = runCode('Cinco escenarios ficticios', []);
  assert.equal(raw.length, 5);
  const normalized = runCode('Consentimiento + normalización', raw);
  assert.deepEqual(normalized.map(item => item.json.status),
    ['accepted', 'duplicate', 'accepted', 'accepted', 'rejected']);
  const accepted = normalized.filter(item => item.json.status === 'accepted');
  const crm = runCode('CRM simulado', accepted);
  assert.equal(crm[0].json.crm.contactCreated, true);
  assert.equal(crm[1].json.crm.contactCreated, false);
  assert.equal(crm[0].json.crm.contactId, crm[1].json.crm.contactId);
  const research = runCode('Agente 1 · resumen simulado', crm);
  const qualified = runCode('Agente 2 · encaje simulado', research);
  assert.ok(qualified.every(item => item.json.qualification.humanReviewRequired));
  assert.ok(qualified.every(item => item.json.research.externalFacts.length === 0));
  const cards = runCode('Tarjeta de revisión', qualified);
  assert.equal(cards.length, 3);
  assert.ok(cards.every(item => item.json.cardHtml.includes('DEMO FICTICIA')));
  const rejected = runCode('Rechazos y repetidos', normalized.filter(item => item.json.status !== 'accepted'));
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every(item => item.json.effects.length === 0));
});
