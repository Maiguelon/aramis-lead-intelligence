# CRM mapping and reviewer handoff

The fictional demonstration can run without a HubSpot account. A live connection awaits credentials and portal-level validation; **no real account write has been attempted**.

## Object model

| Intake fact | HubSpot destination | Rule |
| --- | --- | --- |
| Normalized email / E.164 phone | Contact `email` / `phone` | Search both when present. If they resolve to different contacts, stop for manual resolution. Never invent an email. |
| Name | Contact `firstname` on new records only | Kept whole because splitting international names automatically is unreliable. Reviewer may refine it. |
| New contact | Contact `lifecyclestage=lead` | Existing lifecycle and owner are never downgraded or overwritten. |
| Configured owner ID | New contact `hubspot_owner_id`; review task owner | If absent, leave unassigned for the reviewer queue. |
| Submission, UTM, consent evidence, recap, fit and certainty | Associated note | New note per *new submission*, not per retry; the workflow ledger controls that. |
| Pending human decision | Open associated task | `NOT_STARTED`, medium priority, due time supplied by orchestration. No automated prospect email. |
| Company | Optional later association | Only a supplied and unambiguous company/domain is eligible; never infer from Gmail/Outlook or auto-create from an AI guess. |

The internal email card contains the qualification recommendation and its certainty as separate fields, the missing information, public-source links (if verified), and a deep link to the contact. It is **not** a HubSpot CRM extension/card. The person should not receive it.

## API and access checks

The adapter pins `/crm/objects/2026-03` for search and creation. The version is in one place for a controlled upgrade. HubSpot [announced the end of support for v1-v3 APIs in September 2027](https://developers.hubspot.com/changelog/legacy-apis-and-legacy-apps-whats-going-unsupported-and-when), so a new implementation should not start on `/crm/v3/`. The dated CRM paths and note association example are in [HubSpot's current docs](https://developers.hubspot.com/docs/api-reference/latest/files/guide). Task creation and association must be smoke-tested in the actual portal before live use; account scopes and required CRM properties may vary. The task-to-contact type ID currently used is `204`, and note-to-contact is `202`; both are isolated in the adapter and should be confirmed against the portal's association labels endpoint during setup.

Onboarding needs a HubSpot account/portal ID and an app token with the necessary contact read/write and activity scopes. The token stays in the automation's credential store, never in this repository, screenshots or chat. A 401/403 is a configuration error, 429/5xx is retryable, and an ambiguous contact is a manual exception. Contact creation returning 409 triggers a fresh search, not blind duplication.

## Human step

The reviewer opens the task, checks the original request and sources, confirms or changes the suggested fit, chooses an owner if needed, then records the next action and completes the task. HubSpot is the source of truth for that decision. Unknown budget/timing is not a reason to mark an otherwise relevant inquiry as bad.
