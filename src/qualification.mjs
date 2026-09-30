const SERVICES = {
  redes_sociales: 'gestión de redes sociales',
  identidad_visual: 'identidad visual',
  pagina_web: 'página web',
};

/** Deterministic offline provider. It is intentionally modest about unknown facts. */
export function researchStub(intake) {
  const requested = intake.serviceHints.map(key => SERVICES[key]).filter(Boolean);
  const description = requested.length
    ? `Consulta por ${requested.join(', ')}${intake.message ? `: ${intake.message}` : '.'}`
    : intake.message || 'No se especificó una necesidad comercial.';
  return {
    summary: description.slice(0, 350),
    verifiedFacts: [
      ...(intake.message ? [{ fact: intake.message, source: 'intake:message' }] : []),
      ...(intake.plan ? [{ fact: `Selecciones del plan: ${JSON.stringify(intake.plan)}`, source: 'intake:plan' }] : []),
    ],
    externalFacts: [],
    missingInformation: [
      ...(!intake.company ? ['empresa'] : []),
      ...(!intake.serviceHints.length ? ['servicio solicitado'] : []),
      ...(!intake.message && !intake.plan ? ['detalle de la necesidad'] : []),
    ],
    researchStatus: 'not_performed',
  };
}

/** Recommendation only. It never gates CRM creation or human review. */
export function qualifyStub(intake, research) {
  const hasService = intake.serviceHints.length > 0;
  const hasDetail = Boolean(intake.message || intake.plan);
  const unrelated = /(?:busco|necesito|quiero)\s+(?:un\s+)?(?:contador|abogado|pr[eé]stamo|empleo)/i.test(intake.message);
  let fit = 'insufficient_information';
  if (unrelated && !hasService) fit = 'low_fit';
  else if (hasService && hasDetail) fit = 'high_fit';
  else if (hasService) fit = 'possible_fit';
  const certainty = unrelated || (hasService && hasDetail) ? 'medium' : 'low';
  const signals = [];
  if (hasService) signals.push({ signal: `Servicio alineado: ${intake.serviceHints.join(', ')}`, source: intake.plan ? 'intake:plan' : 'intake:message' });
  if (unrelated) signals.push({ signal: 'La necesidad expresada parece fuera de los servicios de Aramis', source: 'intake:message' });
  return {
    fit,
    certainty,
    signals,
    missingInformation: research.missingInformation,
    rationale: fit === 'high_fit'
      ? 'El servicio solicitado coincide con la oferta y existe una solicitud concreta.'
      : fit === 'low_fit'
        ? 'La solicitud parece ajena a la oferta; confirmar antes de cerrar.'
        : 'Faltan datos para una recomendación firme.',
    humanReviewRequired: true,
  };
}
