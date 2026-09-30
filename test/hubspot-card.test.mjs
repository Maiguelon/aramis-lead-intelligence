import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';
import { HubSpotClient, HubSpotError, contactRecordUrl } from '../src/hubspot.mjs';
import { renderReviewCard } from '../src/review-card.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/footer-valid.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw).intake;

function mockFetch(sequence, calls) {
  return async (url, options) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : null });
    const next = sequence.shift();
    assert.ok(next, `Unexpected request to ${url}`);
    return { ok: next.status >= 200 && next.status < 300, status: next.status,
      async json() { return next.body; } };
  };
}

test('creates only a minimally populated new lead, then an associated note and human task', async () => {
  const calls = [];
  const hubspot = new HubSpotClient({ token: 'test-token', portalId: '123', ownerId: '17',
    fetcher: mockFetch([
      { status: 200, body: { results: [] } },
      { status: 201, body: { id: '501', properties: { email: intake.email } } },
      { status: 201, body: { id: '601' } },
      { status: 201, body: { id: '701' } },
    ], calls) });
  const { contact, created } = await hubspot.ensureContact(intake);
  const research = researchStub(intake);
  const qualification = qualifyStub(intake, research);
  await hubspot.createIntakeNote(contact.id, { intake, research, qualification });
  await hubspot.createReviewTask(contact.id, { intake, dueAt: '2026-10-01T15:00:00Z' });
  assert.equal(created, true);
  assert.equal(calls[1].body.properties.lifecyclestage, 'lead');
  assert.equal(calls[1].body.properties.hubspot_owner_id, '17');
  assert.equal(calls[1].body.properties.leadops_review_status, undefined);
  assert.equal(calls[2].body.associations[0].types[0].associationTypeId, 202);
  assert.match(calls[2].body.properties.hs_note_body, /contact-v1/);
  assert.equal(calls[3].body.associations[0].types[0].associationTypeId, 204);
  assert.equal(calls[3].body.properties.hs_task_status, 'NOT_STARTED');
  assert.equal(calls[3].body.properties.hs_timestamp, '2026-10-01T15:00:00.000Z');
});

test('reuses an existing contact without changing owner or lifecycle', async () => {
  const calls = [];
  const hubspot = new HubSpotClient({ token: 'test', portalId: '123', ownerId: '17',
    fetcher: mockFetch([{ status: 200, body: { results: [{ id: '501', properties: {
      hubspot_owner_id: '99', lifecyclestage: 'customer' } }] } }], calls) });
  const result = await hubspot.ensureContact(intake);
  assert.equal(result.created, false);
  assert.equal(result.contact.properties.hubspot_owner_id, '99');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /crm\/objects\/2026-03\/contacts\/search$/);
});

test('phone-only intake can be matched without an invented email', async () => {
  const phoneIntake = normalizeIntake({ ...raw, email: '', contacto: '+5493815550101' }).intake;
  const calls = [];
  const hubspot = new HubSpotClient({ token: 'test', portalId: '123',
    fetcher: mockFetch([{ status: 200, body: { results: [] } },
      { status: 201, body: { id: '502' } }], calls) });
  await hubspot.ensureContact(phoneIntake);
  assert.equal(calls[0].body.filterGroups[0].filters[0].propertyName, 'phone');
  assert.equal(calls[1].body.properties.email, undefined);
  assert.equal(calls[1].body.properties.phone, '+5493815550101');
});

test('two identity matches require manual resolution instead of arbitrary merge', async () => {
  const both = normalizeIntake({ ...raw, telefono: '+5493815550101' }).intake;
  const calls = [];
  const hubspot = new HubSpotClient({ token: 'test', portalId: '123',
    fetcher: mockFetch([
      { status: 200, body: { results: [{ id: '1' }] } },
      { status: 200, body: { results: [{ id: '2' }] } },
    ], calls) });
  await assert.rejects(hubspot.ensureContact(both), error => error.code === 'ambiguous_existing_contact');
  assert.equal(calls.length, 2);
});

test('create conflict re-searches, while 429 is a retryable sanitized error', async () => {
  const calls = [];
  const hubspot = new HubSpotClient({ token: 'secret-token', portalId: '123',
    fetcher: mockFetch([
      { status: 200, body: { results: [] } }, { status: 409, body: {} },
      { status: 200, body: { results: [{ id: '30' }] } },
      { status: 429, body: { message: 'sensitive provider body' } },
    ], calls) });
  assert.equal((await hubspot.ensureContact(intake)).contact.id, '30');
  await assert.rejects(hubspot.findContacts(intake), error => {
    assert.ok(error instanceof HubSpotError);
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /secret-token|sensitive provider body/);
    return true;
  });
});

test('review card escapes untrusted content and links only to a validated CRM record', () => {
  const unsafe = { ...intake, name: '<script>alert(1)</script>', message: '<img src=x>' };
  const research = { ...researchStub(unsafe), summary: '<script>alert(2)</script>',
    externalFacts: [{ fact: '<b>claimed</b>', source: 'javascript:alert(3)' }] };
  const qualification = { ...qualifyStub(unsafe, research), rationale: '<svg onload=alert(4)>' };
  const card = renderReviewCard({ intake: unsafe, research, qualification, portalId: '123', contactId: '501' });
  assert.doesNotMatch(card.html, /<script|<svg|<img|href="javascript:/);
  assert.match(card.html, /&lt;script&gt;/);
  assert.match(card.html, /Revisión humana obligatoria/);
  assert.match(card.html, /https:\/\/app.hubspot.com\/contacts\/123\/record\/0-1\/501/);
  assert.throws(() => contactRecordUrl('123', '../501'), /invalid_hubspot_object_id/);
});
