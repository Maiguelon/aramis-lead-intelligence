import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hubspotRequest } from '../src/hubspot-contract.mjs';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/footer-valid.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw).intake;

test('portable contract runs without imports in an n8n-style JavaScript sandbox', () => {
  const portable = new Function(`return (${hubspotRequest.toString()});`)();
  const values = { intake, ownerId: '17' };
  assert.deepEqual(portable('create_contact', values), hubspotRequest('create_contact', values));
  assert.throws(() => portable('search_contact', { propertyName: 'arbitrary_field', value: 'x' }), /invalid_contact_search/);
});

test('rich text notes escape form and research content before entering the CRM', () => {
  const unsafe = { ...intake, message: '<img src=x onerror=alert(1)>' };
  const research = researchStub(unsafe);
  const qualification = qualifyStub(unsafe, research);
  const plan = hubspotRequest('create_note', { contactId: '100', intake: unsafe, research, qualification });
  assert.match(plan.body.properties.hs_note_body, /&lt;img/);
  assert.doesNotMatch(plan.body.properties.hs_note_body, /<img|<script/);
  assert.equal(plan.body.associations[0].types[0].associationTypeId, 202);
});

test('write plans reject missing identity, invalid target IDs and invalid deadlines', () => {
  assert.throws(() => hubspotRequest('create_contact', { intake: { name: 'Nobody' } }), /missing_contact_identity/);
  assert.throws(() => hubspotRequest('create_contact', { intake, ownerId: '../1' }), /invalid_hubspot_object_id/);
  assert.throws(() => hubspotRequest('create_task', { intake, contactId: '1', dueAt: 'tomorrow' }), /invalid_task_due_at/);
  assert.throws(() => hubspotRequest('create_task', { intake, contactId: '../1', dueAt: '2026-10-27T12:00:00Z' }), /invalid_hubspot_object_id/);
});
