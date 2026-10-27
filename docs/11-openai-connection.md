# OpenAI connection and secret handling

The user enters the API key directly into an **OpenAI** credential in n8n. Workflow exports and Code nodes do not contain the key. `openAiApi` is n8n's built-in credential type; the HTTP Request node uses it through **Predefined Credential Type**.

Use a project-scoped key with only the access needed for model listing and response creation. The dashboard may expose Responses permissions separately from Model Capabilities. Expiration and rotation are operator choices; a 90-day lifetime is a practical pilot default when account policy allows it. Before expiration, save a replacement in n8n and verify it. Never paste a key into chat or a workflow field.

Official references: [OpenAI permissions](https://developers.openai.com/api/docs/guides/rbac), [key expiration and rotation](https://developers.openai.com/api/docs/guides/production-best-practices), [n8n OpenAI credentials](https://docs.n8n.io/integrations/builtin/credentials/openai).

## Manual read-only check

`n8n/leadops-openai-preflight.json` makes exactly one request: `GET https://api.openai.com/v1/models`. Select the saved OpenAI credential in **OpenAI · listar modelos**, execute manually, and inspect **Resultado de conexión OpenAI**. The export is inactive, contains no credential references and does not send intake data, create a response, search the web, write to HubSpot or send mail.

The summary distinguishes credential errors, missing model-read permission, quota errors, rate limits and provider failures. It does not echo provider error messages or private model names. A successful list is **not** proof of generation access, sufficient API credit, model capability or research quality. See the [model-list endpoint](https://developers.openai.com/api/reference/resources/models/methods/list).

Regenerate the export with `npm run build:n8n-openai-preflight` after changing its builder or summary function.

## Verified — 2026-10-27

The user saved an OpenAI credential. Its reference and type were inspected without reading its value. The native n8n 2.41.7 workflow was imported into the intended personal project and returned **HTTP 200 / connected_read_only**. Both the `gpt-5.4-mini` alias and `gpt-5.4-mini-2026-03-17` snapshot appeared in the returned catalog. This is an account-availability observation, not an evaluation of their output.

All 45 automated tests passed at the connection checkpoint. The sanitized native receipt and private workflow import are under `.local/n8n/leadops-verification/`, excluded from Git. No model generation occurred in this check. The subsequent [two-agent pilot](12-native-ai-pilot.md) verified actual Responses generation, company research and human-review validation with fictional input; the expanded suite has 54 tests.

A full private backup taken after credential setup contains both saved credential types, the database and encryption configuration. All 47 file hashes matched its manifest, and the service restarted healthy. That backup predates the AI-generation pilot; its portable export is versioned separately.

## Git exclusions checked

The repository already ignores `.env`, `.env.*` and `.local/`, including the local n8n database and encryption configuration. `.env.example` is the deliberate exception for a placeholder-only template. A check on 2026-10-27 found no tracked environment files or private-instance files. Ignore rules do not remove a file that was already tracked; check the index before every commit containing integration changes.
