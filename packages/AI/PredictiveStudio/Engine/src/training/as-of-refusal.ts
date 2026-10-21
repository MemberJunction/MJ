/**
 * @module training/as-of-refusal
 *
 * Containment of F-PIT-3 / F-PIT-7 until dated feature assembly exists. Training reads every feature as it
 * stands today and passes no dated sources to assembly, so an as-of mode other than `none` cannot change the model;
 * a pipeline that claims point-in-time assembly is refused before training instead of training a model identical to
 * `Mode: 'none'`.
 */
import type { AsOfStrategy } from '@memberjunction/predictive-studio-core';

/** Thrown before any training row is written when an as-of setting would be ignored. */
export class AsOfSettingHasNoEffectError extends Error {
  constructor(
    public readonly Source: 'pipeline' | 'train-input',
    public readonly Mode: AsOfStrategy['Mode'],
    public readonly PipelineID: string,
  ) {
    super(
      `Training refused: ${Source === 'pipeline' ? "the pipeline's AsOfStrategy" : "the Train operation's asOf input"} ` +
        `(Mode='${Mode}') has no effect. Training reads every feature as it stands today and ` +
        `uses no dated sources, so the model would be identical to Mode='none' while appearing point-in-time. ` +
        `Set the pipeline's AsOfStrategy to {"Mode":"none"} (pipeline ${PipelineID}).`,
    );
    this.name = 'AsOfSettingHasNoEffectError';
  }

  /** True when an as-of setting asks for point-in-time assembly that training cannot perform today. */
  public static WouldBeIgnored<T extends { Mode: AsOfStrategy['Mode'] }>(asOf: T | null | undefined): asOf is T {
    return asOf !== null && asOf !== undefined && asOf.Mode !== 'none';
  }
}
