import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCENARIOS, DEMO_CONSENT, demoFormInput, renderDemoResult } from '../src/demo-form.mjs';

test('demo form maps only known scenarios and an explicit unchecked-by-default consent option', () => {
  assert.deepEqual(demoFormInput({ Escenario: 'Consulta web', Consentimiento: [DEMO_CONSENT] }, DEMO_SCENARIOS, DEMO_CONSENT).inbound.body,
    { scenario: 'new', consent: true });
  for (const value of [undefined, [], true, 'true', [DEMO_CONSENT, 'extra']]) {
    assert.equal(demoFormInput({ Escenario: 'Consulta web', Consentimiento: value }, DEMO_SCENARIOS, DEMO_CONSENT).inbound.body.consent, false);
  }
  assert.equal(demoFormInput({ Escenario: '__proto__' }, DEMO_SCENARIOS, DEMO_CONSENT).inbound.body.scenario, '');
});

test('form result explains duplicate behavior and escapes result text', () => {
  const page = renderDemoResult({ status: 'duplicate', reason: '<script>bad</script>', contactId: '123' }, '456');
  assert.match(page, /No se volvieron a ejecutar/);
  assert.doesNotMatch(page, /<script>/);
  assert.match(page, /record\/0-1\/123/);
});
