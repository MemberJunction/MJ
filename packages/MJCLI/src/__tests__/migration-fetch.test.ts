/**
 * Unit tests for the migration-fetch slice selector and ref resolver.
 * These are pure functions — no network or filesystem involved.
 */
import { describe, it, expect } from 'vitest';
import { SelectMigrationSlice, ResolveGitRef } from '../lib/migration-fetch';
import type { AppliedMigrationState } from '../lib/db-version';

// Representative baselines (B) and versioned (V) files keyed by their numeric timestamp.
const B_V3 = 'migrations/v3/B202601122300__v3.0_Baseline.sql';
const B_V4 = 'migrations/v4/B202602061600__v4.0__Baseline.sql';
const B_V5_0 = 'migrations/v5/B202602151200__v5.0__Baseline.sql';
const B_V5_37 = 'migrations/v5/B202605241137__v5.37.x__Baseline.sql'; // highest baseline
const V_LEGACY = 'migrations/v2/V202407171600__v2.0.x.sql';
const V_SUBSUMED = 'migrations/v5/V202605200000__v5.36.x__Foo.sql'; // before B_V5_37 → subsumed
const V_TAIL_1 = 'migrations/v5/V202605250000__v5.38.x__Bar.sql'; // after B_V5_37
const V_TAIL_2 = 'migrations/v5/V202606010000__v5.39.x__Baz.sql'; // after B_V5_37
const REPEATABLE = 'migrations/R__RefreshMetadata.sql';
const NON_MIGRATION_1 = 'migrations/CLAUDE.md';
const NON_MIGRATION_2 = 'migrations/Baseline_v3.0_OPTIMIZATION_REPORT.md';

const sorted = (arr: string[]): string[] => [...arr].sort();

/** Builds the history state of an existing database from its applied versions and baseline floor. */
function appliedState(versions: string[], baselineFloor: string | null = null): AppliedMigrationState {
  const set = new Set(versions);
  const highest = versions.length > 0 ? [...versions].sort().at(-1) ?? null : null;
  return { AppliedVersions: set, HighestVersion: highest, BaselineFloor: baselineFloor };
}

/** Timestamp key of a migration path (the 12 digits after the V/B prefix). */
const ts = (p: string): string => /\/[VB](\d{12})__/.exec(p)?.[1] ?? '';

describe('selectMigrationSlice', () => {
  it('selects the highest baseline + the versioned tail after it + repeatables', () => {
    const input = [V_LEGACY, B_V3, B_V4, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE, NON_MIGRATION_1, NON_MIGRATION_2];
    const result = SelectMigrationSlice(input);
    expect(sorted(result)).toEqual(sorted([B_V5_37, V_TAIL_1, V_TAIL_2, REPEATABLE]));
  });

  it('excludes lower baselines, subsumed versioned files, and non-migration files', () => {
    const result = SelectMigrationSlice([V_LEGACY, B_V3, B_V4, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, REPEATABLE, NON_MIGRATION_1]);
    expect(result).not.toContain(B_V3);
    expect(result).not.toContain(B_V4);
    expect(result).not.toContain(B_V5_0);
    expect(result).not.toContain(V_LEGACY);
    expect(result).not.toContain(V_SUBSUMED);
    expect(result).not.toContain(NON_MIGRATION_1);
  });

  it('picks the highest baseline even when the target falls between baselines', () => {
    const vAfterB4 = 'migrations/v4/V202602100000__v4.1.x__X.sql';
    const vBeforeB4 = 'migrations/v4/V202602050000__v4.0.x__Y.sql';
    const result = SelectMigrationSlice([B_V3, B_V4, vAfterB4, vBeforeB4, REPEATABLE]);
    expect(sorted(result)).toEqual(sorted([B_V4, vAfterB4, REPEATABLE]));
  });

  it('returns the full versioned history when no baseline is present (legacy v2)', () => {
    const v1 = 'migrations/v2/V202407171600__v2.0.x.sql';
    const v2 = 'migrations/v2/V202408010000__v2.1.x__Add.sql';
    const result = SelectMigrationSlice([v1, v2, REPEATABLE]);
    expect(sorted(result)).toEqual(sorted([v1, v2, REPEATABLE]));
  });

  it('always includes repeatable migrations', () => {
    const result = SelectMigrationSlice([B_V5_37, V_TAIL_1, REPEATABLE]);
    expect(result).toContain(REPEATABLE);
  });

  it('returns an empty slice for an empty input', () => {
    expect(SelectMigrationSlice([])).toEqual([]);
  });
});

describe('selectMigrationSlice — existing-DB upgrade (applied set)', () => {
  const ALL = [B_V3, B_V4, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE, NON_MIGRATION_1];

  it('upgrades from below a baseline by including the intermediate versioned migrations (no baseline)', () => {
    // DB installed from the v5.0 baseline and upgraded to a version BEFORE V_SUBSUMED (e.g.
    // v5.35), with a v5.37 baseline present in the tree. The v5.36 file (V_SUBSUMED) MUST be
    // fetched. No B file is fetched; Skyway never applies one to an existing DB.
    const applied = appliedState([ts(B_V5_0), '202605150000'], ts(B_V5_0));
    const result = SelectMigrationSlice(ALL, applied);
    expect(sorted(result)).toEqual(sorted([V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE]));
    expect(result).not.toContain(B_V5_37);
  });

  it('skips versioned migrations the DB has already applied', () => {
    const applied = appliedState([ts(B_V5_0), ts(V_SUBSUMED), ts(V_TAIL_1)], ts(B_V5_0));
    const result = SelectMigrationSlice(ALL, applied);
    expect(sorted(result)).toEqual(sorted([V_TAIL_2, REPEATABLE]));
  });

  it('returns only repeatables when the DB has applied everything in the tree', () => {
    const applied = appliedState([ts(B_V5_0), ts(V_SUBSUMED), ts(V_TAIL_1), ts(V_TAIL_2)], ts(B_V5_0));
    expect(SelectMigrationSlice(ALL, applied)).toEqual([REPEATABLE]);
  });

  it('never includes baseline files for an existing DB', () => {
    const result = SelectMigrationSlice(ALL, appliedState(['202501010000']));
    expect(result.some((p) => p.includes('/B'))).toBe(false);
  });

  it('treats a history table with nothing applied as a fresh install (baseline + tail)', () => {
    const result = SelectMigrationSlice(ALL, appliedState([]));
    expect(sorted(result)).toEqual(sorted([B_V5_37, V_TAIL_1, V_TAIL_2, REPEATABLE]));
  });
});

describe('selectMigrationSlice — cross-line upgrade (6.1 line database → 6.2 candidate)', () => {
  // Files at the 6.2 ref. Backports are byte-identical, so a line fix carries the same
  // timestamp on both lines; next-only files dated before the line's newest fix never ran there.
  const SHARED_61 = 'migrations/v6/V202608200000__v6.1.x__Shared_Before_Cut.sql';
  const NEXT_ONLY_EARLY = 'migrations/v6/V202609142100__v6.2.x__Next_Only_Early.sql';
  const NEXT_ONLY_MID = 'migrations/v6/V202609291625__v6.2.x__Next_Only_Mid.sql';
  const BACKPORTED = 'migrations/v6/V202610011200__v6.2.x__Backported_Security_Fix.sql';
  const NEXT_ONLY_LATE = 'migrations/v6/V202610200000__v6.2.x__Next_Only_Late.sql';
  const TREE_62 = [B_V5_37, V_TAIL_1, SHARED_61, NEXT_ONLY_EARLY, NEXT_ONLY_MID, BACKPORTED, NEXT_ONLY_LATE, REPEATABLE];
  // A line-only migration (never on next) that the 6.1 database also applied.
  const LINE_ONLY_VERSION = '202610061630';

  const lineDb = appliedState([ts(B_V5_37), ts(V_TAIL_1), ts(SHARED_61), ts(BACKPORTED), LINE_ONLY_VERSION], ts(B_V5_37));

  it('selects next-only files older than the database\'s newest applied migration', () => {
    const result = SelectMigrationSlice(TREE_62, lineDb);
    expect(sorted(result)).toEqual(sorted([NEXT_ONLY_EARLY, NEXT_ONLY_MID, NEXT_ONLY_LATE, REPEATABLE]));
    // The two early files sort below the line's newest migration; a "newer than the max"
    // filter would have dropped them and reported success.
    expect(ts(NEXT_ONLY_EARLY) < (lineDb.HighestVersion ?? '')).toBe(true);
    expect(ts(NEXT_ONLY_MID) < (lineDb.HighestVersion ?? '')).toBe(true);
  });

  it('does not re-fetch the backported fix the line already applied', () => {
    expect(SelectMigrationSlice(TREE_62, lineDb)).not.toContain(BACKPORTED);
  });
});

describe('selectMigrationSlice — database installed from a baseline', () => {
  // DB installed fresh from the v5.37 baseline, then upgraded once.
  const OLD_NEVER_RUN = 'migrations/v5/V202604010000__v5.30.x__Before_Baseline.sql';
  const TREE = [V_LEGACY, OLD_NEVER_RUN, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE];
  const baselineDb = appliedState([ts(B_V5_37), ts(V_TAIL_1)], ts(B_V5_37));

  it('excludes versioned files at or below the baseline floor even though they are not in history', () => {
    const result = SelectMigrationSlice(TREE, baselineDb);
    expect(result).not.toContain(V_LEGACY);
    expect(result).not.toContain(OLD_NEVER_RUN);
    expect(result).not.toContain(V_SUBSUMED);
  });

  it('selects the unapplied files above the floor', () => {
    expect(sorted(SelectMigrationSlice(TREE, baselineDb))).toEqual(sorted([V_TAIL_2, REPEATABLE]));
  });

  it('selects an unapplied file between the floor and the newest applied version', () => {
    const between = 'migrations/v5/V202605241200__v5.38.x__Between.sql'; // floor < between < V_TAIL_1
    const result = SelectMigrationSlice([...TREE, between], baselineDb);
    expect(sorted(result)).toEqual(sorted([between, V_TAIL_2, REPEATABLE]));
  });
});

describe('selectMigrationSlice — fresh install', () => {
  it('selects the highest baseline + tail when the database has no history', () => {
    const result = SelectMigrationSlice([V_LEGACY, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE], null);
    expect(sorted(result)).toEqual(sorted([B_V5_37, V_TAIL_1, V_TAIL_2, REPEATABLE]));
  });
});

describe('resolveGitRef', () => {
  it('maps a bare semantic version to a v-prefixed release tag', () => {
    expect(ResolveGitRef('2.123.0')).toBe('v2.123.0');
  });

  it('leaves an already v-prefixed semantic version unchanged', () => {
    expect(ResolveGitRef('v2.123.0')).toBe('v2.123.0');
  });

  it('treats non-semver values as branch names', () => {
    expect(ResolveGitRef('main')).toBe('main');
    expect(ResolveGitRef('next')).toBe('next');
  });
});
