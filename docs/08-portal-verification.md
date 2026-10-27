# Portal contract verification — 2026-10-26

The HubSpot connector was connected and used for **read-only schema discovery**. No CRM records, associations, properties, onboarding goals or permissions were changed. This check does not authenticate the n8n workflow.

## Confirmed in the connected account

| Item | Observed result | LeadOps implication |
| --- | --- | --- |
| CONTACT, COMPANY, NOTE, TASK | Read and write available through the connector | The core object model is supported. This does not establish Service Key scopes. |
| Contact fields | `firstname`, `email`, `phone`, `lifecyclestage`, `hubspot_owner_id` exist | The adapter's base mapping is compatible with the portal schema. |
| `lifecyclestage` | `lead` is an available option | Valid initial stage for a new inquiry; preserve existing records' lifecycle. |
| `hs_task_status` | `NOT_STARTED` is available | A pending human-review task can use this status. |
| `hs_task_priority` | `MEDIUM` is available | The adapter's default priority is valid. |
| Task `hs_timestamp` | Datetime, labelled Due date | Map the planned review deadline here. |
| Note fields | `hs_note_body` and `hs_timestamp` exist | Store the intake evidence and activity time in an associated note. |
| Reviewer | One active owner matched the intended reviewer | Resolve the actual owner ID privately during configuration. Do not hard-code personal account IDs in public fixtures. |
| Onboarding | Initial onboarding goal not set | This did not prevent schema reads or object availability discovery. |

Lifecycle options observed were `subscriber`, `lead`, `marketingqualifiedlead`, `salesqualifiedlead`, `opportunity`, `customer`, `evangelist`, and `other`. Task statuses were `COMPLETED`, `DEFERRED`, `IN_PROGRESS`, `NOT_STARTED`, and `WAITING`; priorities were `NONE`, `LOW`, `MEDIUM`, and `HIGH`.

This was a schema and permission inspection, not an audit of CRM data. No contact/company counts or sample records were queried, so it establishes neither that the portal is empty nor that it contains only fictional data. Personal identifiers and raw connector responses are deliberately not committed.

## Subsequent API verification

The user created a Service Key and saved it in n8n. The authenticated preflight returned HTTP 200. Read-only association queries also returned HTTP 200 and verified note-to-contact type `202` and task-to-contact type `204`.

The authorized fictional pilot searched successfully but contact creation returned HTTP 403 / MISSING_SCOPES; no note/task request followed. A separate exact-email CRM search returned zero matches. No records were created, and the pilot was returned to preview. Connector write availability does not grant the Service Key equivalent access.

On 2026-10-27, after the user replaced the Service Key in n8n, the same dated API successfully created the fictional contact, note and task. Independent reads confirmed the mapped values and reviewer; association-filtered searches returned exactly one note and one task on the fictional contact. A repeat of the native manual pilot found the existing contact and executed no write nodes. The workflow was returned to inactive preview.

Still pending: real AI research/qualification, internal email delivery, a production event store and full intake/replay/failure scenarios with provider credentials. The manual pilot's existing-contact stop is not proof of production exactly-once delivery. See the [native pilot record](10-native-crm-pilot.md).

## Local runtime blocker observed during inspection

The existing `.local/n8n/database.sqlite` and `.local/n8n/config` files are still present. Their presence alone is not a database-integrity or credential-decryption test.

Docker Desktop 4.76.0 failed during startup while trying to replace its `dockerInference` runtime endpoint. The local endpoint is a zero-byte `Archive, ReparsePoint` object, and backend logs report Windows access/name errors. The engine pipe does not become available. This matches a failure class reported in [Docker's issue tracker](https://github.com/docker/desktop-feedback/issues/625); that issue includes a maintainer's report of fixes in 4.92, but an upgrade has not been tested on this machine. Do not assume disabling Model Runner resolves the issue: reports show its listener can still initialize.

At this inspection checkpoint, no factory reset, prune, data-directory removal, settings modification, diagnostic upload or Docker update had been performed. Miguel subsequently authorized the required exception to the workspace-only write constraint. Docker and n8n were recovered while preserving data; see the [recovery and verification record](09-docker-recovery.md).
