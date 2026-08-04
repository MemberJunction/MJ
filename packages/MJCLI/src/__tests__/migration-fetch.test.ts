/**
 * Unit tests for the migration-fetch slice selector and ref resolver.
 * These are pure functions — no network or filesystem involved.
 */
import { describe, it, expect } from 'vitest';
import { selectMigrationSlice, resolveGitRef } from '../lib/migration-fetch';

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

describe('selectMigrationSlice', () => {
  it('selects the highest baseline + the versioned tail after it + repeatables', () => {
    const input = [V_LEGACY, B_V3, B_V4, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE, NON_MIGRATION_1, NON_MIGRATION_2];
    const result = selectMigrationSlice(input);
    expect(sorted(result)).toEqual(sorted([B_V5_37, V_TAIL_1, V_TAIL_2, REPEATABLE]));
  });

  it('excludes lower baselines, subsumed versioned files, and non-migration files', () => {
    const result = selectMigrationSlice([V_LEGACY, B_V3, B_V4, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, REPEATABLE, NON_MIGRATION_1]);
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
    const result = selectMigrationSlice([B_V3, B_V4, vAfterB4, vBeforeB4, REPEATABLE]);
    expect(sorted(result)).toEqual(sorted([B_V4, vAfterB4, REPEATABLE]));
  });

  it('returns the full versioned history when no baseline is present (legacy v2)', () => {
    const v1 = 'migrations/v2/V202407171600__v2.0.x.sql';
    const v2 = 'migrations/v2/V202408010000__v2.1.x__Add.sql';
    const result = selectMigrationSlice([v1, v2, REPEATABLE]);
    expect(sorted(result)).toEqual(sorted([v1, v2, REPEATABLE]));
  });

  it('always includes repeatable migrations', () => {
    const result = selectMigrationSlice([B_V5_37, V_TAIL_1, REPEATABLE]);
    expect(result).toContain(REPEATABLE);
  });

  it('returns an empty slice for an empty input', () => {
    expect(selectMigrationSlice([])).toEqual([]);
  });
});

describe('selectMigrationSlice — existing-DB upgrade (currentVersion)', () => {
  const ALL = [B_V3, B_V4, B_V5_0, B_V5_37, V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE, NON_MIGRATION_1];

  it('upgrades from below a baseline by including the intermediate versioned migrations (no baseline)', () => {
    // DB at a version BEFORE V_SUBSUMED (e.g. v5.35), with a v5.37 baseline present.
    // The v5.36 file (V_SUBSUMED) MUST be fetched — it would be wrongly skipped by the
    // baseline floor. No B file is fetched; Skyway never applies one to an existing DB.
    const result = selectMigrationSlice(ALL, '202605150000');
    expect(sorted(result)).toEqual(sorted([V_SUBSUMED, V_TAIL_1, V_TAIL_2, REPEATABLE]));
    expect(result).not.toContain(B_V5_37);
  });

  it('selects only versioned migrations strictly after the current version', () => {
    // DB already at V_TAIL_1's version → only V_TAIL_2 (and repeatables) are newer.
    const result = selectMigrationSlice(ALL, '202605250000');
    expect(sorted(result)).toEqual(sorted([V_TAIL_2, REPEATABLE]));
    expect(result).not.toContain(V_TAIL_1);
  });

  it('returns only repeatables when the DB is already at or beyond the target', () => {
    const result = selectMigrationSlice(ALL, '202701010000');
    expect(result).toEqual([REPEATABLE]);
  });

  it('never includes baseline files for an existing DB, even below the baseline', () => {
    const result = selectMigrationSlice(ALL, '202600000000');
    expect(result.some((p) => p.includes('/B'))).toBe(false);
  });
});

describe('resolveGitRef', () => {
  it('maps a bare semantic version to a v-prefixed release tag', () => {
    expect(resolveGitRef('2.123.0')).toBe('v2.123.0');
  });

  it('leaves an already v-prefixed semantic version unchanged', () => {
    expect(resolveGitRef('v2.123.0')).toBe('v2.123.0');
  });

  it('treats non-semver values as branch names', () => {
    expect(resolveGitRef('main')).toBe('main');
    expect(resolveGitRef('next')).toBe('next');
  });
});
