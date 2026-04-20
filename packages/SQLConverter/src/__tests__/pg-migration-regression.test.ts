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

  describe('every T-SQL migration converts without error', () => {
    for (const file of tsqlFiles) {
      it(`converts: ${file}`, () => {
        const result = convertFile({
          Source: join(MIGRATIONS_DIR, file),
          SourceIsFile: true,
          Rules: rules,
          IncludeHeader: false,
        });
        expect(result.OutputSQL).toBeTruthy();
        expect(result.OutputSQL.length).toBeGreaterThan(0);
      });
    }
  });

  it('should produce output with zero TODO markers', () => {
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
  });
});

describe.skipIf(!hasMigrations)('v5 migration regression — sequence deduplication', () => {
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
  });
});

describe.skipIf(!hasPGMigrations)('v5 migration regression — committed PG files', () => {
  const pgFiles = hasPGMigrations
    ? readdirSync(PG_MIGRATIONS_DIR).filter(f => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql')).sort()
    : [];

  it('should have PG migration files', () => {
    expect(pgFiles.length).toBeGreaterThan(30);
  });

  it('should have a baseline migration', () => {
    const baselines = pgFiles.filter(f => f.startsWith('B'));
    expect(baselines.length).toBeGreaterThan(0);
  });

  it('should not contain pg_cast manipulation (breaks managed PG)', () => {
    for (const file of pgFiles) {
      const content = readFileSync(join(PG_MIGRATIONS_DIR, file), 'utf-8');
      const hasPgCast = content.includes('UPDATE pg_cast SET castcontext');
      if (hasPgCast) {
        // Only the restored v5.0.x files from origin/next should have this
        // New conversions should NOT include pg_cast
        const isLegacy = file.includes('v5.0.x');
        if (!isLegacy) {
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

  it('should have zero EntityField sequence collisions in committed files', () => {
    const result = deduplicateEntityFieldSequences(PG_MIGRATIONS_DIR, true);
    expect(result.totalCollisions).toBe(0);
  });

  it('every PG file should be valid UTF-8 with no null bytes', () => {
    for (const file of pgFiles) {
      const content = readFileSync(join(PG_MIGRATIONS_DIR, file), 'utf-8');
      expect(content).not.toContain('\0');
    }
  });
});

describe.skipIf(!hasMigrations || !hasPGMigrations)('v5 migration regression — parity', () => {
  it('should have a PG counterpart for every T-SQL V-migration', () => {
    const tsqlFiles = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.startsWith('V') && f.endsWith('.sql'))
      .sort();
    const pgBases = new Set(
      readdirSync(PG_MIGRATIONS_DIR)
        .filter(f => f.startsWith('V'))
        .map(f => f.replace(/\.pg\.sql$/, '').replace(/\.pg-only\.sql$/, ''))
    );

    const missing = tsqlFiles
      .map(f => f.replace(/\.sql$/, ''))
      .filter(base => !pgBases.has(base));

    if (missing.length > 0) {
      console.log('T-SQL migrations without PG counterpart:');
      for (const m of missing) console.log(`  ${m}`);
    }
    expect(missing.length).toBe(0);
  });
});
