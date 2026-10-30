import { describe, it, expect } from 'vitest';
import type { HoldoutSplit, SnapshotRowKey } from '../index';
import {
  DEFAULT_YEAR_CUTOFF_SHARE,
  HoldoutCarve,
  HoldoutCarveDateError,
  type CarveRow,
} from '../holdout-carve';

type DateCarved = Extract<HoldoutSplit, { readonly kind: 'date-carved' }>;
type RollingOrigin = Extract<HoldoutSplit, { readonly kind: 'rolling-origin' }>;
const row = (id: string, entity: string, date: string, label: string | null = 'Renewed'): CarveRow => ({ RowId: id, EntityKey: entity, CarveDate: date, Label: label });
const holdout = (cutoff: string, end: string | null = null, newEntityFraction: number | null = null): DateCarved => ({
  kind: 'date-carved', dateColumn: 'DecisionDate', cutoff, holdoutEnd: end,
  newEntityReport: newEntityFraction === null ? null : { groupKey: 'PersonID', holdoutFraction: newEntityFraction },
});
const rolling = (origins: number, horizonPeriods: number, gapPeriods: number, minTrainPeriods: number): RollingOrigin => ({
  kind: 'rolling-origin', origins, horizonPeriods, gapPeriods, minTrainPeriods, window: 'expanding',
});
/** `count` consecutive monthly periods from January 2020, as rows `t0`, `t1`, … */
const monthlyRows = (count: number): { readonly RowId: string; readonly Period: string }[] =>
  Array.from({ length: count }, (_, i) => ({ RowId: `t${i}`, Period: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01` }));

/** Four members, one row per membership year 2019–2025 (person × year). */
function personYears(): CarveRow[] {
  const rows: CarveRow[] = [];
  for (const person of ['P1', 'P2', 'P3', 'P4']) for (let year = 2019; year <= 2025; year++) rows.push(row(`${person}:${year}`, person, `${year}-01-01`, year % 3 === 0 ? 'Lapsed' : 'Renewed'));
  return rows;
}

describe('HoldoutCarve.CarveLockedHoldout', () => {
  it('holds out every row from the cutoff up to the holdout end and trains on rows before the cutoff only', () => {
    const r = HoldoutCarve.CarveLockedHoldout(personYears(), holdout('2024-01-01', '2025-01-01'));
    if (!r.Ok) throw new Error('expected a carve');
    expect([...r.Deployment.HoldoutRowIds].sort()).toEqual(['P1:2024', 'P2:2024', 'P3:2024', 'P4:2024']);
    const developmentIds = r.Deployment.Rows.filter((x) => x.Role === 'development').map((x) => x.RowId);
    expect(developmentIds).toHaveLength(20);
    expect(developmentIds.every((id) => Number(id.split(':')[1]) < 2024)).toBe(true);
    expect(r.Deployment.ExcludedAfterHoldoutEnd).toBe(4);
    expect(r.Deployment.Rows.some((x) => x.RowId.endsWith(':2025'))).toBe(false);
  });
  it('sends a row dated exactly at the cutoff to the holdout', () => {
    const r = HoldoutCarve.CarveLockedHoldout([row('a', 'P1', '2023-12-31'), row('b', 'P1', '2024-01-01')], holdout('2024-01-01'));
    expect(r.Ok && r.Deployment.HoldoutRowIds).toEqual(['b']);
  });
  it('excludes and counts a row dated exactly at the holdout end, and keeps the day before it in the holdout', () => {
    const r = HoldoutCarve.CarveLockedHoldout(
      [row('a', 'P1', '2023-06-01'), row('b', 'P1', '2024-12-31'), row('c', 'P1', '2025-01-01'), row('d', 'P1', '2025-07-01')],
      holdout('2024-01-01', '2025-01-01'),
    );
    if (!r.Ok) throw new Error('expected a carve');
    expect(r.Deployment.HoldoutRowIds).toEqual(['b']);
    expect(r.Deployment.Rows.map((x) => x.RowId)).toEqual(['a', 'b']);
    expect([r.Deployment.DevelopmentRowCount, r.Deployment.HoldoutRowCount, r.Deployment.ExcludedAfterHoldoutEnd]).toEqual([1, 1, 2]);
  });
  it('does not depend on the order rows were read in (no trailing slice of a key-ordered scan)', () => {
    const rows = personYears();
    expect(HoldoutCarve.CarveLockedHoldout([...rows].reverse(), holdout('2024-01-01'))).toEqual(HoldoutCarve.CarveLockedHoldout(rows, holdout('2024-01-01')));
  });
  it('counts holdout classes for the minority-class guard, and gives null when no row is labelled', () => {
    const r = HoldoutCarve.CarveLockedHoldout(personYears(), holdout('2024-01-01', '2025-01-01'));
    expect(r.Ok && r.Deployment.HoldoutClassCounts).toEqual({ Renewed: 4 });
    const unlabelled = HoldoutCarve.CarveLockedHoldout([row('a', 'P1', '2023-01-01', null), row('b', 'P1', '2024-01-01', null)], holdout('2024-01-01'));
    expect(unlabelled.Ok && unlabelled.Deployment.HoldoutClassCounts).toBeNull();
  });
  it('refuses a cutoff that leaves no development rows and an unparseable carve date', () => {
    expect(HoldoutCarve.CarveLockedHoldout(personYears(), holdout('2019-01-01'))).toEqual({ Ok: false, Refusal: { kind: 'no-development-rows', cutoff: '2019-01-01' } });
    expect(HoldoutCarve.CarveLockedHoldout([row('x', 'P1', 'not-a-date')], holdout('2024-01-01'))).toEqual({ Ok: false, Refusal: { kind: 'unparseable-carve-date', rowId: 'x', value: 'not-a-date' } });
  });
  it('carves a zone-less date-time on its own date part, whatever the host time zone', () => {
    // 20:00 on 31 December is 01:00 on 1 January UTC when read as New York local time; the carve reads the day 2023-12-31.
    const r = HoldoutCarve.CarveLockedHoldout(
      [row('a', 'P1', '2023-06-01'), row('b', 'P1', '2023-12-31T20:00:00'), row('c', 'P1', '2024-01-01T00:30:00-05:00')],
      holdout('2024-01-01'),
    );
    if (!r.Ok) throw new Error('expected a carve');
    expect(r.Deployment.Rows).toEqual([{ RowId: 'a', Role: 'development' }, { RowId: 'b', Role: 'development' }, { RowId: 'c', Role: 'locked-holdout' }]);
  });
  it('refuses a carve date that names no calendar day', () => {
    expect(HoldoutCarve.CarveLockedHoldout([row('x', 'P1', '2024-02-30')], holdout('2024-01-01')))
      .toEqual({ Ok: false, Refusal: { kind: 'unparseable-carve-date', rowId: 'x', value: '2024-02-30' } });
  });
  it('refuses a window with no holdout rows and an unparseable cutoff or holdout end', () => {
    expect(HoldoutCarve.CarveLockedHoldout(personYears(), holdout('2030-01-01'))).toEqual({ Ok: false, Refusal: { kind: 'no-holdout-rows', cutoff: '2030-01-01', holdoutEnd: null } });
    expect(HoldoutCarve.CarveLockedHoldout(personYears(), holdout('soon'))).toEqual({ Ok: false, Refusal: { kind: 'unparseable-cutoff', value: 'soon' } });
    expect(HoldoutCarve.CarveLockedHoldout(personYears(), holdout('2024-01-01', 'later'))).toEqual({ Ok: false, Refusal: { kind: 'unparseable-cutoff', value: 'later' } });
  });
});

describe('the new-entity report', () => {
  it('holds out the newest entities whole, with no entity key in both the training and the holdout rows', () => {
    const rows: CarveRow[] = [];
    for (let e = 0; e < 10; e++) for (let year = 2015 + e; year <= 2025; year++) rows.push(row(`E${e}:${year}`, `E${e}`, `${year}-06-01`));
    const r = HoldoutCarve.CarveLockedHoldout(rows, holdout('2024-01-01', null, 0.3));
    if (!r.Ok || r.NewEntity === null) throw new Error('expected a new-entity carve');
    expect([...r.NewEntity.HoldoutEntityKeys].sort()).toEqual(['E7', 'E8', 'E9']);
    // The shared keys are read from the carved rows themselves, not from the report's own count.
    const entityOf = new Map(rows.map((x) => [x.RowId, x.EntityKey]));
    const trainingEntities = new Set(r.NewEntity.TrainingRowIds.map((id) => entityOf.get(id)));
    const holdoutEntities = new Set(r.NewEntity.HoldoutRowIds.map((id) => entityOf.get(id)));
    expect([...holdoutEntities].sort()).toEqual(['E7', 'E8', 'E9']);
    expect([...holdoutEntities].filter((k) => trainingEntities.has(k))).toEqual([]);
    expect(trainingEntities.size).toBe(7);
    expect(r.NewEntity.SharedEntityKeys).toBe(0);
    // Training rows are dated before the cutoff, holdout rows on or after it; every row is in one of the three counts.
    expect(r.NewEntity.TrainingRowIds.every((id) => Number(id.split(':')[1]) < 2024)).toBe(true);
    expect(r.NewEntity.HoldoutRowIds.every((id) => Number(id.split(':')[1]) >= 2024)).toBe(true);
    expect(r.NewEntity.TrainingRowIds.length + r.NewEntity.HoldoutRowIds.length + r.NewEntity.ExcludedRowCount).toBe(rows.length);
  });
  it('excludes and counts the held-out groups\' rows on or after the holdout end', () => {
    const rows: CarveRow[] = [];
    for (let e = 0; e < 10; e++) for (let year = 2015 + e; year <= 2025; year++) rows.push(row(`E${e}:${year}`, `E${e}`, `${year}-06-01`));
    const r = HoldoutCarve.CarveLockedHoldout(rows, holdout('2024-01-01', '2025-01-01', 0.3));
    if (!r.Ok || r.NewEntity === null) throw new Error('expected a new-entity carve');
    expect([...r.NewEntity.HoldoutRowIds].sort()).toEqual(['E7:2024', 'E8:2024', 'E9:2024']);
    // 65 rows: 42 training rows (E0–E6 before 2024) + 3 holdout rows + 20 excluded (E0–E6 from 2024, E7–E9 before 2024 and in 2025).
    expect([r.NewEntity.TrainingRowIds.length, r.NewEntity.ExcludedRowCount]).toEqual([42, 20]);
    const used = new Set([...r.NewEntity.TrainingRowIds, ...r.NewEntity.HoldoutRowIds]);
    expect(rows.filter((x) => x.RowId.endsWith(':2025') && used.has(x.RowId))).toEqual([]);
  });
  it('is null when the protocol declares no new-entity report', () => {
    const r = HoldoutCarve.CarveLockedHoldout(personYears(), holdout('2024-01-01'));
    expect(r.Ok && r.NewEntity).toBeNull();
  });
});

// Measured with the shipped hash and pinned: a change to the hash changes these and re-carves stored holdouts.
const SEED_42_HOLDOUT = 997;
const SEED_7_EIGHT_ROWS: readonly string[] = ['r3', 'r5', 'r6', 'r7'];

describe('HoldoutCarve.SeededRandomCarve', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `r${i}`);
  it('assigns the same rows whatever the read order, at about the declared fraction', () => {
    const a = HoldoutCarve.SeededRandomCarve(ids, 0.25, 42);
    const b = HoldoutCarve.SeededRandomCarve([...ids].reverse(), 0.25, 42);
    expect([...a.HoldoutRowIds].sort()).toEqual([...b.HoldoutRowIds].sort());
    expect(a.HoldoutRowIds.length).toBeGreaterThan(900);
    expect(a.HoldoutRowIds.length).toBeLessThan(1100);
    expect(a.HoldoutRowIds.length + a.DevelopmentRowIds.length).toBe(4000);
  });
  it('stays near the declared fraction on short sequential ids for every seed', () => {
    for (const seed of [0, 1, 7, 42, 123]) {
      const n = HoldoutCarve.SeededRandomCarve(ids, 0.25, seed).HoldoutRowIds.length;
      expect(n, `seed ${seed}`).toBeGreaterThan(900);
      expect(n, `seed ${seed}`).toBeLessThan(1100);
    }
  });
  it('keeps the assignment of a seed fixed across releases (a stored holdout is never silently re-carved)', () => {
    expect(HoldoutCarve.SeededRandomCarve(ids, 0.25, 42).HoldoutRowIds.length).toBe(SEED_42_HOLDOUT);
    expect(HoldoutCarve.SeededRandomCarve(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], 0.5, 7).HoldoutRowIds).toEqual(SEED_7_EIGHT_ROWS);
  });
  it('draws a different holdout under a different seed', () => {
    const a = new Set(HoldoutCarve.SeededRandomCarve(ids, 0.25, 1).HoldoutRowIds);
    const b = HoldoutCarve.SeededRandomCarve(ids, 0.25, 2).HoldoutRowIds;
    expect(b.filter((id) => a.has(id)).length).toBeLessThan(b.length / 2);
  });
});

describe('HoldoutCarve.RollingOriginCarve', () => {
  it('holds out the last origins × horizon periods and refuses too short a series', () => {
    const r = HoldoutCarve.RollingOriginCarve(monthlyRows(60), rolling(5, 3, 0, 24));
    const unsorted = HoldoutCarve.RollingOriginCarve([...monthlyRows(60)].reverse(), rolling(5, 3, 0, 24));
    expect(unsorted.Ok && [...unsorted.HoldoutRowIds].sort()).toEqual(Array.from({ length: 15 }, (_, i) => `t${45 + i}`).sort());
    expect(unsorted.Ok && unsorted.HoldoutPeriods[0]).toBe('2023-10-01');
    if (!r.Ok) throw new Error('expected a carve');
    expect(r.HoldoutRowIds).toHaveLength(15);
    expect(r.HoldoutRowIds[0]).toBe('t45');
    expect(HoldoutCarve.RollingOriginCarve(monthlyRows(30), rolling(5, 3, 0, 24)))
      .toEqual({ Ok: false, Refusal: { kind: 'too-few-periods', periods: 30, origins: 5, horizonPeriods: 3, gapPeriods: 0, minTrainPeriods: 24 } });
  });
  it('counts the gap between the training window and the first origin against the training periods', () => {
    // 30 periods − 2 origins × 3 − gap 4 leaves exactly the 20 training periods the protocol asks for.
    const fits = HoldoutCarve.RollingOriginCarve(monthlyRows(30), rolling(2, 3, 4, 20));
    if (!fits.Ok) throw new Error('expected a carve');
    expect(fits.HoldoutRowIds).toEqual(['t24', 't25', 't26', 't27', 't28', 't29']);
    expect(fits.HoldoutPeriods[0]).toBe('2022-01-01');
    expect(HoldoutCarve.RollingOriginCarve(monthlyRows(30), rolling(2, 3, 5, 20)))
      .toEqual({ Ok: false, Refusal: { kind: 'too-few-periods', periods: 30, origins: 2, horizonPeriods: 3, gapPeriods: 5, minTrainPeriods: 20 } });
  });
});

describe('HoldoutCarve.DescribeCarveRefusal', () => {
  it('states each refusal in one sentence naming its values', () => {
    expect(HoldoutCarve.DescribeCarveRefusal({ kind: 'no-holdout-rows', cutoff: '2024-01-01', holdoutEnd: '2025-01-01' }))
      .toBe('No row is dated on or after the cutoff 2024-01-01 and before 2025-01-01; there is nothing to test on. Choose an earlier cutoff.');
    expect(HoldoutCarve.DescribeCarveRefusal({ kind: 'too-few-periods', periods: 30, origins: 2, horizonPeriods: 3, gapPeriods: 5, minTrainPeriods: 20 }))
      .toBe('30 periods cannot hold 2 origins of 3 periods and a gap of 5 periods after 20 training periods.');
    expect(HoldoutCarve.DescribeCarveRefusal({ kind: 'too-few-periods', periods: 30, origins: 5, horizonPeriods: 3, gapPeriods: 0, minTrainPeriods: 24 }))
      .toBe('30 periods cannot hold 5 origins of 3 periods and a gap of 0 periods after 24 training periods.');
    expect(HoldoutCarve.DescribeCarveRefusal({ kind: 'missing-carve-date', rowId: 'r1', column: 'StartDate' }))
      .toBe('Row r1 has no StartDate; the holdout is carved on that column.');
  });
});

describe('HoldoutCarve.YearCutoff, HoldoutPeriods, TrainingRowIds', () => {
  const dates = ['2021-03-01', '2022-03-01', '2022-07-01', '2023-03-01', '2023-05-01', '2024-02-01', '2024-03-01', '2024-04-01'];
  it('picks the earliest 1 January whose trailing block holds at most the share', () => {
    expect(HoldoutCarve.YearCutoff(dates, 0.25)).toBe('2024-01-01');
    expect(HoldoutCarve.YearCutoff(dates, 0.7)).toBe('2023-01-01');
  });
  it('defaults to a share of one quarter, from the one exported constant', () => {
    expect(DEFAULT_YEAR_CUTOFF_SHARE).toBe(0.25);
    // 2023–2024 hold 2 of 8 rows (exactly a quarter, kept); 2022 onwards would hold 3 of 8. A share of 0.2 stops at 2024.
    const eight = ['2020-02-01', '2020-03-01', '2020-04-01', '2020-05-01', '2020-06-01', '2022-01-01', '2023-05-01', '2024-05-01'];
    expect(HoldoutCarve.YearCutoff(eight)).toBe('2023-01-01');
    expect(HoldoutCarve.YearCutoff(eight, 0.2)).toBe('2024-01-01');
  });
  it('refuses a cutoff that would leave no row before it, and a date it cannot read', () => {
    expect(() => HoldoutCarve.YearCutoff(['2024-01-01', '2024-06-01'])).toThrow('The cutoff would leave no training rows.');
    expect(() => HoldoutCarve.YearCutoff(['2023-03-01', 'soon', '2024-03-01'])).toThrow(HoldoutCarveDateError);
    expect(() => HoldoutCarve.YearCutoff(['2023-03-01', 'soon', '2024-03-01'])).toThrow('"soon" is not a date (yyyy-mm-dd); the holdout cannot be derived from it.');
    expect(() => HoldoutCarve.HoldoutPeriods(['2024-01-01', '2024-13-01'], 'month')).toThrow(HoldoutCarveDateError);
  });
  it('starts a week on Monday and a quarter on its first month', () => {
    // 2024-03-10 is a Sunday, 2024-03-11 a Monday.
    expect(HoldoutCarve.HoldoutPeriods(['2024-03-10', '2024-03-11', '2024-03-17'], 'week')).toEqual(['2024-03-04', '2024-03-11']);
    expect(HoldoutCarve.HoldoutPeriods(['2024-05-20', '2024-06-30', '2024-08-15', '2024-12-31'], 'quarter')).toEqual(['2024-04-01', '2024-07-01', '2024-10-01']);
    expect(HoldoutCarve.HoldoutPeriods(['2024-05-20', '2024-05-20T23:59:00'], 'day')).toEqual(['2024-05-20']);
    expect(HoldoutCarve.HoldoutPeriods(['2023-05-20', '2024-12-31'], 'year')).toEqual(['2023-01-01', '2024-01-01']);
  });
  it('lists each post-cutoff month once, in order', () => {
    expect(HoldoutCarve.HoldoutPeriods(['2024-03-15', '2024-01-02', '2024-03-01', '2024-02-28'], 'month')).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });
  it('marks only rows in the development role as seen in training', () => {
    const manifest: SnapshotRowKey[] = [
      { rowId: 'a', entityKey: 'E1', decisionDate: '2023-01-01', groupKey: 'e1', period: null, role: 'development' },
      { rowId: 'b', entityKey: 'E1', decisionDate: '2024-02-01', groupKey: 'e1', period: null, role: 'locked-holdout' },
    ];
    expect([...HoldoutCarve.TrainingRowIds(manifest)]).toEqual(['a']);
  });
});
