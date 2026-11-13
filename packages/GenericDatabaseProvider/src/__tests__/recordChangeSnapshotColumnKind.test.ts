/**
 * How each column type is written when a dialect builds a Record Change's FullRecordJSON in SQL.
 * Field types arrive in either SQL Server or PostgreSQL vocabulary (PostgreSQL metadata mixes both).
 */
import { describe, it, expect } from 'vitest';
import { RecordChangeSnapshotColumnKindOf } from '../recordChangeSnapshot';

describe('RecordChangeSnapshotColumnKindOf', () => {
    it.each([
        ['datetime', 'utc-datetime'],
        ['datetime2', 'utc-datetime'],
        ['smalldatetime', 'utc-datetime'],
        ['DATETIME2(7)', 'utc-datetime'],
        ['datetimeoffset', 'offset-datetime'],
        ['date', 'date'],
        ['time', 'time'],
        ['bigint', 'bigint'],
        ['varbinary', 'binary'],
        ['image', 'binary'],
        ['timestamp', 'binary'],
        ['geography', 'clr'],
        ['geometry', 'clr'],
        ['hierarchyid', 'clr'],
        ['xml', 'text'],
        ['sql_variant', 'text'],
        ['vector', 'text'],
        ['nvarchar', 'native'],
        ['uniqueidentifier', 'native'],
        ['bit', 'native'],
        ['decimal', 'native'],
        ['float', 'native'],
    ])('SQL Server %s → %s', (type, kind) => {
        expect(RecordChangeSnapshotColumnKindOf(type, 'sqlserver')).toBe(kind);
    });

    it.each([
        ['TIMESTAMPTZ', 'offset-datetime'],
        ['timestamp with time zone', 'offset-datetime'],
        ['timestamp', 'utc-datetime'],
        ['timestamp without time zone', 'utc-datetime'],
        ['datetimeoffset', 'offset-datetime'],
        ['bytea', 'binary'],
        ['jsonb', 'json'],
        ['json', 'json'],
        ['int8', 'bigint'],
        ['UUID', 'native'],
        ['TEXT', 'native'],
        ['BOOLEAN', 'native'],
        ['INTEGER', 'native'],
        ['interval', 'text'],
    ])('PostgreSQL %s → %s', (type, kind) => {
        expect(RecordChangeSnapshotColumnKindOf(type, 'postgresql')).toBe(kind);
    });
});
