/** Safe to embed in an n8n Code node. Never return provider errors or account model names. */
export function summarizeOpenAiPreflight(response) {
  const httpStatus = Number.isInteger(response?.statusCode) ? response.statusCode : null;
  const base = { httpStatus, generationPerformed: false, generationPermissionVerified: false,
    crmWritesPerformed: false };
  if (response?.error || httpStatus === null) {
    return { ...base, status: 'configuration_needed', reason: 'credential_or_network_error' };
  }
  if (httpStatus === 401) return { ...base, status: 'configuration_needed', reason: 'invalid_or_expired_credential' };
  if (httpStatus === 403) return { ...base, status: 'configuration_needed', reason: 'missing_models_read_permission' };
  if (httpStatus === 429 && response.body?.error?.code === 'insufficient_quota') {
    return { ...base, status: 'configuration_needed', reason: 'api_quota_unavailable' };
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    return { ...base, status: 'retry_later', reason: httpStatus === 429 ? 'rate_limited' : 'provider_unavailable' };
  }
  const models = response.body?.data;
  if (httpStatus !== 200 || !Array.isArray(models) || models.some(model => typeof model?.id !== 'string')) {
    return { ...base, status: 'manual_review', reason: 'unexpected_model_list_response' };
  }
  return { ...base, status: 'connected_read_only', reason: 'model_list_succeeded', modelCount: models.length,
    candidateModels: { 'gpt-5.4-mini': models.some(model => model.id === 'gpt-5.4-mini'),
      'gpt-5.4-mini-2026-03-17': models.some(model => model.id === 'gpt-5.4-mini-2026-03-17') } };
}
