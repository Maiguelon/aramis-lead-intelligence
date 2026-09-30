import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { qualifyStub, researchStub } from '../src/qualification.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

test('footer intake preserves explicit consent, source and unknown UTM dimensions', async () => {
  const result = normalizeIntake(await fixture('footer-valid'));
  assert.equal(result.status, 'accepted');
  assert.equal(result.intake.email, 'lucia@example.test');
  assert.equal(result.intake.utm.utm_source, 'instagram');
  assert.equal(result.intake.utm.utm_term, 'unknown');
  assert.deepEqual(result.intake.serviceHints, ['identidad_visual']);
  assert.equal(result.intake.consent.contact, true);
});

test('plan JSON is parsed but prices are not used as qualification facts', async () => {
  const result = normalizeIntake(await fixture('plan-valid'));
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.intake.serviceHints, ['redes_sociales', 'pagina_web']);
  assert.equal(result.intake.plan.posts, 4);
  assert.equal(result.intake.plan.precioMensual, undefined);
});

test('consent missing or false stops before any identity processing', async () => {
  const denied = normalizeIntake(await fixture('no-consent'));
  assert.equal(denied.status, 'rejected');
  assert.equal(denied.intake, null);
  const missing = { ...await fixture('footer-valid') };
  delete missing.consentimiento_contacto;
  assert.equal(normalizeIntake(missing).status, 'rejected');
  const noEvidence = { ...await fixture('footer-valid'), consentimiento_texto_version: '' };
  assert.equal(normalizeIntake(noEvidence).reason, 'consent_evidence_incomplete');
});

test('phone-only contact is accepted only with international format', async () => {
  const base = await fixture('plan-valid');
  assert.equal(normalizeIntake({ ...base, contacto: 'WhatsApp: +54 9 381 555 0101' }).intake.phone, '+5493815550101');
  const ambiguous = normalizeIntake({ ...base, contacto: '381 555 0101' });
  assert.equal(ambiguous.status, 'manual_review');
  assert.equal(ambiguous.intake, null);
});

test('same submission ID has same fingerprint, new event from same person has different fingerprint', async () => {
  const raw = await fixture('footer-valid');
  const first = normalizeIntake(raw).intake;
  const same = normalizeIntake({ ...raw, mensaje: 'Reenvío del formulario' }).intake;
  const returner = normalizeIntake({ ...raw, submission_id: 'demo-footer-002' }).intake;
  assert.equal(first.fingerprint, same.fingerprint);
  assert.equal(first.identityKey, returner.identityKey);
  assert.notEqual(first.fingerprint, returner.fingerprint);
});

test('offline agents separate recommendation from certainty and do not invent research', async () => {
  const intake = normalizeIntake(await fixture('footer-valid')).intake;
  const research = researchStub(intake);
  const fit = qualifyStub(intake, research);
  assert.equal(research.researchStatus, 'not_performed');
  assert.deepEqual(research.externalFacts, []);
  assert.equal(fit.fit, 'high_fit');
  assert.equal(fit.certainty, 'medium');
  assert.equal(fit.humanReviewRequired, true);
  assert.equal(fit.signals[0].source, 'intake:message');
});

test('unsupported request is a low-fit recommendation, never an automatic discard', async () => {
  const raw = { ...await fixture('footer-valid'), mensaje: 'Necesito un contador para impuestos.' };
  const intake = normalizeIntake(raw).intake;
  const fit = qualifyStub(intake, researchStub(intake));
  assert.equal(fit.fit, 'low_fit');
  assert.equal(fit.humanReviewRequired, true);
});
