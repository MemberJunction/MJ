/**
 * Tests for payload-operations.ts — parsePathWithOperations, parsePathsWithOperations,
 * isOperationAllowed, formatPathWithOperations.
 *
 * Pure function tests — no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import {
    ParsePathWithOperations,
    ParsePathsWithOperations,
    IsOperationAllowed,
    FormatPathWithOperations,
    ALL_OPERATIONS,
} from '../types/payload-operations';

describe('parsePathWithOperations', () => {
    it('should parse path without operations as all-operations-allowed', () => {
        const result = ParsePathWithOperations('customer.*');
        expect(result.path).toBe('customer.*');
        expect(result.allOperations).toBe(true);
        expect(result.operations).toEqual(ALL_OPERATIONS);
    });

    it('should parse path with single operation', () => {
        const result = ParsePathWithOperations('customer.*:add');
        expect(result.path).toBe('customer.*');
        expect(result.operations).toEqual(['add']);
        expect(result.allOperations).toBe(false);
    });

    it('should parse path with multiple operations', () => {
        const result = ParsePathWithOperations('customer.*:add,update');
        expect(result.path).toBe('customer.*');
        expect(result.operations).toContain('add');
        expect(result.operations).toContain('update');
        expect(result.operations).not.toContain('delete');
        expect(result.allOperations).toBe(false);
    });

    it('should mark allOperations=true when all three ops are specified', () => {
        const result = ParsePathWithOperations('data:add,update,delete');
        expect(result.allOperations).toBe(true);
    });

    it('should handle empty string gracefully', () => {
        const result = ParsePathWithOperations('');
        expect(result.path).toBe('');
        expect(result.operations).toEqual([]);
        expect(result.allOperations).toBe(false);
    });

    it('should ignore invalid operations silently', () => {
        const result = ParsePathWithOperations('path:add,invalid,update');
        expect(result.operations).toEqual(['add', 'update']);
    });

    it('should handle colon with no valid ops as no-operations', () => {
        const result = ParsePathWithOperations('path:invalid');
        expect(result.path).toBe('path');
        expect(result.operations).toEqual([]);
        expect(result.allOperations).toBe(false);
    });

    it('should deduplicate repeated operations', () => {
        const result = ParsePathWithOperations('path:add,add,add');
        expect(result.operations).toEqual(['add']);
    });

    it('should trim whitespace in operation names', () => {
        const result = ParsePathWithOperations('path: add , update ');
        expect(result.operations).toContain('add');
        expect(result.operations).toContain('update');
    });

    it('should be case-insensitive for operation names', () => {
        const result = ParsePathWithOperations('path:ADD,Update,DELETE');
        expect(result.operations).toContain('add');
        expect(result.operations).toContain('update');
        expect(result.operations).toContain('delete');
    });
});

describe('parsePathsWithOperations', () => {
    it('should parse an array of path specs', () => {
        const results = ParsePathsWithOperations(['customer.*', 'analysis:add,update']);
        expect(results).toHaveLength(2);
        expect(results[0].allOperations).toBe(true);
        expect(results[1].operations).toEqual(['add', 'update']);
    });

    it('should return empty array for non-array input', () => {
        // Type guard — runtime protection
        const result = ParsePathsWithOperations(null as unknown as string[]);
        expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
        expect(ParsePathsWithOperations([])).toEqual([]);
    });
});

describe('isOperationAllowed', () => {
    it('should allow any operation when allOperations is true', () => {
        const parsed = ParsePathWithOperations('data');
        expect(IsOperationAllowed(parsed, 'add')).toBe(true);
        expect(IsOperationAllowed(parsed, 'update')).toBe(true);
        expect(IsOperationAllowed(parsed, 'delete')).toBe(true);
    });

    it('should only allow specified operations', () => {
        const parsed = ParsePathWithOperations('data:add');
        expect(IsOperationAllowed(parsed, 'add')).toBe(true);
        expect(IsOperationAllowed(parsed, 'update')).toBe(false);
        expect(IsOperationAllowed(parsed, 'delete')).toBe(false);
    });

    it('should deny all operations when none are specified', () => {
        const parsed = ParsePathWithOperations('data:invalid');
        expect(IsOperationAllowed(parsed, 'add')).toBe(false);
        expect(IsOperationAllowed(parsed, 'update')).toBe(false);
        expect(IsOperationAllowed(parsed, 'delete')).toBe(false);
    });
});

describe('formatPathWithOperations', () => {
    it('should format all-operations path as just the path', () => {
        const parsed = ParsePathWithOperations('customer.*');
        expect(FormatPathWithOperations(parsed)).toBe('customer.*');
    });

    it('should format restricted operations with colon notation', () => {
        const parsed = ParsePathWithOperations('data:add,update');
        expect(FormatPathWithOperations(parsed)).toBe('data:add,update');
    });

    it('should format no-operations as path:none', () => {
        const parsed = ParsePathWithOperations('data:invalid');
        expect(FormatPathWithOperations(parsed)).toBe('data:none');
    });

    it('should round-trip: format(parse(x)) preserves semantics', () => {
        const specs = ['customer.*', 'data:add', 'items:add,update,delete', 'readonly:invalid'];
        for (const spec of specs) {
            const parsed = ParsePathWithOperations(spec);
            const formatted = FormatPathWithOperations(parsed);
            const reparsed = ParsePathWithOperations(formatted);
            expect(reparsed.operations).toEqual(parsed.operations);
            expect(reparsed.allOperations).toEqual(parsed.allOperations);
        }
    });
});
