import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeHubSpotPreflight } from '../src/hubspot-preflight.mjs';

test('read-only preflight reports access without leaking returned contact data', () => {
  const result = summarizeHubSpotPreflight({ statusCode: 200,
    body: { total: 1, results: [{ id: '1', properties: { email: 'private@example.test' } }] } });
  assert.equal(result.status, 'connected_read_only');
  assert.equal(result.matchingDemoContacts, 1);
  assert.equal(result.writeAccessVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /private@example|properties/);
});

test('authorization and provider failures remain distinct and sanitized', () => {
  assert.equal(summarizeHubSpotPreflight({ statusCode: 401 }).reason, 'invalid_or_expired_credential');
  assert.equal(summarizeHubSpotPreflight({ statusCode: 403 }).reason, 'missing_contact_read_permission');
  assert.equal(summarizeHubSpotPreflight({ statusCode: 429 }).status, 'retry_later');
  assert.equal(summarizeHubSpotPreflight({ statusCode: 503 }).status, 'retry_later');
  assert.equal(summarizeHubSpotPreflight({ statusCode: 200, body: {} }).status, 'manual_review');
  const missing = summarizeHubSpotPreflight({ error: { message: 'secret-token provider detail' } });
  assert.equal(missing.status, 'configuration_needed');
  assert.doesNotMatch(JSON.stringify(missing), /secret-token|provider detail/);
});

test('importable graph has exactly one read-only API call and no stored credentials', async () => {
  const workflow = JSON.parse(await readFile(new URL('../n8n/leadops-hubspot-preflight.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  const requests = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].parameters.method, 'POST');
  assert.equal(requests[0].parameters.url, 'https://api.hubapi.com/crm/objects/2026-03/contacts/search');
  assert.equal(requests[0].credentials, undefined);
  assert.equal(JSON.parse(requests[0].parameters.jsonBody).filterGroups[0].filters[0].value,
    'leadops-connection-check@example.test');
  const code = workflow.nodes.find(node => node.type === 'n8n-nodes-base.code').parameters.jsCode;
  const run = new Function('$input', code);
  const output = run({ all: () => [{ json: { statusCode: 200, body: { results: [] } } }] });
  assert.equal(output[0].json.status, 'connected_read_only');
});
