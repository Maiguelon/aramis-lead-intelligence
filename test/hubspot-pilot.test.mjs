import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';
import { hubspotRequest } from '../src/hubspot-contract.mjs';
import { prepareCrmPilot, advanceCrmPilot, summarizeCrmPilot } from '../src/hubspot-pilot.mjs';

const now = '2026-10-26T12:00:00Z';
const raw = JSON.parse(await readFile(new URL('../fixtures/hubspot-pilot.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw, { receivedAt: now }).intake;
const research = researchStub(intake);
const bundle = { fictional: true, intake, research, qualification: qualifyStub(intake, research) };
const writeConfig = { mode: 'write', portalId: '123', confirmFictionalWrites: 'YES_CREATE_DEMO_RECORDS' };
const prepare = config => prepareCrmPilot(config, bundle, now, hubspotRequest);
const advance = (state, response) => advanceCrmPilot(state, response, hubspotRequest);
const success = id => ({ statusCode: 201, body: { id } });
const noMatches = { statusCode: 200, body: { total: 0, results: [] } };

test('preview is credential-free and has no request to execute', () => {
  const state = prepare({ mode: 'preview' });
  assert.equal(state.status, 'preview');
  assert.equal(state.request, undefined);
  assert.equal(state.proposedContact.email, 'leadops-crm-pilot@example.com');
  assert.deepEqual(state.effects, []);
  assert.equal(summarizeCrmPilot(state).automaticProspectContact, false);
});

test('write mode requires typed confirmation, a portal, the fixed fictional identity and consent', () => {
  assert.equal(prepare({ mode: 'write', portalId: '123' }).status, 'blocked');
  assert.equal(prepare({ ...writeConfig, portalId: '' }).status, 'blocked');
  assert.equal(prepare({ mode: 'other' }).status, 'blocked');
  const denied = { ...bundle, intake: { ...intake, consent: { ...intake.consent, contact: false } } };
  assert.equal(prepareCrmPilot(writeConfig, denied, now, hubspotRequest).status, 'rejected');
  const realPerson = { ...bundle, intake: { ...intake, email: 'someone@business.example' } };
  assert.equal(prepareCrmPilot(writeConfig, realPerson, now, hubspotRequest).status, 'blocked');
});

test('check mode performs only a search, including when the fake email already exists', () => {
  const state = prepare({ mode: 'check' });
  assert.equal(state.request.path.endsWith('/contacts/search'), true);
  const result = advance(state, { statusCode: 200, body: { total: 1, results: [{ id: '100', properties: { lifecyclestage: 'customer' } }] } });
  assert.equal(result.status, 'connected_read_only');
  assert.equal(result.request, undefined);
  assert.deepEqual(result.effects, []);
  assert.doesNotMatch(JSON.stringify(summarizeCrmPilot(result)), /lifecyclestage|customer/);
});

test('existing contact stops the write pilot before modifying records or adding activities', () => {
  const state = advance(prepare(writeConfig), { statusCode: 200, body: { total: 1, results: [{ id: '100' }] } });
  assert.equal(state.reason, 'existing_contact_no_writes');
  assert.equal(state.request, undefined);
  assert.deepEqual(state.effects, []);
});

test('approved fictional path creates exactly a contact, an associated note and an open task', () => {
  let state = advance(prepare(writeConfig), noMatches);
  assert.match(state.request.path, /\/contacts$/);
  assert.equal(state.request.body.properties.lifecyclestage, 'lead');
  state = advance(state, success('100'));
  assert.match(state.request.path, /\/notes$/);
  assert.equal(state.request.body.associations[0].to.id, '100');
  assert.match(state.request.body.properties.hs_note_body, /PRUEBA FICTICIA/);
  state = advance(state, success('200'));
  assert.match(state.request.path, /\/tasks$/);
  assert.equal(state.request.body.properties.hs_task_status, 'NOT_STARTED');
  assert.equal(state.request.body.properties.hs_timestamp, '2026-10-27T12:00:00.000Z');
  state = advance(state, success('300'));
  assert.equal(state.status, 'complete');
  assert.equal(state.request, undefined);
  assert.deepEqual(state.effects, ['contact_created', 'note_created', 'task_created']);
  assert.match(summarizeCrmPilot(state).contactUrl, /\/123\/record\/0-1\/100$/);
});

test('provider and ambiguous write outcomes stop the chain without exposing error bodies', () => {
  assert.equal(advance(prepare({ mode: 'check' }), { statusCode: 403 }).reason, 'missing_contact_read_permission');
  let state = advance(prepare(writeConfig), noMatches);
  state = advance(state, success('100'));
  const result = advance(state, { error: { message: 'private-provider-error' }, statusCode: 503 });
  assert.equal(result.reason, 'note_write_requires_reconciliation');
  assert.equal(result.request, undefined);
  assert.deepEqual(result.effects, ['contact_created']);
  assert.doesNotMatch(JSON.stringify(result), /private-provider-error/);
});

test('native export defaults to preview, has no credentials and wires all branch destinations', async () => {
  const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-hubspot-pilot.json', import.meta.url), 'utf8'));
  const names = new Set(workflow.nodes.map(node => node.name));
  assert.equal(workflow.active, false);
  const config = workflow.nodes.find(node => node.name === 'Modo y portal').parameters.assignments.assignments;
  assert.equal(config.find(field => field.name === 'mode').value, 'preview');
  assert.equal(config.find(field => field.name === 'confirmFictionalWrites').value, '');
  const http = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(http.length, 4);
  for (const node of http) {
    assert.equal(node.credentials, undefined);
    assert.equal(node.retryOnFail, false);
    assert.equal(node.parameters.genericAuthType, 'httpBearerAuth');
  }
  for (const connection of Object.values(workflow.connections)) {
    for (const branch of connection.main) for (const edge of branch) assert.ok(names.has(edge.node));
  }
  const code = workflow.nodes.find(node => node.name === 'Preparar prueba ficticia').parameters.jsCode;
  const run = new Function('$input', code);
  assert.equal(run({ first: () => ({ json: { mode: 'preview' } }) })[0].json.status, 'preview');
});
