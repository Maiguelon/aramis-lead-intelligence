import { createHash } from 'node:crypto';

const MAX_FIELD = 2000;
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const KNOWN_FORMS = new Set(['footer', 'plan_card', 'demo', 'manual']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTERNATIONAL_PHONE = /^\+[1-9]\d{7,14}$/;

function field(value, max = MAX_FIELD) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function lower(value, max) {
  return field(value, max).toLowerCase();
}

function email(value) {
  const normalized = lower(value, 254);
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
}

function phone(value) {
  const normalized = field(value, 64).replace(/^whats?app\s*:?\s*/i, '').replace(/[\s()-]/g, '');
  return INTERNATIONAL_PHONE.test(normalized) ? normalized : null;
}

function date(value) {
  const input = field(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parsePlan(value) {
  if (!value) return null;
  let parsed = value;
  if (typeof value === 'string') {
    if (value.length > 10000) return null;
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const choices = parsed.selections;
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) return null;
  const output = {};
  for (const key of ['posts', 'reels', 'folletos']) {
    const value = choices[key];
    if (Number.isInteger(value) && value >= 0 && value <= 100) output[key] = value;
  }
  for (const key of ['ads', 'brandbook', 'tarjetas', 'tiendanube', 'pagina']) {
    if (typeof choices[key] === 'boolean') output[key] = choices[key];
  }
  return Object.keys(output).length ? output : null;
}

function serviceFromPlan(plan) {
  if (!plan) return null;
  const services = [];
  if ((plan.posts || 0) > 0 || (plan.reels || 0) > 0 || plan.ads) services.push('redes_sociales');
  if (plan.brandbook || plan.tarjetas || (plan.folletos || 0) > 0) services.push('identidad_visual');
  if (plan.pagina || plan.tiendanube) services.push('pagina_web');
  return services.length ? services : null;
}

function serviceFromText(text) {
  const lowerText = lower(text, MAX_FIELD);
  const services = [];
  if (/redes|social|posteos?|reels?|publicidad|meta ads/.test(lowerText)) services.push('redes_sociales');
  if (/identidad|marca|branding|logo|brandbook|dise[ñn]o/.test(lowerText)) services.push('identidad_visual');
  if (/p[aá]gina|sitio|web|tienda online|ecommerce/.test(lowerText)) services.push('pagina_web');
  return services.length ? services : null;
}

function outcome(status, reason, intake = null) {
  return { status, reason, intake };
}

/**
 * Parse a Formspree-shaped object or a trusted webhook's `body` object.
 * The caller must supply its own trusted receipt timestamp for real intake;
 * browser-supplied timestamps are useful only in fictional test fixtures.
 */
export function normalizeIntake(raw, { receivedAt = null } = {}) {
  const payload = raw?.body && typeof raw.body === 'object' ? raw.body : raw;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return outcome('rejected', 'invalid_payload');

  const submissionId = field(payload.submission_id, 160);
  if (!submissionId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(submissionId)) {
    return outcome('manual_review', 'missing_or_invalid_submission_id');
  }
  if (payload.consentimiento_contacto !== true) return outcome('rejected', 'contact_consent_not_explicit');
  const noticeVersion = field(payload.consentimiento_texto_version, 80);
  const consentAt = date(receivedAt || payload.consentimiento_fecha);
  if (!noticeVersion || !consentAt) return outcome('rejected', 'consent_evidence_incomplete');

  const form = lower(payload.source_form, 40) || 'demo';
  if (!KNOWN_FORMS.has(form)) return outcome('manual_review', 'unknown_source_form');

  const contactField = field(payload.contacto, 254);
  const normalizedEmail = email(payload.email) || email(contactField);
  const normalizedPhone = phone(payload.telefono) || phone(contactField);
  if (!normalizedEmail && !normalizedPhone) return outcome('manual_review', 'missing_or_ambiguous_identity');

  const plan = parsePlan(payload.plan);
  const serviceHints = serviceFromPlan(plan) || serviceFromText([payload.servicio, payload.mensaje].join(' '));
  const utm = Object.fromEntries(UTM_FIELDS.map(key => [key, lower(payload[key], 120) || 'unknown']));
  const identityKey = normalizedEmail ? `email:${normalizedEmail}` : `phone:${normalizedPhone}`;
  const intake = {
    id: submissionId,
    identityKey,
    email: normalizedEmail,
    phone: normalizedPhone,
    name: field(payload.nombre, 160),
    social: field(payload.redes, 160),
    company: field(payload.empresa, 160),
    companyWebsite: field(payload.empresa_web, 300),
    message: field(payload.mensaje, MAX_FIELD),
    sourceForm: form,
    sourceUrl: field(payload.source_url, 500),
    serviceHints: serviceHints || [],
    plan,
    utm,
    consent: { contact: true, noticeVersion, recordedAt: consentAt },
  };
  intake.fingerprint = createHash('sha256').update(`${intake.sourceForm}:${intake.id}`).digest('hex');
  return outcome('accepted', 'ok', intake);
}
