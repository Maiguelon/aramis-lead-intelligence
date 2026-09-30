import { normalizeIntake } from './intake.mjs';
import { researchStub } from './qualification.mjs';
import { renderReviewCard } from './review-card.mjs';

export class PipelineError extends Error {
  constructor(code, cause) {
    super(code, { cause });
    this.name = 'PipelineError';
    this.code = code;
  }
}

export class MemoryLedger {
  constructor() { this.rows = new Map(); }
  async get(key) { return this.rows.get(key) || null; }
  async save(key, row) { this.rows.set(key, structuredClone(row)); }
}

function manualQualification(reason, research) {
  return {
    fit: 'insufficient_information', certainty: 'low', signals: [],
    missingInformation: research.missingInformation,
    rationale: `Análisis automático no disponible (${reason}). Revisar la solicitud personalmente.`,
    humanReviewRequired: true,
  };
}

/**
 * One submission at a time. The ledger records completed effects, not a second CRM.
 * Crash gaps between an external write and save remain "unknown" and need reconciliation.
 */
export async function processSubmission(raw, {
  ledger, hubspot, agents, mailer, portalId, receivedAt = null, now = () => new Date(),
} = {}) {
  const normalized = normalizeIntake(raw, { receivedAt });
  if (normalized.status !== 'accepted') {
    return { status: normalized.status, reason: normalized.reason, effects: [] };
  }
  const { intake } = normalized;
  if (!ledger || !hubspot || !agents || !mailer || !portalId) throw new PipelineError('missing_pipeline_dependency');
  const key = intake.fingerprint;
  const row = (await ledger.get(key)) || { key, state: 'pending', effects: {} };
  if (row.state === 'complete') return { status: 'duplicate', reason: 'already_processed', effects: [], contactId: row.effects.contactId };
  if (row.state !== 'pending') return { status: 'manual_review', reason: `${row.state}_needs_reconciliation`, effects: [], contactId: row.effects.contactId };

  const completed = [];
  try {
    if (!row.effects.contactId) {
      row.state = 'contact_unknown';
      await ledger.save(key, row);
      const result = await hubspot.ensureContact(intake);
      row.effects.contactId = String(result.contact.id);
      row.effects.contactCreated = result.created;
      row.state = 'pending';
      await ledger.save(key, row);
      completed.push(result.created ? 'contact_created' : 'contact_reused');
    }

    let research;
    let qualification;
    let analysisMode = 'agent';
    try {
      research = await agents.research(intake);
      qualification = await agents.qualify(intake, research);
      if (qualification.humanReviewRequired !== true) throw new PipelineError('agent_removed_human_review');
      if (research.researchStatus === 'not_performed') analysisMode = 'offline_stub';
    } catch (error) {
      research = researchStub(intake);
      qualification = manualQualification(error.code || 'error', research);
      analysisMode = 'manual_fallback';
    }

    if (!row.effects.noteId) {
      row.state = 'note_unknown';
      await ledger.save(key, row);
      const note = await hubspot.createIntakeNote(row.effects.contactId, { intake, research, qualification });
      row.effects.noteId = String(note.id);
      row.state = 'pending';
      await ledger.save(key, row);
      completed.push('note_created');
    }
    if (!row.effects.taskId) {
      const dueAt = new Date(now().getTime() + 24 * 60 * 60 * 1000).toISOString();
      row.state = 'task_unknown';
      await ledger.save(key, row);
      const task = await hubspot.createReviewTask(row.effects.contactId, { intake, dueAt });
      row.effects.taskId = String(task.id);
      row.state = 'pending';
      await ledger.save(key, row);
      completed.push('task_created');
    }

    const card = renderReviewCard({ intake, research, qualification, portalId, contactId: row.effects.contactId });
    if (!row.effects.alertId) {
      // SMTP/API timeouts can happen after delivery. Stop replay until a human reconciles.
      row.state = 'alert_unknown';
      await ledger.save(key, row);
      const receipt = await mailer.send(card);
      if (!receipt?.id) throw new PipelineError('alert_receipt_missing');
      row.effects.alertId = String(receipt.id);
      row.state = 'complete';
      await ledger.save(key, row);
      completed.push('review_alert_sent');
    }
    return { status: 'complete', reason: 'ok', effects: completed,
      contactId: row.effects.contactId, analysisMode, qualification, card };
  } catch (error) {
    if (row.state !== 'alert_unknown' && error.status === 429) {
      row.state = 'pending';
      await ledger.save(key, row);
    }
    const unknownWrite = row.state !== 'pending';
    return { status: unknownWrite ? 'manual_review' : 'retryable_failure',
      reason: unknownWrite ? `${row.state}_needs_reconciliation` : error.code || 'provider_error',
      retryable: !unknownWrite && error.retryable === true,
      effects: completed, contactId: row.effects.contactId || null };
  }
}
