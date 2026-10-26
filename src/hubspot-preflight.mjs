/** Return operational status only; never echo provider bodies, records or errors. */
export function summarizeHubSpotPreflight(response) {
  const status = Number.isInteger(response?.statusCode) ? response.statusCode : null;
  const result = { status: 'configuration_needed', reason: 'credential_or_network_error',
    httpStatus: status, crmWritesPerformed: false, writeAccessVerified: false };
  if (response?.error || status === null) return result;
  if (status === 200) {
    if (!Array.isArray(response.body?.results)) {
      return { ...result, status: 'manual_review', reason: 'unexpected_search_response' };
    }
    return { ...result, status: 'connected_read_only', reason: 'contact_search_succeeded',
      matchingDemoContacts: response.body.results.length };
  }
  if (status === 401) return { ...result, reason: 'invalid_or_expired_credential' };
  if (status === 403) return { ...result, reason: 'missing_contact_read_permission' };
  if (status === 429 || status >= 500) {
    return { ...result, status: 'retry_later', reason: status === 429 ? 'rate_limited' : 'provider_unavailable' };
  }
  return { ...result, status: 'manual_review', reason: 'endpoint_or_request_rejected' };
}
