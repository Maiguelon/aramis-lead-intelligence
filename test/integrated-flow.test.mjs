import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { hubspotRequest } from '../src/hubspot-contract.mjs';
import { prepareIntegratedInput, decideIntegratedEvent, advanceIntegrated, integratedFallback, integratedSummary } from '../src/integrated-flow.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/integrated-demo.json', import.meta.url), 'utf8'));
const bundles = { new: normalizeIntake(raw, { receivedAt: '2026-10-27T00:00:00Z' }).intake };
const config = { enabled: 'true', confirm: 'YES_RUN_FICTIONAL_LEADOPS', portalId: '123', ownerId: '456', model: 'demo-model' };
const start = () => prepareIntegratedInput({ body: { scenario: 'new', consent: true } }, config, bundles, '2026-10-27T01:00:00Z', 'webhook');
const api = { crm: hubspotRequest, fallback: integratedFallback };

test('live gates require production webhook, explicit boolean consent and a closed fictional scenario', () => {
  for (const mode of ['cli', 'manual', 'trigger', undefined]) assert.equal(prepareIntegratedInput({}, config, bundles, '', mode).status, 'blocked');
  for (const consent of [false, 'true', 1, undefined]) assert.equal(prepareIntegratedInput({ scenario: 'new', consent }, config, bundles, '', 'webhook').status, 'rejected');
  assert.equal(prepareIntegratedInput({ scenario: '__proto__', consent: true }, config, bundles, '', 'webhook').status, 'rejected');
  const frame = prepareIntegratedInput({ scenario: 'new', consent: true, email: 'other@invalid.test', to: 'other@invalid.test' }, config, bundles, '2026-10-27T01:00:00Z', 'webhook');
  assert.equal(frame.intake.email, raw.email);
  assert.equal(frame.intake.consent.recordedAt, '2026-10-27T01:00:00Z');
  assert.equal(frame.config.to, undefined);
});

test('completed or uncertain events stop before any provider request; only read failures can retry up to three attempts', () => {
  const complete = decideIntegratedEvent(start(), [{ event_key: 'a', state: 'complete', contact_id: '42', analysis_mode: 'manual_fallback', fit: 'insufficient_information', certainty: 'low' }]);
  assert.equal(complete.status, 'duplicate');
  assert.equal(complete.request, undefined);
  assert.equal(integratedSummary(complete).analysisMode, 'manual_fallback');
  for (const state of ['contact_unknown', 'analysis_unknown', 'note_unknown', 'task_unknown', 'alert_unknown']) {
    assert.equal(decideIntegratedEvent(start(), [{ event_key: 'a', state }]).status, 'manual_review');
  }
  assert.equal(decideIntegratedEvent(start(), [{ event_key: 'a', state: 'retryable_no_write', attempts: 2 }]).attempts, 3);
  assert.equal(decideIntegratedEvent(start(), [{ event_key: 'a', state: 'retryable_no_write', attempts: 3 }]).status, 'manual_review');
  assert.equal(decideIntegratedEvent(start(), [{ event_key: 'a' }, { event_key: 'a' }]).reason, 'duplicate_ledger_keys');
});

test('existing contact is reused without changing owner or lifecycle; conflicts and incomplete search results stop', () => {
  const frame = decideIntegratedEvent(start(), []);
  const reused = advanceIntegrated('search', frame, { statusCode: 200, body: { total: 1, results: [{ id: '42' }] } }, api);
  assert.equal(reused.status, 'analyze'); assert.equal(reused.ids.contact, '42'); assert.equal(reused.request, undefined);
  assert.equal(advanceIntegrated('search', frame, { statusCode: 200, body: { total: 5, results: [{ id: '42' }] } }, api).status, 'manual_review');
  assert.equal(advanceIntegrated('search', frame, { statusCode: 429 }, api).ledgerState, 'retryable_no_write');
  const create = advanceIntegrated('search', frame, { statusCode: 200, body: { total: 0, results: [] } }, api);
  assert.equal(create.status, 'create_contact');
  assert.equal(create.request.body.properties.lifecyclestage, 'lead');
  for (const stage of ['contact', 'note', 'task']) assert.equal(advanceIntegrated(stage, frame, { error: 'timeout' }, api).status, 'manual_review');
});

test('AI failure or invalid output yields a visible manual fallback, never an invented positive fit', () => {
  const frame = start();
  for (const stage of ['research', 'qualification']) {
    const fallback = advanceIntegrated(stage, frame, { statusCode: 429 }, api);
    assert.equal(fallback.status, 'write_note');
    assert.equal(fallback.analysisMode, 'manual_fallback');
    assert.equal(fallback.qualification.fit, 'insufficient_information');
    assert.equal(fallback.qualification.certainty, 'low');
    assert.equal(fallback.qualification.humanReviewRequired, true);
  }
});

test('valid research passes the qualification JSON body to the native HTTP boundary', () => {
  const research = { summary: 'A website inquiry', externalFacts: [] };
  const result = advanceIntegrated('research', start(), { statusCode: 200, body: {} }, {
    ...api, decode: () => research, ai: (stage, values) => ({ model: values.model, stage, input: values.research }),
  });
  assert.equal(result.status, 'qualify');
  assert.equal(result.request.body.stage, 'qualification');
  assert.deepEqual(result.request.body.input, research);
});

test('connected graph has no credential values, and each write follows a persistent checkpoint', async () => {
  const flow = JSON.parse(await readFile(new URL('../n8n/leadops-integrated.json', import.meta.url), 'utf8'));
  assert.equal(flow.active, false);
  assert.equal(new Set(flow.nodes.map(node => node.id)).size, flow.nodes.length);
  assert.equal(new Set(flow.nodes.map(node => node.name)).size, flow.nodes.length);
  for (const node of flow.nodes) assert.equal(node.credentials, undefined);
  assert.equal(flow.nodes.some(node => node.type === 'n8n-nodes-base.respondToWebhook'), false,
    'n8n 2.41.7 rejects Respond to Webhook anywhere downstream of a current Form Trigger');
  for (const id of ['integrated-contact', 'integrated-note-http', 'integrated-task-http', 'integrated-mail-http']) {
    const node = flow.nodes.find(item => item.id === id);
    assert.equal(node.retryOnFail, false);
  }
  for (const label of ['contacto', 'análisis', 'nota', 'tarea', 'correo', 'completado']) assert.ok(flow.nodes.some(node => node.name === `Persistir · ${label}`));
  for (const node of flow.nodes.filter(node => node.type === 'n8n-nodes-base.code')) assert.doesNotThrow(() => new Function(node.parameters.jsCode));
});
