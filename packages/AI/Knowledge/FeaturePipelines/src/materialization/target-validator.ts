/**
 * @fileoverview Materialization target validator for Feature Pipelines (P1-4).
 * Validates that pipeline outputs target real, writable schema: existing physical columns,
 * type and range compatibility with precision/scale, CHECK constraint agreement,
 * foreign key related entity and lookup field resolution, child entity FK compatibility,
 * and valid tag taxonomy configuration.
 * Satisfies D17 — the developer's migration is the contract; the pipeline fails early.
 * @module @memberjunction/feature-pipelines
 */

import { SQLMaxLength } from '@memberjunction/core';
import {
  type DataFeatureSpec,
  type SpecValidationIssue,
  validateSpec,
} from '../spec/data-feature-spec.js';
import type { ValueConstraint } from '../spec/value-constraint.js';

/** Minimal field metadata abstraction compatible with EntityFieldInfo without requiring full classes. */
export interface FieldInfoLike {
  Name: string;
  Type?: string | null;
  Length?: number | null;
  MaxLength?: number | null;
  Precision?: number | null;
  Scale?: number | null;
  TSType?: string | null;
  IsVirtual?: boolean | null;
  AllowsNull?: boolean | null;
  IsPrimaryKey?: boolean | null;
  RelatedEntity?: string | null;
  RelatedEntityID?: string | null;
  EntityFieldValues?: ReadonlyArray<{ Value: string; Code?: string }> | null;
}

/** Minimal entity metadata abstraction compatible with EntityInfo without requiring full classes. */
export interface EntityInfoLike {
  ID?: string | null;
  Name: string;
  Fields: FieldInfoLike[] | readonly FieldInfoLike[];
  FirstPrimaryKey?: FieldInfoLike | null; // first-pk-ok: duck-typed interface property for single-column PK resolution
  PrimaryKeys?: FieldInfoLike[] | readonly FieldInfoLike[] | null;
  FieldByName?(name: string): FieldInfoLike | undefined;
}

/** Minimal metadata provider abstraction compatible with IMetadataProvider. */
export interface TargetValidationMetadataProvider {
  EntityByID(id: string): EntityInfoLike | undefined;
  EntityByName(name: string): EntityInfoLike | undefined;
  Entities?: EntityInfoLike[] | readonly EntityInfoLike[];
}

function getField(entity: EntityInfoLike, name: string): FieldInfoLike | undefined {
  if (typeof entity.FieldByName === 'function') {
    return entity.FieldByName(name);
  }
  const lower = name.trim().toLowerCase();
  return entity.Fields.find((f) => f.Name?.trim().toLowerCase() === lower);
}

function getPrimaryKey(entity: EntityInfoLike): FieldInfoLike | undefined {
  if (entity.FirstPrimaryKey) { // first-pk-ok: foreign-key target comparison for single parent key
    return entity.FirstPrimaryKey; // first-pk-ok: foreign-key target comparison for single parent key
  }
  return entity.Fields.find((f) => f.IsPrimaryKey);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates materialization targets for a DataFeatureSpec against loaded metadata.
 * Performs deep schema contract validation:
 * - Target column exists, is not virtual
 * - Numeric constraint bounds fit within column precision/scale (e.g. DECIMAL(5,4) max is 9.9999)
 * - String/text constraints fit within column Length
 * - Enum constraints agree with column CHECK constraint value list
 * - Foreign key targets resolve to existing related entities and valid non-virtual match fields
 * - Child targets resolve to existing entities with type-compatible ParentField and valid mapped fields
 * - Tag targets have valid UUID RootTagID, valid MaxDepth, valid Growth, and valid MatchThreshold
 *
 * @param spec The pipeline feature specification.
 * @param provider Metadata provider providing EntityByID and EntityByName.
 * @param targetEntityIDOrName Entity ID or Entity Name of the record set being processed.
 * @returns Array of validation issues with path, message, fix recommendation, and severity.
 */
export function validateMaterializationTargets(
  spec: DataFeatureSpec,
  provider: TargetValidationMetadataProvider,
  targetEntityIDOrName: string
): SpecValidationIssue[] {
  const issues: SpecValidationIssue[] = [];

  const targetEntity = provider.EntityByID(targetEntityIDOrName) ?? provider.EntityByName(targetEntityIDOrName);
  if (!targetEntity) {
    issues.push({
      Path: 'TargetEntity',
      Message: `Target entity '${targetEntityIDOrName}' was not found in metadata.`,
      FixRecommendation: 'Ensure the pipeline is configured with a valid EntityID or EntityName present in metadata.',
      Severity: 'error',
    });
    return issues;
  }

  // Run base spec validation with target entity metadata
  const baseIssues = validateSpec(spec, {
    Name: targetEntity.Name,
    Fields: targetEntity.Fields.map((f) => ({
      Name: f.Name,
      TSType: f.TSType ?? undefined,
      IsVirtual: f.IsVirtual ?? false,
      AllowsNull: f.AllowsNull ?? true,
      RelatedEntity: f.RelatedEntity ?? undefined,
      RelatedEntityID: f.RelatedEntityID ?? undefined,
      EntityFieldValues: f.EntityFieldValues ? f.EntityFieldValues.map((v) => ({ Value: v.Value, Code: v.Code ?? undefined })) : undefined,
    })),
  });
  issues.push(...baseIssues);

  if (!spec.Outputs || spec.Outputs.length === 0) {
    return issues;
  }

  for (let i = 0; i < spec.Outputs.length; i++) {
    const out = spec.Outputs[i];
    const basePath = `Outputs[${i}]`;

    if (!out.Target) {
      continue;
    }

    if (out.Target.Mode === 'field') {
      const fieldName = out.Target.EntityFieldName;
      if (!fieldName) {
        continue;
      }

      const field = getField(targetEntity, fieldName);
      if (!field) {
        // Already handled by validateSpec
        continue;
      }

      if (field.IsVirtual) {
        // Already flagged by validateSpec
        continue;
      }

      // 1. Numeric bounds vs. column precision/scale (e.g. DECIMAL(5,4))
      if (out.Constraint && (out.Constraint.Type === 'numeric' || out.Constraint.Type === 'money')) {
        validateNumericBounds(out.Constraint, field, out.Name, basePath, issues);
      }

      // 2. String length vs. column Length
      if (out.Constraint && (out.Constraint.Type === 'freetext' || out.Constraint.Type === 'enum')) {
        validateStringLengths(out.Constraint, field, out.Name, basePath, issues);
      }

      // 3. CHECK constraint value list agreement
      if (out.Constraint && out.Constraint.Type === 'enum') {
        validateCheckConstraintAgreement(out.Constraint, field, out.Name, basePath, issues);
      }

      // 4. Foreign key resolution and LookupMatchField validation
      const isFK = Boolean(field.RelatedEntity || field.RelatedEntityID);
      if (isFK) {
        validateForeignKeyTarget(out.Target.LookupMatchField, field, out.Name, basePath, provider, issues);
      }
    } else if (out.Target.Mode === 'child') {
      validateChildTarget(out.Target, targetEntity, out.Name, basePath, provider, issues);
    } else if (out.Target.Mode === 'tags') {
      validateTagTarget(out.Target, out.Name, basePath, provider, issues);
    }
  }

  return issues;
}

function parsePrecisionAndScale(field: FieldInfoLike): { precision?: number; scale?: number } {
  if (typeof field.Precision === 'number' && typeof field.Scale === 'number') {
    return { precision: field.Precision, scale: field.Scale };
  }
  if (field.Type) {
    const match = field.Type.match(/(?:decimal|numeric)\s*\(\s*(\d+)\s*(?:,\s*(\d+))?\s*\)/i);
    if (match) {
      return {
        precision: parseInt(match[1], 10),
        scale: match[2] ? parseInt(match[2], 10) : 0,
      };
    }
  }
  return {};
}

function validateNumericBounds(
  constraint: ValueConstraint & { Type: 'numeric' | 'money' },
  field: FieldInfoLike,
  outputName: string,
  basePath: string,
  issues: SpecValidationIssue[]
): void {
  const { precision, scale } = parsePrecisionAndScale(field);

  if (precision !== undefined && scale !== undefined && precision > 0) {
    const integerDigits = precision - scale;
    if (integerDigits >= 0) {
      const maxAllowed = Math.pow(10, integerDigits) - Math.pow(10, -scale);
      const minAllowed = -maxAllowed;

      if (constraint.Max !== undefined && constraint.Max > maxAllowed) {
        issues.push({
          Field: field.Name,
          Path: `${basePath}.Constraint.Max`,
          Message: `Target column '${field.Name}' has type decimal(${precision},${scale}) with maximum representable value ${maxAllowed}, but constraint Max is ${constraint.Max}. This would cause arithmetic overflow on write.`,
          FixRecommendation: `Adjust constraint Max to <= ${maxAllowed}, or expand the column precision/scale in a database migration.`,
          Severity: 'error',
        });
      }

      if (constraint.Min !== undefined && constraint.Min < minAllowed) {
        issues.push({
          Field: field.Name,
          Path: `${basePath}.Constraint.Min`,
          Message: `Target column '${field.Name}' has type decimal(${precision},${scale}) with minimum representable value ${minAllowed}, but constraint Min is ${constraint.Min}. This would cause arithmetic overflow on write.`,
          FixRecommendation: `Adjust constraint Min to >= ${minAllowed}, or expand the column precision/scale in a database migration.`,
          Severity: 'error',
        });
      }
    }
  }

  // Integer type ranges
  const typeLower = (field.Type ?? '').toLowerCase().trim();
  if (typeLower === 'tinyint') {
    if (constraint.Max !== undefined && constraint.Max > 255) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.Max`,
        Message: `Target column '${field.Name}' is tinyint (max: 255), but constraint Max is ${constraint.Max}.`,
        FixRecommendation: 'Adjust constraint Max to <= 255, or widen column type to smallint/int in a migration.',
        Severity: 'error',
      });
    }
    if (constraint.Min !== undefined && constraint.Min < 0) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.Min`,
        Message: `Target column '${field.Name}' is unsigned tinyint (min: 0), but constraint Min is ${constraint.Min}.`,
        FixRecommendation: 'Adjust constraint Min to >= 0.',
        Severity: 'error',
      });
    }
  } else if (typeLower === 'smallint') {
    if (constraint.Max !== undefined && constraint.Max > 32767) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.Max`,
        Message: `Target column '${field.Name}' is smallint (max: 32767), but constraint Max is ${constraint.Max}.`,
        FixRecommendation: 'Adjust constraint Max to <= 32767, or widen column type to int in a migration.',
        Severity: 'error',
      });
    }
    if (constraint.Min !== undefined && constraint.Min < -32768) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.Min`,
        Message: `Target column '${field.Name}' is smallint (min: -32768), but constraint Min is ${constraint.Min}.`,
        FixRecommendation: 'Adjust constraint Min to >= -32768.',
        Severity: 'error',
      });
    }
  } else if (typeLower === 'int' || typeLower === 'integer') {
    if (constraint.Max !== undefined && constraint.Max > 2147483647) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.Max`,
        Message: `Target column '${field.Name}' is int (max: 2147483647), but constraint Max is ${constraint.Max}.`,
        FixRecommendation: 'Adjust constraint Max to <= 2147483647, or widen column type to bigint in a migration.',
        Severity: 'error',
      });
    }
    if (constraint.Min !== undefined && constraint.Min < -2147483648) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.Min`,
        Message: `Target column '${field.Name}' is int (min: -2147483648), but constraint Min is ${constraint.Min}.`,
        FixRecommendation: 'Adjust constraint Min to >= -2147483648.',
        Severity: 'error',
      });
    }
  }
}

function getEffectiveMaxLength(field: FieldInfoLike): number | undefined {
  if (field.MaxLength !== undefined && field.MaxLength !== null && field.MaxLength > 0) {
    return field.MaxLength;
  }
  if (field.Type && field.Length && field.Length > 0) {
    return SQLMaxLength(field.Type, field.Length);
  }
  if (field.Length && field.Length > 0) {
    return field.Length;
  }
  return undefined;
}

function validateStringLengths(
  constraint: ValueConstraint & { Type: 'freetext' | 'enum' },
  field: FieldInfoLike,
  outputName: string,
  basePath: string,
  issues: SpecValidationIssue[]
): void {
  const maxLen = getEffectiveMaxLength(field);
  if (maxLen && maxLen > 0) {
    if (constraint.Type === 'freetext' && constraint.MaxLength !== undefined && constraint.MaxLength > maxLen) {
      issues.push({
        Field: field.Name,
        Path: `${basePath}.Constraint.MaxLength`,
        Message: `Target column '${field.Name}' has maximum length ${maxLen}, but freetext constraint MaxLength is ${constraint.MaxLength}.`,
        FixRecommendation: `Reduce constraint MaxLength to <= ${maxLen}, or widen the column length in a database migration.`,
        Severity: 'error',
      });
    } else if (constraint.Type === 'enum' && constraint.Values) {
      for (const val of constraint.Values) {
        if (val.length > maxLen) {
          issues.push({
            Field: field.Name,
            Path: `${basePath}.Constraint.Values`,
            Message: `Enum constraint value '${val}' on output '${outputName}' has length ${val.length}, which exceeds maximum length ${maxLen} of target column '${field.Name}'.`,
            FixRecommendation: `Shorten the enum value or widen the column length in a database migration.`,
            Severity: 'error',
          });
        }
      }
    }
  }
}

function validateCheckConstraintAgreement(
  constraint: ValueConstraint & { Type: 'enum' },
  field: FieldInfoLike,
  outputName: string,
  basePath: string,
  issues: SpecValidationIssue[]
): void {
  if (field.EntityFieldValues && field.EntityFieldValues.length > 0) {
    if (!constraint.FromFieldMetadata && constraint.Values && constraint.Values.length > 0) {
      const allowedDbValues = field.EntityFieldValues.map((v) => v.Value);
      const allowedDbSet = new Set(allowedDbValues.map((v) => v.trim().toLowerCase()));

      const invalidValues = constraint.Values.filter((v) => !allowedDbSet.has(v.trim().toLowerCase()));
      if (invalidValues.length > 0) {
        issues.push({
          Field: field.Name,
          Path: `${basePath}.Constraint.Values`,
          Message: `Enum constraint on output '${outputName}' specifies value(s) [${invalidValues.map((v) => `'${v}'`).join(', ')}] not permitted by the database CHECK constraint on column '${field.Name}' (allowed: [${allowedDbValues.map((v) => `'${v}'`).join(', ')}]).`,
          FixRecommendation: `Update constraint values to match the database CHECK constraint on '${field.Name}', or add the missing value(s) to the CHECK constraint in a migration.`,
          Severity: 'error',
        });
      }
    }
  }
}

function validateForeignKeyTarget(
  lookupMatchField: string | undefined,
  field: FieldInfoLike,
  outputName: string,
  basePath: string,
  provider: TargetValidationMetadataProvider,
  issues: SpecValidationIssue[]
): void {
  const relatedEntity =
    (field.RelatedEntityID ? provider.EntityByID(field.RelatedEntityID) : undefined) ??
    (field.RelatedEntity ? provider.EntityByName(field.RelatedEntity) : undefined);

  if (!relatedEntity) {
    issues.push({
      Field: field.Name,
      Path: `${basePath}.Target`,
      Message: `Target field '${field.Name}' is a foreign key to entity '${field.RelatedEntity || field.RelatedEntityID}', but that entity was not found in metadata.`,
      FixRecommendation: 'Ensure the related entity exists in MemberJunction metadata.',
      Severity: 'error',
    });
    return;
  }

  const matchFieldName = lookupMatchField || 'Name';
  const matchField = getField(relatedEntity, matchFieldName);

  if (!matchField) {
    const pkName = getPrimaryKey(relatedEntity)?.Name ?? 'ID';
    issues.push({
      Field: field.Name,
      Path: `${basePath}.Target.LookupMatchField`,
      Message: `Foreign key target field '${field.Name}' specifies LookupMatchField '${matchFieldName}', but '${matchFieldName}' does not exist on related entity '${relatedEntity.Name}'.`,
      FixRecommendation: `Specify an existing column on '${relatedEntity.Name}' for LookupMatchField (e.g. '${pkName}' or 'Name').`,
      Severity: 'error',
    });
  } else if (matchField.IsVirtual) {
    issues.push({
      Field: field.Name,
      Path: `${basePath}.Target.LookupMatchField`,
      Message: `LookupMatchField '${matchFieldName}' on related entity '${relatedEntity.Name}' is virtual and cannot be used for direct lookup matching.`,
      FixRecommendation: `Use a physical, non-virtual column on '${relatedEntity.Name}' for LookupMatchField.`,
      Severity: 'error',
    });
  }
}

function validateChildTarget(
  target: { Mode: 'child'; EntityName: string; ParentField: string; Map: Record<string, string> },
  parentEntity: EntityInfoLike,
  outputName: string,
  basePath: string,
  provider: TargetValidationMetadataProvider,
  issues: SpecValidationIssue[]
): void {
  const childEntity = provider.EntityByName(target.EntityName) ?? provider.EntityByID(target.EntityName);
  if (!childEntity) {
    issues.push({
      Path: `${basePath}.Target.EntityName`,
      Message: `Child target for output '${outputName}' references entity '${target.EntityName}', which does not exist in metadata.`,
      FixRecommendation: 'Specify an existing entity name for the child target.',
      Severity: 'error',
    });
    return;
  }

  const parentField = getField(childEntity, target.ParentField);
  if (!parentField) {
    issues.push({
      Path: `${basePath}.Target.ParentField`,
      Message: `Child target for output '${outputName}' specifies ParentField '${target.ParentField}', but that field does not exist on child entity '${childEntity.Name}'.`,
      FixRecommendation: `Specify an existing foreign key column on '${childEntity.Name}' that links to '${parentEntity.Name}'.`,
      Severity: 'error',
    });
  } else {
    if (parentField.IsVirtual) {
      issues.push({
        Path: `${basePath}.Target.ParentField`,
        Message: `ParentField '${target.ParentField}' on child entity '${childEntity.Name}' is virtual and cannot be written to.`,
        FixRecommendation: `Use a physical foreign key column on '${childEntity.Name}'.`,
        Severity: 'error',
      });
    }

    const parentPK = getPrimaryKey(parentEntity);
    if (parentPK && parentPK.TSType && parentField.TSType) {
      if (parentPK.TSType.toLowerCase() !== parentField.TSType.toLowerCase()) {
        issues.push({
          Path: `${basePath}.Target.ParentField`,
          Message: `ParentField '${target.ParentField}' on child entity '${childEntity.Name}' (type '${parentField.TSType}') is not type-compatible with parent primary key '${parentPK.Name}' on '${parentEntity.Name}' (type '${parentPK.TSType}').`,
          FixRecommendation: `Ensure '${target.ParentField}' matches the data type of the parent primary key column '${parentPK.Name}'.`,
          Severity: 'error',
        });
      }
    }
  }

  if (target.Map) {
    for (const childCol of Object.keys(target.Map)) {
      const field = getField(childEntity, childCol);
      if (!field) {
        issues.push({
          Field: childCol,
          Path: `${basePath}.Target.Map[${childCol}]`,
          Message: `Mapped child field '${childCol}' does not exist on child entity '${childEntity.Name}'.`,
          FixRecommendation: `Map only to existing columns on '${childEntity.Name}' or add the column via a database migration.`,
          Severity: 'error',
        });
      } else if (field.IsVirtual) {
        issues.push({
          Field: childCol,
          Path: `${basePath}.Target.Map[${childCol}]`,
          Message: `Mapped child field '${childCol}' on child entity '${childEntity.Name}' is virtual and cannot be written to.`,
          FixRecommendation: `Map only to physical, non-virtual columns on '${childEntity.Name}'.`,
          Severity: 'error',
        });
      }
    }
  }
}

function validateTagTarget(
  target: { Mode: 'tags'; RootTagID: string; MaxDepth?: number; Growth?: string; MatchThreshold?: number; TaggedEntityName?: string },
  outputName: string,
  basePath: string,
  provider: TargetValidationMetadataProvider,
  issues: SpecValidationIssue[]
): void {
  if (!target.RootTagID || !UUID_REGEX.test(target.RootTagID)) {
    issues.push({
      Path: `${basePath}.Target.RootTagID`,
      Message: `RootTagID '${target.RootTagID}' must be a valid UUID format.`,
      FixRecommendation: 'Specify a valid root tag UUID to constrain tag creation/matching to a valid taxonomy subtree.',
      Severity: 'error',
    });
  }

  if (target.MaxDepth !== undefined && (target.MaxDepth < 1 || !Number.isInteger(target.MaxDepth))) {
    issues.push({
      Path: `${basePath}.Target.MaxDepth`,
      Message: `MaxDepth (${target.MaxDepth}) must be a positive integer >= 1.`,
      FixRecommendation: 'Set MaxDepth to a positive integer (e.g. 1 for direct children only).',
      Severity: 'error',
    });
  }

  if (target.Growth && !['constrained', 'auto-grow', 'hybrid'].includes(target.Growth)) {
    issues.push({
      Path: `${basePath}.Target.Growth`,
      Message: `Invalid Growth mode '${target.Growth}'. Allowed modes: 'constrained', 'auto-grow', 'hybrid'.`,
      FixRecommendation: `Choose a valid Growth mode ('constrained' | 'auto-grow' | 'hybrid').`,
      Severity: 'error',
    });
  }

  if (target.MatchThreshold !== undefined && (target.MatchThreshold < 0 || target.MatchThreshold > 1)) {
    issues.push({
      Path: `${basePath}.Target.MatchThreshold`,
      Message: `MatchThreshold (${target.MatchThreshold}) must be between 0.0 and 1.0.`,
      FixRecommendation: 'Set MatchThreshold to a decimal between 0.0 and 1.0.',
      Severity: 'error',
    });
  }

  if (target.TaggedEntityName) {
    const taggedEntity = provider.EntityByName(target.TaggedEntityName) ?? provider.EntityByID(target.TaggedEntityName);
    if (!taggedEntity) {
      issues.push({
        Path: `${basePath}.Target.TaggedEntityName`,
        Message: `TaggedEntityName '${target.TaggedEntityName}' does not exist in metadata.`,
        FixRecommendation: 'Specify an existing entity name or leave empty to default to the processed entity.',
        Severity: 'error',
      });
    }
  }
}
