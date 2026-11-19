import { describe, it, expect } from 'vitest';
import { MapSQLTypeToJSType } from '../type-context';

describe('MapSQLTypeToJSType', () => {
    it('maps known SQL types', () => {
        expect(MapSQLTypeToJSType('nvarchar')).toBe('string');
        expect(MapSQLTypeToJSType('INT')).toBe('number');
        expect(MapSQLTypeToJSType('bit')).toBe('boolean');
    });

    it('treats a missing type as unknown instead of throwing', () => {
        expect(MapSQLTypeToJSType(undefined)).toBe('unknown');
        expect(MapSQLTypeToJSType(null)).toBe('unknown');
        expect(MapSQLTypeToJSType('')).toBe('unknown');
    });
});
