/**
 * The history-shape matrix: every as-of reader of one field, over every shape of a record's change history, at every
 * decision day, against one written oracle — and the same cell again with an unrelated record's history added, which
 * must change nothing. "The two readers disagree on whether a record existed" and "an unrelated record moved a
 * coverage count" are failing cells here, not review comments.
 *
 * The production reader runs over the table fake (`TableDataAccess`, `RunViewRecordHistoryReader`, the real
 * `AsOfFeatureAssembler`), so a row production refuses is refused here too.
 *
 * History rows of a year are dated 1 July of that year: between that year's decision day (1 June) and the next one,
 * so every interval a shape names (a deleted interval between a Delete and a re-Create included) holds a decision day.
 */
import { describe, it, expect } from 'vitest';
import type { AssemblyRefusal, FeatureColumnSpec, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { AsOfFeatureAssembler, type AsOfAssemblyInput, type AsOfAssemblyResult, type AssemblyRowRef, type MatrixCell } from '../as-of-assembler';
import { RunViewRecordHistoryReader, type RecordChangeRow } from '../record-history';
import type { SourceRow } from '../../data-access';
import type { AssemblyEntityInfo, AssemblyFieldInfo, IAssemblyMetadata } from '../../assembly-metadata';
import { TableDataAccess } from '../../../__tests__/fakes/table-data-access';

// ---- Fixture helpers (copied from as-of-assembler.test.ts) ----

const rc = (id: string, key: string, type: RecordChangeRow['Type'], at: string, full: Record<string, string | number>, changed: string[] = []): RecordChangeRow =>
  ({ ID: id, RecordID: `ID|${key}`, Type: type, Source: 'Internal', ChangedAt: new Date(at), ChangesJSON: JSON.stringify(Object.fromEntries(changed.map((f) => [f, { field: f, oldValue: null, newValue: full[f] }]))), FullRecordJSON: JSON.stringify(full) });

const field = (Name: string, TSType: AssemblyFieldInfo['TSType'] = 'string'): AssemblyFieldInfo => ({ Name, SqlType: 'nvarchar', TSType, AllowUpdateAPI: true, IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false });
const fixed = (Name: string, TSType: AssemblyFieldInfo['TSType'] = 'string'): AssemblyFieldInfo => ({ ...field(Name, TSType), AllowUpdateAPI: false });

const YEARS: AssemblyEntityInfo = { ID: 'E-Y', Name: 'Years', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), fixed('PersonID')] };
const PEOPLE_ID = 'E-PE';

const unit: PredictionUnitSpec = {
  id: 'U-W', lineageRootId: 'U-W', version: 1, name: 'yearly renewal unit',
  rows: { kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
  history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'outreach', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
};

const ASSEMBLED_AT = '2026-10-12';

interface Fixture {
  readonly Rows: readonly AssemblyRowRef[];
  readonly Tables: Record<string, SourceRow[]>;
  readonly Changes: readonly RecordChangeRow[];
  readonly People: AssemblyEntityInfo;
}

const input = (features: FeatureColumnSpec[], f: Fixture): AsOfAssemblyInput => {
  const dataAccess = new TableDataAccess({ ...f.Tables, 'MJ: Record Changes': f.Changes.map((c) => ({ ...c, EntityID: PEOPLE_ID, Status: 'Complete' })) });
  const metadata: IAssemblyMetadata = { Entity: (n) => (n === 'People' ? f.People : n === 'Years' ? YEARS : null) };
  return {
    Context: 'train',
    Unit: unit,
    RowEntity: YEARS,
    Rows: f.Rows,
    Features: features,
    SeriesHistory: null,
    Read: { mode: 'complete' },
    DataAccess: dataAccess,
    History: new RunViewRecordHistoryReader(dataAccess, { mode: 'complete' }),
    Metadata: metadata,
    AssembledAt: new Date(`${ASSEMBLED_AT}T00:00:00Z`),
  };
};

// ---- The table: shapes, decision days, readers ----

type ChangeType = RecordChangeRow['Type'];
/** One change row of P1: its type, the year it is dated in (1 July) and the `Status` its FullRecordJSON records. Updates list `Status`. */
interface HistoryRow { readonly Type: ChangeType; readonly Year: number; readonly Status: string }
interface Shape {
  readonly Name: string;
  readonly History: readonly HistoryRow[];
  /** P1's current `Status`, or null when P1 has no current row. */
  readonly Current: string | null;
  /** P1's stored `__mj_CreatedAt` (the `People` entity then lists the column), or null when the entity does not list it. */
  readonly CreatedAt: string | null;
  /** The current row disagrees with the replay of the history (a continuity mismatch). */
  readonly Mismatched: boolean;
}

const at = (year: number): Date => new Date(`${year}-07-01T00:00:00.000Z`);
const h = (Type: ChangeType, Year: number, Status: string): HistoryRow => ({ Type, Year, Status });
const shape = (Name: string, History: readonly HistoryRow[], Current: string | null, extra: Partial<Pick<Shape, 'CreatedAt' | 'Mismatched'>> = {}): Shape =>
  ({ Name, History, Current, CreatedAt: extra.CreatedAt ?? null, Mismatched: extra.Mismatched ?? false });

const SHAPES: readonly Shape[] = [
  shape('anchored-live', [h('Create', 2020, 'Active')], 'Active'),
  shape('anchored-updated', [h('Create', 2020, 'Active'), h('Update', 2022, 'Lapsed')], 'Lapsed'),
  shape('anchored-hard-deleted', [h('Create', 2020, 'Active'), h('Delete', 2024, 'Active')], null),
  shape('unanchored-hard-deleted', [h('Update', 2021, 'Active'), h('Delete', 2024, 'Active')], null),
  shape('unanchored-live', [h('Update', 2021, 'Active')], 'Active'),
  shape('recreated', [h('Delete', 2020, 'Active'), h('Create', 2021, 'Lapsed')], 'Lapsed'),
  // The stored creation instant is the re-creation's: it must not turn the deleted interval into "created after".
  shape('recreated-with-created-at', [h('Delete', 2020, 'Active'), h('Create', 2021, 'Lapsed')], 'Lapsed', { CreatedAt: at(2021).toISOString() }),
  shape('anchored-deleted-reinserted', [h('Create', 2020, 'Active'), h('Delete', 2022, 'Active')], 'Active'),
  shape('unanchored-deleted-reinserted', [h('Update', 2021, 'Active'), h('Delete', 2022, 'Active')], 'Active'),
  shape('snapshot-anchored', [h('Snapshot', 2022, 'Active')], 'Active'),
  shape('continuity-mismatch', [h('Create', 2020, 'Active')], 'Lapsed', { Mismatched: true }),
];

const DAYS = ['2019-06-01', '2021-06-01', '2023-06-01', '2025-06-01', ASSEMBLED_AT] as const;
type Day = typeof DAYS[number];

const READERS = ['record-changes', 'immutable-field/updatable', 'immutable-field/not-updatable'] as const;
type Reader = typeof READERS[number];

/** The unrelated record: a history of its own, no current row, and no unit row references it. */
const P9: readonly RecordChangeRow[] = [
  rc('p9-0', 'P9', 'Create', at(2020).toISOString(), { ID: 'P9', Status: 'Active' }),
  rc('p9-1', 'P9', 'Delete', '2025-06-01T00:00:00.000Z', { ID: 'P9', Status: 'Lapsed' }),
];

// ---- The oracle ----

type OracleClass = 'DELETED' | 'CREATED_AFTER' | 'MISMATCH' | 'UNREACHED' | 'CHANGED_AFTER' | 'VALUE';
/** What a cell assembles to: the row excluded, the whole assembly refused, or a value (null with its created-after provenance). */
type Expected = 'excluded' | { readonly refused: AssemblyRefusal['kind'] } | { readonly value: string | null };

/** Everything known on the decision day: change rows strictly before the start of the next UTC day. */
const asOfOf = (day: Day): Date => new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
const inForceOf = (s: Shape, asOf: Date): readonly HistoryRow[] => s.History.filter((r) => at(r.Year).getTime() < asOf.getTime());
const lastOf = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

/** The one creation rule: the history's first row when it is a Create; the stored `__mj_CreatedAt`; the later when both tell. */
const creationOf = (s: Shape): Date | null => {
  const fromHistory = s.History[0]?.Type === 'Create' ? at(s.History[0].Year) : null;
  const fromColumn = s.CreatedAt === null ? null : new Date(s.CreatedAt);
  if (fromHistory === null || fromColumn === null) return fromHistory ?? fromColumn;
  return fromHistory.getTime() >= fromColumn.getTime() ? fromHistory : fromColumn;
};

/** A hard-deleted record: its history ends in a Delete and it has no current row. */
const hardDeleted = (s: Shape): boolean => s.Current === null && lastOf(s.History)?.Type === 'Delete';

/**
 * A row at or after `asOf` that changed the field or replaced the record: an Update (every Update here lists `Status`),
 * a Delete other than the final Delete of a hard-deleted record, or a row recording a different `Status` than the one before it.
 */
const changedAfter = (s: Shape, asOf: Date): boolean =>
  s.History.some((r, i) => {
    if (at(r.Year).getTime() < asOf.getTime()) return false;
    const finalDeleteOfHardDeleted = r.Type === 'Delete' && hardDeleted(s) && i === s.History.length - 1;
    const moved = i > 0 && r.Status !== s.History[i - 1].Status;
    return r.Type === 'Update' || (r.Type === 'Delete' && !finalDeleteOfHardDeleted) || moved;
  });

/** The class of a (shape, day), judged in the order DELETED, CREATED_AFTER, MISMATCH, UNREACHED, CHANGED_AFTER, VALUE. */
const classify = (s: Shape, day: Day): OracleClass => {
  const asOf = asOfOf(day);
  const inForce = inForceOf(s, asOf);
  if (lastOf(inForce)?.Type === 'Delete') return 'DELETED';
  const created = creationOf(s);
  if (inForce.length === 0 && created !== null && created.getTime() >= asOf.getTime()) return 'CREATED_AFTER';
  if (s.Mismatched) return 'MISMATCH';
  const anchored = s.History.some((r) => (r.Type === 'Create' || r.Type === 'Snapshot') && at(r.Year).getTime() < asOf.getTime());
  if (inForce.length === 0 || !anchored) return 'UNREACHED';
  if (changedAfter(s, asOf)) return 'CHANGED_AFTER';
  return 'VALUE';
};

/** The stored value: the current row's, else (a hard-deleted record) the one its Delete row recorded. */
const storedOf = (s: Shape): string => {
  if (s.Current !== null) return s.Current;
  const del = lastOf(s.History);
  if (del?.Type !== 'Delete') throw new Error(`oracle: ${s.Name} has neither a current row nor a final Delete`);
  return del.Status;
};

/** The replayed value: the `Status` of the last row in force. */
const replayedOf = (s: Shape, day: Day): string => {
  const last = lastOf(inForceOf(s, asOfOf(day)));
  if (last === undefined) throw new Error(`oracle: ${s.Name} @ ${day} has no row in force to replay`);
  return last.Status;
};

const expected = (s: Shape, day: Day, reader: Reader): Expected => {
  const notUpdatable = reader === 'immutable-field/not-updatable';
  switch (classify(s, day)) {
    case 'DELETED': return 'excluded';
    case 'CREATED_AFTER': return { value: null };
    case 'MISMATCH': return notUpdatable ? { value: storedOf(s) } : 'excluded';
    case 'UNREACHED': return notUpdatable || day === ASSEMBLED_AT ? { value: storedOf(s) } : 'excluded';
    case 'CHANGED_AFTER':
      if (reader === 'record-changes') return { value: replayedOf(s, day) };
      return notUpdatable ? { value: storedOf(s) } : { refused: 'select-changes-after-decision-date' };
    case 'VALUE': return reader === 'record-changes' ? { value: replayedOf(s, day) } : { value: storedOf(s) };
  }
};

// ---- Running a cell ----

/** A cell's outcome in one comparable form. */
type Observed =
  | { readonly Kind: 'refused'; readonly Refusal: AssemblyRefusal['kind'] }
  | { readonly Kind: 'excluded'; readonly Excluded: readonly { readonly entity: string; readonly field: string; readonly rows: number }[] }
  | { readonly Kind: 'value'; readonly Value: MatrixCell; readonly Version: string | null; readonly Excluded: readonly { readonly entity: string; readonly field: string; readonly rows: number }[] };

const EXCLUDED_ONE = [{ entity: 'People', field: 'Status', rows: 1 }];

const observedFor = (e: Expected): Observed => {
  if (e === 'excluded') return { Kind: 'excluded', Excluded: EXCLUDED_ONE };
  if ('refused' in e) return { Kind: 'refused', Refusal: e.refused };
  return { Kind: 'value', Value: e.value, Version: e.value === null ? 'created-after-decision' : null, Excluded: [] };
};

const observe = (out: AsOfAssemblyResult): Observed => {
  if (out.Status === 'refused') return { Kind: 'refused', Refusal: out.Refusal.kind };
  const excluded = out.UncoveredRowsExcluded.map((u) => ({ entity: u.entity, field: u.field, rows: u.rows }));
  const row = out.Rows[0];
  if (row === undefined) return { Kind: 'excluded', Excluded: excluded };
  const value = row.Values[0];
  // The provenance version is compared only for a null value: it says why the value is missing.
  return { Kind: 'value', Value: value, Version: value === null ? row.Provenance[0].sourceVersion : null, Excluded: excluded };
};

const peopleFor = (s: Shape, reader: Reader): AssemblyEntityInfo => ({
  ID: PEOPLE_ID, Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true,
  Fields: [field('ID'), reader === 'immutable-field/not-updatable' ? fixed('Status') : field('Status'), ...(s.CreatedAt === null ? [] : [field('__mj_CreatedAt', 'Date')])],
});

const featureFor = (reader: Reader): FeatureColumnSpec => ({
  name: 'Status',
  source: { kind: reader === 'record-changes' ? 'record-changes' : 'immutable-field', entity: 'People', field: 'Status', keyField: 'PersonID' },
  encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' },
  missing: { impute: 'mode', indicator: true, constant: null },
});

const historyOf = (s: Shape): RecordChangeRow[] =>
  s.History.map((r, i) => rc(`p1-${i}`, 'P1', r.Type, at(r.Year).toISOString(), { ID: 'P1', Status: r.Status }, r.Type === 'Update' ? ['Status'] : []));

const run = async (s: Shape, day: Day, reader: Reader, withUnrelated: boolean): Promise<AsOfAssemblyResult> => {
  const current: SourceRow[] = s.Current === null ? [] : [{ ID: 'P1', Status: s.Current, ...(s.CreatedAt === null ? {} : { __mj_CreatedAt: s.CreatedAt }) }];
  return new AsOfFeatureAssembler().Assemble(input([featureFor(reader)], {
    Rows: [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date(`${day}T00:00:00Z`), Period: null }],
    Tables: { Years: [{ ID: 'y1', PersonID: 'P1' }], People: current },
    Changes: [...historyOf(s), ...(withUnrelated ? P9 : [])],
    People: peopleFor(s, reader),
  }));
};

const continuityOf = (out: AsOfAssemblyResult) => (out.Status === 'assembled' ? out.Coverage.find((c) => c.entity === 'People')?.continuity : undefined);

const CELLS: readonly (readonly [Shape, Day])[] = SHAPES.flatMap((s) => DAYS.map((d) => [s, d] as const));

/**
 * Cells where the code disagrees with the oracle: open product defects, run as expected failures so the suite stays
 * green and a fix turns them red (then delete the entry). Every one is an unreached history (UNREACHED) with a change
 * row after the decision day: the stored-value rule (`judgeStoredValue`) checks `ChangesAfter` before coverage and
 * refuses `select-changes-after-decision-date`, where the oracle, judging UNREACHED before CHANGED_AFTER, excludes the
 * row under exclude-and-count as the replay reader does.
 */
const PRODUCT_DEFECTS: ReadonlySet<string> = new Set([
  'unanchored-hard-deleted @ 2019-06-01 via immutable-field/updatable',
  'unanchored-hard-deleted @ 2021-06-01 via immutable-field/updatable',
  'unanchored-live @ 2019-06-01 via immutable-field/updatable',
  'unanchored-live @ 2021-06-01 via immutable-field/updatable',
  'recreated @ 2019-06-01 via immutable-field/updatable',
  'unanchored-deleted-reinserted @ 2019-06-01 via immutable-field/updatable',
  'unanchored-deleted-reinserted @ 2021-06-01 via immutable-field/updatable',
]);

const assertCell = async (s: Shape, day: Day, reader: Reader): Promise<void> => {
  const cell = `${s.Name} @ ${day} via ${reader}`;
  const want = observedFor(expected(s, day, reader));
  const alone = await run(s, day, reader, false);
  const withP9 = await run(s, day, reader, true);
  expect(observe(alone), cell).toEqual(want);
  expect(observe(withP9), `${cell} +P9`).toEqual(want);
  expect(observe(withP9), `${cell} +P9 (outcome immune to P9)`).toEqual(observe(alone));
  expect(continuityOf(withP9), `${cell} +P9 (continuity immune to P9)`).toEqual(continuityOf(alone));
};

describe('as-of history-shape matrix (exclude-and-count)', () => {
  describe.each(READERS)('via %s', (reader) => {
    for (const [s, day] of CELLS) {
      const cell = `${s.Name} @ ${day} via ${reader}`;
      if (PRODUCT_DEFECTS.has(cell)) it.fails(`${s.Name} @ ${day} (open product defect)`, () => assertCell(s, day, reader));
      else it(`${s.Name} @ ${day}`, () => assertCell(s, day, reader));
    }
  });

  it('lists only cells of the matrix as product defects', () => {
    const cells = new Set(READERS.flatMap((r) => CELLS.map(([s, d]) => `${s.Name} @ ${d} via ${r}`)));
    expect([...PRODUCT_DEFECTS].filter((c) => !cells.has(c))).toEqual([]);
  });
});
