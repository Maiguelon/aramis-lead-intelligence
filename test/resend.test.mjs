import test from 'node:test';
import assert from 'node:assert/strict';
import { resendRequest, summarizeResendResponse, createResendMailer } from '../src/resend.mjs';
import { nativeReviewCardCode } from '../src/review-card.mjs';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';

const card = { deliveryKey: `leadops-review/${'a'.repeat(64)}`, subject: '[DEMO] Review',
  html: '<p>Fictional review</p>', text: 'Fictional review', to: 'prospect@example.test' };
const config = { from: 'LeadOps <alerts@verified.example.test>', to: 'team@example.test' };
const receiptId = '00000000-0000-4000-8000-000000000001';

test('internal recipient is fixed by operations config and stable event identity becomes the idempotency header', () => {
  const request = resendRequest(card, config);
  assert.deepEqual(request.body.to, ['team@example.test']);
  assert.equal(request.headers['Idempotency-Key'], card.deliveryKey);
  assert.equal(request.body.cc, undefined);
  assert.equal(request.body.bcc, undefined);
  assert.equal(request.body.reply_to, undefined);
  assert.throws(() => resendRequest({ ...card, deliveryKey: '' }, config), /invalid_mail_delivery_key/);
  assert.throws(() => resendRequest({ ...card, subject: 'bad\r\nBcc: x@y.test' }, config), /invalid_mail_subject/);
  assert.throws(() => resendRequest(card, { ...config, to: 'a@test.com,b@test.com' }), /invalid_internal_recipient/);
});

test('acceptance is distinct from delivery and provider errors never enter the result', () => {
  const accepted = summarizeResendResponse({ statusCode: 200, body: { id: receiptId } });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.deliveryConfirmed, false);
  for (const statusCode of [401, 403, 409, 422, 429, 503]) {
    const result = summarizeResendResponse({ statusCode, body: { message: 'private-provider-error-and-token' } });
    assert.notEqual(result.status, 'accepted');
    assert.doesNotMatch(JSON.stringify(result), /private-provider/);
  }
  assert.equal(summarizeResendResponse({ error: {} }).reason, 'mail_outcome_requires_reconciliation');
});

test('API adapter sends the shared contract and does not blindly retry an uncertain send', async () => {
  let captured;
  const mailer = createResendMailer({ ...config, key: 'test-key', fetcher: async (url, options) => {
    captured = { url, options }; return { status: 200, async json() { return { id: receiptId }; } };
  } });
  assert.equal((await mailer.send(card)).id, receiptId);
  assert.deepEqual(JSON.parse(captured.options.body).to, ['team@example.test']);
  assert.equal(captured.options.headers['Idempotency-Key'], card.deliveryKey);
  const uncertain = createResendMailer({ ...config, key: 'private-token', fetcher: async () => { throw Error('private-token'); } });
  await assert.rejects(uncertain.send(card), error => error.code === 'mail_outcome_requires_reconciliation'
    && error.retryable === false && !JSON.stringify(error).includes('private-token'));
});

test('shared review card renders in a native Code context and carries a technical delivery key', () => {
  const intake = normalizeIntake({ submission_id: 'mail-test-001', source_form: 'demo', email: 'fake@example.test',
    mensaje: 'Quiero una web', consentimiento_contacto: true, consentimiento_texto_version: 'fictional-v1' },
  { receivedAt: '2026-10-27T00:00:00Z' }).intake;
  const research = researchStub(intake);
  const render = new Function(`${nativeReviewCardCode()}\nreturn renderReviewCard;`)();
  const rendered = render({ intake, research, qualification: qualifyStub(intake, research), portalId: '123', contactId: '456' });
  assert.match(rendered.deliveryKey, /^leadops-review\/[a-f0-9]{64}$/);
  assert.match(rendered.html, /Revisión humana obligatoria/);
});
