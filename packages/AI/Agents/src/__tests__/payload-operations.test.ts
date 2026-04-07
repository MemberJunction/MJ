/**
 * Tests for payload-operations.ts — parsePathWithOperations, parsePathsWithOperations,
 * isOperationAllowed, formatPathWithOperations.
 *
 * Pure function tests — no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import {
    parsePathWithOperations,
    parsePathsWithOperations,
    isOperationAllowed,
    formatPathWithOperations,
    ALL_OPERATIONS,
} from '../types/payload-operations';

describe('parsePathWithOperations', () => {
    it('should parse path without operations as all-operations-allowed', () => {
        const result = parsePathWithOperations('customer.*');
        expect(result.path).toBe('customer.*');
        expect(result.allOperations).toBe(true);
        expect(result.operations).toEqual(ALL_OPERATIONS);
    });

    it('should parse path with single operation', () => {
        const result = parsePathWithOperations('customer.*:add');
        expect(result.path).toBe('customer.*');
        expect(result.operations).toEqual(['add']);
        expect(result.allOperations).toBe(false);
    });

    it('should parse path with multiple operations', () => {
        const result = parsePathWithOperations('customer.*:add,update');
        expect(result.path).toBe('customer.*');
        expect(result.operations).toContain('add');
        expect(result.operations).toContain('update');
        expect(result.operations).not.toContain('delete');
        expect(result.allOperations).toBe(false);
    });

    it('should mark allOperations=true when all three ops are specified', () => {
        const result = parsePathWithOperations('data:add,update,delete');
        expect(result.allOperations).toBe(true);
    });

    it('should handle empty string gracefully', () => {
        const result = parsePathWithOperations('');
        expect(result.path).toBe('');
        expect(result.operations).toEqual([]);
        expect(result.allOperations).toBe(false);
    });

    it('should ignore invalid operations silently', () => {
        const result = parsePathWithOperations('path:add,invalid,update');
        expect(result.operations).toEqual(['add', 'update']);
    });

    it('should handle colon with no valid ops as no-operations', () => {
        const result = parsePathWithOperations('path:invalid');
        expect(result.path).toBe('path');
        expect(result.operations).toEqual([]);
        expect(result.allOperations).toBe(false);
    });

    it('should deduplicate repeated operations', () => {
        const result = parsePathWithOperations('path:add,add,add');
        expect(result.operations).toEqual(['add']);
    });

    it('should trim whitespace in operation names', () => {
        const result = parsePathWithOperations('path: add , update ');
        expect(result.operations).toContain('add');
        expect(result.operations).toContain('update');
    });

    it('should be case-insensitive for operation names', () => {
        const result = parsePathWithOperations('path:ADD,Update,DELETE');
        expect(result.operations).toContain('add');
        expect(result.operations).toContain('update');
        expect(result.operations).toContain('delete');
    });
});

describe('parsePathsWithOperations', () => {
    it('should parse an array of path specs', () => {
        const results = parsePathsWithOperations(['customer.*', 'analysis:add,update']);
        expect(results).toHaveLength(2);
        expect(results[0].allOperations).toBe(true);
        expect(results[1].operations).toEqual(['add', 'update']);
    });

    it('should return empty array for non-array input', () => {
        // Type guard — runtime protection
        const result = parsePathsWithOperations(null as unknown as string[]);
        expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
        expect(parsePathsWithOperations([])).toEqual([]);
    });
});

describe('isOperationAllowed', () => {
    it('should allow any operation when allOperations is true', () => {
        const parsed = parsePathWithOperations('data');
        expect(isOperationAllowed(parsed, 'add')).toBe(true);
        expect(isOperationAllowed(parsed, 'update')).toBe(true);
        expect(isOperationAllowed(parsed, 'delete')).toBe(true);
    });

    it('should only allow specified operations', () => {
        const parsed = parsePathWithOperations('data:add');
        expect(isOperationAllowed(parsed, 'add')).toBe(true);
        expect(isOperationAllowed(parsed, 'update')).toBe(false);
        expect(isOperationAllowed(parsed, 'delete')).toBe(false);
    });

    it('should deny all operations when none are specified', () => {
        const parsed = parsePathWithOperations('data:invalid');
        expect(isOperationAllowed(parsed, 'add')).toBe(false);
        expect(isOperationAllowed(parsed, 'update')).toBe(false);
        expect(isOperationAllowed(parsed, 'delete')).toBe(false);
    });
});

describe('formatPathWithOperations', () => {
    it('should format all-operations path as just the path', () => {
        const parsed = parsePathWithOperations('customer.*');
        expect(formatPathWithOperations(parsed)).toBe('customer.*');
    });

    it('should format restricted operations with colon notation', () => {
        const parsed = parsePathWithOperations('data:add,update');
        expect(formatPathWithOperations(parsed)).toBe('data:add,update');
    });

    it('should format no-operations as path:none', () => {
        const parsed = parsePathWithOperations('data:invalid');
        expect(formatPathWithOperations(parsed)).toBe('data:none');
    });

    it('should round-trip: format(parse(x)) preserves semantics', () => {
        const specs = ['customer.*', 'data:add', 'items:add,update,delete', 'readonly:invalid'];
        for (const spec of specs) {
            const parsed = parsePathWithOperations(spec);
            const formatted = formatPathWithOperations(parsed);
            const reparsed = parsePathWithOperations(formatted);
            expect(reparsed.operations).toEqual(parsed.operations);
            expect(reparsed.allOperations).toEqual(parsed.allOperations);
        }
    });
});
