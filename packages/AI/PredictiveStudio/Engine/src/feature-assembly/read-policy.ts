/**
 * @module feature-assembly/read-policy
 *
 * Complete reads: the source is counted, read in full (or paged by key), and the rows read are compared with the
 * count. A short read is the refusal `truncated-read`, never a silently smaller matrix.
 */
import { EscapeSQLString } from '@memberjunction/global';
import type { AssemblyRefusal, ReadPolicy } from '@memberjunction/predictive-studio-core';
import type { ICountingDataAccess, SourceRow } from './data-access';

export interface CompleteReadParams {
  readonly EntityName: string;
  /** The single primary-key field; paged reads continue after the last key read. */
  readonly KeyField: string;
  readonly ExtraFilter?: string;
  readonly Fields?: readonly string[];
}

export type CompleteReadOutcome =
  | { readonly Status: 'read'; readonly Rows: SourceRow[]; readonly Expected: number }
  | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal };

/**
 * Complete reads: count, read in full or paged by key, compare. Static members on one owner.
 */
export class CompleteReader {
  public static async ReadCompletely(dataAccess: ICountingDataAccess, params: CompleteReadParams, policy: ReadPolicy): Promise<CompleteReadOutcome> {
    const counted = await dataAccess.CountRows({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter });
    if (!counted.Success) {
      throw new Error(`Counting ${params.EntityName} failed: ${counted.ErrorMessage || 'unknown error'}`);
    }
    const rows = policy.mode === 'complete' ? await CompleteReader.readAll(dataAccess, params) : await CompleteReader.readPaged(dataAccess, params, policy.pageSize);
    if (rows.length === counted.Count) {
      return { Status: 'read', Rows: rows, Expected: counted.Count };
    }
    // A concurrent insert or delete moves the count; accept only when a recount agrees with what was read.
    const recount = await dataAccess.CountRows({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter });
    if (recount.Success && recount.Count === rows.length) {
      return { Status: 'read', Rows: rows, Expected: recount.Count };
    }
    return { Status: 'refused', Refusal: { kind: 'truncated-read', entity: params.EntityName, rowsExpected: counted.Count, rowsRead: rows.length } };
  }

  private static fieldsWithKey(params: CompleteReadParams): string[] | undefined {
    if (!params.Fields) return undefined;
    return params.Fields.includes(params.KeyField) ? [...params.Fields] : [params.KeyField, ...params.Fields];
  }

  private static async readAll(dataAccess: ICountingDataAccess, params: CompleteReadParams): Promise<SourceRow[]> {
    const res = await dataAccess.fetchRows({ EntityName: params.EntityName, ExtraFilter: params.ExtraFilter, Fields: CompleteReader.fieldsWithKey(params), OrderBy: `[${params.KeyField}]` });
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage || 'unknown error'}`);
    return res.Rows;
  }

  private static async readPaged(dataAccess: ICountingDataAccess, params: CompleteReadParams, pageSize: number): Promise<SourceRow[]> {
    const out: SourceRow[] = [];
    let last: string | null = null;
    for (;;) {
      const keyFilter = last === null ? null : `[${params.KeyField}] > '${EscapeSQLString(last)}'`;
      const filter = [params.ExtraFilter, keyFilter].filter((f): f is string => !!f && f.length > 0).map((f) => `(${f})`).join(' AND ');
      const res = await dataAccess.fetchRows({ EntityName: params.EntityName, ExtraFilter: filter, Fields: CompleteReader.fieldsWithKey(params), OrderBy: `[${params.KeyField}]`, MaxRows: pageSize });
      if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage || 'unknown error'}`);
      out.push(...res.Rows);
      if (res.Rows.length < pageSize) return out;
      const key = res.Rows[res.Rows.length - 1][params.KeyField];
      // An absent key would page on the literal "undefined" (String(undefined)) and silently skip rows.
      if (key === null || key === undefined) throw new Error(`Reading ${params.EntityName}: a row has no ${params.KeyField}, so paging cannot continue`);
      last = key instanceof Date ? key.toISOString() : String(key);
    }
  }
}
