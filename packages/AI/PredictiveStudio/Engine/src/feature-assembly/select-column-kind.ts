import { EntityFieldTSType, EntityFieldValueListType, type EntityFieldInfo } from '@memberjunction/core';

/**
 * How a plain `select` column enters the feature matrix (#3104).
 *
 * The sidecar reads every pass-through column as a number and turns anything it cannot convert into 0, so a datetime
 * (assembled as an ISO string) or a free-text string becomes a constant 0 that trains nothing and warns no one.
 * - `numeric`: numbers and booleans (a boolean converts to 1 / 0).
 * - `categorical`: a string with a value list, or one a `onehot` step encodes. It is one-hot encoded.
 * - `refused`: anything else. Pipeline validation and training refuse it with {@link Reason}.
 */
export type SelectColumnKind =
  | { Kind: 'numeric' }
  | { Kind: 'categorical' }
  | { Kind: 'refused'; Reason: string };

/**
 * Classifies one `select` column from its field metadata. A column that is not a field of the target entity (a
 * joined or derived column) keeps the old numeric treatment: there is nothing to judge it by.
 *
 * @param column the column name as written in the step
 * @param field the target entity's field, when there is one
 * @param oneHotColumns columns a `onehot` step encodes, lower-cased
 */
export function ClassifySelectColumn(column: string, field: EntityFieldInfo | undefined, oneHotColumns: ReadonlySet<string>): SelectColumnKind {
  if (!field) {
    return { Kind: 'numeric' };
  }
  switch (field.TSType) {
    case EntityFieldTSType.Number:
    case EntityFieldTSType.Boolean:
      return { Kind: 'numeric' };
    case EntityFieldTSType.Date:
      return {
        Kind: 'refused',
        Reason:
          `Column '${column}' is a date/time, which the model cannot use directly (it would be a constant 0). ` +
          `Add a derived numeric feature instead, e.g. days since '${column}', its month or its day of week.`,
      };
    default: {
      const hasValueList = field.ValueListType !== EntityFieldValueListType.None && field.ValueListType != null && field.EntityFieldValues.length > 0;
      if (hasValueList || oneHotColumns.has(column.toLowerCase())) {
        return { Kind: 'categorical' };
      }
      return {
        Kind: 'refused',
        Reason:
          `Column '${column}' is free text with no value list, which the model cannot use directly (it would be a constant 0). ` +
          `One-hot encode it with a 'onehot' step if it holds a small set of categories, or derive a numeric feature from it.`,
      };
    }
  }
}

/** Thrown when a training run would include a `select` column the model cannot use. */
export class UnusableFeatureColumnError extends Error {
  public readonly Columns: string[];
  constructor(entityName: string, refusals: Array<{ Column: string; Reason: string }>) {
    super(`The pipeline selects column(s) on '${entityName}' that cannot be features: ${refusals.map((r) => r.Reason).join(' ')}`);
    this.name = 'UnusableFeatureColumnError';
    this.Columns = refusals.map((r) => r.Column);
  }
}
