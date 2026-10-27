import { hubspotRequest } from './hubspot-contract.mjs';

const API_BASE = 'https://api.hubapi.com';

export class HubSpotError extends Error {
  constructor(code, { status = null, retryable = false, cause } = {}) {
    super(code, { cause });
    this.name = 'HubSpotError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function objectId(value) {
  const id = String(value ?? '');
  if (!/^\d+$/.test(id)) throw new HubSpotError('invalid_hubspot_object_id');
  return id;
}

export function contactRecordUrl(portalId, contactId) {
  return `https://app.hubspot.com/contacts/${objectId(portalId)}/record/0-1/${objectId(contactId)}`;
}

export function nativeContactUrlCode() {
  return [HubSpotError, objectId, contactRecordUrl].map(value => value.toString()).join('\n');
}

/** Small, injectable API boundary. Tokens and response bodies are never included in errors. */
export class HubSpotClient {
  constructor({ token, portalId, ownerId = null, fetcher = fetch } = {}) {
    if (!token) throw new HubSpotError('missing_hubspot_token');
    this.token = token;
    this.portalId = objectId(portalId);
    this.ownerId = ownerId == null ? null : objectId(ownerId);
    this.fetcher = fetcher;
  }

  async request(method, path, body) {
    let response;
    try {
      response = await this.fetcher(`${API_BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) { throw new HubSpotError('hubspot_network_error', { retryable: true, cause }); }
    if (!response.ok) {
      throw new HubSpotError('hubspot_http_error', {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    try { return response.status === 204 ? null : await response.json(); }
    catch (cause) { throw new HubSpotError('hubspot_invalid_json', { retryable: true, cause }); }
  }

  async findContacts(intake) {
    const found = new Map();
    for (const [propertyName, value] of [['email', intake.email], ['phone', intake.phone]]) {
      if (!value) continue;
      const page = await this.executeOperation('search_contact', { propertyName, value });
      if (!Array.isArray(page.results)) throw new HubSpotError('invalid_search_response');
      for (const contact of page.results) found.set(objectId(contact.id), contact);
    }
    return [...found.values()];
  }

  async executeOperation(operation, values) {
    const plan = hubspotRequest(operation, values);
    return this.request(plan.method, plan.path, plan.body);
  }

  async ensureContact(intake) {
    const matches = await this.findContacts(intake);
    if (matches.length > 1) throw new HubSpotError('ambiguous_existing_contact');
    if (matches.length === 1) return { contact: matches[0], created: false };

    try {
      const contact = await this.executeOperation('create_contact', { intake, ownerId: this.ownerId });
      objectId(contact.id);
      return { contact, created: true };
    } catch (error) {
      // Another writer can create the same email between search and create.
      if (!(error instanceof HubSpotError) || error.status !== 409) throw error;
      const raced = await this.findContacts(intake);
      if (raced.length !== 1) throw new HubSpotError('contact_conflict_needs_review');
      return { contact: raced[0], created: false };
    }
  }

  async createIntakeNote(contactId, { intake, research, qualification }) {
    const note = await this.executeOperation('create_note', { contactId, intake, research, qualification });
    objectId(note.id);
    return note;
  }

  async createReviewTask(contactId, { intake, dueAt }) {
    const task = await this.executeOperation('create_task', { contactId, intake, dueAt, ownerId: this.ownerId });
    objectId(task.id);
    return task;
  }
}
