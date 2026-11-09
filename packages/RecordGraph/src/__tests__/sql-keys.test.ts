import { describe, it, expect } from 'vitest';
import { CompositeKey, EntityInfo } from '@memberjunction/core';
import {
    escapeSqlString,
    sqlEquals,
    sqlContains,
    sqlIn,
    sqlNotIn,
} from '../sql';
import {
    buildIdKey,
    buildCompositeKeyFromRecord,
    buildPrimaryKeyForLoad,
} from '../keys';

describe('escapeSqlString', () => {
    it('should double single quotes', () => {
        expect(escapeSqlString("O'Brien")).toBe("O''Brien");
    });

    it('should return empty string for null or undefined', () => {
        expect(escapeSqlString(null)).toBe('');
        expect(escapeSqlString(undefined)).toBe('');
    });

    it('should leave clean strings unchanged', () => {
        expect(escapeSqlString('Hello')).toBe('Hello');
    });
});

describe('sqlEquals', () => {
    it('should produce a safe equality filter', () => {
        expect(sqlEquals('Name', "O'Brien")).toBe("Name = 'O''Brien'");
    });
});

describe('sqlContains', () => {
    it('should produce a LIKE filter', () => {
        expect(sqlContains('Title', 'test')).toBe("Title LIKE '%test%'");
    });
});

describe('sqlIn', () => {
    it('should produce an IN clause', () => {
        expect(sqlIn('ID', ['a', 'b'])).toBe("ID IN ('a', 'b')");
    });

    it('should escape values in the IN clause', () => {
        expect(sqlIn('Name', ["O'Brien", 'Smith'])).toBe("Name IN ('O''Brien', 'Smith')");
    });
});

describe('sqlNotIn', () => {
    it('should produce a NOT IN clause', () => {
        expect(sqlNotIn('ID', ['x'])).toBe("ID NOT IN ('x')");
    });
});

describe('buildIdKey', () => {
    it('should create a CompositeKey with FieldName=ID', () => {
        const key = buildIdKey('abc-123');
        expect(key.GetValueByIndex(0)).toBe('abc-123');
        expect(key.ToRecordID()).toContain('abc-123');
    });
});

describe('buildCompositeKeyFromRecord and buildPrimaryKeyForLoad', () => {
    const mockEntityInfo = {
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' }],
        FirstPrimaryKey: { Name: 'ID' },
    } as unknown as EntityInfo;

    it('builds CompositeKey from record data', () => {
        const key = buildCompositeKeyFromRecord(mockEntityInfo, { ID: 'guid-999', Name: 'Foo' });
        expect(key.GetValueByIndex(0)).toBe('guid-999');
    });

    it('builds CompositeKey from URL segment or ID string', () => {
        const key = buildPrimaryKeyForLoad(mockEntityInfo, 'guid-999');
        expect(key.GetValueByIndex(0)).toBe('guid-999');
    });
});
