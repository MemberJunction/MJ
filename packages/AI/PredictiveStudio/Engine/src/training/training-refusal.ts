/**
 * @module training/training-refusal
 *
 * A training run refused before (or instead of) fitting; the run row records `refusal` and the operation surfaces the
 * sentence.
 */
import type { TrainingRefusal } from '@memberjunction/predictive-studio-core';

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
      // The assembly refusal kinds: each gets its own sentence when a case names it; until then the kind and its fields.
      default: return `Refused (${reason.kind}): ${JSON.stringify(reason)}`;
    }
  }
}
