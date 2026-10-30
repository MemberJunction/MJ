import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { HoldoutCarve, type EvaluationProtocolSpec, type HoldoutSplit, type SnapshotRowKey } from '@memberjunction/predictive-studio-core';
import { DateCarvedCarver, HoldoutCarvers, RollingOriginCarver, SeededRandomCarver } from '../holdout-carver';
import { InMemorySnapshotFileStore } from '../snapshot-file-store';
import { SnapshotIntegrityError, SnapshotManifest } from '../snapshot-manifest';
import { SnapshotFileFormatError } from '../snapshot-serialization';
import { TrainingRefusedError } from '../../training/training-refusal';
import type { AssembledRow } from '../../feature-assembly/as-of/as-of-assembler';
import type { UnitRow } from '../../prediction-unit/unit-row-reader';

type DateCarved = Extract<HoldoutSplit, { readonly kind: 'date-carved' }>;
type RollingOrigin = Extract<HoldoutSplit, { readonly kind: 'rolling-origin' }>;

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
/** A unit row decided on `decision`, whose own `StartDate` field is `start`, in group `group`. */
const unitRow = (id: string, decision: string, start: string | null, group = `p-${id}`, label = '1', period: Date | null = null): UnitRow => ({
  RowId: id, EntityKey: id, DecisionDate: day(decision), WindowEnd: day(decision), GroupKey: group, Period: period, Label: label, Source: { ID: id, StartDate: start },
});
const assembled = (id: string): AssembledRow => ({ RowId: id, Values: [1], Provenance: [] });
const byId = (rows: readonly UnitRow[]): ReadonlyMap<string, UnitRow> => new Map(rows.map((r) => [r.RowId, r]));
const dateCarved = (o: Partial<DateCarved>): DateCarved => ({ kind: 'date-carved', dateColumn: 'StartDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null, ...o });

describe('DateCarvedCarver', () => {
  it('carves on the declared date column of the unit row, leaves out rows on or after the holdout end, and summarises the carve', () => {
    const rows = [unitRow('a', '2023-12-01', '2023-01-01'), unitRow('b', '2024-12-01', '2024-01-01', 'p-b', '0'), unitRow('c', '2025-12-01', '2025-01-01')];
    const carver = new DateCarvedCarver(dateCarved({ holdoutEnd: '2025-01-01' }), 'year');
    const carve = carver.AssignRoles([...rows].reverse().map((r) => assembled(r.RowId)), byId(rows));
    expect([...carve.Roles.entries()]).toEqual([['a', 'development'], ['b', 'locked-holdout']]);
    expect(carve.Summary).toEqual({
      kind: 'date-carved', cutoff: '2024-01-01', holdoutEnd: '2025-01-01', developmentRowCount: 1, holdoutRowCount: 1, excludedAfterHoldoutEnd: 1,
      holdoutClassCounts: { 0: 1 }, holdoutPeriods: ['2024-01-01'], newEntity: null,
    });
  });

  it('carves on the unit row decision date when the protocol names DecisionDate', () => {
    // StartDate would put both rows in development; the decision dates straddle the cutoff.
    const rows = [unitRow('a', '2023-12-01', '2020-01-01'), unitRow('b', '2024-02-01', '2020-01-01')];
    const { Roles: roles } = new DateCarvedCarver(dateCarved({ dateColumn: 'DecisionDate' }), 'month').AssignRoles(rows.map((r) => assembled(r.RowId)), byId(rows));
    expect([...roles.entries()]).toEqual([['a', 'development'], ['b', 'locked-holdout']]);
  });

  it('refuses a row whose carve column is empty or names no day, at the carve stage', () => {
    const carver = new DateCarvedCarver(dateCarved({}), 'year');
    for (const start of [null, 'soon', '2024-02-30']) {
      const rows = [unitRow('a', '2023-12-01', start), unitRow('b', '2024-12-01', '2024-06-01')];
      expect(() => carver.AssignRoles(rows.map((r) => assembled(r.RowId)), byId(rows))).toThrow(TrainingRefusedError);
      expect(() => carver.AssignRoles(rows.map((r) => assembled(r.RowId)), byId(rows))).toThrow(expect.objectContaining({
        Refusal: { stage: 'carve', reason: { kind: 'missing-carve-date', rowId: 'a', column: 'StartDate' } },
      }));
    }
  });

  it("holds out the newest groups whole by the unit row's group key, never by its row id", () => {
    // Ten members, one row per membership year from their joining year: the group key is the member, the row id the year row.
    // The three newest members (E7–E9) are held out with their 2024 and 2025 rows.
    const rows: UnitRow[] = [];
    for (let e = 0; e < 10; e++) for (let year = 2015 + e; year <= 2025; year++) rows.push(unitRow(`E${e}:${year}`, `${year}-06-01`, `${year}-06-01`, `e${e}`));
    const carver = new DateCarvedCarver(dateCarved({ newEntityReport: { groupKey: 'PersonID', holdoutFraction: 0.3 } }), 'year');
    const { Summary: summary } = carver.AssignRoles(rows.map((r) => assembled(r.RowId)), byId(rows));
    const expected = HoldoutCarve.CarveLockedHoldout(rows.map((r) => ({ RowId: r.RowId, EntityKey: r.GroupKey, CarveDate: r.Source.StartDate as string, Label: '1' })), dateCarved({ newEntityReport: { groupKey: 'PersonID', holdoutFraction: 0.3 } }));
    if (expected.Ok === false || expected.NewEntity === null) throw new Error('expected a new-entity carve');
    expect(summary.newEntity).toEqual({
      holdoutEntityKeys: 3, trainingRowCount: expected.NewEntity.TrainingRowIds.length, holdoutRowCount: 6, excludedRowCount: expected.NewEntity.ExcludedRowCount, sharedEntityKeys: 0,
      // The stored membership: the held members and the trained-on members, each sorted and joined with '\n'.
      heldGroupKeysSha256: sha256('e7\ne8\ne9'), trainingGroupKeysSha256: sha256(['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'].join('\n')),
    });
  });

  it('refuses a carve that leaves no development row', () => {
    const rows = [unitRow('a', '2024-12-01', '2024-03-01')];
    expect(() => new DateCarvedCarver(dateCarved({}), 'year').AssignRoles([assembled('a')], byId(rows))).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'no-development-rows', cutoff: '2024-01-01' } },
    }));
  });
});

describe('SeededRandomCarver', () => {
  it('assigns every row a role whatever the read order, and counts the holdout classes', () => {
    const rows = Array.from({ length: 400 }, (_, i) => unitRow(`r${i}`, '2024-01-01', null, `p-r${i}`, i % 4 === 0 ? '0' : '1'));
    const a = new SeededRandomCarver(0.25, 7);
    const b = new SeededRandomCarver(0.25, 7);
    const { Roles: rolesA, Summary: summary } = a.AssignRoles(rows.map((r) => assembled(r.RowId)), byId(rows));
    const { Roles: rolesB } = b.AssignRoles([...rows].reverse().map((r) => assembled(r.RowId)), byId(rows));
    expect([...rolesA].sort()).toEqual([...rolesB].sort());
    expect(rolesA.size).toBe(400);
    const held = [...rolesA].filter(([, role]) => role === 'locked-holdout').map(([id]) => id);
    expect(held).toEqual(HoldoutCarve.SeededRandomCarve(rows.map((r) => r.RowId), 0.25, 7).HoldoutRowIds);
    expect(summary).toMatchObject({ kind: 'seeded-random', cutoff: null, holdoutEnd: null, holdoutRowCount: held.length, developmentRowCount: 400 - held.length, excludedAfterHoldoutEnd: 0, holdoutPeriods: [], newEntity: null });
    const classes = summary.holdoutClassCounts || {};
    expect((classes['0'] || 0) + (classes['1'] || 0)).toBe(held.length);
  });

  it('refuses a carve that leaves no holdout row, and one that leaves no development row, at the carve stage', () => {
    const three = ['r0', 'r1', 'r2'].map((id) => unitRow(id, '2024-01-01', null));
    expect(() => new SeededRandomCarver(0.01, 7).AssignRoles(three.map((r) => assembled(r.RowId)), byId(three))).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'seeded-random-side-empty', side: 'locked-holdout', fraction: 0.01, rows: 3 } },
    }));
    const two = ['r0', 'r1'].map((id) => unitRow(id, '2024-01-01', null));
    expect(() => new SeededRandomCarver(0.99, 7).AssignRoles(two.map((r) => assembled(r.RowId)), byId(two))).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'seeded-random-side-empty', side: 'development', fraction: 0.99, rows: 2 } },
    }));
  });
});

/** Monthly unit rows t0…t(n−1) from January 2020, each with its period. */
function monthly(n: number): { readonly Rows: AssembledRow[]; readonly UnitRows: Map<string, UnitRow> } {
  const units = Array.from({ length: n }, (_, k) => unitRow(`t${k}`, '2020-01-01', null, 'series', '1', new Date(Date.UTC(2020, k, 1))));
  return { Rows: units.map((u) => assembled(u.RowId)), UnitRows: new Map(units.map((u) => [u.RowId, u])) };
}

const design: RollingOrigin = { kind: 'rolling-origin', origins: 5, horizonPeriods: 1, gapPeriods: 0, minTrainPeriods: 24, window: 'expanding' };

describe('RollingOriginCarver', () => {
  it("holds out exactly the last origins × horizon periods, the trainer's outer test periods, whatever the row order", () => {
    const { Rows, UnitRows } = monthly(40);
    const carver = new RollingOriginCarver(design);
    const { Roles: roles, Summary: summary } = carver.AssignRoles([...Rows].reverse(), UnitRows);
    expect([...roles].filter(([, role]) => role === 'locked-holdout').map(([id]) => id).sort()).toEqual(['t35', 't36', 't37', 't38', 't39']);
    expect(roles.size).toBe(40);
    expect(summary).toEqual({
      kind: 'rolling-origin', cutoff: '2022-12-01', holdoutEnd: null, developmentRowCount: 35, holdoutRowCount: 5, excludedAfterHoldoutEnd: 0,
      holdoutClassCounts: null, holdoutPeriods: ['2022-12-01', '2023-01-01', '2023-02-01', '2023-03-01', '2023-04-01'], newEntity: null,
    });
  });

  it('refuses a series too short for the design, and a row without a period, at the carve stage', () => {
    const short = monthly(28);
    expect(() => new RollingOriginCarver(design).AssignRoles(short.Rows, short.UnitRows)).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'too-few-periods', periods: 28, origins: 5, horizonPeriods: 1, gapPeriods: 0, minTrainPeriods: 24 } },
    }));
    const { Rows, UnitRows } = monthly(40);
    UnitRows.set('t3', unitRow('t3', '2020-01-01', null, 'series', '1', null));
    expect(() => new RollingOriginCarver(design).AssignRoles(Rows, UnitRows)).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'missing-carve-date', rowId: 't3', column: 'Period' } },
    }));
  });
});

describe('HoldoutCarvers', () => {
  it("returns the carver of the protocol's holdout kind, carrying its settings", () => {
    const unit = { decision: { action: 'a', actorRole: 'r', capacityPerPeriod: null, period: 'year' as const } };
    const protocol = (holdout: HoldoutSplit): Pick<EvaluationProtocolSpec, 'holdout' | 'seed'> => ({ holdout, seed: 7 });
    expect(HoldoutCarvers.CarverForProtocol(protocol(dateCarved({})), unit)).toBeInstanceOf(DateCarvedCarver);
    expect(HoldoutCarvers.CarverForProtocol(protocol(design), unit)).toBeInstanceOf(RollingOriginCarver);
    const seeded = HoldoutCarvers.CarverForProtocol(protocol({ kind: 'seeded-random', fraction: 0.25 }), unit);
    expect(seeded).toBeInstanceOf(SeededRandomCarver);
    const rows = Array.from({ length: 40 }, (_, i) => unitRow(`r${i}`, '2024-01-01', null));
    expect(seeded.AssignRoles(rows.map((r) => assembled(r.RowId)), byId(rows)).Summary.holdoutRowCount).toBe(HoldoutCarve.SeededRandomCarve(rows.map((r) => r.RowId), 0.25, 7).HoldoutRowIds.length);
  });

  it('refuses an assembled row that is not a unit row', () => {
    const carver = new DateCarvedCarver(dateCarved({}), 'year');
    expect(() => carver.AssignRoles([assembled('x')], new Map())).toThrow('Holdout carve: assembled row x is not a unit row');
  });
});

describe('SnapshotManifest.ReadSnapshotManifest', () => {
  const line: SnapshotRowKey = { rowId: 'r1', entityKey: 'E1', decisionDate: '2023-01-01', groupKey: 'e1', period: null, role: 'development' };
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

  it('reads a verified manifest and refuses one whose bytes differ from the stored SHA-256', async () => {
    const files = new InMemorySnapshotFileStore('p');
    const f = await files.Put('k/manifest.jsonl', 'n', encode(`${JSON.stringify(line)}\n`));
    await expect(SnapshotManifest.ReadSnapshotManifest({ RowManifestFileID: f.FileID, RowManifestSha256: f.Sha256 }, files)).resolves.toEqual([line]);
    await expect(SnapshotManifest.ReadSnapshotManifest({ RowManifestFileID: f.FileID, RowManifestSha256: '0'.repeat(64) }, files)).rejects.toBeInstanceOf(SnapshotIntegrityError);
    await expect(SnapshotManifest.ReadSnapshotManifest({ RowManifestFileID: f.FileID, RowManifestSha256: '0'.repeat(64) }, files)).rejects.toMatchObject({ File: 'manifest', Expected: '0'.repeat(64), Actual: f.Sha256 });
  });

  it('refuses a manifest line of the wrong shape', async () => {
    const files = new InMemorySnapshotFileStore('p');
    const f = await files.Put('k/manifest.jsonl', 'n', encode('{"rowId":"r1"}\n'));
    await expect(SnapshotManifest.ReadSnapshotManifest({ RowManifestFileID: f.FileID, RowManifestSha256: f.Sha256 }, files)).rejects.toBeInstanceOf(SnapshotFileFormatError);
  });
});
