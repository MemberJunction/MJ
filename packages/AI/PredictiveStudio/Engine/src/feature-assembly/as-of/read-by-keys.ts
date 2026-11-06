/**
 * @module feature-assembly/as-of/read-by-keys
 *
 * Reads rows of one entity by primary key in batches, reporting or refusing the keys with no row, so training and
 * scoring read the same rows the same way.
 */
import { EscapeSQLString } from '@memberjunction/global';
import type { AssemblyRefusal } from '@memberjunction/predictive-studio-core';
import type { ICountingDataAccess, SourceRow } from '../data-access';

/** Keys per read: one `IN (...)` list stays well inside SQL Server's parameter and statement limits. */
export const READ_BY_KEYS_BATCH = 500;

export type ReadByKeysOutcome = { readonly Status: 'read'; readonly Rows: ReadonlyMap<string, SourceRow> } | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal };

/** The rows a keyed read found, and the requested keys it found no row for. */
export interface PresentRowsByKey {
  /** Rows by lower-cased key. */
  readonly Rows: ReadonlyMap<string, SourceRow>;
  /** Requested keys with no row, lower-cased, in first-seen order. */
  readonly MissingKeys: readonly string[];
}

/** Keyed reads of one entity. */
export class KeyedReader {
  /**
   * The rows of `keys` (deduplicated case-insensitively), keyed by lower-cased key, and the keys no row was found for.
   * The batches are independent reads and run in parallel. Keys go into SQL as given (escaped), never in their
   * lower-cased matching form.
   */
  public static async ReadPresentByKeys(
    dataAccess: ICountingDataAccess, entityName: string, keyField: string, keys: readonly string[], fields: readonly string[],
  ): Promise<PresentRowsByKey> {
    const unique = new Map<string, string>();   // lower-cased → first original spelling
    for (const k of keys) if (!unique.has(k.toLowerCase())) unique.set(k.toLowerCase(), k);
    const originals = [...unique.values()];
    const batches: string[][] = [];
    for (let i = 0; i < originals.length; i += READ_BY_KEYS_BATCH) batches.push(originals.slice(i, i + READ_BY_KEYS_BATCH));
    const results = await Promise.all(batches.map((batch) => dataAccess.fetchRows({
      EntityName: entityName,
      ExtraFilter: `[${keyField}] IN (${batch.map((k) => `'${EscapeSQLString(k)}'`).join(',')})`,
      Fields: [keyField, ...fields.filter((f) => f !== keyField)],
      MaxRows: batch.length,
    })));
    const out = new Map<string, SourceRow>();
    for (const res of results) {
      if (!res.Success) throw new Error(`Reading ${entityName} by key failed: ${res.ErrorMessage || 'unknown error'}`);
      for (const row of res.Rows) out.set(String(row[keyField]).toLowerCase(), row);
    }
    return { Rows: out, MissingKeys: [...unique.keys()].filter((k) => !out.has(k)) };
  }

  /** As {@link ReadPresentByKeys}, refusing `truncated-read` when any key has no row. */
  public static async ReadByKeys(
    dataAccess: ICountingDataAccess, entityName: string, keyField: string, keys: readonly string[], fields: readonly string[],
  ): Promise<ReadByKeysOutcome> {
    const present = await KeyedReader.ReadPresentByKeys(dataAccess, entityName, keyField, keys, fields);
    if (present.MissingKeys.length > 0) {
      const rowsExpected = present.Rows.size + present.MissingKeys.length;
      return { Status: 'refused', Refusal: { kind: 'truncated-read', entity: entityName, rowsExpected, rowsRead: present.Rows.size } };
    }
    return { Status: 'read', Rows: present.Rows };
  }
}
