/**
 * Phase C2: v5 Migration Regression Test Suite
 *
 * Validates that the full v5 T-SQL migration set converts to PostgreSQL
 * without errors and produces correct output. These tests run WITHOUT
 * a database — they verify conversion correctness only.
 *
 * For integration tests that apply migrations to a real PG instance,
 * see scripts/test-pg-ci-flow.mjs.
 */

import { describe, it, expect } from 'vitest';
import { convertFile, getRulesForDialects, deduplicateEntityFieldSequences } from '../rules/index.js';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations', 'v5');
const PG_MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations-pg', 'v5');

// Only run these tests if the migration directories exist (they won't in isolated CI without checkout)
const hasMigrations = (() => {
  try { return readdirSync(MIGRATIONS_DIR).length > 0; }
  catch { return false; }
})();

const hasPGMigrations = (() => {
  try { return readdirSync(PG_MIGRATIONS_DIR).length > 0; }
  catch { return false; }
})();

// Heavy converter loops (each runs 107 conversions, including the 13 MB
// V202604131200__v5.25.x__Metadata_Sync.sql which alone takes ~220 s).
// They are valuable for local development but redundant on CI: the
// `pg-migrations.yml` workflow already runs the same conversion against every
// T-SQL file (Step 3) and applies the result to a fresh PG (Step 5). Skipping
// these in CI keeps the unit-test job under its 30-min timeout. Set
// CI_HEAVY_REGRESSION=true to opt back in (e.g. nightly).
const SKIP_HEAVY_IN_CI = process.env.CI === 'true' && process.env.CI_HEAVY_REGRESSION !== 'true';

describe.skipIf(!hasMigrations)('v5 migration regression — conversion', () => {
  const rules = getRulesForDialects('tsql', 'postgres');
  const tsqlFiles = hasMigrations
    ? readdirSync(MIGRATIONS_DIR).filter(f => f.startsWith('V') && f.endsWith('.sql')).sort()
    : [];

  it('should have conversion rules loaded', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('should find T-SQL V-migration files', () => {
    expect(tsqlFiles.length).toBeGreaterThan(30);
  });

  /**
   * Files where the converter intentionally classifies all batches as
   * SKIP_SQLSERVER (e.g. CodeGen-bootstrap SPs with temp tables and table
   * variables that have no clean PG equivalent). With IncludeHeader:false,
   * those files produce a null OutputSQL — the test would fail even though
   * "skip the whole file" is the correct behavior. Each entry here MUST have
   * a tracked follow-up to either hand-port the file or add a converter rule.
   *
   * TODO(v5.30.1): hand-port Scoped_EntityField_SPs (CodeGen Pass-2 perf
   * optimization adding optional @EntityIDs scoping; needs CTE + array
   * unnest replacement for SQL Server temp tables and table variables).
   */
  const ALL_SKIP_SQLSERVER_FILES = new Set<string>([
    'V202604261352__v5.30.x__Scoped_EntityField_SPs.sql',
  ]);

  describe.skipIf(SKIP_HEAVY_IN_CI)('every T-SQL migration converts without error', () => {
    for (const file of tsqlFiles) {
      // V202604131200__v5.25.x__Metadata_Sync.sql is ~13 MB and takes ~220s to
      // convert. A single per-case timeout is simpler than branching per file.
      it(`converts: ${file}`, () => {
        const result = convertFile({
          Source: join(MIGRATIONS_DIR, file),
          SourceIsFile: true,
          Rules: rules,
          IncludeHeader: false,
        });
        if (ALL_SKIP_SQLSERVER_FILES.has(file)) {
          // Documented all-SKIP file — converter correctly returns null output.
          // Don't gate the suite on a file we explicitly chose to hand-port.
          return;
        }
        expect(result.OutputSQL).toBeTruthy();
        expect(result.OutputSQL.length).toBeGreaterThan(0);
      }, 600_000);
    }
  });

  // Loops through every T-SQL file; dominated by the 13 MB metadata_sync convert.
  it.skipIf(SKIP_HEAVY_IN_CI)('should produce output with zero TODO markers', () => {
    let totalTodos = 0;
    for (const file of tsqlFiles) {
      const result = convertFile({
        Source: join(MIGRATIONS_DIR, file),
        SourceIsFile: true,
        Rules: rules,
        IncludeHeader: false,
      });
      const todos = (result.OutputSQL.match(/-- TODO/g) || []).length;
      totalTodos += todos;
    }
    expect(totalTodos).toBe(0);
  }, 600_000);
});

describe.skipIf(!hasMigrations || SKIP_HEAVY_IN_CI)('v5 migration regression — sequence deduplication', () => {
  // Converts all 84 T-SQL files to a tmp dir, then runs dedup. Dominated by
  // the 13 MB metadata_sync file (~220s).
  it('should detect and fix sequence collisions in converted output', () => {
    const rules = getRulesForDialects('tsql', 'postgres');
    const tmpDir = mkdtempSync(join(tmpdir(), 'pg-regression-'));
    const tsqlFiles = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.startsWith('V') && f.endsWith('.sql'))
      .sort();

    // Convert all to temp dir
    for (const file of tsqlFiles) {
      try {
        convertFile({
          Source: join(MIGRATIONS_DIR, file),
          SourceIsFile: true,
          OutputFile: join(tmpDir, file.replace(/\.sql$/, '.pg.sql')),
          Rules: rules,
          IncludeHeader: false,
        });
      } catch { /* some may fail — that's OK for this test */ }
    }

    // Run dedup
    const result = deduplicateEntityFieldSequences(tmpDir, false);
    expect(result.totalInserts).toBeGreaterThan(0);

    // Verify idempotent — second run should find zero collisions
    const verify = deduplicateEntityFieldSequences(tmpDir, true);
    expect(verify.totalCollisions).toBe(0);

    rmSync(tmpDir, { recursive: true, force: true });
  }, 600_000);
});

describe.skipIf(!hasPGMigrations)('v5 migration regression — committed PG files', () => {
  const pgFiles = hasPGMigrations
    ? readdirSync(PG_MIGRATIONS_DIR).filter(f => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql')).sort()
    : [];

  it('should have at least one PG migration file', () => {
    // With the v5.30 baseline approach, the baseline alone is sufficient — historical
    // V-files have been removed since their content is in the baseline. This check
    // just ensures migrations-pg/v5/ isn't empty.
    expect(pgFiles.length).toBeGreaterThan(0);
  });

  it('should have a baseline migration', () => {
    const baselines = pgFiles.filter(f => f.startsWith('B'));
    expect(baselines.length).toBeGreaterThan(0);
  });

  // The migrations PR (`pg-migration-files` branch) has rewritten all 50
  // affected files to be managed-PG safe — no pg_cast UPDATE, BOOLEAN values
  // use TRUE/FALSE directly. This main repo branch still has the legacy ~40
  // files inherited from origin/next, which the migrations PR will replace on
  // merge.
  //
  // Until the merge, exempt the legacy v5.0–v5.11 files explicitly so the gate
  // still catches *new* conversions that introduce pg_cast. After both PRs
  // merge to next, this exemption set should be deleted along with this comment.
  // Older v5.1–v5.4 filenames use `__v5.1__` (no `.x` suffix); v5.5+ use `__v5.8.x__`.
  // Allow either `_` or `.` after the version digits.
  // Timestamp is 12 digits (YYYYMMDDHHMM); after "20260[23]" we have 6 more.
  const PG_CAST_LEGACY_EXEMPTIONS = /^V20260[23]\d{6}__v5\.(11|10|[1-9])[._]/;
  it('should not contain pg_cast manipulation (breaks managed PG)', () => {
    for (const file of pgFiles) {
      const content = readFileSync(join(PG_MIGRATIONS_DIR, file), 'utf-8');
      const hasPgCast = content.includes('UPDATE pg_cast SET castcontext');
      if (hasPgCast) {
        const isLegacy = file.startsWith('B') || file.includes('v5.0.x') || file.includes('v5.0__');
        const isPgCastDebt = PG_CAST_LEGACY_EXEMPTIONS.test(file);
        if (!isLegacy && !isPgCastDebt) {
          expect.fail(`${file} contains pg_cast manipulation — should have been stripped by converter`);
        }
      }
    }
  });

  it('should not contain T-SQL syntax in non-legacy files', () => {
    const nonLegacy = pgFiles.filter(f => !f.includes('v5.0.x') && !f.startsWith('B'));
    for (const file of nonLegacy) {
      const content = readFileSync(join(PG_MIGRATIONS_DIR, file), 'utf-8');
      // Check for common T-SQL that shouldn't be in PG output
      expect(content).not.toContain('GETUTCDATE()');
      expect(content).not.toContain('GETDATE()');
      expect(content).not.toContain('SCOPE_IDENTITY()');
      expect(content).not.toContain('[${flyway:defaultSchema}]');
    }
  });

  it.skipIf(SKIP_HEAVY_IN_CI)('should have zero EntityField sequence collisions in committed files', () => {
    // Scans every .pg.sql file — metadata_sync files run 100K+ lines each, so
    // parsing the full set is legitimately slow on cold disk. Skipped on CI by
    // default (gated behind CI_HEAVY_REGRESSION=true) for the same reason as
    // the conversion regression tests above; this keeps the standard unit-test
    // gate fast while preserving full coverage on local dev runs and nightly.
    const result = deduplicateEntityFieldSequences(PG_MIGRATIONS_DIR, true);
    // KNOWN DEBT: V202603042042__v5.8.x__Integration_System.pg.sql contains 2
    // duplicate-EntityField INSERTs guarded by `IF NOT EXISTS` (runtime-idempotent
    // — only the first insert fires). The deduper counts them as collisions
    // because it scans raw VALUES tuples without parsing the surrounding
    // DO $$ ... END $$ guard.
    //
    // Bumping the sequences in that committed file would invalidate Flyway
    // checksums in deployed environments. Tracked for v5.30.1: either teach
    // the deduper to recognize IF NOT EXISTS guards (without breaking the
    // SequenceDeduplicator unit tests, which use the guard pattern in their
    // fixtures and intentionally expect collision detection), or
    // post-process the v5.8 file with a Flyway repair note.
    const KNOWN_LEGACY_COLLISION_BUDGET = 2;
    expect(result.totalCollisions).toBeLessThanOrEqual(KNOWN_LEGACY_COLLISION_BUDGET);
  }, 300_000);

  it('every PG file should be valid UTF-8 with no null bytes', () => {
    for (const file of pgFiles) {
      const content = readFileSync(join(PG_MIGRATIONS_DIR, file), 'utf-8');
      expect(content).not.toContain('\0');
    }
  });
});

// Parity check (every T-SQL V-migration has a committed PG counterpart) was
// moved to scripts/check-pg-migration-parity.mjs. Rationale: turbo runs tests
// in dependency order and stops on first failure, so a parity gap (expected
// any time a T-SQL migration is added before pg-migrate runs) was masking
// every downstream package's test failures. The script is invoked by the
// `pg-migrate` skill and can be wired into pg-migrations.yml directly.
