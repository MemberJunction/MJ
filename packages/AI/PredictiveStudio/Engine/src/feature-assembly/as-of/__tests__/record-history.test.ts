import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { RecordHistory, RunViewRecordHistoryReader, type HistoryEntity, type RecordChangeRow } from '../record-history';
import { AssemblyRefused } from '../refusal';
import type { FetchRowsParams, FetchRowsResult, SourceRow } from '../../data-access';
import type { AssemblyEntityInfo } from '../../assembly-metadata';
import { TableDataAccess } from '../../../__tests__/fakes/table-data-access';

const rc = (id: string, key: string, type: RecordChangeRow['Type'], at: string, full: Record<string, string | number | boolean | null>, changed: string[] = [], source: RecordChangeRow['Source'] = 'Internal'): RecordChangeRow =>
  ({ ID: id, RecordID: `ID|${key}`, Type: type, Source: source, ChangedAt: new Date(at), ChangesJSON: JSON.stringify(Object.fromEntries(changed.map((f) => [f, { field: f, oldValue: null, newValue: full[f] }]))), FullRecordJSON: JSON.stringify(full) });

const changes: RecordChangeRow[] = [
  rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { Status: 'Active' }),
  rc('c2', 'P1', 'Update', '2023-01-01T00:00:00Z', { Status: 'Lapsed' }, ['Status']),
  rc('c3', 'P2', 'Snapshot', '2022-06-01T00:00:00Z', { Status: 'Active' }),
];

/** The People entity as the history sees it: its name and the type of every field the tests compare. */
const field = (Name: string, TSType: HistoryEntity['Fields'][number]['TSType']): HistoryEntity['Fields'][number] =>
  ({ Name, SqlType: 'nvarchar', TSType, AllowUpdateAPI: Name !== 'ID', IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false });
const PEOPLE: HistoryEntity = {
  Name: 'People',
  Fields: [field('ID', 'string'), field('Status', 'string'), field('Code', 'string'), field('JoinDate', 'Date'), field('IsMember', 'boolean'), field('Visits', 'number')],
};

describe('BuildEntityHistory', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  const current = new Map([['p1', { Status: 'Lapsed' }], ['p2', { Status: 'Lapsed' }], ['p3', { Status: 'Active' }]]);
  const h = RecordHistory.BuildEntityHistory(PEOPLE, changes, current, ['Status'], { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, now);

  it('replays the value in force before the as-of instant', () => {
    expect(h.ValueAt('P1', 'Status', new Date('2022-12-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Active', ChangeID: 'c1' });
    expect(h.ValueAt('P1', 'Status', new Date('2023-06-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Lapsed', ChangeID: 'c2' });
  });
  it('refuses to fill a decision date before the record\'s history start with today\'s value', () => {
    expect(h.ValueAt('P1', 'Status', new Date('2020-12-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'before-history-start' });
    expect(h.ValueAt('P3', 'Status', new Date('2025-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'no-history' });
  });
  it('has no history for a record whose change rows hold no Create or Snapshot row to start from', () => {
    const updatesOnly = RecordHistory.BuildEntityHistory(PEOPLE, [rc('u1', 'P4', 'Update', '2022-01-01T00:00:00Z', { Status: 'Lapsed' }, ['Status'])],
      new Map([['p4', { Status: 'Lapsed' }]]), ['Status'], { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, now);
    expect(updatesOnly.ValueAt('P4', 'Status', new Date('2023-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'no-history' });
  });
  it('marks a record whose replay disagrees with its stored value as uncovered (continuity check)', () => {
    // P2's history says Active; the stored row says Lapsed: a change bypassed Record Changes.
    expect(h.ValueAt('P2', 'Status', new Date('2025-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'continuity-mismatch' });
    expect(h.Coverage).toMatchObject({ entity: 'People', historyStart: null, continuity: { recordsReplayed: 2, recordsMismatched: 1 } });
  });
  it('counts updates of a field after an instant (the immutable-field confirmation)', () => {
    expect(h.ChangesAfter('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toBe(1);
    expect(h.ChangesAfter('P1', 'Status', new Date('2024-01-01T00:00:00Z'))).toBe(0);
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
    expect(JSON.parse(provider.Saved.find((s) => s.RecordID === 'ID|P2')?.FullRecordJSON || 'null')).toEqual({ ID: 'P2', Status: 'Lapsed' });
    expect(provider.Reads.every((r) => r.ResultType === 'simple' && Array.isArray(r.Fields) && r.IgnoreMaxRows === true)).toBe(true);
  });

  it('lists a record whose snapshot cannot be built in the one error and still saves the others', async () => {
    const provider = new SnapshotProviderDouble([{ ID: 'P2', Status: 'Lapsed' }, { ID: 'P|4', Status: 'Active' }, { ID: 'P3', Status: 'Active' }]);
    const user = { ID: 'U-1', Email: 'snapshots@example.com' } as UserInfo;

    await expect(RecordHistory.WriteHistorySnapshots('People', provider as unknown as IMetadataProvider, user)).rejects.toThrow(/1 of 3 failed: ID P\|4: /);
    expect(provider.Saved.map((s) => s.RecordID).sort()).toEqual(['ID|P2', 'ID|P3']);
  });
});

describe('RunViewRecordHistoryReader', () => {
  /** A table fake that counts the row reads of each entity. */
  class CountingTables extends TableDataAccess {
    public readonly Reads = new Map<string, number>();
    public async fetchRows(p: FetchRowsParams): Promise<FetchRowsResult> {
      this.Reads.set(p.EntityName, (this.Reads.get(p.EntityName) || 0) + 1);
      return super.fetchRows(p);
    }
  }
  const people: AssemblyEntityInfo = {
    ID: 'E-PE', Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true,
    Fields: ['ID', 'Status', 'Tier'].map((Name) => ({ Name, SqlType: 'nvarchar', TSType: 'string', AllowUpdateAPI: Name !== 'ID', IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false })),
  };
  const changeRow = (c: RecordChangeRow): SourceRow => ({ ...c, EntityID: 'E-PE', Status: 'Complete' });

  it('reads an entity\'s change rows once for every field list and key set it loads', async () => {
    const data = new CountingTables({
      People: [{ ID: 'P1', Status: 'Lapsed', Tier: 'A' }, { ID: 'P2', Status: 'Active', Tier: 'B' }],
      'MJ: Record Changes': [
        changeRow(rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { Status: 'Active', Tier: 'A' })),
        changeRow(rc('c2', 'P1', 'Update', '2023-01-01T00:00:00Z', { Status: 'Lapsed', Tier: 'A' }, ['Status'])),
        changeRow(rc('c3', 'P2', 'Snapshot', '2022-06-01T00:00:00Z', { Status: 'Active', Tier: 'B' })),
      ],
    });
    const reader = new RunViewRecordHistoryReader(data, { mode: 'complete' });
    const policy = { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' } as const;
    const now = new Date('2026-10-12T00:00:00Z');
    const status = await reader.Load(people, ['P1'], ['Status'], policy, now);
    const tier = await reader.Load(people, ['P1', 'P2'], ['Tier'], policy, now);
    expect(data.Reads.get('MJ: Record Changes')).toBe(1);
    expect(data.Reads.get('People')).toBe(2);
    expect(status.ValueAt('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Active' });
    expect(tier.ValueAt('P2', 'Tier', new Date('2023-01-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'B' });
  });

  it('replays a parent deleted after the decision date from its history, and marks it uncovered when deleted before', async () => {
    const data = new CountingTables({
      People: [{ ID: 'P2', Status: 'Active', Tier: 'B' }],   // P1 is hard-deleted
      'MJ: Record Changes': [
        changeRow(rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { Status: 'Active', Tier: 'A' })),
        changeRow(rc('d1', 'P1', 'Delete', '2024-06-01T00:00:00Z', { Status: 'Active', Tier: 'A' })),
        changeRow(rc('c3', 'P2', 'Snapshot', '2022-06-01T00:00:00Z', { Status: 'Active', Tier: 'B' })),
      ],
    });
    const reader = new RunViewRecordHistoryReader(data, { mode: 'complete' });
    const history = await reader.Load(people, ['P1', 'P2'], ['Status'], { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, new Date('2026-10-12T00:00:00Z'));
    expect(history.ValueAt('P1', 'Status', new Date('2024-01-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Active' });
    expect(history.ValueAt('P1', 'Status', new Date('2025-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'deleted' });
  });

  it('still refuses a key with no row and no Delete in its history as a truncated read', async () => {
    const data = new CountingTables({ People: [], 'MJ: Record Changes': [changeRow(rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { Status: 'Active', Tier: 'A' }))] });
    await expect(new RunViewRecordHistoryReader(data, { mode: 'complete' }).Load(people, ['P1'], ['Status'], { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, new Date('2026-10-12T00:00:00Z')))
      .rejects.toMatchObject({ Refusal: { kind: 'truncated-read', entity: 'People', rowsExpected: 1, rowsRead: 0 } });
  });

  describe('BuildEntityHistory — scope', () => {
    const policy = { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' } as const;
    const now = new Date('2026-10-12T00:00:00Z');
    it('counts only the requested keys: an unrequested deleted record moves neither the continuity counts nor the history start', async () => {
      const unrelated = [rc('c9', 'P9', 'Create', '2020-01-01T00:00:00Z', { ID: 'P9', Status: 'Active' }), rc('d9', 'P9', 'Delete', '2025-06-01T00:00:00Z', { ID: 'P9', Status: 'Lapsed' })];
      const unanchored = [rc('u1', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }, ['Status']), rc('d1', 'P1', 'Delete', '2025-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' })];
      const data = new CountingTables({ People: [], 'MJ: Record Changes': [...unanchored, ...unrelated].map(changeRow) });
      const h = await new RunViewRecordHistoryReader(data, { mode: 'complete' }).Load(people, ['P1'], ['Status'], policy, now);
      expect(h.Coverage).toMatchObject({ historyStart: null, continuity: { recordsReplayed: 0, recordsMismatched: 0 } });
      expect(h.DeletedRecordAt('P1', new Date('2026-01-01T00:00:00Z'))).toMatchObject({ Status: 'deleted', ChangeID: 'd1' });
    });
    it('a hard-deleted requested key with no anchor leaves the history start null even when it is the only key', () => {
      const h = RecordHistory.BuildEntityHistory(PEOPLE, [rc('u1', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }, ['Status']), rc('d1', 'P1', 'Delete', '2025-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' })], new Map(), ['Status'], policy, now);
      expect(h.Coverage.historyStart).toBeNull();
    });
    it('dates creation only from a history whose first row is the Create: a re-created record keeps its first creation, and a Delete-first history has none', () => {
      const recreated = [rc('c1', 'P1', 'Create', '2019-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('d1', 'P1', 'Delete', '2020-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('c2', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })];
      expect(RecordHistory.BuildEntityHistory(PEOPLE, recreated, new Map([['p1', { ID: 'P1', Status: 'Lapsed' }]]), ['Status'], policy, now).CreatedAt('P1')).toEqual(new Date('2019-01-01T00:00:00Z'));
      const deleteFirst = recreated.slice(1);
      expect(RecordHistory.BuildEntityHistory(PEOPLE, deleteFirst, new Map([['p1', { ID: 'P1', Status: 'Lapsed' }]]), ['Status'], policy, now).CreatedAt('P1')).toBeNull();
    });
  });
});

describe('BuildEntityHistory — a hard-deleted record', () => {
  const policy = { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' } as const;
  const now = new Date('2026-10-12T00:00:00Z');
  const deletedRows = [rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('d1', 'P1', 'Delete', '2024-06-01T00:00:00Z', { ID: 'P1', Status: 'Active' })];

  it('reads it from its Delete row: held while the Delete is not in force, deleted once it is', () => {
    const h = RecordHistory.BuildEntityHistory(PEOPLE, deletedRows, new Map(), ['Status'], policy, now);
    expect(h.DeletedRecordAt('P1', new Date('2024-06-01T00:00:00Z'))).toEqual({ Status: 'held', Row: new Map([['ID', 'P1'], ['Status', 'Active']]), ChangeID: 'd1', ChangedAt: new Date('2024-06-01T00:00:00Z') });
    expect(h.DeletedRecordAt('p1', new Date('2024-06-02T00:00:00Z'))).toMatchObject({ Status: 'deleted', ChangeID: 'd1' });
  });
  it('does not count its final Delete as a change unless the Delete recorded a different value', () => {
    expect(RecordHistory.BuildEntityHistory(PEOPLE, deletedRows, new Map(), ['Status'], policy, now).ChangesAfter('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toBe(0);
    const moved = [deletedRows[0], rc('d1', 'P1', 'Delete', '2024-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })];
    expect(RecordHistory.BuildEntityHistory(PEOPLE, moved, new Map(), ['Status'], policy, now).ChangesAfter('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toBe(1);
  });
  it('is not hard-deleted when a current row exists, so its Delete still counts as replacing the record', () => {
    const h = RecordHistory.BuildEntityHistory(PEOPLE, deletedRows, new Map([['p1', { ID: 'P1', Status: 'Active' }]]), ['Status'], policy, now);
    expect(h.DeletedRecordAt('P1', new Date('2022-01-01T00:00:00Z'))).toBeNull();
    expect(h.ChangesAfter('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toBe(1);
  });
  it('lists the keys whose last change row is a Delete', () => {
    expect([...RecordHistory.KeysDeletedByHistory([...deletedRows, rc('c3', 'P2', 'Snapshot', '2022-06-01T00:00:00Z', { ID: 'P2', Status: 'Active' })])]).toEqual(['p1']);
  });
  it('reads a record whose rows in force end in a Delete as deleted, even with no Create or Snapshot row to start from', () => {
    const unanchored = [rc('u1', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']), rc('d1', 'P1', 'Delete', '2022-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })];
    const h = RecordHistory.BuildEntityHistory(PEOPLE, unanchored, new Map(), ['Status'], policy, now);
    expect(h.ValueAt('P1', 'Status', new Date('2023-01-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'deleted' });
    expect(h.ValueAt('P1', 'Status', new Date('2021-06-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'no-history' });
  });
  it('reads a Delete in force as deleted before any history-start check, even when the history anchors only after it (re-created record)', () => {
    const recreated = [rc('d1', 'P1', 'Delete', '2020-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('c2', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })];
    const h = RecordHistory.BuildEntityHistory(PEOPLE, recreated, new Map([['p1', { ID: 'P1', Status: 'Lapsed' }]]), ['Status'], policy, now);
    expect(h.ValueAt('P1', 'Status', new Date('2020-06-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'deleted' });
    expect(h.ValueAt('P1', 'Status', new Date('2022-01-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Lapsed', ChangeID: 'c2' });
  });
  it('checks its continuity against its Delete row: a value the Delete recorded that no change row produced is a mismatch', () => {
    const moved = [deletedRows[0], rc('d1', 'P1', 'Delete', '2024-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })];
    const h = RecordHistory.BuildEntityHistory(PEOPLE, moved, new Map(), ['Status'], policy, now);
    expect(h.ValueAt('P1', 'Status', new Date('2023-12-01T00:00:00Z'))).toEqual({ Status: 'uncovered', Reason: 'continuity-mismatch' });
    expect(h.Coverage.continuity).toMatchObject({ recordsReplayed: 1, recordsMismatched: 1 });
    const consistent = RecordHistory.BuildEntityHistory(PEOPLE, deletedRows, new Map(), ['Status'], policy, now);
    expect(consistent.ValueAt('P1', 'Status', new Date('2023-12-01T00:00:00Z'))).toMatchObject({ Status: 'value', Value: 'Active', ChangeID: 'c1' });
    expect(consistent.Coverage.continuity).toMatchObject({ recordsReplayed: 1, recordsMismatched: 0 });
  });
});

describe('BuildEntityHistory — values shaped like timestamps', () => {
  const policy = { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' } as const;
  const build = (value: string) => () =>
    RecordHistory.BuildEntityHistory(PEOPLE, [rc('c', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Code: value })], new Map([['p1', { ID: 'P1', Code: value }]]), ['Code'], policy, new Date('2026-10-12T00:00:00Z'));

  it('compares a text value that only starts like a timestamp as text', () => {
    expect(build('2025-01-15T-BATCH-1')().Coverage.continuity.recordsMismatched).toBe(0);
  });
  it('refuses a timestamp value that is not a valid instant with a typed refusal naming the entity, field and value', () => {
    let refusal: unknown = null;
    try {
      build('2025-99-99T00:00')();
    } catch (e) {
      refusal = e instanceof AssemblyRefused ? e.Refusal : e;
    }
    expect(refusal).toEqual({ kind: 'invalid-date-in-history', entity: 'People', field: 'Code', value: '2025-99-99T00:00' });
  });
  it('refuses a timestamp value whose date names no calendar day, which a Date would roll into the next month', () => {
    expect(build('2025-02-30T00:00')).toThrow(AssemblyRefused);
  });
});

describe('BuildEntityHistory — one value written in two formats is one value', () => {
  const policy = { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' } as const;
  const now = new Date('2026-10-12T00:00:00Z');
  /** Mismatched records when the history recorded `recorded` for `field` and the row now stores `stored`. */
  const mismatches = (field: string, recorded: string | number | boolean, stored: string | number | boolean | Date): number =>
    RecordHistory.BuildEntityHistory(PEOPLE, [rc('c', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', [field]: recorded })], new Map([['p1', { ID: 'P1', [field]: stored }]]), [field], policy, now)
      .Coverage.continuity.recordsMismatched;

  it('reads a date-only text as that day at UTC midnight, against a Date or a timestamp text', () => {
    expect(mismatches('JoinDate', '2025-01-15', new Date('2025-01-15T00:00:00Z'))).toBe(0);
    expect(mismatches('JoinDate', '2025-01-15', '2025-01-15T00:00:00.000Z')).toBe(0);
    expect(mismatches('JoinDate', '2025-01-15T00:00:00Z', '2025-01-15')).toBe(0);
  });
  it('still reports a date that moved, and never reads a date-only text that names no day as the day a Date rolls it to', () => {
    expect(mismatches('JoinDate', '2025-01-15', new Date('2025-01-16T00:00:00Z'))).toBe(1);
    // 2025-02-30 is no day (a Date would roll it to 2025-03-02), so it never equals that day.
    expect(mismatches('JoinDate', '2025-02-30', new Date('2025-03-02T00:00:00Z'))).toBe(1);
  });
  it('compares 1/0 and true/false equal on a field the metadata declares boolean (a bit column)', () => {
    expect(mismatches('IsMember', 1, true)).toBe(0);
    expect(mismatches('IsMember', 0, false)).toBe(0);
    expect(mismatches('IsMember', true, 1)).toBe(0);
    expect(mismatches('IsMember', 1, false)).toBe(1);
  });
  it('never compares 1 and true equal on a numeric field, where 1 is a quantity', () => {
    expect(mismatches('Visits', 1, true)).toBe(1);
    expect(mismatches('Visits', 1, 1)).toBe(0);
  });
  it('does not count a later row that re-records a boolean field in the other format as a change', () => {
    const h = RecordHistory.BuildEntityHistory(PEOPLE, [
      rc('c1', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', IsMember: 1 }),
      rc('c2', 'P1', 'Snapshot', '2023-01-01T00:00:00Z', { ID: 'P1', IsMember: true }),
    ], new Map([['p1', { ID: 'P1', IsMember: true }]]), ['IsMember'], policy, now);
    expect(h.ChangesAfter('P1', 'IsMember', new Date('2022-01-01T00:00:00Z'))).toBe(0);
  });
});
