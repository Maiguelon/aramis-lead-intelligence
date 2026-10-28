import { randomUUID } from 'node:crypto';
import { CONSENT_TEXT, CONSENT_VERSION } from './tally.mjs';

/** Draft only. Keep the returned blueprint to bind stable block IDs after creation. */
export function tallyFormBlueprint(uuid = randomUUID) {
  const blocks = [], fields = {};
  const block = (type, groupType, payload) => {
    const item = { uuid: uuid(), type, groupUuid: uuid(), groupType, payload };
    blocks.push(item); return item;
  };
  block('FORM_TITLE', 'TEXT', { html: 'Contacto · Aramis' });
  block('TEXT', 'TEXT', { html: 'Contanos qué necesitás y revisaremos tu consulta personalmente. Los campos de empresa y redes son opcionales.' });
  const input = (key, label, placeholder, required = false, type = 'INPUT_TEXT') => {
    block('TITLE', 'QUESTION', { html: label });
    fields[key] = block(type, type, { name: key, isRequired: required, placeholder,
      hasMaxCharacters: true, maxCharacters: type === 'TEXTAREA' ? 2000 : 300 }).uuid;
  };
  input('nombre', 'Tu nombre', '¿Cómo te llamás?', true);
  input('contacto', 'Email o WhatsApp', 'Email o número con código de país, por ejemplo +54…', true);
  input('mensaje', '¿En qué podemos ayudarte?', 'Qué necesitás, para cuándo y cualquier contexto que quieras compartir', true, 'TEXTAREA');
  input('empresa', 'Empresa o proyecto (opcional)', 'Nombre de tu empresa o proyecto');
  input('empresa_web', 'Sitio web (opcional)', 'https://…');
  input('redes', 'Red profesional o del negocio (opcional)', 'Enlace al perfil, o usuario y plataforma');
  block('TITLE', 'QUESTION', { html: 'Permiso para gestionar tu consulta' });
  fields.consentimiento_contacto = block('CHECKBOX', 'CHECKBOXES', { name: 'consentimiento_contacto',
    index: 0, isFirst: true, isLast: true, isRequired: true, hasDefaultAnswer: false, text: CONSENT_TEXT }).uuid;
  const hidden = ['source_form', 'source_url', 'plan', 'plan_title', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  block('HIDDEN_FIELDS', 'HIDDEN_FIELDS', { hiddenFields: hidden.map(name => {
    const id = uuid(); fields[name] = id; return { uuid: id, name };
  }) });
  return { request: { status: 'DRAFT', settings: { language: 'es' }, blocks }, fields, noticeVersion: CONSENT_VERSION, consentText: CONSENT_TEXT };
}

/** Fail closed if the provider's question structure cannot bind every expected field uniquely. */
export function bindTallyQuestions(blueprint, questions) {
  if (!Array.isArray(questions)) throw Error('tally_questions_invalid');
  const bound = {};
  for (const [name, uuid] of Object.entries(blueprint.fields)) {
    const block = blueprint.request.blocks.find(item => item.uuid === uuid);
    const fieldId = block ? block.groupUuid : uuid;
    const matches = questions.filter(question => question.fields?.some(field => field.uuid === fieldId
      && (block ? question.type === block.groupType : question.type === 'HIDDEN_FIELDS' && field.title === name)));
    if (matches.length !== 1 || typeof matches[0].id !== 'string') throw Error(`tally_question_binding_failed:${name}`);
    bound[name] = block ? matches[0].id : { questionId: matches[0].id, answerKey: name, fieldId };
  }
  const identities = Object.values(bound).map(value => typeof value === 'string' ? `${value}:value` : `${value.questionId}:${value.answerKey}`);
  if (new Set(identities).size !== identities.length) throw Error('tally_question_binding_not_unique');
  return bound;
}
