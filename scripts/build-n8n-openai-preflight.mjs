import { writeFile } from 'node:fs/promises';
import { summarizeOpenAiPreflight } from '../src/openai-preflight.mjs';

const workflow = {
  id: 'aramis-openai-preflight', name: 'Aramis LeadOps — comprobar OpenAI (sin generar texto)', active: false,
  nodes: [
    { id: 'openai-check-start', name: 'Comprobar OpenAI', type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1, position: [200, 280], parameters: {} },
    { id: 'openai-check-models', name: 'OpenAI · listar modelos', type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2, position: [460, 280], retryOnFail: false, onError: 'continueRegularOutput',
      parameters: { method: 'GET', url: 'https://api.openai.com/v1/models',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
        options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } } },
    { id: 'openai-check-summary', name: 'Resultado de conexión OpenAI', type: 'n8n-nodes-base.code',
      typeVersion: 2, position: [740, 280], parameters: { mode: 'runOnceForAllItems',
        jsCode: `const summarize = ${summarizeOpenAiPreflight.toString()};\nreturn $input.all().map(item => ({ json: summarize(item.json) }));` } },
    { id: 'openai-check-guide', name: 'Configurar OpenAI', type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1, position: [370, -30], parameters: { width: 540, height: 240,
        content: '## Comprobar la credencial OpenAI\nEn «OpenAI · listar modelos», seleccioná tu credencial **OpenAI**. La clave se guarda únicamente en el editor de credenciales, nunca en este workflow.\n\nEste GET solo verifica acceso a la lista de modelos. No envía una consulta comercial ni genera texto. No prueba saldo, acceso de generación ni búsqueda web.\n\nEjecución manual. No publicar. El export público no contiene credenciales.' } },
  ],
  connections: {
    'Comprobar OpenAI': { main: [[{ node: 'OpenAI · listar modelos', type: 'main', index: 0 }]] },
    'OpenAI · listar modelos': { main: [[{ node: 'Resultado de conexión OpenAI', type: 'main', index: 0 }]] },
  }, settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
};
await writeFile(new URL('../n8n/leadops-openai-preflight.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
