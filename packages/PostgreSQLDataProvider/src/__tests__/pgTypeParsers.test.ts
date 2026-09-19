import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { MJPostgresTypes, parseInt8, parseNumeric, parseDateOnly, PG_INT8_OID, PG_NUMERIC_OID, PG_DATE_OID } from '../pgTypeParsers.js';

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

describe('DATE columns arrive as UTC midnight, the same shape the SQL Server driver delivers (MJ#4210)', () => {
    /**
     * A SQL `date` column is a calendar day with no time and no zone. node-postgres' default
     * parser builds it as LOCAL midnight on the API server, so the instant it hands the framework
     * depends on where the server runs: a stored 2026-11-20 becomes 2026-11-19T22:00Z on a server
     * in Berlin, and every display path that reads the UTC parts (the form field, the grid, the
     * cards) then shows the 19th. The SQL Server driver (tedious) returns UTC midnight, and the
     * framework's date-only rendering is built on that shape. These tests PIN A TIMEZONE on both
     * sides of Greenwich so a UTC runner cannot pass while the bug ships.
     */
    const AT = (tz: string, fn: () => void) => {
        const original = process.env.TZ;
        process.env.TZ = tz;
        try {
            fn();
        } finally {
            process.env.TZ = original;
        }
    };
    const dateParser = () => MJPostgresTypes.getTypeParser(PG_DATE_OID as never, 'text' as never) as (v: string) => unknown;

    it('parses a date as UTC midnight east of Greenwich', () => {
        AT('Asia/Kolkata', () => {
            expect((dateParser()('2026-11-20') as Date).toISOString()).toBe('2026-11-20T00:00:00.000Z');
        });
    });

    it('parses a date as UTC midnight west of Greenwich', () => {
        AT('America/New_York', () => {
            expect((dateParser()('2026-11-20') as Date).toISOString()).toBe('2026-11-20T00:00:00.000Z');
            expect((dateParser()('2026-01-01') as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
        });
    });

    it('is what parseDateOnly does, exported for pools the host builds itself', () => {
        AT('Asia/Kolkata', () => {
            expect(parseDateOnly('2026-11-20').toISOString()).toBe('2026-11-20T00:00:00.000Z');
        });
    });

    it('keeps infinity and unparseable text as the pg default would', () => {
        expect(parseDateOnly('infinity')).toBe(Infinity);
        expect(parseDateOnly('-infinity')).toBe(-Infinity);
        expect(parseDateOnly('not-a-date')).toBeNull();
    });

    it('leaves timestamps to the pg defaults — timestamptz carries its zone; a plain timestamp is left as pg reads it', () => {
        const timestamptzParser = MJPostgresTypes.getTypeParser(1184 as never, 'text' as never);
        expect(timestamptzParser).toBe(pg.types.getTypeParser(1184 as never, 'text' as never));
        const timestampParser = MJPostgresTypes.getTypeParser(1114 as never, 'text' as never);
        expect(timestampParser).toBe(pg.types.getTypeParser(1114 as never, 'text' as never));
    });

    it('delegates binary format to the pg default even for DATE', () => {
        expect(MJPostgresTypes.getTypeParser(PG_DATE_OID as never, 'binary' as never)).not.toBe(parseDateOnly);
    });
});
