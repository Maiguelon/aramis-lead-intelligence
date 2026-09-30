# Idempotency and recovery

The source provides a stable `submission_id`. The intake fingerprint is SHA-256 of `source_form:submission_id`; a new request from the same person is a different event, while a duplicate delivery is the same event. Contact identity is matched separately by normalized email and/or international phone. A ledger stores **only** the fingerprint, step state and provider object IDs, not the person's message or contact details.

For the offline demo, `MemoryLedger` and `FileLedger` implement this contract. `FileLedger` uses atomic file replacement but does not lock across processes. It is not a multi-worker production database. A real n8n deployment needs an atomic claim/upsert store (for example a small table with `fingerprint` as a unique key) before allowing parallel webhook executions.

## Effect sequence

1. Consent and identity validation: no external writes if rejected or ambiguous.
2. HubSpot contact search/create. Existing owner and lifecycle are preserved.
3. Research and commercial-fit recommendation. AI failure yields an explicitly labelled manual fallback.
4. Associated intake note, then open human review task.
5. Internal email card. No outbound prospect message.

Each completed side effect is recorded before the next begins. A replay skips recorded contact, note, task and alert IDs. A definite 429 rejection can be retried; a network timeout or 5xx during a write is **not** assumed safe. The ledger leaves that step as `contact_unknown`, `note_unknown`, `task_unknown`, or `alert_unknown` and stops automatic replay. This avoids pretending to guarantee exactly-once delivery across HubSpot and email.

## Operator reconciliation

- For `contact_unknown`, search HubSpot by the submitted email/phone. If exactly one relevant record exists, record its ID; if none exists, verify that the write did not succeed before resetting the event to `pending`. Multiple matches require a human merge decision.
- For `note_unknown`, inspect the contact timeline for `LeadOps submission: <submission_id>`. Record the note ID if present; otherwise confirm absence before retry.
- For `task_unknown`, inspect open tasks for the same submission ID. Record its ID if present; otherwise confirm absence before retry.
- For `alert_unknown`, inspect the internal mailbox/delivery log. If delivered, record the message ID and mark complete. If definitely not delivered, reset to `pending` for a single replay.

This reconciliation is a deliberate operator action, not an AI decision. Never clear an unknown state merely because the next run did not immediately find an object: HubSpot indexing and mail delivery may be delayed.

## Operational measures

For a pilot, count accepted/rejected/manual-review submissions by day and source, unique contacts created vs. reused, open review tasks, alerts sent, and unknown write states. These are process-health metrics, not sales conversion claims. Do not calculate lead-to-customer conversion until Aramis has real consented traffic and reliable lifecycle updates.
