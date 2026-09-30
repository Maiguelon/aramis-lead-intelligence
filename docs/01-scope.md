# Scope and acceptance contract

## Positioning

This is a CRM implementation and operations case study, not a claim that Aramis has a high-volume inbound funnel. It should show process design, field mapping, data quality, API integration, an actionable human handoff, and failure recovery in approximately one week of MVP work.

## Existing source forms (read-only inspection, 2026-09-30)

| Source | Current submitted fields | Important limitation |
| --- | --- | --- |
| Footer / HeaderFooter | `nombre`, `email`, `redes` | No structured consent or UTM fields. |
| PlanCard | `nombre`, `contacto` (email **or** WhatsApp), `redes`, `plan` JSON | No structured consent or UTM fields; contact is ambiguous. |

Both post to the same Formspree form. The current Formspree account is Free. Its webhook, submissions API, and native HubSpot plugin are not available on that tier. We will not claim a live Formspree trigger. A separate demo intake and fictional Formspree-shaped fixtures exercise the same mapping. Future connection to the existing website is a separate decision because this repository cannot modify Aramis-Web.

## Intake contract

Required new fields for a future source or the standalone demo form:

- `submission_id`: stable unique ID issued by the source; a generated ID may be used only for an explicitly labelled one-off manual entry.
- `consentimiento_contacto`: explicit Boolean `true` or `false`; no inference from the message.
- `consentimiento_texto_version`: exact identifier of the notice shown, such as `contact-v1`.
- `consentimiento_fecha`: ISO timestamp supplied by the trusted receiver, not self-attested by a browser hidden field.
- At least one usable reply channel: email or international-format phone. Unknown local phone formats go to manual review.

Optional fields: name, social profile, service, message, company, website, plan selections, source URL, UTM source/medium/campaign/content/term. Missing UTMs remain `unknown`, never silently become `direct`.

The consent flag covers a response to the submitted inquiry. It does not opt the person into newsletters, automated sales sequences, or unrelated marketing. A false or missing flag is retained only in the technical intake log as a rejected/review-needed event; it is not sent to AI, HubSpot, or email as a lead. For a future real deployment, the notice wording and data-retention policy need review before collecting personal data.

## Human decision model

1. Valid, explicitly permitted intake receives an identity check and a HubSpot contact with an open review task. That task is the MVP's `pending_review` signal; no custom property is assumed before portal setup.
2. Research/summarization agent may extract the request and public company context. Every claimed external fact must carry a URL or be marked unverified.
3. Qualification agent may recommend `high_fit`, `possible_fit`, `low_fit`, or `insufficient_information`; it separately reports `high`, `medium`, or `low` certainty and cites the intake fields or research sources behind each signal.
4. No AI result may set consent, create a deal, discard a contact, send prospect outreach, or override a human owner/stage.
5. The assigned reviewer reads the card, opens HubSpot, confirms or changes the recommendation, and records the next action. A low-fit recommendation is still reviewed.

The rubric is service alignment (social, brand identity, web), identifiable request, available reply channel, and useful context. Unknown budget, industry, or timing reduce certainty; they do not automatically mean low fit. This is **fit for a scenario**, not a prediction of sale probability.

## MVP acceptance cases

| Fixture | Expected |
| --- | --- |
| `footer-valid` | Valid permitted inquiry; one contact and one review alert. |
| `plan-valid` | Plan JSON parsed; email resolved from `contacto`; one contact and alert. |
| `duplicate-repeat` | Same submission ID causes no second contact or alert. |
| `returning-person` | New submission, same email: existing contact and second intake context; no second contact. |
| `no-consent` | Rejected before CRM and AI. |
| `missing-consent` | Rejected before CRM and AI. |
| `phone-only` | Usable international phone; review pathway without invented email. |
| `ambiguous-contact` | Manual exception; no guessed identity. |
| `provider-failure` | Retryable error recorded; rerun can resume without duplicate side effects. |

Only fake data enters committed fixtures and public screenshots. Metrics in the case study describe tested system behavior, not real Aramis conversion or ROI.

## Decisions for implementation

- HubSpot: contacts, owner, lifecycle, open review task, note and optional company association. Avoid custom properties in the first pass; use the dated 2026-03 CRM API and retest before moving versions.
- n8n: intake, routing, API calls, alerts, and error workflow. Portable workflow export committed in this repository.
- OpenAI: structured outputs for two separate analyses. Deterministic fixture mode for a free, reproducible demo.
- Email: concise card with a HubSpot link, recommendation, certainty, sources, missing data, and explicit `human review required` label.
- Technical ledger: only the minimum needed for idempotency and resumption; no second commercial database or custom full-stack UI.
