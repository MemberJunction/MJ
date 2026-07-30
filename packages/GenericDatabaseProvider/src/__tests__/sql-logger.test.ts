/**
 * Tests for SqlLoggingSessionImpl size-based file splitting (`maxFileSize`).
 *
 * These are written from the EXPECTED behavior of the split feature (see
 * SqlLoggingOptions.maxFileSize): a capture that fits under the limit produces one file at
 * the original path; a capture that exceeds it rotates into ordered `*.partNN.sql` files, each
 * an independent runnable migration, splitting strictly on statement boundaries so no statement
 * is ever torn and none is lost or duplicated.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SqlLoggingSessionImpl } from '../SqlLogger';
import { SqlLoggingOptions } from '../types';

const tmpDirs: string[] = [];

function makeTmpFile(name = 'push.sql'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sqllog-'));
  tmpDirs.push(dir);
  return path.join(dir, name);
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A statement of roughly `padTo` bytes carrying a recoverable marker `VALUES (<i>,`. */
function stmt(i: number, padTo = 100): string {
  return `INSERT INTO T VALUES (${i}, '${'x'.repeat(padTo)}')`;
}

/** Recover the ordered list of statement indices from concatenated part contents. */
function markers(text: string): number[] {
  return [...text.matchAll(/VALUES \((\d+),/g)].map(m => Number(m[1]));
}

async function runSession(filePath: string, options: SqlLoggingOptions, count: number, padTo = 100): Promise<SqlLoggingSessionImpl> {
  const session = new SqlLoggingSessionImpl('test-session', filePath, options);
  await session.initialize();
  for (let i = 0; i < count; i++) {
    await session.logSqlStatement(stmt(i, padTo), undefined, undefined, true);
  }
  await session.dispose();
  return session;
}

describe('SqlLoggingSessionImpl — maxFileSize splitting', () => {
  it('does NOT split when output fits under the limit — one file at the original path', async () => {
    const filePath = makeTmpFile();
    const session = await runSession(filePath, { maxFileSize: 10 * 1024 * 1024 }, 5);

    expect(session.filePaths).toEqual([filePath]);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(filePath.replace(/\.sql$/, '.part01.sql'))).toBe(false);

    const content = fs.readFileSync(filePath, 'utf8');
    expect(markers(content)).toEqual([0, 1, 2, 3, 4]);
    expect(content).toContain('-- SQL Logging Session'); // header
    expect(content).toContain('End of SQL Logging Session'); // footer
    expect(content).not.toContain('-- Part:'); // single file stays neutral
    expect(session.statementCount).toBe(5);
  });

  it('splits into ordered part files, each strictly under the limit, on statement boundaries', async () => {
    const filePath = makeTmpFile();
    const limit = 4000;
    const count = 60;
    const session = await runSession(filePath, { maxFileSize: limit }, count, 100);

    const paths = session.filePaths;
    expect(paths.length).toBeGreaterThan(1);

    // Base path renamed away; every part is a `.partNN.sql`, in order, and exists.
    expect(fs.existsSync(filePath)).toBe(false);
    paths.forEach((p, i) => {
      expect(p).toBe(filePath.replace(/\.sql$/, `.part${String(i + 1).padStart(2, '0')}.sql`));
      expect(fs.existsSync(p)).toBe(true);
    });

    // Each part is genuinely under the limit (the footer-reserve guarantees it, since no single
    // statement here is oversized), and is a self-contained migration (own header + footer).
    for (const p of paths) {
      expect(fs.statSync(p).size).toBeLessThanOrEqual(limit);
      const c = fs.readFileSync(p, 'utf8');
      expect(c).toContain('-- Part:');
      expect(c).toContain('End of SQL Logging Session');
    }

    // No statement torn, lost, duplicated, or reordered across the split.
    const combined = paths.map(p => fs.readFileSync(p, 'utf8')).join('\n');
    expect(markers(combined)).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(session.statementCount).toBe(count);
  });

  it('writes a single over-limit statement whole to one file (cannot split a lone statement)', async () => {
    const filePath = makeTmpFile();
    const session = await runSession(filePath, { maxFileSize: 50 }, 1, 300);

    // First statement is always forced into part 1 regardless of size → never rotated → base name kept.
    expect(session.filePaths).toEqual([filePath]);
    expect(fs.existsSync(filePath.replace(/\.sql$/, '.part01.sql'))).toBe(false);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(markers(content)).toEqual([0]);
    expect(content).toContain("'" + 'x'.repeat(300) + "'"); // whole statement intact
  });

  it('maxFileSize=0 disables splitting (backward compatible)', async () => {
    const filePath = makeTmpFile();
    const session = await runSession(filePath, { maxFileSize: 0 }, 30, 100);

    expect(session.filePaths).toEqual([filePath]);
    expect(markers(fs.readFileSync(filePath, 'utf8'))).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('undefined maxFileSize disables splitting', async () => {
    const filePath = makeTmpFile();
    const session = await runSession(filePath, {}, 30, 100);
    expect(session.filePaths).toEqual([filePath]);
    expect(fs.statSync(filePath).size).toBeGreaterThan(0);
  });

  it('empty session reports [filePath] and deletes the empty file', async () => {
    const filePath = makeTmpFile();
    const session = new SqlLoggingSessionImpl('empty', filePath, { maxFileSize: 1000 });
    await session.initialize();
    await session.dispose();

    expect(session.filePaths).toEqual([filePath]);
    expect(fs.existsSync(filePath)).toBe(false); // retainEmptyLogFiles defaults false
    expect(session.statementCount).toBe(0);
  });

  it('with a GO batch separator, no rotated part begins with a stray leading GO', async () => {
    const filePath = makeTmpFile();
    const session = await runSession(filePath, { maxFileSize: 3000, batchSeparator: 'GO' }, 40, 100);
    const paths = session.filePaths;
    expect(paths.length).toBeGreaterThan(1);

    for (const p of paths) {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      // Find the first non-empty, non-comment line — it must be SQL, never a leftover GO from
      // the previous part's batch (each part starts a fresh SQL Server batch).
      const firstCode = lines.find(l => l.trim() !== '' && !l.trim().startsWith('--'));
      expect(firstCode?.trim()).not.toBe('GO');
    }
    // Statements still fully preserved across the GO-separated split.
    const combined = paths.map(p => fs.readFileSync(p, 'utf8')).join('\n');
    expect(markers(combined)).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it('splits a >90 MiB capture at production scale, keeping every part under the 90 MiB limit', async () => {
    const filePath = makeTmpFile();
    const limit = 90 * 1024 * 1024; // ≈ the shipping default (DEFAULT_SQL_LOG_MAX_FILE_SIZE)
    // ~100 KiB per statement × 960 ≈ 96 MiB total → must roll over into multiple parts.
    const count = 960;
    const session = new SqlLoggingSessionImpl('big', filePath, { maxFileSize: limit });
    await session.initialize();
    for (let i = 0; i < count; i++) {
      await session.logSqlStatement(stmt(i, 100 * 1024), undefined, undefined, true);
    }
    await session.dispose();

    const paths = session.filePaths;
    expect(paths.length).toBeGreaterThan(1); // genuinely split at the 90 MiB limit
    for (const p of paths) {
      // Every part is strictly under the limit (no lone statement exceeds it here).
      expect(fs.statSync(p).size).toBeLessThanOrEqual(limit);
    }
    // No statement lost, duplicated, torn, or reordered across the 90 MiB-boundary split.
    const combined = paths.map(p => fs.readFileSync(p, 'utf8')).join('\n');
    expect(markers(combined)).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(session.statementCount).toBe(count);
  }, 30000);
});
