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
export function extractPrimaryKeyValues(record: BaseEntity, entityInfo: EntityInfo): PrimaryKeyValues {
  const values: PrimaryKeyValues = {};
  for (const pk of entityInfo.PrimaryKeys) {
    const value = record.Get(pk.Name);
    if (value === undefined || value === null) {
      throw new Error(
        `Cannot read primary key field '${pk.Name}' on a '${entityInfo.Name}' record. ` +
          `Refusing to write it: a record without its key would overwrite other records in the same file.`
      );
    }
    values[pk.Name] = value;
  }
  return values;
}

/**
 * True when every `field:value` segment of a primary-key lookup string (the format
 * `createPrimaryKeyLookup` builds: sorted segments joined by `|`) carries a value.
 */
export function isCompletePrimaryKeyLookup(lookup: string): boolean {
  if (!lookup) {
    return false;
  }
  return lookup.split('|').every((segment) => {
    const separator = segment.indexOf(':');
    const value = separator >= 0 ? segment.slice(separator + 1) : '';
    return value !== '' && value !== 'undefined' && value !== 'null';
  });
}
