import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';
import { renderReviewCard } from '../src/review-card.mjs';
import { resendRequest, summarizeResendResponse } from '../src/resend.mjs';
import { prepareMailPilot, summarizeMailPilot } from '../src/mail-pilot.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/hubspot-pilot.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw, { receivedAt: '2026-10-27T00:00:00Z' }).intake;
const research = researchStub(intake);
const bundle = { fictional: true, intake, research, qualification: qualifyStub(intake, research) };
const config = { mode: 'send', from: 'Demo <alerts@verified.example.test>', to: 'team@example.test',
  portalId: '123', contactId: '456', confirmInternalSend: 'YES_SEND_INTERNAL_DEMO' };
const prepare = (changes = {}, data = bundle) => prepareMailPilot({ ...config, ...changes }, data, renderReviewCard, resendRequest);

test('mail pilot needs explicit consent, fixed fictional identity and send confirmation', () => {
  const preview = prepare({ mode: 'preview' });
  assert.equal(preview.status, 'preview');
  assert.equal(preview.request, undefined);
  assert.match(preview.card.subject, /PRUEBA/);
  assert.match(preview.card.html, /análisis simulado/);
  assert.equal(prepare({ confirmInternalSend: '' }).status, 'blocked');
  assert.equal(prepare({ portalId: '' }).status, 'blocked');
  assert.equal(prepare({}, { ...bundle, fictional: false }).status, 'blocked');
  assert.equal(prepare({}, { ...bundle, intake: { ...intake, consent: { contact: false } } }).status, 'rejected');
});

test('accepted email stays distinct from delivered mail and uses only the configured internal destination', () => {
  const state = prepare();
  assert.deepEqual(state.request.body.to, ['team@example.test']);
  assert.equal(state.request.body.to.includes(intake.email), false);
  const result = summarizeMailPilot(state, { statusCode: 200, body: { id: '00000000-0000-4000-8000-000000000001' } }, summarizeResendResponse);
  assert.equal(result.emailAccepted, true);
  assert.equal(result.deliveryConfirmed, false);
  assert.equal(result.crmWritesPerformed, false);
  assert.equal(result.aiCallsPerformed, false);
  assert.equal(result.card, undefined);
});

test('native mail preview runs without credentials and its only side-effect node is a guarded Resend POST', async () => {
  const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-mail-pilot.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  const requests = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].parameters.url, 'https://api.resend.com/emails');
  assert.equal(requests[0].credentials, undefined);
  assert.equal(requests[0].retryOnFail, false);
  const fields = workflow.nodes.find(node => node.id === 'mail-config').parameters.assignments.assignments;
  assert.equal(fields.find(field => field.name === 'mode').value, 'preview');
  assert.equal(fields.find(field => field.name === 'to').value, '');
  const execute = new Function('$input', workflow.nodes.find(node => node.id === 'mail-prepare').parameters.jsCode);
  const result = execute({ first: () => ({ json: Object.fromEntries(fields.map(field => [field.name, field.value])) }) });
  assert.equal(result[0].json.status, 'preview');
  assert.equal(result[0].json.request, undefined);
});
