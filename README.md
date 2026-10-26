# Aramis LeadOps

An inbound lead-review system and CRM implementation case study for Aramis Agency. It demonstrates process design, consent handling, data quality, HubSpot mapping, evidence-based AI assistance, human handoff, idempotency and failure recovery. **All demonstration people and results are fictional.** Aramis currently wins most work through referrals, so this repository does not claim measured lead volume, conversion lift or commercial ROI.

## One-minute overview

```text
Formspree-shaped intake / future web form
        ↓
Explicit consent + identity + source/UTM validation
        ↓
Idempotency ledger → HubSpot contact (create or reuse)
        ↓
Agent 1: short brief + cited public company facts
Agent 2: service-fit recommendation + separate certainty
        ↓
HubSpot note + open review task → internal email card
        ↓
Human checks evidence, assigns owner and decides next action
```

HubSpot is the commercial system of record. The email is an alert, not a second CRM. AI never decides consent, changes a customer's lifecycle stage, creates a deal, or sends outreach to the prospect. Missing or refused consent blocks AI, CRM and email effects.

## Try the offline case

Node.js 22+ is sufficient; no account, token or dependency installation is needed.

```powershell
npm run demo
npm run check
```

The demo writes `demo-output/report.json` and three HTML review cards. It exercises a valid footer inquiry, a duplicate delivery, a returning person, a plan-form inquiry and a no-consent rejection. It uses an in-memory CRM, deterministic analysis and a fake mail sender. **It does not call Formspree, HubSpot, OpenAI or an SMTP provider.** Automated tests cover these pathways plus contact conflicts, rate limits, uncertain write outcomes and XSS-safe email rendering.

There is also a [native n8n demo workflow](n8n/leadops-demo.json) with the consent gate, simulated CRM handoff, two visibly separate analysis steps and review card. It was imported and executed successfully with n8n 2.41.3, without credentials or external writes. See [how to show it](docs/04-n8n-demo.md).

To rebuild the local n8n instance after a machine or disk change, use the pinned Docker Compose setup and [local operating guide](docs/05-local-n8n.md). Private instance data is excluded from Git; workflow exports and rebuild instructions are versioned.

## Implementation status

| Capability | State |
| --- | --- |
| Formspree-shaped intake normalization and consent gate | Implemented and tested offline |
| Bounded research and qualification agents | OpenAI API adapter with mocked tests; real API not yet smoke-tested |
| HubSpot contact, note and review-task adapter | Date-based 2026-03 API adapter with mocked tests; real portal not yet smoke-tested |
| Idempotent handoff and manual reconciliation states | Implemented and tested offline; production atomic store still required |
| Internal email card | Rendered and tested offline; real delivery not yet connected |
| n8n visual offline workflow | Imported and executed with n8n 2.41.3; all provider actions simulated |
| Persistent local n8n runtime | Docker Compose on 2.41.7; demo imported and executed after the rebuild |
| HubSpot connection check | Read-only workflow export and unit tests; authenticated execution pending |
| Native manual CRM pilot | Preview/check/write modes; native 2.41.7 preview executed without HTTP calls; authenticated writes pending |
| Connected HubSpot schema | Object availability, mapped fields and stage/task enum values verified read-only |
| Live n8n automation and end-to-end pilot | Pending account credentials, persistent event store and portal smoke tests |

The current Aramis site submits through Formspree Free, which does not provide the webhook needed for this live trigger. We will not modify the existing website or pretend it already feeds HubSpot. A standalone consented intake or a later form-tier/site change is needed for live traffic.

## Decisions and operating notes

- [Scope, intake contract and acceptance cases](docs/01-scope.md)
- [HubSpot field mapping and reviewer handoff](docs/02-crm-mapping.md)
- [Idempotency and failure recovery](docs/03-recovery.md)
- [n8n offline walkthrough and live-pilot gap](docs/04-n8n-demo.md)
- [Local n8n setup and persistence](docs/05-local-n8n.md)
- [Private backup, restore and commit checkpoints](docs/06-backup-and-commits.md)
- [HubSpot Service Key and read-only connection check](docs/07-hubspot-connection.md)
- [Connected portal verification](docs/08-portal-verification.md)
- [Docker recovery and verified local runtime](docs/09-docker-recovery.md)
- [Native n8n CRM pilot and controlled write test](docs/10-native-crm-pilot.md)

Only fake records belong in committed fixtures or screenshots. Never commit API keys, real submissions or personal data. Existing Aramis-Web, GestorAramis and AramisEditorial repositories remain untouched.
