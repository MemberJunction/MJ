import { describe, it, expect } from 'vitest';
import { MJPostgresTypes, parseInt8, parseNumeric, PG_INT8_OID, PG_NUMERIC_OID } from '../pgTypeParsers.js';

describe('parseNumeric', () => {
    it('parses decimal strings to numbers', () => {
        expect(parseNumeric('0.0091')).toBe(0.0091);
        expect(parseNumeric('1234.567890')).toBe(1234.56789);
        expect(parseNumeric('-42.5')).toBe(-42.5);
        expect(parseNumeric('0')).toBe(0);
    });
});

describe('parseInt8', () => {
    it('parses bigint strings within the safe-integer range to numbers', () => {
        expect(parseInt8('42')).toBe(42);
        expect(parseInt8('0')).toBe(0);
        expect(parseInt8('-17409')).toBe(-17409);
        expect(parseInt8(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('returns the original string when the value exceeds the safe-integer range', () => {
        const beyondSafe = '9007199254740993'; // 2^53 + 1
        expect(parseInt8(beyondSafe)).toBe(beyondSafe);
        const negBeyondSafe = '-9007199254740993';
        expect(parseInt8(negBeyondSafe)).toBe(negBeyondSafe);
    });
});

describe('MJPostgresTypes.getTypeParser', () => {
    it('returns the numeric parser for NUMERIC text values', () => {
        const parser = MJPostgresTypes.getTypeParser(PG_NUMERIC_OID as never, 'text' as never) as (v: string) => unknown;
        expect(parser('0.0045')).toBe(0.0045);
    });

    it('returns the int8 parser for BIGINT text values', () => {
        const parser = MJPostgresTypes.getTypeParser(PG_INT8_OID as never, 'text' as never) as (v: string) => unknown;
        expect(parser('16972')).toBe(16972);
    });

    it('treats an omitted format as text', () => {
        const parser = MJPostgresTypes.getTypeParser(PG_NUMERIC_OID as never) as (v: string) => unknown;
        expect(parser('12.5')).toBe(12.5);
    });

    it('delegates other OIDs to the pg defaults', () => {
        const int4Parser = MJPostgresTypes.getTypeParser(23 as never, 'text' as never) as (v: string) => unknown;
        expect(int4Parser('123')).toBe(123);
        const textParser = MJPostgresTypes.getTypeParser(25 as never, 'text' as never) as (v: string) => unknown;
        expect(textParser('hello')).toBe('hello');
    });

    it('delegates binary format to the pg defaults even for numeric/int8', () => {
        const binaryInt8 = MJPostgresTypes.getTypeParser(PG_INT8_OID as never, 'binary' as never);
        expect(binaryInt8).not.toBe(parseInt8);
        const binaryNumeric = MJPostgresTypes.getTypeParser(PG_NUMERIC_OID as never, 'binary' as never);
        expect(binaryNumeric).not.toBe(parseNumeric);
    });
});
