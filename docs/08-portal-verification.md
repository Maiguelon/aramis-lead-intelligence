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

## Still to verify

1. Service Key availability and contact-read scope in this account.
2. Authenticated execution of `leadops-hubspot-preflight.json` from n8n.
3. Note/task association definitions, contact-write scope, and a controlled fictional contact + note + task smoke test.
4. Internal email delivery and the full intake/replay/failure scenarios with provider credentials.

## Local runtime blocker

The existing `.local/n8n/database.sqlite` and `.local/n8n/config` files are still present. Their presence alone is not a database-integrity or credential-decryption test.

Docker Desktop 4.76.0 failed during startup while trying to replace its `dockerInference` runtime endpoint. The local endpoint is a zero-byte `Archive, ReparsePoint` object, and backend logs report Windows access/name errors. The engine pipe does not become available. This matches a failure class reported in [Docker's issue tracker](https://github.com/docker/desktop-feedback/issues/625); that issue includes a maintainer's report of fixes in 4.92, but an upgrade has not been tested on this machine. Do not assume disabling Model Runner resolves the issue: reports show its listener can still initialize.

No factory reset, prune, data-directory removal, settings modification, diagnostic upload or Docker update was performed. Global Docker repair would modify files outside the repository, so it requires an explicit exception to the user's workspace-only write constraint. Preserve containers, volumes and their data disks in any agreed repair plan.
