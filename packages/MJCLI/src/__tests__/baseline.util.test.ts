import { describe, expect, it } from 'vitest';
import {
  baselineFilename,
  deepValueEqual,
  fileStamp,
  formatTsqlValue,
  isoUtcSeconds,
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
    it('uses literal X for patch', () => {
      const d = new Date(Date.UTC(2026, 4, 2, 19, 47));
      expect(baselineFilename({ generatedAtUtc: d, baselineVersion: '3.1' }))
        .toBe('B202605021947__v3.1.X__Baseline.sql');
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
