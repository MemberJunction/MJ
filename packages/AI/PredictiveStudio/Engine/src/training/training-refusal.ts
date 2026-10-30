/**
 * @module training/training-refusal
 *
 * A training run refused before (or instead of) fitting; the run row records `refusal` and the operation surfaces the
 * sentence.
 */
import { HoldoutCarve, type TrainingRefusal } from '@memberjunction/predictive-studio-core';

/** A training run refused before (or instead of) fitting. Callers identify it by `Refusal`, never by the message. */
export class TrainingRefusedError extends Error {
  constructor(public readonly Refusal: TrainingRefusal) {
    super(TrainingRefusedError.DescribeTrainingRefusal(Refusal));
    this.name = 'TrainingRefusedError';
  }

  /** The one sentence a refusal is shown as (run Notes, operation error). Callers branch on `Refusal`, never on this text. */
  public static DescribeTrainingRefusal(r: TrainingRefusal): string {
    const reason = r.reason;
    switch (reason.kind) {
      case 'single-valued-target': return `Refused (single-valued-target): the outcome is "${reason.value}" for all ${reason.rows} resolved rows; a model needs at least two outcomes.`;
      case 'task-type-mismatch': return `Refused (task-type-mismatch): the unit declares ${reason.declared} but the outcome is ${reason.observed}.`;
      case 'unresolved-reference': return `Refused (unresolved-reference): ${reason.entity}${reason.field ? `.${reason.field}` : ''} is not registered.`;
      case 'missing-decision-date': return `Refused (missing-decision-date): ${reason.rows} rows of ${reason.entity} have no decision date; filter them out in the unit.`;
      case 'no-resolved-rows': return `Refused (no-resolved-rows): no row is resolved (${reason.censored} censored, ${reason.labelKnown} label known at decision, ${reason.emptyLabel} empty).`;
      case 'lag-inside-horizon': return `Refused (lag-inside-horizon): lag ${reason.lag} < horizon ${reason.horizonPeriods}.`;
      case 'rolling-window-inside-horizon': return `Refused (rolling-window-inside-horizon): endLag ${reason.endLag} < horizon ${reason.horizonPeriods}.`;
      case 'unit-required': return `Refused (unit-required): pipeline ${reason.pipelineId} — ${reason.why}`;
      case 'protocol-required': return `Refused (protocol-required): pipeline ${reason.pipelineId} has no Evaluation Protocol.`;
      case 'input-not-accepted': return `Refused (input-not-accepted): ${reason.input} — ${reason.why}`;
      case 'unit-invalid': return `Refused (unit-invalid): Prediction Unit ${reason.unitId}: ${reason.errors.join('; ')}`;
      case 'too-many-candidates': return `Refused (too-many-candidates): ${reason.candidates} candidates requested but the protocol's budget allows ${reason.maxCandidates}; raise the budget in a new protocol version or remove candidates.`;
      case 'protocol-created-after-run': return `Refused (protocol-created-after-run): the Evaluation Protocol ${reason.protocolId} (created ${reason.protocolCreatedAt}) is newer than the run (created ${reason.runCreatedAt}).`;
      case 'protocol-unit-mismatch': return `Refused (protocol-unit-mismatch): Evaluation Protocol ${reason.protocolId} does not fit the Prediction Unit: ${reason.problems.join(' ')}`;
      case 'protocol-invalid': return `Refused (protocol-invalid): Evaluation Protocol ${reason.protocolId}: ${reason.errors.join('; ')}`;
      case 'select-changes-after-decision-date': return `Refused (select-changes-after-decision-date): ${reason.entity}.${reason.field} was updated ${reason.changesAfter} time(s) after a decision date, so its stored value is not the value on that date.`;
      case 'decision-date-before-change-history': return `Refused (decision-date-before-change-history): ${reason.entity}.${reason.field} cannot be read as of ${reason.rowsAffected} row(s)' decision dates; ${reason.historyStart ? `its change history starts ${reason.historyStart}` : 'it has no change history'}.`;
      case 'truncated-read': return `Refused (truncated-read): ${reason.entity} returned ${reason.rowsRead} of ${reason.rowsExpected} expected rows; a partial read is not a complete one.`;
      case 'non-numeric-in-numeric-column': return `Refused (non-numeric-in-numeric-column): column ${reason.column} is declared numeric but holds "${reason.sampleValue}"; no value is coerced to 0.`;
      case 'future-period-lag': return `Refused (future-period-lag): column ${reason.column} is read ${reason.lag} period(s) back, inside the ${reason.horizonPeriods}-period horizon.`;
      case 'unpinned-feature-version': return `Refused (unpinned-feature-version): feature ${reason.featureName} has no pinned version, so its past values cannot be reproduced.`;
      case 'scope-entity-mismatch': return `Refused (scope-entity-mismatch): the model scores ${reason.modelEntity} records but the scope holds ${reason.scopeEntity} records.`;
      case 'unresolved-column': return `Refused (unresolved-column): ${reason.entity}.${reason.field} is not a field the pipeline can read.`;
      case 'unsupported-step-kind': return `Refused (unsupported-step-kind): step ${reason.stepId} is a ${reason.stepKind} step, which has no as-of reading.`;
      case 'trainer-failed': return `Refused (trainer-failed): the trainer stopped at stage ${reason.stage} after ${reason.computeSeconds}s: ${reason.message}`;
      case 'lineage-incomplete': return `Refused (lineage-incomplete): the trainer's CodeVersion lacks ${reason.gaps.join(', ')}.`;
      case 'selection-invalid': return `Refused (selection-invalid): ${reason.reason} — ${reason.detail}`;
      case 'unparseable-cutoff':
      case 'unparseable-carve-date':
      case 'missing-carve-date':
      case 'no-development-rows':
      case 'no-holdout-rows':
      case 'seeded-random-side-empty':
      case 'too-few-periods': return `Refused (${reason.kind}): ${HoldoutCarve.DescribeCarveRefusal(reason)}`;
    }
  }
}
