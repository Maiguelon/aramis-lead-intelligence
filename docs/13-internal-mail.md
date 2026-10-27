# Internal review-card delivery

Resend sends the card to the internal address chosen by the operator. Sender and recipient come only from trusted operations configuration, never from a lead field. The public workflow leaves these values blank; local configuration lives in `.local/mail-pilot-config.json` and contains no API keys. The separate **Resend — LeadOps** Bearer credential stays in n8n.

The sending domain was already verified in the user's account. The user created a separate sending-only key restricted to that domain. Existing keys and other Aramis projects were not modified.

## Contract

`src/resend.mjs` is shared by the Node adapter and native workflow. It sends HTML and plain text through `POST https://api.resend.com/emails`, with a stable `Idempotency-Key` derived from the event fingerprint. It rejects missing delivery identity, invalid recipient configuration and subject-header injection. Lead-supplied `to`, `cc`, `bcc` or reply addresses are not copied into the request.

Resend keeps idempotency keys for **24 hours**. This is additional protection, not a substitute for the persistent event ledger. Do not blindly replay an uncertain send, change its content under the same key, or assume deduplication lasts indefinitely. API acceptance and confirmed delivery are separate results. A delivered status does not prove someone read the message or that it reached the inbox rather than another folder.

Official references: [send email](https://resend.com/docs/api-reference/emails/send-email), [idempotency behavior](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Native transport pilot

`n8n/leadops-mail-pilot.json` starts in **preview**. It renders the shared card without HTTP calls. Without configured CRM IDs its preview uses an explicitly fictional link; actual sending requires the validated IDs of the existing fictional CRM contact, sender, recipient and `YES_SEND_INTERNAL_DEMO`. The example card clearly says its data and analysis are simulated. This test does not call AI or create CRM records.

After saving the separate credential and private operations config, `scripts/prepare-n8n-mail-pilot.mjs` checks the saved inactive, unpinned workflow against the reviewed export, snapshots it privately and binds only the intended Resend credential reference. It deliberately does not choose the first Bearer credential, which could be HubSpot's. Inspect preview before using `--mode send --confirm-internal-demo` and importing the private prepared file.

The manual pilot has no production ledger. The first send's private intent and receipt must be reviewed before any repetition. Its HTTP node has automatic retries disabled; it is restored to preview after the controlled test.

## Verified — 2026-10-27

All 61 automated tests passed. Native n8n 2.41.7 preview executed zero HTTP nodes, and its card linked to the expected fictional contact. The user-authorized internal test returned HTTP 200 with an email ID; Resend's dashboard subsequently showed **Delivered** for that same message and intended recipient. The dashboard preview showed the shared review card, human-review notice and correct CRM link.

The workflow was returned to inactive preview with its send confirmation cleared. Provider IDs, real routing configuration, card preview and delivery evidence remain in `.local/`, excluded from Git. This completes delivery verification; a single intake-to-CRM-to-live-AI-to-mail workflow and its durable event controls remain separate integration work.

A full private backup after all three providers were configured passed all 98 manifest hashes. It includes the n8n database and encryption configuration, mail routing config and delivery receipt. The local service restarted healthy. This verifies the backup copy, not a restore onto another machine.
