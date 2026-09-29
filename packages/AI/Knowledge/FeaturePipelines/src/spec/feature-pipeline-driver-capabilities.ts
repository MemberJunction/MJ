/**
 * @fileoverview What a Feature Pipeline driver can produce. Each `MJ: Feature Pipeline Types` row
 * names a driver, and the driver declares these capabilities so the processor (and, later, the
 * builder UI) can reject outputs the driver cannot produce.
 * Pure types and constants — no dependency on @memberjunction/core or database providers.
 * @module @memberjunction/feature-pipelines
 */

import type { ValueConstraint } from './value-constraint.js';
import type { OutputTarget } from './output-target.js';
import type { DataFeatureOutput, DataFeatureSpec } from './data-feature-spec.js';

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
  /** Whether every output must declare a constraint. */
  RequiresConstraint?: boolean;
  /** Whether numeric constraints must declare ordered level descriptions (2 to 10 levels). */
  RequiresNumericLevels?: boolean;
  /** Whether enum constraints require descriptions for all possible choice values. */
  RequiresEnumValueDescriptions?: boolean;
  /** Maximum number of enum values allowed for this pipeline type. */
  MaxEnumValues?: number;
}

/**
 * A lookup function from field name to its allowed entity field values and descriptions.
 * Scoped to the pipeline's target entity.
 */
export type FeaturePipelineFieldValueLookup = (
  fieldName: string
) => ReadonlyArray<{ Value: string; Description?: string | null }> | undefined;

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

/**
 * The `Decision` pipeline type's capabilities: boolean, enum, and numeric constraint types,
 * field target mode only, producing confidence without reasoning.
 */
export const DECISION_FEATURE_PIPELINE_CAPABILITIES: Readonly<FeaturePipelineDriverCapabilities> = Object.freeze({
  ConstraintTypes: Object.freeze(['boolean', 'enum', 'numeric'] as FeaturePipelineConstraintType[]),
  TargetModes: Object.freeze(['field'] as FeaturePipelineTargetMode[]),
  ProducesReasoning: false,
  ProducesConfidence: true,
  RequiresConstraint: true,
  RequiresNumericLevels: true,
  RequiresEnumValueDescriptions: true,
  MaxEnumValues: 255,
});

/**
 * Looks up the capabilities for a given feature pipeline type name.
 * Case-insensitive and trimmed. Returns DECISION_FEATURE_PIPELINE_CAPABILITIES for 'Decision',
 * and LLM_FEATURE_PIPELINE_CAPABILITIES for 'LLM', empty string, null, undefined, or any unknown name.
 * Pure and browser-safe.
 */
export function GetFeaturePipelineCapabilities(typeName?: string | null): Readonly<FeaturePipelineDriverCapabilities> {
  const normalized = typeName?.trim().toLowerCase();
  if (normalized === 'decision') {
    return DECISION_FEATURE_PIPELINE_CAPABILITIES;
  }
  return LLM_FEATURE_PIPELINE_CAPABILITIES;
}

/**
 * Lists why a feature pipeline driver or type cannot produce one output,
 * checking constraint type and target mode against capabilities.
 * Pure and browser-safe.
 */
export function GetOutputCapabilityIssues(
  output: DataFeatureOutput,
  capabilities: FeaturePipelineDriverCapabilities
): string[] {
  const reasons: string[] = [];
  const constraintType = output.Constraint?.Type;
  if (constraintType && !capabilities.ConstraintTypes.includes(constraintType)) {
    reasons.push(`has constraint type '${constraintType}', which this pipeline type cannot produce`);
  }
  const targetMode = output.Target?.Mode;
  if (targetMode && !capabilities.TargetModes.includes(targetMode)) {
    reasons.push(`has target mode '${targetMode}', which this pipeline type does not support`);
  }
  return reasons;
}

/**
 * Checks a pipeline spec against a driver or pipeline type's capabilities.
 * Validates reasoning, output constraints, numeric levels, and enum values and descriptions.
 * For enum outputs targeting a field, missing values and descriptions are filled via `fieldValues`.
 * Returns one message per issue, or an empty array when valid.
 * Pure and browser-safe.
 */
export function ValidateOutputsAgainstCapabilities(
  spec: DataFeatureSpec,
  capabilities: FeaturePipelineDriverCapabilities,
  fieldValues?: FeaturePipelineFieldValueLookup
): string[] {
  const messages: string[] = [];

  if (spec.CaptureReasoning && !capabilities.ProducesReasoning) {
    messages.push('Decision pipelines do not produce reasoning; remove CaptureReasoning or use an LLM pipeline.');
  }

  for (const output of spec.Outputs ?? []) {
    const reasons = GetOutputCapabilityIssues(output, capabilities);
    if (reasons.length > 0) {
      messages.push(`Output '${output.Name}' ${reasons.join(' and ')}.`);
    }

    if (capabilities.RequiresConstraint && !output.Constraint) {
      messages.push(`Output '${output.Name}' has no constraint; Decision pipelines require boolean, enum, or leveled numeric constraints.`);
      continue;
    }

    if (!output.Constraint) {
      continue;
    }

    if (output.Constraint.Type === 'numeric') {
      if (capabilities.RequiresNumericLevels) {
        const levels = output.Constraint.Levels;
        if (!levels || !Array.isArray(levels) || levels.length < 2 || levels.length > 10) {
          messages.push(`Numeric output '${output.Name}' requires between 2 and 10 Level descriptions.`);
        }
      }
    } else if (output.Constraint.Type === 'enum') {
      let values = output.Constraint.Values ? [...output.Constraint.Values] : [];
      const descriptions: Record<string, string> = { ...(output.Constraint.ValueDescriptions ?? {}) };

      if (output.Target?.Mode === 'field') {
        const fieldName = output.Target.EntityFieldName ?? (output.Target as { Field?: string }).Field;
        if (fieldName && fieldValues) {
          const efvs = fieldValues(fieldName);
          if (efvs && efvs.length > 0) {
            if (values.length === 0) {
              values = efvs.map((v) => v.Value);
            }
            for (const efv of efvs) {
              if (efv.Description && !descriptions[efv.Value]) {
                descriptions[efv.Value] = efv.Description;
              }
            }
          }
        }
      }

      if (capabilities.MaxEnumValues !== undefined && values.length > capabilities.MaxEnumValues) {
        messages.push(`Enum output '${output.Name}' has ${values.length} values; maximum supported for Decision is ${capabilities.MaxEnumValues}.`);
      }

      if (values.length === 0) {
        messages.push(`Enum output '${output.Name}' has no values defined.`);
      } else if (capabilities.RequiresEnumValueDescriptions) {
        const missingDesc = values.filter((v) => !descriptions[v] || descriptions[v].trim().length === 0);
        if (missingDesc.length > 0) {
          messages.push(
            `Enum output '${output.Name}' values missing descriptions: ${missingDesc.join(', ')}. Decision models require a description for every choice option.`
          );
        }
      }
    }
  }

  return messages;
}


