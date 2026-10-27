import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgents, agentContext, AgentError, decodeAgentResponse } from '../src/openai-agents.mjs';
import { normalizeIntake } from '../src/intake.mjs';

const raw = {
  submission_id: 'test-agent-001', source_form: 'demo', nombre: 'Test Person',
  email: 'person@example.test', empresa: 'Ejemplo SA',
  mensaje: 'Quiero una web. Escribirme a person@example.test o al +54 9 381 555 0101.',
  consentimiento_contacto: true, consentimiento_texto_version: 'contact-v1',
  consentimiento_fecha: '2026-09-30T15:00:00Z',
};
const intake = normalizeIntake(raw).intake;

function fakeResponse(output, annotations = []) {
  return { ok: true, async json() { return { status: 'completed', output: [
    ...(annotations.length ? [{ type: 'web_search_call', status: 'completed' }] : []),
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output), annotations }] },
  ] }; } };
}

test('agent context removes direct contact details', () => {
  const context = agentContext(intake);
  const text = JSON.stringify(context);
  assert.doesNotMatch(text, /person@example\.test|\+54 9 381 555 0101|Test Person/);
  assert.match(text, /Quiero una web/);
  assert.equal(context.serviceHints, undefined);
});

test('research cannot claim a performed search without an observed completed web tool call', async () => {
  const agents = createAgents({ mode: 'openai', key: 'test-key', researchModel: 'test-model',
    fetcher: async () => fakeResponse({ summary: 'X', verifiedFacts: [], externalFacts: [],
      missingInformation: [], researchStatus: 'performed' }) });
  await assert.rejects(agents.research(intake), error => error.code === 'web_search_not_observed');
});

test('research requests web search only for supplied company and accepts cited facts', async () => {
  let request;
  const agents = createAgents({ mode: 'openai', key: 'test-key', researchModel: 'test-model',
    qualificationModel: 'test-model', fetcher: async (_url, options) => {
      request = JSON.parse(options.body);
      return fakeResponse({ summary: 'Consulta web', verifiedFacts: [],
        externalFacts: [{ fact: 'Empresa ficticia', source: 'https://example.test/about' }],
        missingInformation: [], researchStatus: 'performed' },
      [{ type: 'url_citation', url: 'https://example.test/about' }]);
    } });
  const result = await agents.research(intake);
  assert.equal(request.tools[0].type, 'web_search');
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(result.externalFacts.length, 1);
});

test('research rejects external facts without actual API citations', async () => {
  const agents = createAgents({ mode: 'openai', key: 'test-key', researchModel: 'test-model',
    fetcher: async () => fakeResponse({ summary: 'X', verifiedFacts: [],
      externalFacts: [{ fact: 'Inventado', source: 'https://example.test/about' }],
      missingInformation: [], researchStatus: 'performed' }) });
  await assert.rejects(agents.research(intake), error => error instanceof AgentError && error.code === 'uncited_external_fact');
});

test('structured research accepts a provider-confirmed opened page and rejects an unfinished one', () => {
  const output = { summary: 'Empresa', verifiedFacts: [],
    externalFacts: [{ fact: 'Ofrece servicios web', source: 'https://example.test/' }],
    missingInformation: [], researchStatus: 'performed' };
  const payload = { status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://example.test/' } },
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] },
  ] };
  assert.equal(decodeAgentResponse('research', payload).externalFacts.length, 1);
  payload.output[0].status = 'searching';
  assert.throws(() => decodeAgentResponse('research', payload), error => error.code === 'uncited_external_fact');
});

test('qualification requires human review and evidence-backed signals', async () => {
  const agents = createAgents({ mode: 'openai', key: 'test-key', qualificationModel: 'test-model',
    fetcher: async () => fakeResponse({ fit: 'high_fit', certainty: 'medium',
      signals: [{ signal: 'Web', source: 'intake:message' }], missingInformation: [],
      rationale: 'Coincide', humanReviewRequired: true }) });
  const research = { externalFacts: [], missingInformation: [] };
  assert.equal((await agents.qualify(intake, research)).fit, 'high_fit');
});

test('qualification rejects unsupported signal and no-review output', async () => {
  const agent = output => createAgents({ mode: 'openai', key: 'test-key', qualificationModel: 'test-model',
    fetcher: async () => fakeResponse(output) });
  const base = { fit: 'high_fit', certainty: 'high', signals: [], missingInformation: [],
    rationale: 'X', humanReviewRequired: true };
  await assert.rejects(agent({ ...base, humanReviewRequired: false }).qualify(intake, { externalFacts: [] }),
    error => error.code === 'invalid_qualification_output');
  await assert.rejects(agent({ ...base, signals: [{ signal: 'X', source: 'imaginary' }] }).qualify(intake, { externalFacts: [] }),
    error => error.code === 'unsupported_qualification_signal');
});
