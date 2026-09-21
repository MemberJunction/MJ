/**
 * @fileoverview DataFeatureSpec artifact definition and pure validation/rendering functions.
 * Pure types + pure validators — zero imports from @memberjunction/core or database providers.
 * @module @memberjunction/feature-pipelines
 */

import type { ValueConstraint, ResolvedConstraint } from './value-constraint.js';
import type { OutputTarget } from './output-target.js';

export interface DataFeatureSpec {
  Name: string;
  Description: string;

  /** How prompt context is built for each row. Exactly one Source is required. */
  Context: {
    /** Render an Entity Document (supports ${Relationship(...)} and __Parent chaining). */
    EntityDocumentID?: string;
    /** Run an APPROVED MJ: Query, parameterized from the row. The reach a relationship walk cannot give. */
    QueryID?: string;
    /** Parameter name -> row-field ref, for QueryID. */
    QueryParams?: Record<string, string>;
    /** Simplest form: project these fields. Default when nothing else is set. */
    Fields?: string[];
    /** Optional value remap layered on whatever the above produced. */
    InputMapping?: Record<string, string>;
  };

  /** The prompt. User-visible and user-editable (D11). */
  PromptID: string;

  /** One or more outputs produced per row. */
  Outputs: DataFeatureOutput[];

  /**
   * Reuse policy (D7). KeyFields name the row fields whose values form the dedup
   * key; omit for whole-rendered-context keying. Scope defaults to this pipeline
   * so a shared dictionary is opt-in and readable.
   */
  Caching: {
    Cacheable: boolean;
    KeyFields?: string[];
    TTLSeconds?: number;
    Scope?: 'pipeline' | 'prompt';
  };

  /** Skip rows whose watermark says nothing they depend on has changed (P1-7). */
  Watermark?: {
    Enabled: boolean;
    Strategy: 'Checksum' | 'UpdatedAt' | 'None';
  };

  /** Capture the model's rationale into the history row's Reasoning column (D20). */
  CaptureReasoning?: boolean;

  /** Optional subclass hook registration (P1-6). */
  ProcessorExtensionKey?: string;
}

export interface DataFeatureOutput {
  /** Result path, e.g. "$.seniority". */
  Ref: string;
  /** Stable name — the history row's FeatureName and the model-feature column name. */
  Name: string;
  /** Narrowing/policy ON TOP of what field metadata already implies (D23). */
  Constraint?: ValueConstraint;
  /** Where this output lands (D19). */
  Target: OutputTarget;
  /** How Predictive Studio should treat it when consumed as a model feature. */
  FeatureKind?: 'numeric' | 'categorical' | 'embedding' | 'llm-derived';
}

/** Structured validation issue surfaced by validateSpec. */
export interface SpecValidationIssue {
  Field?: string;
  Path: string;
  Message: string;
  FixRecommendation: string;
  Severity: 'error' | 'warning';
}

/** Minimal field metadata stub decoupled from @memberjunction/core. */
export interface FieldMetadataStub {
  Name: string;
  TSType?: 'string' | 'number' | 'boolean' | 'Date' | string;
  IsVirtual?: boolean;
  AllowsNull?: boolean;
  RelatedEntity?: string;
  RelatedEntityID?: string;
  EntityFieldValues?: Array<{ Value: string; Code?: string }>;
}

/** Minimal entity metadata stub decoupled from @memberjunction/core. */
export interface EntityMetadataStub {
  Name: string;
  Fields: FieldMetadataStub[];
}

export type FieldResolver = (fieldName: string) => FieldMetadataStub | undefined;

/**
 * Pure validator for a DataFeatureSpec against optional entity metadata.
 * Returns structured problems naming the field and the fix recommendation.
 */
export function validateSpec(
  spec: DataFeatureSpec,
  entityInfo?: EntityMetadataStub,
  fieldResolver?: FieldResolver
): SpecValidationIssue[] {
  const issues: SpecValidationIssue[] = [];

  if (!spec.Name || spec.Name.trim().length === 0) {
    issues.push({
      Path: 'Name',
      Message: 'DataFeatureSpec Name is required.',
      FixRecommendation: 'Provide a descriptive name for the feature pipeline.',
      Severity: 'error',
    });
  }

  if (!spec.PromptID || spec.PromptID.trim().length === 0) {
    issues.push({
      Path: 'PromptID',
      Message: 'DataFeatureSpec PromptID is required.',
      FixRecommendation: 'Select or configure an AI Prompt to execute for this pipeline.',
      Severity: 'error',
    });
  }

  if (!spec.Outputs || spec.Outputs.length === 0) {
    issues.push({
      Path: 'Outputs',
      Message: 'DataFeatureSpec Outputs must contain at least one output definition.',
      FixRecommendation: 'Add at least one output target to specify where computed values land.',
      Severity: 'error',
    });
  }

  const resolveField = (fieldName: string): FieldMetadataStub | undefined => {
    if (fieldResolver) {
      return fieldResolver(fieldName);
    }
    if (entityInfo) {
      const lower = fieldName.toLowerCase();
      return entityInfo.Fields.find(f => f.Name.toLowerCase() === lower);
    }
    return undefined;
  };

  // Validate Caching KeyFields
  if (spec.Caching?.KeyFields && spec.Caching.KeyFields.length > 0 && (entityInfo || fieldResolver)) {
    for (const keyField of spec.Caching.KeyFields) {
      const field = resolveField(keyField);
      if (!field) {
        issues.push({
          Field: keyField,
          Path: `Caching.KeyFields[${keyField}]`,
          Message: `Caching KeyField '${keyField}' does not exist on entity '${entityInfo?.Name ?? 'unknown'}'.`,
          FixRecommendation: `Ensure KeyFields only names existing columns on the entity.`,
          Severity: 'error',
        });
      }
    }
  }

  // Validate Outputs
  if (spec.Outputs && spec.Outputs.length > 0) {
    const seenNames = new Set<string>();

    for (let i = 0; i < spec.Outputs.length; i++) {
      const out = spec.Outputs[i];
      const basePath = `Outputs[${i}]`;

      if (!out.Name || out.Name.trim().length === 0) {
        issues.push({
          Path: `${basePath}.Name`,
          Message: `Output at index ${i} has an empty Name.`,
          FixRecommendation: 'Assign a stable, non-empty Name to the output.',
          Severity: 'error',
        });
      } else if (seenNames.has(out.Name.toLowerCase())) {
        issues.push({
          Field: out.Name,
          Path: `${basePath}.Name`,
          Message: `Duplicate output Name '${out.Name}'. Output names must be unique within a pipeline.`,
          FixRecommendation: 'Provide a distinct Name for each output definition.',
          Severity: 'error',
        });
      } else {
        seenNames.add(out.Name.toLowerCase());
      }

      if (!out.Ref || out.Ref.trim().length === 0) {
        issues.push({
          Path: `${basePath}.Ref`,
          Message: `Output '${out.Name || i}' has an empty result path Ref.`,
          FixRecommendation: 'Specify a result path like "$.value" or "$.summary".',
          Severity: 'error',
        });
      } else {
        const segments = out.Ref.split(/[.\[\]]+/).filter(Boolean);
        if (segments.some(seg => seg === '__proto__' || seg === 'constructor' || seg === 'prototype')) {
          issues.push({
            Path: `${basePath}.Ref`,
            Message: `Output '${out.Name || i}' has an invalid result path Ref '${out.Ref}': prototype pollution property names ('__proto__', 'constructor', 'prototype') are forbidden.`,
            FixRecommendation: 'Remove forbidden property names from the result path Ref.',
            Severity: 'error',
          });
        }
      }

      // Target mode validation
      if (!out.Target) {
        issues.push({
          Path: `${basePath}.Target`,
          Message: `Output '${out.Name || i}' is missing a Target configuration.`,
          FixRecommendation: 'Configure a target Mode: "field", "child", or "tags".',
          Severity: 'error',
        });
        continue;
      }

      interface TargetWithMode {
        Mode?: string;
      }
      const targetWithMode: TargetWithMode = out.Target;
      const validModes: ReadonlyArray<string> = ['field', 'child', 'tags'];
      if (!targetWithMode.Mode || !validModes.includes(targetWithMode.Mode)) {
        issues.push({
          Path: `${basePath}.Target.Mode`,
          Message: `Output '${out.Name || i}' has an invalid or missing target Mode '${targetWithMode.Mode ?? ''}'. Expected one of: ${validModes.join(', ')}.`,
          FixRecommendation: 'Configure Target.Mode as "field", "child", or "tags".',
          Severity: 'error',
        });
        continue;
      }

      if (out.Target.Mode === 'field') {
        const targetField = out.Target.EntityFieldName;
        if (!targetField || targetField.trim().length === 0) {
          issues.push({
            Path: `${basePath}.Target.EntityFieldName`,
            Message: `Field target for output '${out.Name}' must specify EntityFieldName.`,
            FixRecommendation: 'Specify the name of the column on the entity to write to.',
            Severity: 'error',
          });
        } else if (entityInfo || fieldResolver) {
          const field = resolveField(targetField);
          if (!field) {
            issues.push({
              Field: targetField,
              Path: `${basePath}.Target.EntityFieldName`,
              Message: `Target field '${targetField}' does not exist on entity '${entityInfo?.Name ?? 'unknown'}'.`,
              FixRecommendation: `Target an existing column on the entity or create a migration to add it.`,
              Severity: 'error',
            });
          } else {
            // Check virtual column
            if (field.IsVirtual) {
              issues.push({
                Field: targetField,
                Path: `${basePath}.Target.EntityFieldName`,
                Message: `Target field '${targetField}' is a virtual/view column and cannot be written to.`,
                FixRecommendation: `Target a base-table column on this entity or write to a child entity instead.`,
                Severity: 'error',
              });
            }

            // Check FK resolution
            const isFK = Boolean(field.RelatedEntity || field.RelatedEntityID);
            if (isFK && out.Target.LookupMatchField === '') {
              issues.push({
                Field: targetField,
                Path: `${basePath}.Target.LookupMatchField`,
                Message: `Foreign key field '${targetField}' has an empty LookupMatchField.`,
                FixRecommendation: `Specify the column on the related entity to match against (default is 'Name').`,
                Severity: 'error',
              });
            }

            // Check type compatibility
            if (out.Constraint && field.TSType) {
              const typeIssue = checkTypeCompatibility(out.Constraint, field.TSType, targetField);
              if (typeIssue) {
                issues.push({
                  Field: targetField,
                  Path: `${basePath}.Constraint`,
                  Message: typeIssue.message,
                  FixRecommendation: typeIssue.fix,
                  Severity: 'error',
                });
              }
            }
          }
        }
      } else if (out.Target.Mode === 'child') {
        if (!out.Target.EntityName || out.Target.EntityName.trim().length === 0) {
          issues.push({
            Path: `${basePath}.Target.EntityName`,
            Message: `Child target for output '${out.Name}' must specify EntityName.`,
            FixRecommendation: 'Specify the child entity to insert rows into.',
            Severity: 'error',
          });
        }
        if (!out.Target.ParentField || out.Target.ParentField.trim().length === 0) {
          issues.push({
            Path: `${basePath}.Target.ParentField`,
            Message: `Child target for output '${out.Name}' must specify ParentField.`,
            FixRecommendation: 'Specify the foreign key field on the child entity linking back to the parent record.',
            Severity: 'error',
          });
        }
        if (!out.Target.Map || Object.keys(out.Target.Map).length === 0) {
          issues.push({
            Path: `${basePath}.Target.Map`,
            Message: `Child target for output '${out.Name}' must specify at least one field mapping in Map.`,
            FixRecommendation: 'Map at least one field from the result to the child record.',
            Severity: 'error',
          });
        }
      } else if (out.Target.Mode === 'tags') {
        if (!out.Target.RootTagID || out.Target.RootTagID.trim().length === 0) {
          issues.push({
            Path: `${basePath}.Target.RootTagID`,
            Message: `Tag target for output '${out.Name}' requires a RootTagID.`,
            FixRecommendation: 'Specify the root tag UUID to constrain tag creation/matching to a valid taxonomy subtree.',
            Severity: 'error',
          });
        }
      }

      // Constraint bounds validation
      if (out.Constraint) {
        if (out.Constraint.Type === 'enum') {
          if (!out.Constraint.FromFieldMetadata && (!out.Constraint.Values || out.Constraint.Values.length === 0)) {
            issues.push({
              Path: `${basePath}.Constraint.Values`,
              Message: `Enum constraint on output '${out.Name}' has no values and FromFieldMetadata is false.`,
              FixRecommendation: 'Provide a list of allowed enum values or set FromFieldMetadata: true.',
              Severity: 'error',
            });
          }
        } else if (out.Constraint.Type === 'numeric' || out.Constraint.Type === 'money') {
          if (out.Constraint.Min !== undefined && out.Constraint.Max !== undefined && out.Constraint.Min > out.Constraint.Max) {
            issues.push({
              Path: `${basePath}.Constraint.Min`,
              Message: `Numeric/money constraint Min (${out.Constraint.Min}) is greater than Max (${out.Constraint.Max}) on output '${out.Name}'.`,
              FixRecommendation: 'Ensure Min is less than or equal to Max.',
              Severity: 'error',
            });
          }
        }

        if (out.Constraint.OnViolation === 'coerce-to-other' && out.Constraint.Type !== 'enum') {
          issues.push({
            Path: `${basePath}.Constraint.OnViolation`,
            Message: `Violation policy 'coerce-to-other' is only valid for 'enum' constraints, but output '${out.Name}' has constraint type '${out.Constraint.Type}'.`,
            FixRecommendation: "Use 'fail' or 'null' for non-enum constraints, or change constraint type to 'enum'.",
            Severity: 'error',
          });
        }
      }
    }
  }

  return issues;
}

function checkTypeCompatibility(
  constraint: ValueConstraint,
  fieldTSType: string,
  fieldName: string
): { message: string; fix: string } | null {
  const normType = fieldTSType.toLowerCase();

  switch (constraint.Type) {
    case 'numeric':
    case 'money':
      if (normType !== 'number') {
        return {
          message: `Numeric constraint applied to non-numeric column '${fieldName}' (TSType is '${fieldTSType}').`,
          fix: `Change the target column to a numeric type (decimal/int/float) or adjust the output constraint.`,
        };
      }
      break;
    case 'boolean':
      if (normType !== 'boolean') {
        return {
          message: `Boolean constraint applied to non-boolean column '${fieldName}' (TSType is '${fieldTSType}').`,
          fix: `Change the target column to a bit/boolean type or adjust the output constraint.`,
        };
      }
      break;
    case 'date':
      if (normType !== 'date' && !normType.includes('date')) {
        return {
          message: `Date constraint applied to non-date column '${fieldName}' (TSType is '${fieldTSType}').`,
          fix: `Change the target column to a datetimeoffset/date type or adjust the output constraint.`,
        };
      }
      break;
  }
  return null;
}

/**
 * Resolves an output's constraint against field metadata.
 * Materializes FromFieldMetadata into concrete allowed values.
 */
export function resolveConstraint(
  output: DataFeatureOutput,
  field?: FieldMetadataStub
): ResolvedConstraint | null {
  const c = output.Constraint;

  // 1. Explicit constraint
  if (c) {
    if (c.Type === 'enum') {
      let allowedValues = c.Values ?? [];
      if (c.FromFieldMetadata && field?.EntityFieldValues && field.EntityFieldValues.length > 0) {
        allowedValues = field.EntityFieldValues.map(v => v.Value);
      }
      return {
        Type: 'enum',
        OnViolation: c.OnViolation,
        AllowedValues: allowedValues,
      };
    }
    if (c.Type === 'numeric') {
      return {
        Type: 'numeric',
        OnViolation: c.OnViolation,
        Min: c.Min,
        Max: c.Max,
        Integer: c.Integer,
      };
    }
    if (c.Type === 'money') {
      return {
        Type: 'money',
        OnViolation: c.OnViolation,
        Min: c.Min,
        Max: c.Max,
        CurrencyCode: c.CurrencyCode,
      };
    }
    if (c.Type === 'date') {
      return {
        Type: 'date',
        OnViolation: c.OnViolation,
        MinDate: c.Min,
        MaxDate: c.Max,
      };
    }
    if (c.Type === 'boolean') {
      return {
        Type: 'boolean',
        OnViolation: c.OnViolation,
      };
    }
    if (c.Type === 'lookup') {
      return {
        Type: 'lookup',
        OnViolation: c.OnViolation,
        RelatedEntityName: c.Entity ?? field?.RelatedEntity,
        LookupMatchField: c.MatchField ?? (output.Target.Mode === 'field' ? output.Target.LookupMatchField : undefined) ?? 'Name',
      };
    }
    if (c.Type === 'freetext') {
      return {
        Type: 'freetext',
        OnViolation: c.OnViolation ?? 'null',
        MaxLength: c.MaxLength,
      };
    }
  }

  // 2. Implicit constraint derived from field metadata if target is Mode: 'field'
  if (output.Target.Mode === 'field' && field) {
    if (field.EntityFieldValues && field.EntityFieldValues.length > 0) {
      return {
        Type: 'enum',
        OnViolation: 'fail',
        AllowedValues: field.EntityFieldValues.map(v => v.Value),
      };
    }
    if (field.TSType === 'boolean') {
      return {
        Type: 'boolean',
        OnViolation: 'fail',
      };
    }
  }

  return null;
}

/**
 * Pure function to render the exact constraint block text injected into prompts and shown in UI previews.
 */
export function renderConstraintBlock(
  outputs: DataFeatureOutput[],
  resolvedConstraints?: Map<string, ResolvedConstraint | null>
): string {
  if (!outputs || outputs.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('### OUTPUT CONSTRAINTS & FORMATTING INSTRUCTIONS');
  lines.push('You MUST adhere to the following output value constraints:');

  for (const out of outputs) {
    const resolved = resolvedConstraints?.get(out.Name) ?? resolveConstraint(out);
    lines.push(`- **${out.Name}** (${out.Ref}):`);

    if (!resolved) {
      lines.push(`  Provide the computed value for '${out.Name}'.`);
      continue;
    }

    switch (resolved.Type) {
      case 'enum':
        if (resolved.AllowedValues && resolved.AllowedValues.length > 0) {
          lines.push(`  Allowed values (MUST be exactly one of the following):`);
          for (const val of resolved.AllowedValues) {
            lines.push(`  * "${val}"`);
          }
        } else {
          lines.push(`  Must be a valid categorical value.`);
        }
        break;
      case 'numeric':
        {
          const parts: string[] = [];
          if (resolved.Integer) parts.push('integer');
          if (resolved.Min !== undefined && resolved.Max !== undefined) {
            parts.push(`between ${resolved.Min} and ${resolved.Max}`);
          } else if (resolved.Min !== undefined) {
            parts.push(`greater than or equal to ${resolved.Min}`);
          } else if (resolved.Max !== undefined) {
            parts.push(`less than or equal to ${resolved.Max}`);
          }
          lines.push(`  Numeric value${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`);
        }
        break;
      case 'money':
        {
          const parts: string[] = [];
          if (resolved.CurrencyCode) parts.push(`currency: ${resolved.CurrencyCode}`);
          if (resolved.Min !== undefined && resolved.Max !== undefined) {
            parts.push(`between ${resolved.Min} and ${resolved.Max}`);
          } else if (resolved.Min !== undefined) {
            parts.push(`>= ${resolved.Min}`);
          } else if (resolved.Max !== undefined) {
            parts.push(`<= ${resolved.Max}`);
          }
          lines.push(`  Monetary amount${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`);
        }
        break;
      case 'boolean':
        lines.push(`  Boolean value: true or false.`);
        break;
      case 'date':
        lines.push(`  Date value in ISO-8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ).`);
        break;
      case 'lookup':
        lines.push(`  Must match an existing ${resolved.RelatedEntityName || 'record'} by ${resolved.LookupMatchField || 'Name'}.`);
        break;
      case 'freetext':
        if (resolved.MaxLength) {
          lines.push(`  Free-form text with maximum length of ${resolved.MaxLength} characters.`);
        } else {
          lines.push(`  Free-form text.`);
        }
        break;
    }
  }

  return lines.join('\n');
}
