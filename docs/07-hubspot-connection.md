# Connect the HubSpot pilot

Opening HubSpot in a browser signs the person in; it does not authenticate n8n. The CRM connector in ChatGPT, if connected separately, can help inspect the portal but is also independent of the n8n credential.

## Authentication choice, checked 2026-10-26

Use a **HubSpot Service Key** for this account-level integration. HubSpot has ended new legacy private-app creation: September 28 for new accounts and October 26 for older accounts. Existing private apps still work, but a new pilot should follow the Service Key route. This needs Developer Tools or Super Admin access; Miguel subsequently created and saved a key in this portal.

Service Keys support data reads and writes, not HubSpot event webhooks. LeadOps receives inbound submissions in n8n and calls HubSpot; it does not currently need HubSpot to emit webhooks. OAuth and a distributed app are unnecessary for this single-account pilot.

Official references: [private-app creation sunset](https://developers.hubspot.com/changelog/legacy-private-app-creation-sunset), [Service Keys and permissions](https://developers.hubspot.com/changelog/service-keys), [Service Key setup and Bearer authentication](https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations).

## Read-only connection check

The export `n8n/leadops-hubspot-preflight.json` contains:

1. A manual trigger.
2. An HTTP Request that searches for `leadops-connection-check@example.test` using the pinned CRM API.
3. A result that reports permission or provider status without echoing contact properties or provider error text.

The HTTP method is POST because that is how CRM search works. The endpoint ends in `/contacts/search`; this workflow performs no CRM writes. A successful result verifies contact **read** access only, not write permissions, associations, portal identity or the full LeadOps flow.

When Docker and n8n are running:

1. In HubSpot, open **Settings → Integrations → Service Keys** (alternatively **Development → Keys → Service Keys**, depending on the navigation).
2. Create a key named `aramis-leadops-pilot`, initially with `crm.objects.contacts.read`. Do not select marketing, deal or company permissions for this first check.
3. In n8n, import the reviewed export, or use the read-only workflow mount:

   ```powershell
   docker compose exec -T n8n n8n import:workflow --input=/opt/leadops/workflows/leadops-hubspot-preflight.json
   ```

4. Open **Buscar contacto ficticio**. Its authentication is **Generic Credential Type → Bearer Auth**. Create a credential named `HubSpot — LeadOps pilot` and paste the Service Key into **Bearer Token**, without adding the word `Bearer`. Save it in the n8n credential store. The export deliberately contains no credential ID or token.
5. Execute manually and inspect **Resultado sin datos personales**. Expect `status=connected_read_only`, `crmWritesPerformed=false` and `writeAccessVerified=false`.

If the UI does not offer Service Keys or the scope, stop and check the account's feature availability and permissions. Do not substitute an old developer API key or put a secret in a workflow field, repository or chat. Do not create a second integration to work around an unexplained permission failure.

## Results and next step

| Result | Meaning / next action |
| --- | --- |
| `connected_read_only` | Search succeeded; next configure contact write access and smoke-test a fictional contact, note and task. |
| `invalid_or_expired_credential` | 401; check the selected credential and key. |
| `missing_contact_read_permission` | 403; check contact read scope and portal access. |
| `rate_limited` / `provider_unavailable` | 429 / 5xx; retry the manual read later. |
| `credential_or_network_error` | Check n8n node configuration and connectivity. Provider error text is intentionally not returned in the summary. |
| `unexpected_search_response` / `endpoint_or_request_rejected` | Inspect the node privately; API contract needs review before continuing. |

All 31 automated checks passed on 2026-10-26, including success, credential and provider errors, response sanitization, and the workflow's sole allowed search endpoint. The export was also imported successfully with the native n8n 2.41.3 CLI into a fresh isolated validation folder under `.tmp/`, without provider credentials or API execution. This confirms native import, not an authenticated HubSpot connection.

On 2026-10-26 Docker Desktop initially failed with an Inference Manager error. After the [authorized runtime recovery](09-docker-recovery.md), the workflow was imported successfully into the real local n8n 2.41.7 instance. It was initially unconfigured and inactive. The user subsequently configured its credential; the successful read check is recorded below. No CRM record has been created by the implementation agent.

The user subsequently completed the local n8n owner setup; its public settings reported setup no longer required and readiness remained `ok`. A separate [manual CRM pilot](10-native-crm-pilot.md), with preview as its default, has also been imported. It extends the same shared request contract to a controlled fictional contact/note/task test after credentials and permissions are ready.

## Authenticated read verified — 2026-10-26

The user created the HubSpot key and saved it directly in a n8n Bearer Auth credential. Only the credential reference, name and type were inspected; its value was not exported or printed.

Before execution, the saved workflow was compared with the reviewed read-only export, accounting for n8n's omitted default JSON/content and Code execution settings. Its graph matched and it had no pinned data. The saved workflow was then executed with n8n 2.41.7, using a separate internal task-broker port so the running editor did not need to stop.

The authenticated search returned **HTTP 200**, `status=connected_read_only`, `reason=contact_search_succeeded`, and zero matches for the single fictional check email. `crmWritesPerformed=false` and `writeAccessVerified=false`. This establishes contact-read access; it does not establish that the whole CRM is empty, verify portal identity, or prove contact/note/task writes.

The sanitized receipt is stored privately at `.local/verification/hubspot-read.json`. The public workflow export still contains no credential references. AI and mail provider connections are separate work.

A full private n8n backup was taken after this connection check. All ten file hashes were verified, and a metadata-only check confirmed the saved Bearer credential was present in the backed-up database. The service restarted healthy. Backup data, credential identifiers and encryption material remain excluded from Git.

## Write permission checkpoint — 2026-10-26

Authenticated read-only association queries verified note/contact and task/contact type IDs. The authorized fictional write pilot then searched successfully but its contact-create request received **403 / MISSING_SCOPES**. No contact, note or task was created; the workflow is back in preview. See the [pilot evidence and limits](10-native-crm-pilot.md).

This distinguishes the person's HubSpot permissions, the separately connected CRM tool, and the scopes effective on n8n's selected key. Inspect that same Service Key, confirm `crm.objects.contacts.write` is selected and save the update. If the token was rotated, replace the saved n8n Bearer value directly in its credential editor. Do not send it through chat or add unrelated sensitive-data permissions. An updated key has not been verified until the actual n8n write succeeds.
