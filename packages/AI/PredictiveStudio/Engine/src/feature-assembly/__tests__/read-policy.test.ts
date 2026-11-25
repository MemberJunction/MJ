import { describe, it, expect } from 'vitest';
import { OrdinalCompare } from '@memberjunction/global';
import { CompleteReader } from '../read-policy';
import { KeyedReader } from '../as-of/read-by-keys';
import { AssemblyRefused } from '../as-of/refusal';
import type { ICountingDataAccess, CountRowsResult, FetchRowsParams, FetchRowsResult, SourceRow } from '../data-access';

/** Serves `rows` but stops at `cap` per read when set, like a silently capped view; counts report every row. */
class FakeCountingDataAccess implements ICountingDataAccess {
  public Reads: FetchRowsParams[] = [];
  constructor(private readonly rows: SourceRow[], private readonly cap: number | null = null) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    this.Reads.push(params);
    // Ordinal, like the database's key order (localeCompare would order by locale rules).
    let rows = [...this.rows].sort((a, b) => OrdinalCompare(String(a.ID), String(b.ID)));
    const after = /\[ID\] > '([^']+)'/.exec(params.ExtraFilter || '')?.[1];
    if (after) rows = rows.filter((r) => String(r.ID) > after);
    // MaxRows 0 or absent = no limit, as the database provider reads it; a cap of 0 is a real cap (`??`).
    const limit = Math.min(params.MaxRows || Number.POSITIVE_INFINITY, this.cap ?? Number.POSITIVE_INFINITY);
    const served = rows.slice(0, limit);
    return { Success: true, Rows: served, TotalRowCount: served.length };
  }
  async fetchEmbedding(): Promise<number[] | null> { return null; }
  async CountRows(): Promise<CountRowsResult> { return { Success: true, Count: this.rows.length }; }
}

const rows: SourceRow[] = Array.from({ length: 2500 }, (_, i) => ({ ID: `id-${String(i).padStart(5, '0')}`, V: i }));

describe('ReadCompletely', () => {
  it('reads every row in complete mode with no row cap', async () => {
    const da = new FakeCountingDataAccess(rows);
    const out = await CompleteReader.ReadCompletely(da, { EntityName: 'E', KeyField: 'ID' }, { mode: 'complete' });
    expect(out.Status).toBe('read');
    if (out.Status === 'read') expect(out.Rows).toHaveLength(2500);
    expect(da.Reads[0].MaxRows).toBeUndefined();
  });
  it('pages by key and reads every row in paged mode', async () => {
    const da = new FakeCountingDataAccess(rows);
    const out = await CompleteReader.ReadCompletely(da, { EntityName: 'E', KeyField: 'ID' }, { mode: 'paged', pageSize: 1000 });
    expect(out.Status === 'read' && out.Rows.length).toBe(2500);
    expect(da.Reads.map((r) => r.MaxRows)).toEqual([1000, 1000, 1000]);
  });
  it('refuses a truncated read naming the entity and both counts', async () => {
    const out = await CompleteReader.ReadCompletely(new FakeCountingDataAccess(rows, 1000), { EntityName: 'E', KeyField: 'ID' }, { mode: 'complete' });
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'truncated-read', entity: 'E', rowsExpected: 2500, rowsRead: 1000 } });
  });
  it('fails instead of paging on the string "undefined" when a page ends with a key-less row', async () => {
    const keyless: SourceRow[] = [...rows.slice(0, 999), { V: -1 }];   // sorts last ("undefined" > "id-…")
    await expect(CompleteReader.ReadCompletely(new FakeCountingDataAccess(keyless), { EntityName: 'E', KeyField: 'ID' }, { mode: 'paged', pageSize: 1000 })).rejects.toThrow();
  });
  it('refuses a paged read whose page size is below one', async () => {
    const da = new FakeCountingDataAccess(rows);
    await expect(CompleteReader.ReadCompletely(da, { EntityName: 'E', KeyField: 'ID' }, { mode: 'paged', pageSize: 0 })).rejects.toThrow(/pageSize of at least 1, got 0/);
    expect(da.Reads).toHaveLength(0);
  });
});

// A field the caller may not read comes back absent from every row (the provider narrows the SELECT list for the user,
// GenericDatabaseProvider.getRunTimeViewFieldArray); a readable column holding NULL comes back present as null (R5).
describe('a requested field the read did not return (field-level security)', () => {
  const restricted: SourceRow[] = [{ ID: 'a', V: 1 }, { ID: 'b', V: null }];

  it('ReadCompletely refuses unresolved-column naming the entity and the field, rather than reading it as missing', async () => {
    const out = await CompleteReader.ReadCompletely(new FakeCountingDataAccess(restricted), { EntityName: 'E', KeyField: 'ID', Fields: ['V', 'Salary'] }, { mode: 'complete' });
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'E', field: 'Salary' } });
  });

  it('ReadCompletely reads a field that is present but null on a row', async () => {
    const out = await CompleteReader.ReadCompletely(new FakeCountingDataAccess(restricted), { EntityName: 'E', KeyField: 'ID', Fields: ['V'] }, { mode: 'complete' });
    expect(out.Status === 'read' && out.Rows.map((r) => r.V)).toEqual([1, null]);
  });

  it('KeyedReader.ReadByKeys refuses unresolved-column, and ReadPresentByKeys throws it as an assembly refusal', async () => {
    const da = new FakeCountingDataAccess(restricted);
    expect(await KeyedReader.ReadByKeys(da, 'E', 'ID', ['a', 'b'], ['V', 'Salary'])).toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'E', field: 'Salary' } });
    const thrown = await KeyedReader.ReadPresentByKeys(da, 'E', 'ID', ['a'], ['Salary']).catch((e: Error) => e);
    expect(thrown instanceof AssemblyRefused && thrown.Refusal).toEqual({ kind: 'unresolved-column', entity: 'E', field: 'Salary' });
  });
});
