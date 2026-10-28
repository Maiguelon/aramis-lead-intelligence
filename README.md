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
| Bounded research and qualification agents | Two native live analyses verified with fictional inquiries; public company research linked to provider-observed sources; human review enforced |
| HubSpot contact, note and review-task adapter | Date-based 2026-03 contract verified from n8n: fictional contact, associated note and review task created with HTTP 201 and read back |
| Idempotent handoff and manual reconciliation states | Native Data Table checkpoints; two concurrent deliveries produced one set of effects; single-server production concurrency fixed at one |
| Internal email card | Shared HTML/text card delivered through native n8n and Resend to the approved internal recipient; transport test uses labelled simulated analysis |
| n8n visual offline workflow | Imported and executed with n8n 2.41.3; all provider actions simulated |
| Persistent local n8n runtime | Docker Compose on 2.41.7; demo imported and executed after the rebuild |
| HubSpot connection check | Authenticated native n8n search verified with HTTP 200; no CRM writes |
| OpenAI connection check | Authenticated native model-list GET verified with HTTP 200; no generation performed |
| Native manual CRM pilot | Authenticated fictional write succeeded; repeat stopped before all write nodes; inactive and restored to preview |
| Connected HubSpot schema | Object availability, mapped fields and stage/task enum values verified read-only |
| Connected n8n end-to-end demo | Fictional intake → HubSpot → two real AI analyses → associated note/task → Resend; returning contact and public company research verified |
| Basic operating report | Local HTML/JSON from the event table; distinguishes events, contacts, manual fallback and accepted internal alerts |

The deployed Aramis site currently submits through Formspree Free. With Miguel's authorization, a Tally embed is prepared in Aramis-Web for contact and plan inquiries; local n8n polls persisted submissions so capture can work while the PC is off. The new export defaults to disabled inspection. Connected Tally verification and website deployment are separate from local code completion; see the [Tally intake guide](docs/17-tally-intake.md).

## Connected local demonstration

The prepared local instance exposes a native n8n form at `http://localhost:5678/form/aramis-leadops` and a closed-fixture JSON endpoint at `POST http://localhost:5678/webhook/aramis-leadops-demo`. Neither accepts arbitrary real people. The public [workflow export](n8n/leadops-integrated.json) is inactive, disabled and credential-free; the private instance binds three separate n8n credentials.

Choose a scenario and explicitly authorize its fictional processing. Repeating a completed scenario demonstrates duplicate handling without another AI call or email. A new inquiry from the same fictional person reuses the contact and creates its own note and review task. After a run, `npm run report` refreshes `.local/reports/operating-report.html` and its JSON companion. See the [connected-demo operating guide](docs/15-connected-demo.md) and [portfolio case study](docs/16-portfolio-case-study.md).

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
- [OpenAI connection and secret handling](docs/11-openai-connection.md)
- [Two native AI analyses and source validation](docs/12-native-ai-pilot.md)
- [Internal review-card delivery and idempotency](docs/13-internal-mail.md)
- [Native event table and recovery checkpoints](docs/14-native-event-store.md)
- [Connected demo, acceptance evidence and operating steps](docs/15-connected-demo.md)
- [Portfolio case study and interview walkthrough](docs/16-portfolio-case-study.md)
- [Online Tally capture and local polling](docs/17-tally-intake.md)
- [Professional research, identity and evidence](docs/18-professional-research.md)

Only fake records belong in committed fixtures or screenshots. Never commit API keys, real submissions or personal data. Aramis-Web changes are explicitly authorized; GestorAramis and AramisEditorial remain read-only.
