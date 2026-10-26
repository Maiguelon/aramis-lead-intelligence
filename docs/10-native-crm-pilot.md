# Native n8n CRM pilot

`n8n/leadops-hubspot-pilot.json` is a manual smoke test of the shared HubSpot request contract. It is separate from the credential-free five-scenario demo and from the future production intake workflow. Its analysis is an explicitly labelled deterministic fixture; it does not call an AI provider or send email.

## Modes

Open **Modo y portal** to configure the test:

| Mode | Behavior | Credential / scope |
| --- | --- | --- |
| `preview` (default) | Shows the fictional contact and intended activities. Executes no HTTP nodes. | None |
| `check` | Searches the single fictional email and reports read access. Creates nothing. | Bearer Auth, contact read |
| `write` | If the fictional contact does not exist, creates one contact, one associated note and one open review task. | Bearer Auth, validated write permissions; explicit confirmation and portal ID |

The export is inactive and has no credential references. It has a manual trigger only; do not publish it as a live intake.

The sole allowed fixture is `fixtures/hubspot-pilot.json`: `pilot-crm-001`, `source_form=demo`, and `leadops-crm-pilot@example.com`. It carries a fictional-consent notice, a fresh receiver timestamp and a prominent test message. The portable preparation gate rejects missing consent, a changed email/identity or non-fictional input.

## Preview

Run the workflow with `mode=preview`. Inspect **Resumen de prueba**: expect `status=preview`, `effects=[]`, `analysisMode=fixture_stub`. No provider account is needed. The proposed contact is a new `lead`; no existing record would be updated.

## Read check

Configure the Bearer Auth credential in **HubSpot · buscar contacto** and select `mode=check`. The final result should be `connected_read_only` with no effects. The separate [minimal preflight](07-hubspot-connection.md) remains available as a simpler three-node connection check.

## Controlled write test

Do this only after read access, note/task association definitions and required write permissions are verified. Review the planned changes first:

| Object | New values |
| --- | --- |
| Contact | `firstname=LeadOps CRM Pilot (ficticio)`, `email=leadops-crm-pilot@example.com`, `lifecyclestage=lead` |
| Associated note | Fictional inquiry, source/UTM, fictional consent evidence, simulated recap and qualification, submission ID |
| Associated task | `Revisar consulta LeadOps pilot-crm-001`, status `NOT_STARTED`, priority `MEDIUM`, due 24 hours after execution |

Assign the same approved Bearer Auth credential to all four HTTP nodes. In **Modo y portal**, enter the actual numeric `portalId`; optionally enter a validated `ownerId`. Neither value is committed in the public export. Select `mode=write` and type `YES_CREATE_DEMO_RECORDS` into `confirmFictionalWrites`. Without both the confirmation and portal ID, the preparation gate blocks all network calls.

Existing contacts are never modified. If the search returns any matching contact, the workflow stops with `existing_contact_no_writes`; it does not add activities to that record. This includes a contact left by an earlier partial test.

## Failure handling and limits

Every write result is checked before the next request. HTTP 401/403 write rejections stop with `configuration_needed`, the HTTP status and failed step; they do not imply an unknown write outcome. Other failed or ambiguous writes stop with a reconciliation reason and preserve the IDs already returned. The four HTTP nodes have automatic retries disabled. No provider error body is copied into the final summary.

This is a bounded contract test, **not** the final persistent recovery mechanism. It has no atomic event ledger. Search indexing can be delayed, so an immediate second execution after a timeout is unsafe. Inspect HubSpot by the fixture email and submission marker before any repeat. A partial run is reconciled manually; this pilot does not resume it automatically or guarantee exactly-once execution. See [the production ledger contract](03-recovery.md).

## Verification record

On 2026-10-26, 42 automated tests passed. The native export was imported and executed successfully with n8n 2.41.7 in a fresh Docker validation instance whose data mount was checked to be isolated from the user's instance. Preview completed with **zero HTTP nodes executed and zero CRM effects**. The live local n8n service remained running throughout that test.

The saved Bearer credential subsequently passed the authenticated contact search (HTTP 200). A separate read-only probe confirmed the portal's note-to-contact association `202` and task-to-contact association `204`, both with HTTP 200. That metadata probe uses the supported v4 association-labels endpoint; the pilot's object requests retain the dated API contract.

The user authorized the fixed fictional contact, note and task. Its search returned zero matches, but contact creation returned **HTTP 403 / MISSING_SCOPES**. The note and task nodes did not execute. A subsequent exact-email search through the connected CRM also returned zero matches. **No CRM records were created.** The local pilot was returned to preview; the improved permission-error handler was then imported while preserving its credential references and private configuration. That updated pilot also completed native preview with zero HTTP nodes and zero effects; the local service remained healthy. Successful workflow execution alone is not evidence of successful CRM writes: inspect the business result.

Effective `crm.objects.contacts.write` access on the key selected in n8n remains to be resolved before another write attempt. Do not add sensitive-data scopes as a workaround. Native preview and successful reads do not prove CRM writes, AI research, mail delivery or production recovery. Regenerate the export with `npm run build:n8n-pilot` after changing the builder or shared contract.

## Private preparation and receipts

`scripts/prepare-n8n-pilot.mjs` compares the saved inactive, unpinned pilot with the reviewed export before preparing a local import. It accounts for n8n's omitted defaults, preserves operator configuration only where intended, and resolves the saved preflight's Bearer credential by reference and type. It never reads credential values. Workflow snapshots, the prepared import and the read-only association probe are written under the Git-ignored `.local/n8n/leadops-verification/` directory.

The helper defaults to preview. A write preparation additionally requires `--mode write`, a numeric `--portal-id` and `--confirm-fictitious-writes`; preparing a file does not execute it or provide user approval. Use `--owner-id` only after validating the intended reviewer. Do not commit generated private imports or receipts.

The first write attempt has a private intent record, execution receipt and reconciliation record in that directory. Keep previous attempts when resolving configuration and never blindly repeat an unknown outcome. A retry requires checking those records and the CRM first.
