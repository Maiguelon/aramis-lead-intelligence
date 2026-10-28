# Aramis LeadOps — CRM implementation case study

## The operational problem

A form notification is easy to lose and does not establish ownership, preserve attribution or make the next action visible. I designed an inbound review process that turns a consented inquiry into a traceable CRM record and a specific human task.

This is a working portfolio implementation using fictional inquiries and real service integrations. Aramis currently acquires most work through referrals. I do not claim production lead volume, revenue lift, time savings or measured commercial ROI.

## My role

Process design, requirements, field mapping, consent and data-quality rules, CRM configuration, automation architecture, AI output constraints, testing, recovery design and documentation. The implementation uses AI-assisted development; the professional contribution to explain is the operating model and the decisions behind it, supported by a working demonstration.

## The system

- **HubSpot:** commercial record, contact lifecycle, ownership, intake notes and review tasks.
- **Tally:** consented online capture from Aramis contact and calculator embeds; submissions persist while the local worker is offline.
- **n8n:** visible orchestration, consent gate, duplicate checks, provider calls and persistent technical checkpoints.
- **OpenAI:** one bounded research/brief step and a separate fit/certainty recommendation. Company facts require provider-observed public sources.
- **Resend:** internal HTML/text review card linking back to HubSpot.

Two entry paths are verified: a native n8n form with fixed fictional scenarios, and a Tally form embedded in the local Aramis website. Tally is read through its authenticated API; the local n8n worker processes the oldest pending completed submission. The deployed website still uses Formspree until the reviewed website changes are deployed. The connected Tally worker is in fictional-pilot mode, with real inquiries held for review.

## Decisions that matter

**The CRM owns commercial work.** Email is an alert. Existing contact ownership and lifecycle are preserved; a returning inquiry creates its own note and task without duplicating the person.

**Consent is a deterministic gate.** The model cannot infer permission. Responding to an inquiry is kept separate from campaign subscription.

**Fit and certainty are different.** Missing budget does not automatically mean poor fit. Unsupported research cannot become verified CRM facts. If AI fails, the inquiry still reaches a human with an explicit manual-assessment label.

**Recovery is part of the implementation.** Every external write has a prior checkpoint. Completed events stop replays; uncertain writes stop for reconciliation. A two-request concurrency test produced a single set of side effects. The local store relies on one serialized production execution, not a claim of distributed exactly-once processing.

**Scope follows the business need.** No custom full-stack application, autonomous outbound agent, campaign sequencer or unnecessary enrichment subscription. Capture works online without a public local webhook or a paid worker host. Production website deployment, the real-inquiry operating policy, company-object association and distributed concurrency remain separate decisions.

## Validation and demonstration

The connected system has created and read back fictional HubSpot records, run both real AI analyses, researched a supplied public company and delivered internal cards. The test suite covers consent, normalization, conflicts, duplicate events, returning contacts, uncertain outcomes, AI fallback, source validation and safe rendering. A real integration defect triggered the manual fallback during testing; its evidence was retained and the contract was corrected.

On 28 October 2026, two fictional inquiries submitted from the local website through Tally — contact and calculator — completed the entire path. They reused one contact and created two distinct notes, tasks and internal cards. Both emails were observed as Delivered in Resend. Two subsequent polls found no pending submissions and left effect IDs unchanged. Calculator choices and UTM were verified against the actual provider payload. The research explicitly marked an inaccessible Instagram profile as unverified, while retaining good service fit with medium certainty; it attributed no personal facts.

The operating report counts events, contacts, review tasks, accepted alerts and manual fallback. It deliberately does not equate acceptance with inbox delivery or tasks created with tasks still open.

## Interview walkthrough

“I built a LeadOps workflow that turns a consented website inquiry into an owned HubSpot review task. Tally captures inquiries online and n8n processes pending submissions locally. Two bounded AI steps prepare evidence and recommend service fit with separate certainty; an internal card links back to the CRM. I verified contact reuse, attribution, email delivery and safe replays, and designed reconciliation for uncertain writes. It is a working portfolio implementation with fictional data; production activation requires deploying the website changes and agreeing the real-inquiry operating policy.”

For a larger GTM engineering role, this demonstrates CRM integration, orchestration, evidence handling, data quality and human handoff. High-volume account selection, outbound deliverability, campaign sequencing, meeting qualification and commercial agreements would require additional design and experience; this project does not claim to have implemented them.
