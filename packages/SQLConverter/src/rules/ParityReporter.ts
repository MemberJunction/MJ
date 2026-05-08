/**
 * Phase C3: Parity Report Generator
 *
 * Generates a machine-readable JSON report comparing T-SQL and PostgreSQL
 * migration coverage. Consumable by CI, dashboards, and developer tooling.
 *
 * Usage:
 *   import { generateParityReport } from './ParityReporter.js';
 *   const report = generateParityReport('./migrations/v5', './migrations-pg/v5');
 *   // report.parity === true means every T-SQL migration has a PG counterpart
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationFileInfo {
  filename: string;
  version: string;
  description: string;
  type: 'baseline' | 'versioned' | 'repeatable' | 'pg-only';
  sizeBytes: number;
}

export interface ParityGap {
  /** T-SQL migration filename that has no PG counterpart */
  tsqlFile: string;
  /** Extracted MJ version (e.g., "5.12.x") */
  version: string;
}

export interface ParityReport {
  /** ISO timestamp of report generation */
  timestamp: string;
  /** Source directories scanned */
  directories: { tsql: string; pg: string };
  /** Migration file counts */
  counts: {
    tsql: { baseline: number; versioned: number; repeatable: number; total: number };
    pg: { baseline: number; versioned: number; repeatable: number; pgOnly: number; total: number };
  };
  /** T-SQL migrations without PG counterparts */
  gaps: ParityGap[];
  /** PG-only migrations (no T-SQL equivalent — intentional PG-specific fixes) */
  pgOnlyFiles: string[];
  /** Whether every T-SQL migration has a PG counterpart */
  parity: boolean;
  /** Coverage percentage (PG versioned / T-SQL versioned × 100) */
  coveragePercent: number;
}

function classifyFile(filename: string): MigrationFileInfo['type'] {
  if (filename.endsWith('.pg-only.sql')) return 'pg-only';
  if (filename.startsWith('B')) return 'baseline';
  if (filename.startsWith('R')) return 'repeatable';
  return 'versioned';
}

function extractVersion(filename: string): string {
  const match = filename.match(/__v(\d+\.\d+(?:\.\w+)?)__/);
  return match ? match[1] : 'unknown';
}

function extractDescription(filename: string): string {
  const match = filename.match(/__v[\d.]+\w*__(.+?)(?:\.pg)?(?:\.pg-only)?\.sql$/);
  return match ? match[1].replace(/_/g, ' ') : filename;
}

function scanDirectory(dir: string): MigrationFileInfo[] {
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({
        filename: f,
        version: extractVersion(f),
        description: extractDescription(f),
        type: classifyFile(f),
        sizeBytes: statSync(join(dir, f)).size,
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
  } catch {
    return [];
  }
}

/**
 * Generates a parity report comparing T-SQL and PG migration directories.
 */
export function generateParityReport(tsqlDir: string, pgDir: string): ParityReport {
  const tsqlFiles = scanDirectory(tsqlDir);
  const pgFiles = scanDirectory(pgDir);

  const tsqlBaselines = tsqlFiles.filter(f => f.type === 'baseline');
  const tsqlVersioned = tsqlFiles.filter(f => f.type === 'versioned');
  const tsqlRepeatable = tsqlFiles.filter(f => f.type === 'repeatable');

  const pgBaselines = pgFiles.filter(f => f.type === 'baseline');
  const pgVersioned = pgFiles.filter(f => f.type === 'versioned');
  const pgRepeatable = pgFiles.filter(f => f.type === 'repeatable');
  const pgOnly = pgFiles.filter(f => f.type === 'pg-only');

  // Build set of PG base names (strip .pg.sql / .pg-only.sql suffixes)
  const pgBases = new Set(
    pgFiles
      .filter(f => f.type === 'versioned' || f.type === 'pg-only')
      .map(f => f.filename.replace(/\.pg\.sql$/, '').replace(/\.pg-only\.sql$/, ''))
  );

  // Find gaps: T-SQL V-migrations without a PG counterpart
  const gaps: ParityGap[] = tsqlVersioned
    .filter(f => !pgBases.has(f.filename.replace(/\.sql$/, '')))
    .map(f => ({ tsqlFile: f.filename, version: f.version }));

  const coveragePercent = tsqlVersioned.length > 0
    ? Math.round(((tsqlVersioned.length - gaps.length) / tsqlVersioned.length) * 100)
    : 100;

  return {
    timestamp: new Date().toISOString(),
    directories: { tsql: tsqlDir, pg: pgDir },
    counts: {
      tsql: {
        baseline: tsqlBaselines.length,
        versioned: tsqlVersioned.length,
        repeatable: tsqlRepeatable.length,
        total: tsqlFiles.length,
      },
      pg: {
        baseline: pgBaselines.length,
        versioned: pgVersioned.length,
        repeatable: pgRepeatable.length,
        pgOnly: pgOnly.length,
        total: pgFiles.length,
      },
    },
    gaps,
    pgOnlyFiles: pgOnly.map(f => f.filename),
    parity: gaps.length === 0,
    coveragePercent,
  };
}
