import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { RecordHistory, type RecordChangeRow } from '../record-history';

const rc = (id: string, key: string, type: RecordChangeRow['Type'], at: string, full: Record<string, string | null>, changed: string[] = [], source: RecordChangeRow['Source'] = 'Internal'): RecordChangeRow =>
  ({ ID: id, RecordID: `ID|${key}`, Type: type, Source: source, ChangedAt: new Date(at), ChangesJSON: JSON.stringify(Object.fromEntries(changed.map((f) => [f, { field: f, oldValue: null, newValue: full[f] }]))), FullRecordJSON: JSON.stringify(full) });

const changes: RecordChangeRow[] = [
  rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { Status: 'Active' }),
  rc('c2', 'P1', 'Update', '2023-01-01T00:00:00Z', { Status: 'Lapsed' }, ['Status']),
  rc('c3', 'P2', 'Snapshot', '2022-06-01T00:00:00Z', { Status: 'Active' }),
];

describe('BuildEntityHistory', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  const current = new Map([['p1', { Status: 'Lapsed' }], ['p2', { Status: 'Lapsed' }], ['p3', { Status: 'Active' }]]);
  const h = RecordHistory.BuildEntityHistory('People', changes, current, ['Status'], { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, now);

  it('replays the value in force before the as-of instant', () => {
    expect(h.ValueAt('P1', 'Status', new Date('2022-12-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Active', ChangeId: 'c1' });
    expect(h.ValueAt('P1', 'Status', new Date('2023-06-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Lapsed', ChangeId: 'c2' });
  });
  it('refuses to fill a decision date before the record\'s history start with today\'s value', () => {
    expect(h.ValueAt('P1', 'Status', new Date('2020-12-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'before-history-start' });
    expect(h.ValueAt('P3', 'Status', new Date('2025-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'no-history' });
  });
  it('marks a record whose replay disagrees with its stored value as uncovered (continuity check)', () => {
    // P2's history says Active; the stored row says Lapsed: a change bypassed Record Changes.
    expect(h.ValueAt('P2', 'Status', new Date('2025-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'continuity-mismatch' });
    expect(h.Coverage).toMatchObject({ entity: 'People', historyStart: null, continuity: { recordsReplayed: 2, recordsMismatched: 1 } });
  });
  it('counts updates of a field after an instant (the immutable-field confirmation)', () => {
    expect(h.UpdatesAfter('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toBe(1);
    expect(h.UpdatesAfter('P1', 'Status', new Date('2024-01-01T00:00:00Z'))).toBe(0);
  });
  it('tells the instant a record was created only from its own Create row, never from a snapshot or no history', () => {
    expect(h.CreatedAt('P1')).toEqual(new Date('2021-01-01T00:00:00Z'));
    expect(h.CreatedAt('p1')).toEqual(new Date('2021-01-01T00:00:00Z'));
    expect(h.CreatedAt('P2')).toBeNull();
    expect(h.CreatedAt('P3')).toBeNull();
  });
});

/** The fields of a saved Record Change the snapshot writer sets. */
type SavedChange = Pick<MJRecordChangeEntity, 'EntityID' | 'RecordID' | 'UserID' | 'Type' | 'Source' | 'Status' | 'ChangedAt' | 'ChangesJSON' | 'ChangesDescription' | 'FullRecordJSON'>;

/** A provider double: the two reads the snapshot writer runs, the entity metadata and an entity factory capturing saves. */
class SnapshotProviderDouble {
  public readonly Saved: SavedChange[] = [];
  public readonly Reads: RunViewParams[] = [];
  private readonly people = { ID: 'E-P', Name: 'People', PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' }, Fields: [{ Name: 'ID' }, { Name: 'Status' }] };

  constructor(private readonly records: ReadonlyArray<{ ID: string; Status: string }> = [{ ID: 'P1', Status: 'Active' }, { ID: 'P2', Status: 'Lapsed' }, { ID: 'P3', Status: 'Active' }]) {}

  public EntityByName(name: string): EntityInfo | null {
    return name === 'People' ? (this.people as unknown as EntityInfo) : null;
  }

  public async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Reads.push(params);
    const rows = params.EntityName === 'MJ: Record Changes'
      ? [{ RecordID: 'ID|P1' }]
      : this.records;
    return { Success: true, Results: rows as unknown as T[], TotalRowCount: rows.length, RowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  }

  public async GetEntityObject<T>(entityName: string): Promise<T> {
    expect(entityName).toBe('MJ: Record Changes');
    const saved = this.Saved;
    const change = { LatestResult: null, async Save(): Promise<boolean> { saved.push({ ...this }); return true; } };
    return change as unknown as T;
  }
}

describe('WriteHistorySnapshots', () => {
  it('saves one snapshot per record that has no Create or Snapshot row and none for a record that has one', async () => {
    const provider = new SnapshotProviderDouble();
    const user = { ID: 'U-1', Email: 'snapshots@example.com' } as UserInfo;
    const written = await RecordHistory.WriteHistorySnapshots('People', provider as unknown as IMetadataProvider, user);

    expect(written).toBe(2);
    expect(provider.Saved.map((s) => s.RecordID).sort()).toEqual(['ID|P2', 'ID|P3']);
    expect(provider.Saved[0]).toMatchObject({ EntityID: 'E-P', UserID: 'U-1', Type: 'Snapshot', Source: 'Internal', Status: 'Complete', ChangesJSON: '{}', ChangesDescription: 'History snapshot for Predictive Studio as-of coverage' });
    expect(JSON.parse(provider.Saved.find((s) => s.RecordID === 'ID|P2').FullRecordJSON)).toEqual({ ID: 'P2', Status: 'Lapsed' });
    expect(provider.Reads.every((r) => r.ResultType === 'simple' && Array.isArray(r.Fields) && r.IgnoreMaxRows === true)).toBe(true);
  });

  it('lists a record whose snapshot cannot be built in the one error and still saves the others', async () => {
    const provider = new SnapshotProviderDouble([{ ID: 'P2', Status: 'Lapsed' }, { ID: 'P|4', Status: 'Active' }, { ID: 'P3', Status: 'Active' }]);
    const user = { ID: 'U-1', Email: 'snapshots@example.com' } as UserInfo;

    await expect(RecordHistory.WriteHistorySnapshots('People', provider as unknown as IMetadataProvider, user)).rejects.toThrow(/1 of 3 failed: ID P\|4: /);
    expect(provider.Saved.map((s) => s.RecordID).sort()).toEqual(['ID|P2', 'ID|P3']);
  });
});
