/**
 * @fileoverview What a Feature Pipeline driver can produce. Each `MJ: Feature Pipeline Types` row
 * names a driver, and the driver declares these capabilities so the processor, the builder UI and the
 * `MJ: Record Processes` save check can reject outputs the driver cannot produce, with one rule set.
 * Pure types and functions — no dependency on @memberjunction/core or database providers.
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
  /**
   * Whether an enum output must resolve to a listed set of values when the pipeline is checked, because
   * the driver asks the model to choose among them. A driver without it (LLM) can be told the values at
   * run time, or none at all.
   */
  RequiresEnumValues?: boolean;
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

/** The part of an entity's metadata that {@link BuildEntityFieldValueLookup} reads. `EntityInfo` satisfies it. */
export interface FeaturePipelineEntityFields {
  Fields?: ReadonlyArray<{
    Name: string;
    EntityFieldValues?: ReadonlyArray<{ Value: string; Description?: string | null }> | null;
  }> | null;
}

/** An enum output's choices: its allowed values, and a description for each value that has one. */
export interface FeaturePipelineEnumChoices {
  Values: string[];
  Descriptions: Record<string, string>;
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

/**
 * The `Decision` pipeline type's capabilities: boolean, enum, and numeric constraint types,
 * field target mode only, producing confidence without reasoning. A Decision model chooses among
 * listed options, so every enum must resolve to described values.
 */
export const DECISION_FEATURE_PIPELINE_CAPABILITIES: Readonly<FeaturePipelineDriverCapabilities> = Object.freeze({
  ConstraintTypes: Object.freeze(['boolean', 'enum', 'numeric'] as FeaturePipelineConstraintType[]),
  TargetModes: Object.freeze(['field'] as FeaturePipelineTargetMode[]),
  ProducesReasoning: false,
  ProducesConfidence: true,
  RequiresConstraint: true,
  RequiresNumericLevels: true,
  RequiresEnumValues: true,
  RequiresEnumValueDescriptions: true,
  MaxEnumValues: 255,
});

/**
 * Looks up the capabilities for a given feature pipeline type name.
 * Case-insensitive and trimmed. Returns DECISION_FEATURE_PIPELINE_CAPABILITIES for 'Decision',
 * and LLM_FEATURE_PIPELINE_CAPABILITIES for 'LLM', empty string, null, undefined, or any unknown name.
 * Pure and browser-safe.
 *
 * **Keyed by type name, not by driver.** The builder and the `MJ: Record Processes` save check call this
 * with the spec's `PipelineType`, while the processor asks the driver that the catalog row's
 * `DriverClass` names for its own `Capabilities`. The two agree for the seeded `LLM` and `Decision`
 * types. Any other catalog type (a custom row, or a row with another name whose driver is
 * `DecisionFeaturePipelineDriver`) is checked with the LLM capabilities before it runs, and only its
 * driver's capabilities apply at run time.
 */
export function GetFeaturePipelineCapabilities(typeName?: string | null): Readonly<FeaturePipelineDriverCapabilities> {
  const normalized = typeName?.trim().toLowerCase();
  if (normalized === 'decision') {
    return DECISION_FEATURE_PIPELINE_CAPABILITIES;
  }
  return LLM_FEATURE_PIPELINE_CAPABILITIES;
}

/**
 * Builds the field-values lookup for one entity: each field's value list, found by field name
 * (case-insensitive). Returns undefined when the entity or its fields are unknown, so a caller never
 * falls back to a same-named field on another entity.
 * Pure and browser-safe.
 */
export function BuildEntityFieldValueLookup(
  entity: FeaturePipelineEntityFields | null | undefined
): FeaturePipelineFieldValueLookup | undefined {
  const fields = entity?.Fields;
  if (!fields) {
    return undefined;
  }
  return (fieldName: string) => {
    const wanted = fieldName.trim().toLowerCase();
    const field = fields.find((f) => f.Name.trim().toLowerCase() === wanted);
    return field?.EntityFieldValues ?? undefined;
  };
}

/**
 * Resolves an enum output's choices the way `ResolveConstraint` does, so the builder, the save check and
 * the runtime agree on them:
 * - With `FromFieldMetadata`, the target field's value list replaces the spec's `Values`.
 * - When the spec lists no `Values`, the field's value list fills them.
 * - Otherwise the spec's own `Values` stand, and the field is not read.
 *
 * Whenever the field's list is used, its descriptions fill the values the spec leaves undescribed. Only a
 * `field` target has a field to read. Returns undefined for an output whose constraint is not enum.
 * Pure and browser-safe.
 */
export function ResolveEnumChoices(
  output: DataFeatureOutput,
  fieldValues?: FeaturePipelineFieldValueLookup
): FeaturePipelineEnumChoices | undefined {
  const constraint = output.Constraint;
  if (constraint?.Type !== 'enum') {
    return undefined;
  }
  const specValues = Array.isArray(constraint.Values) ? [...constraint.Values] : [];
  const descriptions: Record<string, string> = { ...(constraint.ValueDescriptions ?? {}) };
  const readsField = constraint.FromFieldMetadata === true || specValues.length === 0;
  const fieldList = readsField ? targetFieldValues(output, fieldValues) : undefined;
  if (!fieldList || fieldList.length === 0) {
    return { Values: specValues, Descriptions: descriptions };
  }
  for (const entry of fieldList) {
    if (entry.Description && !descriptions[entry.Value]) {
      descriptions[entry.Value] = entry.Description;
    }
  }
  return { Values: fieldList.map((entry) => entry.Value), Descriptions: descriptions };
}

/** The value list of a `field` target's column, when the lookup knows it. */
function targetFieldValues(
  output: DataFeatureOutput,
  fieldValues?: FeaturePipelineFieldValueLookup
): ReadonlyArray<{ Value: string; Description?: string | null }> | undefined {
  if (output.Target?.Mode !== 'field' || !output.Target.EntityFieldName || !fieldValues) {
    return undefined;
  }
  return fieldValues(output.Target.EntityFieldName);
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
 * An enum's values come from {@link ResolveEnumChoices}, so `fieldValues` (the pipeline entity's value
 * lists) is read only where the spec asks for field metadata or lists no values.
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
    messages.push('This pipeline type does not produce reasoning; turn off CaptureReasoning or use an LLM pipeline.');
  }

  for (const output of spec.Outputs ?? []) {
    const reasons = GetOutputCapabilityIssues(output, capabilities);
    if (reasons.length > 0) {
      messages.push(`Output '${output.Name}' ${reasons.join(' and ')}.`);
    }

    if (capabilities.RequiresConstraint && !output.Constraint) {
      messages.push(
        `Output '${output.Name}' has no constraint; this pipeline type requires one of: ${capabilities.ConstraintTypes.join(', ')}.`
      );
      continue;
    }

    if (output.Constraint?.Type === 'numeric' && capabilities.RequiresNumericLevels) {
      const levels = output.Constraint.Levels;
      if (!levels || !Array.isArray(levels) || levels.length < 2 || levels.length > 10) {
        messages.push(`Numeric output '${output.Name}' requires between 2 and 10 Level descriptions.`);
      }
    }

    const choices = ResolveEnumChoices(output, fieldValues);
    if (choices) {
      messages.push(...enumChoiceIssues(output.Name, choices, capabilities));
    }
  }

  return messages;
}

/** Why an enum output's resolved choices don't meet the capabilities' enum rules. */
function enumChoiceIssues(
  outputName: string,
  choices: FeaturePipelineEnumChoices,
  capabilities: FeaturePipelineDriverCapabilities
): string[] {
  const issues: string[] = [];
  const values = choices.Values;
  if (capabilities.MaxEnumValues !== undefined && values.length > capabilities.MaxEnumValues) {
    issues.push(`Enum output '${outputName}' has ${values.length} values; this pipeline type supports at most ${capabilities.MaxEnumValues}.`);
  }
  if (values.length === 0) {
    if (capabilities.RequiresEnumValues) {
      issues.push(
        `Enum output '${outputName}' has no values defined; list them in Values, or set FromFieldMetadata on a field that has a value list.`
      );
    }
    return issues;
  }
  if (capabilities.RequiresEnumValueDescriptions) {
    const missing = values.filter((v) => !choices.Descriptions[v] || choices.Descriptions[v].trim().length === 0);
    if (missing.length > 0) {
      issues.push(
        `Enum output '${outputName}' values missing descriptions: ${missing.join(', ')}. This pipeline type requires a description for every value.`
      );
    }
  }
  return issues;
}
