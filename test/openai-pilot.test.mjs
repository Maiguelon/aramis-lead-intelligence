import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';
import { openAiRequest, decodeAgentResponse, nativeAgentCode } from '../src/openai-agents.mjs';
import { prepareAiPilot, advanceAiPilot, summarizeAiPilot } from '../src/openai-pilot.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/ai-pilot.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw, { receivedAt: '2026-10-27T00:00:00Z' }).intake;
const bundles = { basic: { fictional: true, intake } };
const config = { mode: 'live', fixture: 'basic', researchModel: 'gpt-5.4-mini',
  qualificationModel: 'gpt-5.4-mini', confirmPaidDemo: 'YES_RUN_AI_DEMO' };
const prepare = (options = {}, data = bundles) => prepareAiPilot({ ...config, ...options }, data,
  '2026-10-27T01:00:00Z', openAiRequest);
const response = output => ({ statusCode: 200, body: { status: 'completed',
  usage: { input_tokens: 100, output_tokens: 50 }, output: [
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] },
  ] } });
const advance = (state, result) => advanceAiPilot(state, result, openAiRequest, decodeAgentResponse);

test('preview and consent rejection make no request; live calls require explicit demo confirmation', () => {
  const preview = prepare({ mode: 'preview', confirmPaidDemo: '' });
  assert.equal(preview.status, 'preview');
  assert.equal(preview.request, undefined);
  assert.equal(prepare({ confirmPaidDemo: '' }).status, 'blocked');
  assert.equal(prepare({ qualificationModel: '' }).reason, 'invalid_model_configuration');
  const denied = { basic: { fictional: true, intake: { ...intake, consent: { contact: false } } } };
  assert.equal(prepare({}, denied).status, 'rejected');
  assert.equal(prepare({ fixture: 'someone-real' }).reason, 'only_committed_fictional_input_allowed');
});

test('two validated analyses stay separate, preserve unknowns and require human review', () => {
  const research = researchStub(intake);
  const afterResearch = advance(prepare(), response(research));
  assert.equal(afterResearch.status, 'awaiting_qualification');
  assert.equal(afterResearch.request.body.text.format.name, 'leadops_qualification_v1');
  assert.equal(afterResearch.request.body.tools, undefined);
  const final = advance(afterResearch, response(qualifyStub(intake, research)));
  assert.equal(final.status, 'complete');
  assert.equal(final.generationCalls, 2);
  assert.deepEqual(final.tokenUsage, { input: 200, output: 100 });
  assert.equal(final.qualification.humanReviewRequired, true);
  assert.equal(summarizeAiPilot(final).automaticProspectContact, false);
  assert.doesNotMatch(JSON.stringify(summarizeAiPilot(final)), /leadops-ai-pilot@example|"email"|"phone"/);
});

test('uncited research, refusal and incomplete output stop before qualification', () => {
  const unverified = { ...researchStub(intake), externalFacts: [{ fact: 'Invented', source: 'https://example.test/' }] };
  for (const result of [response(unverified), { statusCode: 200, body: { status: 'incomplete' } },
    { statusCode: 200, body: { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] } }]) {
    const stopped = advance(prepare(), result);
    assert.equal(stopped.status, 'manual_review');
    assert.equal(stopped.request, undefined);
    assert.equal(stopped.generationCalls, 1);
    assert.equal(stopped.apiAttempts, 1);
  }
});

test('authorization, quota and provider errors have safe distinct outcomes without automatic retry', () => {
  for (const [statusCode, code, status] of [[401, '', 'configuration_needed'], [403, '', 'configuration_needed'],
    [429, 'insufficient_quota', 'configuration_needed'], [429, '', 'retry_later'], [503, '', 'retry_later']]) {
    const stopped = advance(prepare(), { statusCode, body: { error: { code, message: 'private-provider-detail' } } });
    assert.equal(stopped.status, status);
    assert.equal(stopped.request, undefined);
    assert.doesNotMatch(JSON.stringify(stopped), /private-provider-detail/);
  }
});

test('shared native contract works without imports, removes contact details and bounds web calls', () => {
  const native = new Function(`${nativeAgentCode()}\nreturn { openAiRequest, decodeAgentResponse };`)();
  const withCompany = { ...intake, company: 'Company person@example.test +54 9 381 555 0101' };
  const plan = native.openAiRequest('research', { model: 'gpt-5.4-mini', intake: withCompany });
  assert.equal(plan.store, false);
  assert.equal(plan.max_tool_calls, 3);
  assert.equal(plan.max_output_tokens, 4000);
  assert.deepEqual(plan.text.format.schema.properties.verifiedFacts.items.properties.source.enum,
    ['intake:message', 'intake:plan', 'intake:company']);
  assert.doesNotMatch(plan.input, /person@example|\+54 9 381 555 0101|LeadOps AI Pilot|leadops-ai-pilot@/);
  assert.equal(openAiRequest('research', { model: 'gpt-5.4-mini', intake }).tools, undefined);
  assert.deepEqual(openAiRequest('research', { model: 'gpt-5.4-mini', intake }).text.format.schema.properties.researchStatus.enum,
    ['not_performed']);
  assert.deepEqual(native.decodeAgentResponse('research', response(researchStub(intake)).body), researchStub(intake));
});

test('native AI export defaults to preview and permits only two credential-free Responses HTTP nodes', async () => {
  const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-openai-pilot.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  const fields = workflow.nodes.find(node => node.id === 'ai-pilot-config').parameters.assignments.assignments;
  assert.equal(fields.find(field => field.name === 'mode').value, 'preview');
  assert.equal(fields.find(field => field.name === 'confirmPaidDemo').value, '');
  const requests = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(requests.length, 2);
  for (const node of requests) {
    assert.equal(node.parameters.url, 'https://api.openai.com/v1/responses');
    assert.equal(node.parameters.nodeCredentialType, 'openAiApi');
    assert.equal(node.credentials, undefined);
    assert.equal(node.retryOnFail, false);
  }
  const names = new Set(workflow.nodes.map(node => node.name));
  for (const outputs of Object.values(workflow.connections)) for (const branch of outputs.main)
    for (const target of branch) assert.ok(names.has(target.node));
  const prepareNode = workflow.nodes.find(node => node.id === 'ai-pilot-prepare');
  const execute = new Function('$input', prepareNode.parameters.jsCode);
  const result = execute({ first: () => ({ json: Object.fromEntries(fields.map(field => [field.name, field.value])) }) });
  assert.equal(result[0].json.status, 'preview');
  assert.equal(result[0].json.request, undefined);
});
