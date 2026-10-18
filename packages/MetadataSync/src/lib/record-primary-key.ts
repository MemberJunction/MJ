/**
 * Primary-key extraction for pulled records.
 *
 * Pull must key every database record by its real primary-key value: the key decides whether a
 * record updates an existing file entry or is appended as a new one. Reading the key through the
 * entity's typed property (`record.ID`) only works when the entity's generated subclass is
 * registered in this process. When it is not — an Open App whose server package did not load, a
 * host's generated entities package missing from the CLI — the ClassFactory hands back a bare
 * `BaseEntity`, which has no typed properties, so every record read `undefined`. All records then
 * shared one key, each overwrote the last in the write batch, and a pull of N new records wrote
 * exactly one, with an empty `primaryKey` that duplicated on the next pull (#3415).
 *
 * `BaseEntity.Get()` is metadata-driven and works on a bare `BaseEntity` as well as on a subclass.
 */
import type { BaseEntity, EntityInfo } from '@memberjunction/core';
import type { RecordData } from './sync-engine';

/** Primary-key values keyed by field name — the shape `RecordData.primaryKey` carries. */
export type PrimaryKeyValues = NonNullable<RecordData['primaryKey']>;

/**
 * Reads every primary-key field of `record` through `BaseEntity.Get()`.
 *
 * @throws when a key field has no value. A record without its key cannot be matched to a file
 *         entry and would overwrite other records, so refusing is the only safe outcome.
 */
export function ExtractPrimaryKeyValues(record: BaseEntity, entityInfo: EntityInfo): PrimaryKeyValues {
  const values: PrimaryKeyValues = {};
  for (const pk of entityInfo.PrimaryKeys) {
    const value = record.Get(pk.Name);
    if (!isPresentKeyValue(value)) {
      throw new Error(
        `Cannot read primary key field '${pk.Name}' on a '${entityInfo.Name}' record. ` +
          `Refusing to write it: a record without its key would overwrite other records in the same file.`
      );
    }
    values[pk.Name] = value;
  }
  return values;
}

/** @deprecated Use {@link ExtractPrimaryKeyValues}. */
export function extractPrimaryKeyValues(record: BaseEntity, entityInfo: EntityInfo): PrimaryKeyValues {
  return ExtractPrimaryKeyValues(record, entityInfo);
}

/**
 * True when a key field holds a value. Only a missing value counts as absent: an empty string, or
 * the text `null`, is a real key value.
 */
function isPresentKeyValue(value: PrimaryKeyValues[string]): boolean {
  return value !== undefined && value !== null;
}

/** True when `primaryKey` has at least one field and every field holds a value. */
export function HasCompletePrimaryKey(primaryKey: RecordData['primaryKey']): boolean {
  const values = Object.values(primaryKey ?? {});
  return values.length > 0 && values.every(isPresentKeyValue);
}

/** @deprecated Use {@link HasCompletePrimaryKey}. */
export function hasCompletePrimaryKey(primaryKey: RecordData['primaryKey']): boolean {
  return HasCompletePrimaryKey(primaryKey);
}

/**
 * Builds the string pull uses to match a database record to a file entry: `field:value` segments,
 * sorted by field name, joined by `|`. `\` and `|` inside a value are escaped, so a value that
 * contains the separator can't make two different keys produce the same string. The string is only
 * ever compared in memory — never parsed or persisted.
 */
export function CreatePrimaryKeyLookup(primaryKey: RecordData['primaryKey']): string {
  const values = primaryKey ?? {};
  return Object.keys(values)
    .sort()
    .map((field) => `${field}:${String(values[field]).replace(/[\\|]/g, '\\$&')}`)
    .join('|');
}

/** @deprecated Use {@link CreatePrimaryKeyLookup}. */
export function createPrimaryKeyLookup(primaryKey: RecordData['primaryKey']): string {
  return CreatePrimaryKeyLookup(primaryKey);
}
