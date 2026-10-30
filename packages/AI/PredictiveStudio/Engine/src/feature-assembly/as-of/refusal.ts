/**
 * @module feature-assembly/as-of/refusal
 *
 * The one error type the as-of assembly throws to end at its first refusal. Feature resolution and assembly both
 * throw it and catch it with `instanceof` (never by message), turning it into a refused outcome.
 */
import type { AssemblyRefusal, TrainingRefusal } from '@memberjunction/predictive-studio-core';

/** The training refusal an as-of assembly refusal becomes: the `assembly` stage with the refusal as its reason. */
export type AssemblyTrainingRefusal = Extract<TrainingRefusal, { stage: 'assembly' }>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/** Ends feature resolution or assembly at the first refusal; callers read `Refusal`, never the message. */
export class AssemblyRefused extends Error {
  constructor(public readonly Refusal: AssemblyRefusal) {
    super(Refusal.kind);
    this.name = 'AssemblyRefused';
  }

  /** The refusal as a training-run refusal: an assembly refusal always belongs to the `assembly` stage. */
  public get TrainingRefusal(): AssemblyTrainingRefusal {
    return { stage: 'assembly', reason: this.Refusal };
  }
}
