/**
 * @module training/as-of-refusal
 *
 * Containment of F-PIT-3 / F-PIT-7 until dated feature assembly exists. Training reads every feature as it
 * stands today and passes no dated sources to assembly, so an as-of mode other than `none` cannot change the model;
 * a pipeline that claims point-in-time assembly is refused before training instead of training a model identical to
 * `Mode: 'none'`.
 */
import type { AsOfStrategy } from '@memberjunction/predictive-studio-core';

/** Where the refused as-of setting came from. */
export type AsOfSettingSource = 'pipeline' | 'train-input' | 'modeling-plan';

/** Thrown before any training row is written when an as-of setting would be ignored. */
export class AsOfSettingHasNoEffectError extends Error {
  /**
   * @param Source where the setting came from
   * @param Mode the refused as-of mode
   * @param PipelineID the pipeline being trained; null for a modeling plan, which has no pipeline row yet
   */
  constructor(
    public readonly Source: AsOfSettingSource,
    public readonly Mode: AsOfStrategy['Mode'],
    public readonly PipelineID: string | null,
  ) {
    super(
      `Training refused: ${AsOfSettingHasNoEffectError.settingName(Source)} ` +
        `(Mode='${Mode}') has no effect. Training reads every feature as it stands today and ` +
        `uses no dated sources, so the model would be identical to Mode='none' while appearing point-in-time. ` +
        AsOfSettingHasNoEffectError.remedy(Source, PipelineID),
    );
    this.name = 'AsOfSettingHasNoEffectError';
  }

  /** The setting the message names. */
  private static settingName(source: AsOfSettingSource): string {
    switch (source) {
      case 'pipeline':
        return "the pipeline's AsOfStrategy";
      case 'train-input':
        return "the Train operation's asOf input";
      case 'modeling-plan':
        return "the modeling plan's TargetDefinition.AsOfStrategy";
    }
  }

  /** What to change: the pipeline's stored setting, the Train operation's own `asOf` input, or the plan. */
  private static remedy(source: AsOfSettingSource, pipelineID: string | null): string {
    switch (source) {
      case 'pipeline':
        return `Set the pipeline's AsOfStrategy to {"Mode":"none"} (pipeline ${pipelineID}).`;
      case 'train-input':
        return `Remove the asOf input from the Train request (pipeline ${pipelineID}).`;
      case 'modeling-plan':
        return 'Remove TargetDefinition.AsOfStrategy from the plan or set it to {"Mode":"none"}; no pipeline was created.';
    }
  }

  /**
   * True when an as-of setting asks for point-in-time assembly that training cannot perform today. A setting with no
   * `Mode` (a stored `{}`) asks for nothing, so it reads as `Mode: 'none'`.
   */
  public static WouldBeIgnored<T extends { Mode?: AsOfStrategy['Mode'] }>(asOf: T | null | undefined): asOf is T {
    return asOf?.Mode !== undefined && asOf.Mode !== 'none';
  }
}
