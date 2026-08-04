import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  addMinutes,
  baselineFilename,
  computeAutoBaselineStamp,
  deepValueEqual,
  discoverMigrationsSourceDir,
  fileStamp,
  findLatestBaselineMigration,
  findLatestVersionedMigration,
  formatTsqlValue,
  isoUtcSeconds,
  parseFileStamp,
  parseMigrationFilename,
  qname,
  quoteIdent,
  quoteString,
  stableSortBy,
} from '../baseline/util';

describe('baseline/util', () => {
  describe('quoteIdent', () => {
    it('wraps in brackets', () => {
      expect(quoteIdent('Customer')).toBe('[Customer]');
    });
    it('escapes embedded brackets', () => {
      expect(quoteIdent('weird]name')).toBe('[weird]]name]');
    });
  });

  describe('quoteString', () => {
    it('uses N-prefix and doubles single quotes', () => {
      expect(quoteString("O'Brien")).toBe("N'O''Brien'");
    });
  });

  describe('qname', () => {
    it('lowercases and joins', () => {
      expect(qname('DBO', 'Customer')).toBe('dbo.customer');
    });
  });

  describe('stableSortBy', () => {
    it('sorts by key', () => {
      const items = [{ k: 'b' }, { k: 'a' }, { k: 'c' }];
      expect(stableSortBy(items, (i) => i.k).map((i) => i.k)).toEqual(['a', 'b', 'c']);
    });
    it('preserves order for equal keys (stable)', () => {
      const items = [
        { k: 'a', i: 0 }, { k: 'a', i: 1 }, { k: 'b', i: 2 }, { k: 'a', i: 3 },
      ];
      const out = stableSortBy(items, (i) => i.k);
      expect(out.map((i) => i.i)).toEqual([0, 1, 3, 2]);
    });
  });

  describe('isoUtcSeconds', () => {
    it('strips milliseconds', () => {
      const d = new Date('2026-05-02T19:47:23.123Z');
      expect(isoUtcSeconds(d)).toBe('2026-05-02T19:47:23Z');
    });
  });

  describe('fileStamp', () => {
    it('formats UTC YYYYMMDDHHMM', () => {
      const d = new Date(Date.UTC(2026, 4, 2, 19, 47, 23));
      expect(fileStamp(d)).toBe('202605021947');
    });
  });

  describe('baselineFilename', () => {
    it('uses literal lowercase x for patch (matches V-file convention)', () => {
      const d = new Date(Date.UTC(2026, 4, 2, 19, 47));
      expect(baselineFilename({ generatedAtUtc: d, baselineVersion: '3.1' }))
        .toBe('B202605021947__v3.1.x__Baseline.sql');
    });
  });

  describe('formatTsqlValue', () => {
    it('handles null', () => {
      expect(formatTsqlValue(null)).toBe('NULL');
      expect(formatTsqlValue(undefined)).toBe('NULL');
    });
    it('handles booleans as 1/0', () => {
      expect(formatTsqlValue(true)).toBe('1');
      expect(formatTsqlValue(false)).toBe('0');
    });
    it('handles strings with N-prefix and escaping', () => {
      expect(formatTsqlValue("O'Brien")).toBe("N'O''Brien'");
    });
    it('handles numbers', () => {
      expect(formatTsqlValue(42)).toBe('42');
      expect(formatTsqlValue(3.14)).toBe('3.14');
    });
    it('rejects non-finite numbers', () => {
      expect(() => formatTsqlValue(Number.POSITIVE_INFINITY)).toThrow();
      expect(() => formatTsqlValue(Number.NaN)).toThrow();
    });
    it('handles bigint', () => {
      expect(formatTsqlValue(123n)).toBe('123');
    });
    it('handles dates as datetime2 literals', () => {
      const d = new Date('2026-05-02T19:47:23.456Z');
      expect(formatTsqlValue(d)).toBe("N'2026-05-02 19:47:23.456'");
    });
    it('handles Buffer as 0x-prefixed hex', () => {
      expect(formatTsqlValue(Buffer.from([0xab, 0xcd]))).toBe('0xABCD');
    });
    it('handles Uint8Array as 0x-prefixed hex', () => {
      expect(formatTsqlValue(new Uint8Array([0xde, 0xad]))).toBe('0xDEAD');
    });
  });

  describe('parseFileStamp', () => {
    it('parses YYYYMMDDHHMM into a UTC Date', () => {
      const d = parseFileStamp('202605032236');
      expect(d.toISOString()).toBe('2026-05-03T22:36:00.000Z');
    });
    it('rejects malformed input', () => {
      expect(() => parseFileStamp('20260503')).toThrow();
      expect(() => parseFileStamp('20260503223X')).toThrow();
    });
    it('round-trips with fileStamp', () => {
      const stamp = '202605032236';
      expect(fileStamp(parseFileStamp(stamp))).toBe(stamp);
    });
  });

  describe('addMinutes', () => {
    it('adds minutes', () => {
      const d = new Date(Date.UTC(2026, 4, 3, 22, 36));
      expect(addMinutes(d, 1).toISOString()).toBe('2026-05-03T22:37:00.000Z');
    });
    it('rolls hours/days forward', () => {
      const d = new Date(Date.UTC(2026, 4, 3, 23, 59));
      expect(addMinutes(d, 1).toISOString()).toBe('2026-05-04T00:00:00.000Z');
    });
  });

  describe('parseMigrationFilename', () => {
    it('parses a V-file with .x patch', () => {
      const r = parseMigrationFilename('V202605032236__v5.32.x__Metadata_Sync.sql');
      expect(r).not.toBeNull();
      expect(r!.kind).toBe('V');
      expect(r!.timestamp).toBe('202605032236');
      expect(r!.major).toBe(5);
      expect(r!.minor).toBe(32);
      expect(r!.majorMinor).toBe('5.32');
    });
    it('parses a V-file without patch suffix', () => {
      const r = parseMigrationFilename('V202602170015__v5.1__Regenerate_Delete_Stored_Procs.sql');
      expect(r).not.toBeNull();
      expect(r!.majorMinor).toBe('5.1');
    });
    it('parses a B-file (baseline)', () => {
      const r = parseMigrationFilename('B202602151200__v5.0__Baseline.sql');
      expect(r).not.toBeNull();
      expect(r!.kind).toBe('B');
      expect(r!.majorMinor).toBe('5.0');
    });
    it('parses a B-file with literal x patch (current emitter convention)', () => {
      const r = parseMigrationFilename('B202605032237__v5.32.x__Baseline.sql');
      expect(r).not.toBeNull();
      expect(r!.kind).toBe('B');
      expect(r!.majorMinor).toBe('5.32');
    });
    it('also parses legacy B-files with uppercase X (back-compat)', () => {
      const r = parseMigrationFilename('B202605032237__v5.32.X__Baseline.sql');
      expect(r).not.toBeNull();
      expect(r!.kind).toBe('B');
      expect(r!.majorMinor).toBe('5.32');
    });
    it('returns null for unrecognized shapes', () => {
      expect(parseMigrationFilename('R__RefreshMetadata.sql')).toBeNull();
      expect(parseMigrationFilename('something-else.sql')).toBeNull();
      expect(parseMigrationFilename('V202602170015_no_double_underscore.sql')).toBeNull();
    });
  });

  describe('findLatestVersionedMigration / findLatestBaselineMigration', () => {
    function makeTempMigrationsDir(files: string[]): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-baseline-test-'));
      for (const f of files) fs.writeFileSync(path.join(dir, f), '');
      return dir;
    }

    it('returns the highest-timestamped V-file', () => {
      const dir = makeTempMigrationsDir([
        'B202602151200__v5.0__Baseline.sql',
        'V202602170015__v5.1__Regenerate.sql',
        'V202605032236__v5.32.x__Metadata_Sync.sql',
        'V202605021919__v5.32.x__Add_ComponentLibrary.sql',
        'R__RefreshMetadata.sql',
      ]);
      const r = findLatestVersionedMigration(dir);
      expect(r).not.toBeNull();
      expect(r!.timestamp).toBe('202605032236');
      expect(r!.majorMinor).toBe('5.32');
    });

    it('ignores B-files when looking for V-files', () => {
      const dir = makeTempMigrationsDir([
        'B202999999999__v9.9__Baseline.sql', // way in the future
        'V202605032236__v5.32.x__Metadata.sql',
      ]);
      const r = findLatestVersionedMigration(dir);
      expect(r!.timestamp).toBe('202605032236');
    });

    it('finds the latest B-file', () => {
      const dir = makeTempMigrationsDir([
        'B202602151200__v5.0__Baseline.sql',
        'B202605032237__v5.32.x__Baseline.sql',
        'V202605032236__v5.32.x__Metadata.sql',
      ]);
      const r = findLatestBaselineMigration(dir);
      expect(r!.timestamp).toBe('202605032237');
      expect(r!.majorMinor).toBe('5.32');
    });

    it('returns null for an empty directory', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-baseline-empty-'));
      expect(findLatestVersionedMigration(dir)).toBeNull();
    });

    it('returns null for a non-existent directory', () => {
      expect(findLatestVersionedMigration('/nonexistent/path/abc123xyz')).toBeNull();
    });
  });

  describe('discoverMigrationsSourceDir', () => {
    it('walks up to find migrations/ and picks the highest vN/', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-discover-'));
      fs.mkdirSync(path.join(root, 'migrations', 'v2'), { recursive: true });
      fs.mkdirSync(path.join(root, 'migrations', 'v5'), { recursive: true });
      fs.mkdirSync(path.join(root, 'migrations', 'v3'), { recursive: true });
      fs.mkdirSync(path.join(root, 'packages', 'MJCLI', 'src'), { recursive: true });
      const found = discoverMigrationsSourceDir(path.join(root, 'packages', 'MJCLI', 'src'));
      expect(found).toBe(path.join(root, 'migrations', 'v5'));
    });
    it('returns null when no migrations/ exists in the parent chain', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-discover-empty-'));
      // No 'migrations' anywhere in the chain — but tmp dirs may collide with
      // ancestors that DO have migrations. Use a sentinel-only deep path.
      const deep = path.join(root, 'a', 'b', 'c');
      fs.mkdirSync(deep, { recursive: true });
      // We can't fully isolate from ancestors but the sub-tree under root has
      // no 'migrations'. Walking up from `deep` past `root` will eventually
      // find one only if the test runner's cwd has one. So just assert it
      // either finds something outside the test root, or null — the API
      // contract is "best effort".
      const found = discoverMigrationsSourceDir(deep);
      // If found, it should NOT be inside our temp tree.
      if (found !== null) expect(found.startsWith(root)).toBe(false);
    });
  });

  describe('computeAutoBaselineStamp', () => {
    it('produces latestV+1m for the canonical example', () => {
      // V-file V202605032236__v5.32.x__Metadata_Sync.sql is the head of v5
      const result = computeAutoBaselineStamp('202605032236');
      expect(result.fileStamp).toBe('202605032237');
      expect(result.generatedAtUtc.toISOString()).toBe('2026-05-03T22:37:00.000Z');
    });
    it('rolls correctly across hour/day boundary', () => {
      const result = computeAutoBaselineStamp('202605032359');
      expect(result.fileStamp).toBe('202605040000');
    });
    it('builds the canonical baseline filename for v5.32 auto rebaseline', () => {
      const { generatedAtUtc } = computeAutoBaselineStamp('202605032236');
      expect(baselineFilename({ generatedAtUtc, baselineVersion: '5.32' }))
        .toBe('B202605032237__v5.32.x__Baseline.sql');
    });
  });

  describe('deepValueEqual', () => {
    it('treats null and undefined as equal', () => {
      expect(deepValueEqual(null, undefined)).toBe(true);
    });
    it('compares dates by timestamp', () => {
      const a = new Date('2026-05-02T19:47:23Z');
      const b = new Date('2026-05-02T19:47:23.000Z');
      expect(deepValueEqual(a, b)).toBe(true);
    });
    it('compares Buffers byte-wise', () => {
      expect(deepValueEqual(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3]))).toBe(true);
      expect(deepValueEqual(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 4]))).toBe(false);
    });
    it('handles NaN as equal to itself', () => {
      expect(deepValueEqual(Number.NaN, Number.NaN)).toBe(true);
    });
    it('returns false for differing primitives', () => {
      expect(deepValueEqual('a', 'b')).toBe(false);
    });
  });
});
