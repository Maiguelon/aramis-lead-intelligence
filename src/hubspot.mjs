const API_BASE = 'https://api.hubapi.com';
// Pinned stable date-based CRM API. Upgrade deliberately, after contract tests.
const OBJECTS_PATH = '/crm/objects/2026-03';

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

function association(contactId, typeId) {
  return [{ to: { id: objectId(contactId) }, types: [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId },
  ] }];
}

export function contactRecordUrl(portalId, contactId) {
  return `https://app.hubspot.com/contacts/${objectId(portalId)}/record/0-1/${objectId(contactId)}`;
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
      const page = await this.request('POST', `${OBJECTS_PATH}/contacts/search`, {
        filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
        properties: ['email', 'phone', 'firstname', 'lastname', 'hubspot_owner_id', 'lifecyclestage'],
        limit: 3,
      });
      if (!Array.isArray(page.results)) throw new HubSpotError('invalid_search_response');
      for (const contact of page.results) found.set(objectId(contact.id), contact);
    }
    return [...found.values()];
  }

  async ensureContact(intake) {
    const matches = await this.findContacts(intake);
    if (matches.length > 1) throw new HubSpotError('ambiguous_existing_contact');
    if (matches.length === 1) return { contact: matches[0], created: false };

    const properties = { lifecyclestage: 'lead' };
    if (intake.email) properties.email = intake.email;
    if (intake.phone) properties.phone = intake.phone;
    if (intake.name) properties.firstname = intake.name;
    if (this.ownerId) properties.hubspot_owner_id = this.ownerId;
    try {
      const contact = await this.request('POST', `${OBJECTS_PATH}/contacts`, { properties });
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
    const lines = [
      `LeadOps submission: ${intake.id}`,
      `Fuente: ${intake.sourceForm}; URL: ${intake.sourceUrl || 'unknown'}`,
      `UTM: ${JSON.stringify(intake.utm)}`,
      `Consentimiento para responder: sí; aviso: ${intake.consent.noticeVersion}; registrado: ${intake.consent.recordedAt}`,
      `Solicitud: ${intake.message || 'Sin mensaje'}`,
      `Resumen: ${research.summary}`,
      `Encaje sugerido: ${qualification.fit}; certeza: ${qualification.certainty}; revisión humana obligatoria`,
      `Motivo: ${qualification.rationale}`,
      `Faltantes: ${qualification.missingInformation.join(', ') || 'ninguno'}`,
      ...research.externalFacts.map(item => `Fuente pública: ${item.fact} — ${item.source}`),
    ];
    const note = await this.request('POST', `${OBJECTS_PATH}/notes`, {
      properties: { hs_timestamp: intake.consent.recordedAt, hs_note_body: lines.join('\n').slice(0, 12000) },
      associations: association(contactId, 202),
    });
    objectId(note.id);
    return note;
  }

  async createReviewTask(contactId, { intake, dueAt }) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(dueAt) || Number.isNaN(new Date(dueAt).getTime())) {
      throw new HubSpotError('invalid_task_due_at');
    }
    const properties = {
      hs_timestamp: new Date(dueAt).toISOString(),
      hs_task_subject: `Revisar consulta LeadOps ${intake.id}`,
      hs_task_body: 'Revisar la nota, validar encaje y certeza, decidir responsable y siguiente paso. No contactar automáticamente.',
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
    };
    if (this.ownerId) properties.hubspot_owner_id = this.ownerId;
    const task = await this.request('POST', `${OBJECTS_PATH}/tasks`, {
      properties, associations: association(contactId, 204),
    });
    objectId(task.id);
    return task;
  }
}
