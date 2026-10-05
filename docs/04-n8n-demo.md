# n8n offline workflow

`n8n/leadops-demo.json` is a native, importable n8n workflow. It was imported and executed successfully with n8n 2.41.3 in an isolated local test instance on 2026-09-30. The workflow has no credentials, external HTTP calls, CRM writes or email delivery.

After rebuilding the local Docker instance on 2026-10-05, the same export was imported and executed with n8n 2.41.7: execution status `success`, three review cards, one duplicate and one consent rejection. The imported workflow remains inactive and is ready to inspect in the editor once the local owner setup is completed.

## Show it

1. In n8n, import `n8n/leadops-demo.json` as a workflow. Leave it inactive.
2. Click **Execute workflow**. The manual trigger produces five fictional scenarios.
3. Inspect `Consentimiento + normalización` and `¿Entrada aceptada?`: three are accepted, one is a duplicate and one is rejected for lack of consent.
4. Follow the accepted branch: `CRM simulado` → `Agente 1 · resumen simulado` → `Agente 2 · encaje simulado` → `Tarjeta de revisión`.
5. In the last node, inspect `cardHtml` for the three internal review-card previews. Nothing is sent.

The Code nodes intentionally duplicate only enough logic for a visual, credential-free walkthrough. The Node.js core under `src/` is the more complete and tested contract for real consent, phone-only identity, retry states, HubSpot API mapping and cited OpenAI research. Do not publish the demo workflow as a live inbound integration: its duplicate check is in-memory for one execution only, and its CRM and agents are explicit stubs.

To regenerate the export after editing the builder, run `npm run build:n8n-demo`. `npm run check` tests the graph and each Code node's output. The real n8n CLI import/execution smoke test is not part of the normal test command because n8n is not a project dependency and installation is large.

## Live pilot still to connect

The operational replacement should use a consented n8n Form Trigger or an authenticated Webhook, persistent atomic event claim, HubSpot credentials, OpenAI credentials, and SMTP credentials. It must carry the same review-task and unknown-write reconciliation rules documented in [recovery](03-recovery.md). The current Formspree Free account cannot emit the webhook, and the existing Aramis website is out of scope for edits here.
