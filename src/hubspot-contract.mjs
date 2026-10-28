/** Portable request contract shared by the API adapter and native n8n Code nodes. */
export function hubspotRequest(operation, values = {}) {
  const objectsPath = '/crm/objects/2026-03';
  const fail = code => { const error = new Error(code); error.code = code; throw error; };
  const objectId = value => {
    const id = String(value ?? '');
    if (!/^\d+$/.test(id)) fail('invalid_hubspot_object_id');
    return id;
  };
  const associations = (id, typeId) => [{ to: { id: objectId(id) }, types: [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId },
  ] }];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const request = (objectType, body) => ({ method: 'POST', path: `${objectsPath}/${objectType}`, body });

  if (operation === 'search_contact') {
    const { propertyName, value } = values;
    if (!['email', 'phone'].includes(propertyName) || typeof value !== 'string' || !value) {
      fail('invalid_contact_search');
    }
    return request('contacts/search', {
      filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
      properties: ['email', 'phone', 'firstname', 'lastname', 'hubspot_owner_id', 'lifecyclestage'], limit: 3,
    });
  }

  const { intake, ownerId = null } = values;
  if (!intake) fail('missing_intake');
  if (operation === 'create_contact') {
    const properties = { lifecyclestage: 'lead' };
    if (intake.email) properties.email = intake.email;
    if (intake.phone) properties.phone = intake.phone;
    if (!intake.email && !intake.phone) fail('missing_contact_identity');
    if (intake.name) properties.firstname = intake.name;
    if (ownerId != null) properties.hubspot_owner_id = objectId(ownerId);
    return request('contacts', { properties });
  }

  if (operation === 'create_note') {
    const { research, qualification, contactId } = values;
    const lines = [
      `LeadOps submission: ${intake.id}`,
      `Fuente: ${intake.sourceForm}; URL: ${intake.sourceUrl || 'unknown'}`,
      `UTM: ${JSON.stringify(intake.utm)}`,
      `Consentimiento para responder: sí; aviso: ${intake.consent.noticeVersion}; registrado: ${intake.consent.recordedAt}`,
      `Solicitud: ${intake.message || 'Sin mensaje'}`,
      `Resumen: ${research.summary}`,
      ...(research.identity ? [`Identidad profesional: ${research.identity.status}; certeza: ${research.identity.confidence}; ${research.identity.rationale}`] : []),
      `Encaje sugerido: ${qualification.fit}; certeza: ${qualification.certainty}; revisión humana obligatoria`,
      `Motivo: ${qualification.rationale}`,
      `Faltantes: ${qualification.missingInformation.join(', ') || 'ninguno'}`,
      ...research.externalFacts.map(item => `Fuente pública: ${item.fact}${item.confidence ? ` (certeza ${item.confidence})` : ''} — ${item.source}`),
    ];
    return request('notes', {
      properties: { hs_timestamp: intake.consent.recordedAt, hs_note_body: lines.map(escapeHtml).join('<br>').slice(0, 12000) },
      associations: associations(contactId, 202),
    });
  }

  if (operation === 'create_task') {
    const { contactId, dueAt } = values;
    if (typeof dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(dueAt) || Number.isNaN(new Date(dueAt).getTime())) {
      fail('invalid_task_due_at');
    }
    const properties = {
      hs_timestamp: new Date(dueAt).toISOString(),
      hs_task_subject: `Revisar consulta LeadOps ${intake.id}`,
      hs_task_body: 'Revisar la nota, validar encaje y certeza, decidir responsable y siguiente paso. No contactar automáticamente.',
      hs_task_status: 'NOT_STARTED', hs_task_priority: 'MEDIUM',
    };
    if (ownerId != null) properties.hubspot_owner_id = objectId(ownerId);
    return request('tasks', { properties, associations: associations(contactId, 204) });
  }
  fail('unknown_hubspot_operation');
}
