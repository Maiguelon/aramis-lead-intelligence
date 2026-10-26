import { writeFile } from 'node:fs/promises';
import { summarizeHubSpotPreflight } from '../src/hubspot-preflight.mjs';

const workflow = {
  id: 'aramis-hubspot-preflight',
  name: 'Aramis LeadOps — comprobar HubSpot (solo lectura)',
  active: false,
  nodes: [
    { id: 'preflight-start', name: 'Comprobar conexión', type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1, position: [200, 280], parameters: {} },
    { id: 'preflight-search', name: 'Buscar contacto ficticio', type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2, position: [460, 280], onError: 'continueRegularOutput', retryOnFail: false,
      parameters: {
        method: 'POST', url: 'https://api.hubapi.com/crm/objects/2026-03/contacts/search',
        authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
        sendBody: true, contentType: 'json', specifyBody: 'json',
        jsonBody: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ',
          value: 'leadops-connection-check@example.test' }] }], properties: ['email'], limit: 1 }),
        options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
      } },
    { id: 'preflight-result', name: 'Resultado sin datos personales', type: 'n8n-nodes-base.code',
      typeVersion: 2, position: [740, 280], parameters: { mode: 'runOnceForAllItems',
        jsCode: `const summarize = ${summarizeHubSpotPreflight.toString()};\nreturn $input.all().map(item => ({ json: summarize(item.json) }));` } },
    { id: 'preflight-guide', name: 'Configurar credencial', type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1, position: [360, -20], parameters: { width: 440, height: 220,
        content: '## Conectar HubSpot\nEn «Buscar contacto ficticio», seleccioná una credencial **Bearer Auth** con tu Service Key de HubSpot. Guardá el token solo en la credencial.\n\nEste POST es una búsqueda: no crea ni modifica contactos. El resultado confirma únicamente lectura; las escrituras y el flujo completo se probarán por separado. No publicar este workflow.' } },
  ],
  connections: {
    'Comprobar conexión': { main: [[{ node: 'Buscar contacto ficticio', type: 'main', index: 0 }]] },
    'Buscar contacto ficticio': { main: [[{ node: 'Resultado sin datos personales', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
};

await writeFile(new URL('../n8n/leadops-hubspot-preflight.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
