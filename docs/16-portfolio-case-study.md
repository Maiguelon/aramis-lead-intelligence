# Aramis LeadOps — CRM implementation case study

## The operational problem

A form notification is easy to lose and does not establish ownership, preserve attribution or make the next action visible. I designed an inbound review process that turns a consented inquiry into a traceable CRM record and a specific human task.

This is a working portfolio implementation using fictional inquiries and real service integrations. Aramis currently acquires most work through referrals. I do not claim production lead volume, revenue lift, time savings or measured commercial ROI.

## My role

Process design, requirements, field mapping, consent and data-quality rules, CRM configuration, automation architecture, AI output constraints, testing, recovery design and documentation. The implementation uses AI-assisted development; the professional contribution to explain is the operating model and the decisions behind it, supported by a working demonstration.

## The system

- **HubSpot:** commercial record, contact lifecycle, ownership, intake notes and review tasks.
- **n8n:** visible orchestration, consent gate, duplicate checks, provider calls and persistent technical checkpoints.
- **OpenAI:** one bounded research/brief step and a separate fit/certainty recommendation. Company facts require provider-observed public sources.
- **Resend:** internal HTML/text review card linking back to HubSpot.

The local demo uses native n8n forms and fixed fictional scenarios. The original Aramis website still submits through Formspree Free and is not connected to this workflow. The normalized intake contract is prepared for a later authenticated adapter.

## Decisions that matter

**The CRM owns commercial work.** Email is an alert. Existing contact ownership and lifecycle are preserved; a returning inquiry creates its own note and task without duplicating the person.

**Consent is a deterministic gate.** The model cannot infer permission. Responding to an inquiry is kept separate from campaign subscription.

**Fit and certainty are different.** Missing budget does not automatically mean poor fit. Unsupported research cannot become verified CRM facts. If AI fails, the inquiry still reaches a human with an explicit manual-assessment label.

**Recovery is part of the implementation.** Every external write has a prior checkpoint. Completed events stop replays; uncertain writes stop for reconciliation. A two-request concurrency test produced a single set of side effects. The local store relies on one serialized production execution, not a claim of distributed exactly-once processing.

**Scope follows the business need.** No custom full-stack application, autonomous outbound agent, campaign sequencer or unnecessary enrichment subscription. Company-object association, real-traffic intake and distributed concurrency are explicit next-stage decisions.

## Validation and demonstration

The connected system has created and read back fictional HubSpot records, run both real AI analyses, researched a supplied public company and delivered internal cards. The test suite covers consent, normalization, conflicts, duplicate events, returning contacts, uncertain outcomes, AI fallback, source validation and safe rendering. A real integration defect triggered the manual fallback during testing; its evidence was retained and the contract was corrected.

The operating report counts events, contacts, review tasks, accepted alerts and manual fallback. It deliberately does not equate acceptance with inbox delivery or tasks created with tasks still open.

## Interview walkthrough

“I built a LeadOps workflow that turns a consented inquiry into an owned HubSpot review task. n8n normalizes and checks the event, two bounded AI steps prepare research and recommend service fit with separate certainty, and an internal card links back to the CRM. I tested duplicate deliveries and returning contacts, and designed reconciliation for uncertain writes. It is a working portfolio demo with fictional data; the next step for production would be an authenticated intake adapter and an agreed operating policy.”

For a larger GTM engineering role, this demonstrates CRM integration, orchestration, evidence handling, data quality and human handoff. High-volume account selection, outbound deliverability, campaign sequencing, meeting qualification and commercial agreements would require additional design and experience; this project does not claim to have implemented them.
