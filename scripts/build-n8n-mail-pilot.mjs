import { readFile, writeFile } from 'node:fs/promises';
import { normalizeIntake } from '../src/intake.mjs';
import { researchStub, qualifyStub } from '../src/qualification.mjs';
import { nativeReviewCardCode } from '../src/review-card.mjs';
import { resendRequest, summarizeResendResponse } from '../src/resend.mjs';
import { prepareMailPilot, summarizeMailPilot } from '../src/mail-pilot.mjs';

const raw = JSON.parse(await readFile(new URL('../fixtures/hubspot-pilot.json', import.meta.url), 'utf8'));
const intake = normalizeIntake(raw, { receivedAt: '2026-10-27T00:00:00Z' }).intake;
const research = researchStub(intake);
const bundle = { fictional: true, intake, research, qualification: qualifyStub(intake, research) };
const code = (id, name, jsCode, position) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2,
  position, parameters: { mode: 'runOnceForAllItems', jsCode } });
const workflow = {
  id: 'aramis-resend-pilot', name: 'Aramis LeadOps — tarjeta interna Resend (preview por defecto)', active: false,
  nodes: [
    { id: 'mail-start', name: 'Probar tarjeta interna', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [100, 300], parameters: {} },
    { id: 'mail-config', name: 'Modo y correo interno', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [330, 300], parameters: {
      assignments: { assignments: [
        { id: 'mail-mode', name: 'mode', value: 'preview', type: 'string' },
        ...['from', 'to', 'portalId', 'contactId', 'confirmInternalSend'].map(name => ({ id: `mail-${name}`, name, value: '', type: 'string' })),
      ] }, options: {} } },
    code('mail-prepare', 'Preparar tarjeta ficticia', `${nativeReviewCardCode()}\nconst requestFor = ${resendRequest.toString()};\nconst prepare = ${prepareMailPilot.toString()};\nreturn [{ json: prepare($input.first().json, ${JSON.stringify(bundle)}, renderReviewCard, requestFor) }];`, [570, 300]),
    { id: 'mail-gate', name: '¿Enviar prueba interna?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [820, 300], parameters: {
      conditions: { combinator: 'and', options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'mail-send-condition', leftValue: '={{ $json.status }}', rightValue: 'awaiting_send', operator: { type: 'string', operation: 'equals' } }] }, options: {} } },
    { id: 'mail-send', name: 'Resend · enviar tarjeta interna', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1070, 180], retryOnFail: false, onError: 'continueRegularOutput', parameters: {
      method: 'POST', url: 'https://api.resend.com/emails', authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Idempotency-Key', value: '={{ $json.request.headers["Idempotency-Key"] }}' }] },
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ $json.request.body }}',
      options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
    } },
    code('mail-result', 'Resultado de envío interno', `const summarize = ${summarizeMailPilot.toString()};\nconst providerSummary = ${summarizeResendResponse.toString()};\nreturn [{ json: summarize($('Preparar tarjeta ficticia').first().json, $input.first().json, providerSummary) }];`, [1330, 180]),
    code('mail-preview', 'Vista previa sin envío', `const summarize = ${summarizeMailPilot.toString()};\nreturn $input.all().map(item => ({ json: summarize(item.json) }));`, [1080, 500]),
    { id: 'mail-guide', name: 'Guía de tarjeta interna', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [300, -100], parameters: { width: 660, height: 310, content:
      '## Prueba de entrega de la tarjeta\n**preview**: muestra HTML y texto sin enviar correo. Los IDs CRM sin configurar usan un enlace ficticio de demostración.\n\n**send**: requiere remitente verificado, destinatario interno, IDs CRM reales del contacto ficticio y confirmInternalSend=YES_SEND_INTERNAL_DEMO. Seleccionar la credencial Resend en el nodo HTTP.\n\nDatos ficticios y análisis simulado, claramente etiquetados. No modifica HubSpot ni llama a IA. El destinatario sale solo de la configuración operativa, nunca del formulario del lead.\n\nIdempotency-Key estable por evento; Resend la conserva 24 horas. Sin reintentos automáticos. API aceptada no equivale a entrega confirmada. No publicar.' } },
  ],
  connections: {
    'Probar tarjeta interna': { main: [[{ node: 'Modo y correo interno', type: 'main', index: 0 }]] },
    'Modo y correo interno': { main: [[{ node: 'Preparar tarjeta ficticia', type: 'main', index: 0 }]] },
    'Preparar tarjeta ficticia': { main: [[{ node: '¿Enviar prueba interna?', type: 'main', index: 0 }]] },
    '¿Enviar prueba interna?': { main: [[{ node: 'Resend · enviar tarjeta interna', type: 'main', index: 0 }], [{ node: 'Vista previa sin envío', type: 'main', index: 0 }]] },
    'Resend · enviar tarjeta interna': { main: [[{ node: 'Resultado de envío interno', type: 'main', index: 0 }]] },
  }, settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
};
await writeFile(new URL('../n8n/leadops-mail-pilot.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
