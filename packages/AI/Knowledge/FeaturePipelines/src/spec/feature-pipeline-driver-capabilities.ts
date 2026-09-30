/**
 * @fileoverview What a Feature Pipeline driver can produce. Each `MJ: Feature Pipeline Types` row
 * names a driver, and the driver declares these capabilities so the processor (and, later, the
 * builder UI) can reject outputs the driver cannot produce.
 * Pure types and constants — no dependency on @memberjunction/core or database providers.
 * @module @memberjunction/feature-pipelines
 */

import type { ValueConstraint } from './value-constraint.js';
import type { OutputTarget } from './output-target.js';

/** A constraint type an output can declare (`enum`, `numeric`, …), derived from {@link ValueConstraint}. */
export type FeaturePipelineConstraintType = ValueConstraint['Type'];

/** A target mode an output can write to (`field`, `child`, `tags`), derived from {@link OutputTarget}. */
export type FeaturePipelineTargetMode = OutputTarget['Mode'];

/** What a Feature Pipeline driver can produce. */
export interface FeaturePipelineDriverCapabilities {
  /** The constraint types the driver can produce. */
  ConstraintTypes: ReadonlyArray<FeaturePipelineConstraintType>;
  /** The target modes the driver supports. */
  TargetModes: ReadonlyArray<FeaturePipelineTargetMode>;
  /** Whether the driver can return the model's reasoning for the history row. */
  ProducesReasoning: boolean;
  /** Whether the driver returns a confidence for each output. */
  ProducesConfidence: boolean;
  /** The most outputs one pipeline of this type may declare. Absent means no limit. */
  MaxOutputs?: number;
}

/**
 * Every constraint type, keyed so the compiler fails here when {@link ValueConstraint} gains a type
 * that this list does not name.
 */
const EVERY_CONSTRAINT_TYPE: Record<FeaturePipelineConstraintType, true> = {
  enum: true,
  lookup: true,
  numeric: true,
  money: true,
  date: true,
  boolean: true,
  freetext: true,
};

/**
 * Every target mode, keyed so the compiler fails here when {@link OutputTarget} gains a mode that
 * this list does not name.
 */
const EVERY_TARGET_MODE: Record<FeaturePipelineTargetMode, true> = {
  field: true,
  child: true,
  tags: true,
};

/**
 * The `LLM` pipeline type's capabilities: every constraint type and every target mode, with
 * reasoning and without confidence. It lives in this package, not in the engine, so the builder UI
 * can read it without a server dependency.
 */
export const LLM_FEATURE_PIPELINE_CAPABILITIES: Readonly<FeaturePipelineDriverCapabilities> = Object.freeze({
  ConstraintTypes: Object.freeze(Object.keys(EVERY_CONSTRAINT_TYPE) as FeaturePipelineConstraintType[]),
  TargetModes: Object.freeze(Object.keys(EVERY_TARGET_MODE) as FeaturePipelineTargetMode[]),
  ProducesReasoning: true,
  ProducesConfidence: false,
});
