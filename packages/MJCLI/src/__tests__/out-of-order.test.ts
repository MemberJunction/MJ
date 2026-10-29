/**
 * Unit tests for the automatic outOfOrder decision in `mj migrate`. The status reports come
 * from Skyway's own resolver (`ResolveMigrations`), fed a history modelled on a database
 * upgraded from a release line, so the tests track what Skyway would actually refuse.
 */
import { describe, it, expect } from 'vitest';
import { ResolveMigrations, type HistoryRecord, type MigrationStatus, type ResolvedMigration } from '@memberjunction/skyway-core';
import { DecideOutOfOrder, FindOutOfOrderPending, ReadExplicitOutOfOrder, ShouldProbeOutOfOrder } from '../lib/out-of-order';

function versioned(version: string, description: string): ResolvedMigration {
  const filename = `V${version}__v6.2.x__${description}.sql`;
  return {
    Type: 'versioned',
    Version: version,
    Description: description,
    Filename: filename,
    FilePath: `/tmp/migrations/v6/${filename}`,
    ScriptPath: `v6/${filename}`,
    SQL: 'SELECT 1;',
    Checksum: 1,
  };
}

function historyRow(rank: number, version: string, type: HistoryRecord['Type'] = 'SQL'): HistoryRecord {
  return {
    InstalledRank: rank,
    Version: version,
    Description: `row ${version}`,
    Type: type,
    Script: `v6/V${version}.sql`,
    Checksum: 1,
    InstalledBy: 'test',
    InstalledOn: new Date(0),
    ExecutionTime: 1,
    Success: true,
  };
}

const SHARED = versioned('202608200000', 'Shared_Before_Cut');
const NEXT_ONLY_EARLY = versioned('202609142100', 'Next_Only_Early');
const BACKPORTED = versioned('202610011200', 'Backported_Fix');
const NEXT_ONLY_LATE = versioned('202610200000', 'Next_Only_Late');
const DISCOVERED = [SHARED, NEXT_ONLY_EARLY, BACKPORTED, NEXT_ONLY_LATE];

/** A 6.1 line database: shared and backported files applied, plus a line-only file newer than both. */
const LINE_HISTORY: HistoryRecord[] = [
  historyRow(1, SHARED.Version ?? ''),
  historyRow(2, BACKPORTED.Version ?? ''),
  historyRow(3, '202610061630'),
];

function statusFor(history: HistoryRecord[], outOfOrder: boolean): MigrationStatus[] {
  return ResolveMigrations(DISCOVERED, history, '1', true, outOfOrder).StatusReport;
}

describe('FindOutOfOrderPending', () => {
  it('finds the unapplied files older than the newest applied migration', () => {
    const found = FindOutOfOrderPending(statusFor(LINE_HISTORY, false));
    expect(found.map((s) => s.Version)).toEqual([NEXT_ONLY_EARLY.Version]);
  });

  it('finds nothing when every pending file is newer than the newest applied one', () => {
    const inOrder = [historyRow(1, SHARED.Version ?? '')];
    expect(FindOutOfOrderPending(statusFor(inOrder, false))).toEqual([]);
  });

  it('leaves out files at or below a baseline floor (Skyway never runs those)', () => {
    // Installed from a baseline cut after the early files; the backported file sits above it.
    const baselineAbove = [historyRow(1, '202609300000', 'SQL_BASELINE'), historyRow(2, '202610061630')];
    const found = FindOutOfOrderPending(statusFor(baselineAbove, false));
    expect(found.map((s) => s.Version)).toEqual([BACKPORTED.Version]);
  });

  it('finds nothing on a fresh database', () => {
    expect(FindOutOfOrderPending(statusFor([], false))).toEqual([]);
  });
});

describe('DecideOutOfOrder', () => {
  const pending = FindOutOfOrderPending(statusFor(LINE_HISTORY, false));

  it('enables outOfOrder for a core run with out-of-order files when config does not set it', () => {
    const decision = DecideOutOfOrder({ ExplicitSetting: undefined, IsCoreSchema: true, OutOfOrderPending: pending });
    expect(decision).toEqual({ OutOfOrder: true, EnabledAutomatically: true, BlockedByExplicitSetting: false });
    // With the decision applied, Skyway schedules the older file instead of refusing the run.
    const resolved = ResolveMigrations(DISCOVERED, LINE_HISTORY, '1', true, decision.OutOfOrder);
    expect(resolved.PendingMigrations.map((m) => m.Version)).toEqual([NEXT_ONLY_EARLY.Version, NEXT_ONLY_LATE.Version]);
  });

  it('leaves outOfOrder off when there are no out-of-order files', () => {
    expect(DecideOutOfOrder({ ExplicitSetting: undefined, IsCoreSchema: true, OutOfOrderPending: [] })).toEqual({
      OutOfOrder: false,
      EnabledAutomatically: false,
      BlockedByExplicitSetting: false,
    });
  });

  it('honours an explicit false and reports that it blocks the run', () => {
    expect(DecideOutOfOrder({ ExplicitSetting: false, IsCoreSchema: true, OutOfOrderPending: pending })).toEqual({
      OutOfOrder: false,
      EnabledAutomatically: false,
      BlockedByExplicitSetting: true,
    });
  });

  it('honours an explicit true', () => {
    const decision = DecideOutOfOrder({ ExplicitSetting: true, IsCoreSchema: true, OutOfOrderPending: [] });
    expect(decision.OutOfOrder).toBe(true);
    expect(decision.EnabledAutomatically).toBe(false);
  });

  it('does not auto-enable for an Open App schema', () => {
    const decision = DecideOutOfOrder({ ExplicitSetting: undefined, IsCoreSchema: false, OutOfOrderPending: pending });
    expect(decision.OutOfOrder).toBe(false);
  });
});

describe('ReadExplicitOutOfOrder', () => {
  it('returns undefined when the config does not set the key', () => {
    expect(ReadExplicitOutOfOrder({ dbHost: 'localhost' })).toBeUndefined();
    expect(ReadExplicitOutOfOrder(undefined)).toBeUndefined();
  });

  it('returns the boolean the config sets', () => {
    expect(ReadExplicitOutOfOrder({ outOfOrder: false })).toBe(false);
    expect(ReadExplicitOutOfOrder({ outOfOrder: true })).toBe(true);
  });
});

describe('ShouldProbeOutOfOrder', () => {
  it('probes a core run unless config already sets true', () => {
    expect(ShouldProbeOutOfOrder(undefined, true)).toBe(true);
    expect(ShouldProbeOutOfOrder(false, true)).toBe(true);
    expect(ShouldProbeOutOfOrder(true, true)).toBe(false);
  });

  it('never probes an Open App run', () => {
    expect(ShouldProbeOutOfOrder(undefined, false)).toBe(false);
  });
});
