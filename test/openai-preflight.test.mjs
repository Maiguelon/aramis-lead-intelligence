import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeOpenAiPreflight } from '../src/openai-preflight.mjs';

test('model-list check verifies only read access and suppresses private model names', () => {
  const result = summarizeOpenAiPreflight({ statusCode: 200, body: { data: [
    { id: 'gpt-5.4-mini' }, { id: 'private-finetune-name', owned_by: 'private-account' },
  ] } });
  assert.equal(result.status, 'connected_read_only');
  assert.equal(result.modelCount, 2);
  assert.equal(result.candidateModels['gpt-5.4-mini'], true);
  assert.equal(result.generationPerformed, false);
  assert.equal(result.generationPermissionVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /private-finetune|private-account/);
});

test('credential, permission, quota and retry states stay distinct without leaking provider details', () => {
  for (const [statusCode, code, reason] of [
    [401, '', 'invalid_or_expired_credential'], [403, '', 'missing_models_read_permission'],
    [429, 'insufficient_quota', 'api_quota_unavailable'], [429, '', 'rate_limited'],
    [503, '', 'provider_unavailable'],
  ]) {
    const result = summarizeOpenAiPreflight({ statusCode, body: { error: { code, message: 'private-token-and-error' } } });
    assert.equal(result.reason, reason);
    assert.doesNotMatch(JSON.stringify(result), /private-token|private-error/);
  }
  assert.equal(summarizeOpenAiPreflight({ error: { message: 'private-token' } }).reason, 'credential_or_network_error');
  assert.equal(summarizeOpenAiPreflight({ statusCode: 200, body: { data: [{}] } }).status, 'manual_review');
});

test('native OpenAI preflight makes only a model-list GET and exports no credential references', async () => {
  const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-openai-preflight.json', import.meta.url), 'utf8'));
  const requests = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].parameters.method, 'GET');
  assert.equal(requests[0].parameters.url, 'https://api.openai.com/v1/models');
  assert.equal(requests[0].parameters.nodeCredentialType, 'openAiApi');
  assert.equal(requests[0].parameters.sendBody, undefined);
  assert.equal(requests[0].credentials, undefined);
  const code = workflow.nodes.find(node => node.type === 'n8n-nodes-base.code').parameters.jsCode;
  const run = new Function('$input', code);
  const result = run({ all: () => [{ json: { statusCode: 200, body: { data: [] } } }] });
  assert.equal(result[0].json.status, 'connected_read_only');
});
