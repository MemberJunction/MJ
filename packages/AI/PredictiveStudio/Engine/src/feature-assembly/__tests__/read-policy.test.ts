import { describe, it, expect } from 'vitest';
import { OrdinalCompare } from '@memberjunction/global';
import { CompleteReader } from '../read-policy';
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
    const limit = Math.min(params.MaxRows ?? Number.POSITIVE_INFINITY, this.cap ?? Number.POSITIVE_INFINITY);
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
