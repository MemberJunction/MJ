import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateParityReport } from '../rules/ParityReporter.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ParityReporter', () => {
  let tmpDir: string;
  let tsqlDir: string;
  let pgDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'parity-test-'));
    tsqlDir = join(tmpDir, 'tsql');
    pgDir = join(tmpDir, 'pg');
    mkdirSync(tsqlDir);
    mkdirSync(pgDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should report full parity when PG has all T-SQL counterparts', () => {
    writeFileSync(join(tsqlDir, 'V202604010000__v5.0.x__Foo.sql'), 'SELECT 1;');
    writeFileSync(join(tsqlDir, 'V202604020000__v5.0.x__Bar.sql'), 'SELECT 1;');
    writeFileSync(join(pgDir, 'V202604010000__v5.0.x__Foo.pg.sql'), 'SELECT 1;');
    writeFileSync(join(pgDir, 'V202604020000__v5.0.x__Bar.pg.sql'), 'SELECT 1;');

    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.parity).toBe(true);
    expect(report.gaps).toHaveLength(0);
    expect(report.coveragePercent).toBe(100);
    expect(report.counts.tsql.versioned).toBe(2);
    expect(report.counts.pg.versioned).toBe(2);
  });

  it('should detect gaps when PG is missing migrations', () => {
    writeFileSync(join(tsqlDir, 'V202604010000__v5.0.x__Foo.sql'), 'SELECT 1;');
    writeFileSync(join(tsqlDir, 'V202604020000__v5.1.x__Bar.sql'), 'SELECT 1;');
    writeFileSync(join(pgDir, 'V202604010000__v5.0.x__Foo.pg.sql'), 'SELECT 1;');
    // V202604020000 missing from PG

    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.parity).toBe(false);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].tsqlFile).toContain('Bar');
    expect(report.gaps[0].version).toBe('5.1.x');
    expect(report.coveragePercent).toBe(50);
  });

  it('should count baselines, versioned, and repeatable separately', () => {
    writeFileSync(join(tsqlDir, 'B202602151200__v5.0__Baseline.sql'), 'SELECT 1;');
    writeFileSync(join(tsqlDir, 'V202604010000__v5.0.x__Foo.sql'), 'SELECT 1;');
    writeFileSync(join(tsqlDir, 'R__RefreshMetadata.sql'), 'SELECT 1;');
    writeFileSync(join(pgDir, 'B202602151200__v5.0__Baseline.pg.sql'), 'SELECT 1;');
    writeFileSync(join(pgDir, 'V202604010000__v5.0.x__Foo.pg.sql'), 'SELECT 1;');

    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.counts.tsql.baseline).toBe(1);
    expect(report.counts.tsql.versioned).toBe(1);
    expect(report.counts.tsql.repeatable).toBe(1);
    expect(report.counts.pg.baseline).toBe(1);
    expect(report.counts.pg.versioned).toBe(1);
  });

  it('should recognize pg-only files as covering their T-SQL counterpart', () => {
    writeFileSync(join(tsqlDir, 'V202604010000__v5.0.x__Foo.sql'), 'SELECT 1;');
    writeFileSync(join(pgDir, 'V202604010000__v5.0.x__Foo.pg-only.sql'), 'SELECT 1;');

    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.parity).toBe(true);
    expect(report.pgOnlyFiles).toHaveLength(1);
    expect(report.pgOnlyFiles[0]).toContain('pg-only');
  });

  it('should handle empty directories', () => {
    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.parity).toBe(true);
    expect(report.coveragePercent).toBe(100);
    expect(report.counts.tsql.total).toBe(0);
    expect(report.counts.pg.total).toBe(0);
  });

  it('should handle non-existent directories', () => {
    const report = generateParityReport('/nonexistent/tsql', '/nonexistent/pg');
    expect(report.parity).toBe(true);
    expect(report.coveragePercent).toBe(100);
  });

  it('should include timestamp in ISO format', () => {
    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should extract version from filenames correctly', () => {
    writeFileSync(join(tsqlDir, 'V202604060452__v5.24.x__KnowledgeHub.sql'), 'SELECT 1;');
    // No PG counterpart

    const report = generateParityReport(tsqlDir, pgDir);
    expect(report.gaps[0].version).toBe('5.24.x');
  });
});
