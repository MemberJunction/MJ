import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedCoreMetadataBooleanColumns } from '../rules/CoreMetadataBooleanColumns';

/**
 * The boolean-column catalog is a hand-maintained mirror of the PG baseline. When it drifts, a
 * bare `UPDATE ... SET "SomeFlag" = 1` converts unchanged and PG rejects it at apply time with
 * "column is of type boolean but expression is of type integer" — a failure that only surfaces
 * when someone runs the migration, not when the converter runs. This test closes that gap by
 * re-deriving the catalog from the baseline and asserting the shipped one covers it.
 */

/** Walk up from this file to the repo root (the directory holding `migrations-pg/`). */
function findRepoRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'migrations-pg'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

/** Newest `B*__Baseline.pg.sql` — filenames are timestamp-prefixed, so lexical order is chronological. */
function newestBaseline(root: string): string | null {
  const dir = join(root, 'migrations-pg', 'v5');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^B\d+__.*__Baseline\.pg\.sql$/.test(f)).sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

/**
 * Parse `CREATE TABLE __mj."X" ( ... )` blocks out of a PG baseline, collecting boolean columns.
 * The type name is matched case-INSENSITIVELY on purpose: pg_dump-style baselines spell it
 * `boolean`, and an uppercase-only match is exactly how this catalog silently went stale before.
 */
function booleanColumnsFromBaseline(sql: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let table: string | null = null;
  for (const line of sql.split('\n')) {
    const create = line.match(/^CREATE TABLE __mj\."([A-Za-z0-9_]+)" \($/);
    if (create) { table = create[1]; continue; }
    if (!table) continue;
    if (/^\);/.test(line)) { table = null; continue; }
    const col = line.match(/^\s+"([A-Za-z0-9_]+)"\s+boolean\b/i);
    if (col) {
      const cols = out.get(table) ?? [];
      cols.push(col[1]);
      out.set(table, cols);
    }
  }
  return out;
}

describe('CoreMetadataBooleanColumns', () => {
  const root = findRepoRoot();
  const baseline = root ? newestBaseline(root) : null;

  it('locates a PG baseline to check against', () => {
    // A packaged install has no migrations-pg/; only assert inside the monorepo.
    if (!root) return;
    expect(baseline).not.toBeNull();
  });

  it('covers every boolean column in the newest PG baseline', () => {
    if (!baseline) return; // published-package context — nothing to compare against

    const expected = booleanColumnsFromBaseline(readFileSync(baseline, 'utf-8'));
    expect(expected.size).toBeGreaterThan(100); // sanity: the parser actually matched something

    const seeded = new Map<string, Map<string, string>>();
    seedCoreMetadataBooleanColumns(seeded);

    const gaps: string[] = [];
    for (const [table, columns] of expected) {
      const have = seeded.get(table.toLowerCase());
      if (!have) { gaps.push(`${table} (whole table missing): ${columns.join(', ')}`); continue; }
      const missing = columns.filter((c) => !have.has(c.toLowerCase()));
      if (missing.length) gaps.push(`${table}: ${missing.join(', ')}`);
    }

    expect(
      gaps,
      `The boolean-column catalog has drifted from ${baseline}. Regenerate it with the awk recipe in ` +
        'CoreMetadataBooleanColumns.ts — note the type match must be case-insensitive.\n  ' +
        gaps.join('\n  ')
    ).toEqual([]);
  });

  it('seeds IntegrationObject with its per-operation CRUD flags', () => {
    const seeded = new Map<string, Map<string, string>>();
    seedCoreMetadataBooleanColumns(seeded);
    const cols = seeded.get('integrationobject');
    expect(cols).toBeDefined();
    for (const flag of ['supportswrite', 'supportscreate', 'supportsupdate', 'supportsdelete']) {
      expect(cols?.get(flag), `IntegrationObject.${flag} must be known-BOOLEAN`).toBe('BOOLEAN');
    }
  });

  it('never overrides a table the migration itself created', () => {
    const seeded = new Map<string, Map<string, string>>([['integrationobject', new Map([['custom', 'INTEGER']])]]);
    seedCoreMetadataBooleanColumns(seeded);
    expect(seeded.get('integrationobject')?.has('supportscreate')).toBe(false);
    expect(seeded.get('integrationobject')?.get('custom')).toBe('INTEGER');
  });
});
