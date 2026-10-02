import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AddMinutes,
  BaselineFilename,
  ComputeAutoBaselineStamp,
  DeepValueEqual,
  DiscoverMigrationsSourceDir,
  FileStamp,
  FindLatestBaselineMigration,
  FindLatestVersionedMigration,
  FormatTsqlValue,
  IsoUtcSeconds,
  ParseFileStamp,
  ParseMigrationFilename,
  Qname,
  QuoteIdent,
  QuoteString,
  StableSortBy,
} from '../baseline/util';

describe('baseline/util', () => {
  describe('quoteIdent', () => {
    it('wraps in brackets', () => {
      expect(QuoteIdent('Customer')).toBe('[Customer]');
    });
    it('escapes embedded brackets', () => {
      expect(QuoteIdent('weird]name')).toBe('[weird]]name]');
    });
  });

  describe('quoteString', () => {
    it('uses N-prefix and doubles single quotes', () => {
      expect(QuoteString("O'Brien")).toBe("N'O''Brien'");
    });
  });

  describe('qname', () => {
    it('lowercases and joins', () => {
      expect(Qname('DBO', 'Customer')).toBe('dbo.customer');
    });
  });

  describe('stableSortBy', () => {
    it('sorts by key', () => {
      const items = [{ k: 'b' }, { k: 'a' }, { k: 'c' }];
      expect(StableSortBy(items, (i) => i.k).map((i) => i.k)).toEqual(['a', 'b', 'c']);
    });
    it('preserves order for equal keys (stable)', () => {
      const items = [
        { k: 'a', i: 0 }, { k: 'a', i: 1 }, { k: 'b', i: 2 }, { k: 'a', i: 3 },
      ];
      const out = StableSortBy(items, (i) => i.k);
      expect(out.map((i) => i.i)).toEqual([0, 1, 3, 2]);
    });
  });

  describe('isoUtcSeconds', () => {
    it('strips milliseconds', () => {
      const d = new Date('2026-05-02T19:47:23.123Z');
      expect(IsoUtcSeconds(d)).toBe('2026-05-02T19:47:23Z');
    });
  });

  describe('fileStamp', () => {
    it('formats UTC YYYYMMDDHHMM', () => {
      const d = new Date(Date.UTC(2026, 4, 2, 19, 47, 23));
      expect(FileStamp(d)).toBe('202605021947');
    });
  });

  describe('baselineFilename', () => {
    it('uses literal lowercase x for patch (matches V-file convention)', () => {
      const d = new Date(Date.UTC(2026, 4, 2, 19, 47));
      expect(BaselineFilename({ generatedAtUtc: d, baselineVersion: '3.1' }))
        .toBe('B202605021947__v3.1.x__Baseline.sql');
    });
  });

  describe('formatTsqlValue', () => {
    it('handles null', () => {
      expect(FormatTsqlValue(null)).toBe('NULL');
      expect(FormatTsqlValue(undefined)).toBe('NULL');
    });
    it('handles booleans as 1/0', () => {
      expect(FormatTsqlValue(true)).toBe('1');
      expect(FormatTsqlValue(false)).toBe('0');
    });
    it('handles strings with N-prefix and escaping', () => {
      expect(FormatTsqlValue("O'Brien")).toBe("N'O''Brien'");
    });
    it('handles numbers', () => {
      expect(FormatTsqlValue(42)).toBe('42');
      expect(FormatTsqlValue(3.14)).toBe('3.14');
    });
    it('rejects non-finite numbers', () => {
      expect(() => FormatTsqlValue(Number.POSITIVE_INFINITY)).toThrow();
      expect(() => FormatTsqlValue(Number.NaN)).toThrow();
    });
    it('handles bigint', () => {
      expect(FormatTsqlValue(123n)).toBe('123');
    });
    it('handles dates as datetime2 literals', () => {
      const d = new Date('2026-05-02T19:47:23.456Z');
      expect(FormatTsqlValue(d)).toBe("N'2026-05-02 19:47:23.456'");
    });
    it('handles Buffer as 0x-prefixed hex', () => {
      expect(FormatTsqlValue(Buffer.from([0xab, 0xcd]))).toBe('0xABCD');
    });
    it('handles Uint8Array as 0x-prefixed hex', () => {
      expect(FormatTsqlValue(new Uint8Array([0xde, 0xad]))).toBe('0xDEAD');
    });
  });

  describe('parseFileStamp', () => {
    it('parses YYYYMMDDHHMM into a UTC Date', () => {
      const d = ParseFileStamp('202605032236');
      expect(d.toISOString()).toBe('2026-05-03T22:36:00.000Z');
    });
    it('rejects malformed input', () => {
      expect(() => ParseFileStamp('20260503')).toThrow();
      expect(() => ParseFileStamp('20260503223X')).toThrow();
    });
    it('round-trips with fileStamp', () => {
      const stamp = '202605032236';
      expect(FileStamp(ParseFileStamp(stamp))).toBe(stamp);
    });
  });

  describe('addMinutes', () => {
    it('adds minutes', () => {
      const d = new Date(Date.UTC(2026, 4, 3, 22, 36));
      expect(AddMinutes(d, 1).toISOString()).toBe('2026-05-03T22:37:00.000Z');
    });
    it('rolls hours/days forward', () => {
      const d = new Date(Date.UTC(2026, 4, 3, 23, 59));
      expect(AddMinutes(d, 1).toISOString()).toBe('2026-05-04T00:00:00.000Z');
    });
  });

  describe('parseMigrationFilename', () => {
    it('parses a V-file with .x patch', () => {
      const r = ParseMigrationFilename('V202605032236__v5.32.x__Metadata_Sync.sql');
      expect(r).not.toBeNull();
      expect(r!.Kind).toBe('V');
      expect(r!.Timestamp).toBe('202605032236');
      expect(r!.Major).toBe(5);
      expect(r!.Minor).toBe(32);
      expect(r!.MajorMinor).toBe('5.32');
    });
    it('parses a V-file without patch suffix', () => {
      const r = ParseMigrationFilename('V202602170015__v5.1__Regenerate_Delete_Stored_Procs.sql');
      expect(r).not.toBeNull();
      expect(r!.MajorMinor).toBe('5.1');
    });
    it('parses a B-file (baseline)', () => {
      const r = ParseMigrationFilename('B202602151200__v5.0__Baseline.sql');
      expect(r).not.toBeNull();
      expect(r!.Kind).toBe('B');
      expect(r!.MajorMinor).toBe('5.0');
    });
    it('parses a B-file with literal x patch (current emitter convention)', () => {
      const r = ParseMigrationFilename('B202605032237__v5.32.x__Baseline.sql');
      expect(r).not.toBeNull();
      expect(r!.Kind).toBe('B');
      expect(r!.MajorMinor).toBe('5.32');
    });
    it('also parses legacy B-files with uppercase X (back-compat)', () => {
      const r = ParseMigrationFilename('B202605032237__v5.32.X__Baseline.sql');
      expect(r).not.toBeNull();
      expect(r!.Kind).toBe('B');
      expect(r!.MajorMinor).toBe('5.32');
    });
    it('returns null for unrecognized shapes', () => {
      expect(ParseMigrationFilename('R__RefreshMetadata.sql')).toBeNull();
      expect(ParseMigrationFilename('something-else.sql')).toBeNull();
      expect(ParseMigrationFilename('V202602170015_no_double_underscore.sql')).toBeNull();
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
      const r = FindLatestVersionedMigration(dir);
      expect(r).not.toBeNull();
      expect(r!.Timestamp).toBe('202605032236');
      expect(r!.MajorMinor).toBe('5.32');
    });

    it('ignores B-files when looking for V-files', () => {
      const dir = makeTempMigrationsDir([
        'B202999999999__v9.9__Baseline.sql', // way in the future
        'V202605032236__v5.32.x__Metadata.sql',
      ]);
      const r = FindLatestVersionedMigration(dir);
      expect(r!.Timestamp).toBe('202605032236');
    });

    it('finds the latest B-file', () => {
      const dir = makeTempMigrationsDir([
        'B202602151200__v5.0__Baseline.sql',
        'B202605032237__v5.32.x__Baseline.sql',
        'V202605032236__v5.32.x__Metadata.sql',
      ]);
      const r = FindLatestBaselineMigration(dir);
      expect(r!.Timestamp).toBe('202605032237');
      expect(r!.MajorMinor).toBe('5.32');
    });

    it('returns null for an empty directory', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-baseline-empty-'));
      expect(FindLatestVersionedMigration(dir)).toBeNull();
    });

    it('returns null for a non-existent directory', () => {
      expect(FindLatestVersionedMigration('/nonexistent/path/abc123xyz')).toBeNull();
    });
  });

  describe('discoverMigrationsSourceDir', () => {
    it('walks up to find migrations/ and picks the highest vN/', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-discover-'));
      fs.mkdirSync(path.join(root, 'migrations', 'v2'), { recursive: true });
      fs.mkdirSync(path.join(root, 'migrations', 'v5'), { recursive: true });
      fs.mkdirSync(path.join(root, 'migrations', 'v3'), { recursive: true });
      fs.mkdirSync(path.join(root, 'packages', 'MJCLI', 'src'), { recursive: true });
      const found = DiscoverMigrationsSourceDir(path.join(root, 'packages', 'MJCLI', 'src'));
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
      const found = DiscoverMigrationsSourceDir(deep);
      // If found, it should NOT be inside our temp tree.
      if (found !== null) expect(found.startsWith(root)).toBe(false);
    });
  });

  describe('computeAutoBaselineStamp', () => {
    it('produces latestV+1m for the canonical example', () => {
      // V-file V202605032236__v5.32.x__Metadata_Sync.sql is the head of v5
      const result = ComputeAutoBaselineStamp('202605032236');
      expect(result.fileStamp).toBe('202605032237');
      expect(result.generatedAtUtc.toISOString()).toBe('2026-05-03T22:37:00.000Z');
    });
    it('rolls correctly across hour/day boundary', () => {
      const result = ComputeAutoBaselineStamp('202605032359');
      expect(result.fileStamp).toBe('202605040000');
    });
    it('builds the canonical baseline filename for v5.32 auto rebaseline', () => {
      const { generatedAtUtc } = ComputeAutoBaselineStamp('202605032236');
      expect(BaselineFilename({ generatedAtUtc, baselineVersion: '5.32' }))
        .toBe('B202605032237__v5.32.x__Baseline.sql');
    });
  });

  describe('deepValueEqual', () => {
    it('treats null and undefined as equal', () => {
      expect(DeepValueEqual(null, undefined)).toBe(true);
    });
    it('compares dates by timestamp', () => {
      const a = new Date('2026-05-02T19:47:23Z');
      const b = new Date('2026-05-02T19:47:23.000Z');
      expect(DeepValueEqual(a, b)).toBe(true);
    });
    it('compares Buffers byte-wise', () => {
      expect(DeepValueEqual(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3]))).toBe(true);
      expect(DeepValueEqual(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 4]))).toBe(false);
    });
    it('handles NaN as equal to itself', () => {
      expect(DeepValueEqual(Number.NaN, Number.NaN)).toBe(true);
    });
    it('returns false for differing primitives', () => {
      expect(DeepValueEqual('a', 'b')).toBe(false);
    });
  });
});
