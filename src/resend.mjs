/** Pure internal-mail contract, also embedded by native n8n workflows. */
export function resendRequest(card, { from, to } = {}) {
  const fail = code => { const error = new Error(code); error.code = code; throw error; };
  const email = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  if (typeof to !== 'string' || !email.test(to)) fail('invalid_internal_recipient');
  const sender = typeof from === 'string' ? (from.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] || from).trim() : '';
  if (!email.test(sender) || /[\r\n]/.test(from)) fail('invalid_internal_sender');
  if (!/^leadops-review\/[a-f0-9]{64}$/.test(card?.deliveryKey || '')) fail('invalid_mail_delivery_key');
  if (typeof card.subject !== 'string' || !card.subject.trim() || card.subject.length > 180 || /[\r\n]/.test(card.subject)) fail('invalid_mail_subject');
  if (typeof card.html !== 'string' || !card.html || card.html.length > 100000
    || typeof card.text !== 'string' || !card.text || card.text.length > 20000) fail('invalid_mail_content');
  // Recipient and sender come only from trusted operations configuration, never the lead.
  return { method: 'POST', url: 'https://api.resend.com/emails',
    headers: { 'Idempotency-Key': card.deliveryKey },
    body: { from, to: [to], subject: card.subject, html: card.html, text: card.text,
      tags: [{ name: 'system', value: 'aramis_leadops' }] } };
}

export function summarizeResendResponse(response) {
  const httpStatus = Number.isInteger(response?.statusCode) ? response.statusCode : null;
  const base = { httpStatus, deliveryConfirmed: false, automaticProspectContact: false };
  if (response?.error || httpStatus === null || httpStatus >= 500) {
    return { ...base, status: 'manual_review', reason: 'mail_outcome_requires_reconciliation' };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { ...base, status: 'configuration_needed', reason: 'resend_credential_or_domain_permission' };
  }
  if (httpStatus === 429) return { ...base, status: 'retry_later', reason: 'resend_rate_or_quota_limit' };
  if (httpStatus === 409) return { ...base, status: 'manual_review', reason: 'mail_idempotency_requires_reconciliation' };
  const id = response.body?.id;
  if ([200, 201].includes(httpStatus) && typeof id === 'string'
    && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    return { ...base, status: 'accepted', reason: 'resend_accepted_internal_mail', emailId: id };
  }
  return { ...base, status: 'manual_review', reason: 'mail_request_or_response_rejected' };
}

export class ResendError extends Error {
  constructor(code, status = null) {
    super(code); this.name = 'ResendError'; this.code = code; this.status = status;
    this.retryable = false;
  }
}

export function createResendMailer({ key, from, to, fetcher = fetch } = {}) {
  if (!key) throw new ResendError('missing_resend_key');
  return { async send(card) {
    const request = resendRequest(card, { from, to });
    let response;
    try { response = await fetcher(request.url, { method: request.method,
      headers: { ...request.headers, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body) }); }
    catch { throw new ResendError('mail_outcome_requires_reconciliation'); }
    let body;
    try { body = await response.json(); } catch { throw new ResendError('mail_outcome_requires_reconciliation', response.status); }
    const summary = summarizeResendResponse({ statusCode: response.status, body });
    if (summary.status !== 'accepted') throw new ResendError(summary.reason, response.status);
    return { id: summary.emailId, deliveryConfirmed: false };
  } };
}
