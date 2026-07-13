/**
 * Tests for LocalCacheManager's cheap PK keying (Fix 1 — delimiter collision).
 *
 * UpsertSingleEntity / RemoveSingleEntity build an allocation-free composite-key string per row
 * via `cheapRowKey(row, pkFieldNames)` and compare it to the target key built by
 * `cheapKeyFromCompositeKey(key)`. These two builders must be mutually consistent and must NOT
 * collide for distinct composite keys. The delimiter is the NUL character (U+0000) precisely so
 * that composite PKs like ("A","B C") and ("A B","C") do not both serialize to "A B C" and target
 * the wrong cached row. These tests exercise the private builders directly (same `as unknown as`
 * private-access pattern used by localCacheManager.sizeEstimate.test.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

type Internal = {
    cheapRowKey: (row: Record<string, unknown>, pkFieldNames: string[]) => string;
    cheapKeyFromCompositeKey: (key: CompositeKey) => string;
};
const asInternal = (cm: LocalCacheManager) => cm as unknown as Internal;

function compositeKey(pairs: Array<[string, unknown]>): CompositeKey {
    return CompositeKey.FromKeyValuePairs(pairs.map(([f, v]) => new KeyValuePair(f, v)));
}

describe('LocalCacheManager cheap PK keying', () => {
    let cm: LocalCacheManager;
    beforeEach(() => {
        resetLocalCacheManager();
        cm = LocalCacheManager.Instance;
    });

    describe('single-column keys round-trip', () => {
        it('cheapRowKey(row) equals cheapKeyFromCompositeKey(key) for a single PK field', () => {
            const row = { ID: 'abc-123', Name: 'ignored' };
            const key = compositeKey([['ID', 'abc-123']]);
            const rowKey = asInternal(cm).cheapRowKey(row, ['ID']);
            const targetKey = asInternal(cm).cheapKeyFromCompositeKey(key);
            expect(rowKey).toBe(targetKey);
        });

        it('distinct single-column values produce distinct cheap keys', () => {
            const a = asInternal(cm).cheapRowKey({ ID: 'x' }, ['ID']);
            const b = asInternal(cm).cheapRowKey({ ID: 'y' }, ['ID']);
            expect(a).not.toBe(b);
        });
    });

    describe('composite-key collision is closed (Fix 1)', () => {
        it('("A","B C") and ("A B","C") produce DIFFERENT cheap keys (would collide with a space delimiter)', () => {
            const key1 = asInternal(cm).cheapKeyFromCompositeKey(compositeKey([['F1', 'A'], ['F2', 'B C']]));
            const key2 = asInternal(cm).cheapKeyFromCompositeKey(compositeKey([['F1', 'A B'], ['F2', 'C']]));
            expect(key1).not.toBe(key2);
        });

        it('row-built keys for those two distinct composites are also different', () => {
            const rowKey1 = asInternal(cm).cheapRowKey({ F1: 'A', F2: 'B C' }, ['F1', 'F2']);
            const rowKey2 = asInternal(cm).cheapRowKey({ F1: 'A B', F2: 'C' }, ['F1', 'F2']);
            expect(rowKey1).not.toBe(rowKey2);
        });

        it('the delimiter is NUL, not a space, so embedded spaces never shift the boundary', () => {
            const k = asInternal(cm).cheapKeyFromCompositeKey(compositeKey([['F1', 'A'], ['F2', 'B C']]));
            expect(k).toContain('\0');
            expect(k).toBe('A\0B C');
        });
    });

    describe('cheapRowKey === cheapKeyFromCompositeKey for the same logical composite key', () => {
        it('multi-field composite key round-trips between the two builders (same field order)', () => {
            const row = { TenantID: 'T 1', RecordID: 'R 2', Extra: 'x' };
            const pkFieldNames = ['TenantID', 'RecordID'];
            const key = compositeKey([['TenantID', 'T 1'], ['RecordID', 'R 2']]);
            const rowKey = asInternal(cm).cheapRowKey(row, pkFieldNames);
            const targetKey = asInternal(cm).cheapKeyFromCompositeKey(key);
            expect(rowKey).toBe(targetKey);
        });

        it('numeric and null-ish PK values coerce identically in both builders', () => {
            const row: Record<string, unknown> = { A: 7, B: null };
            const key = compositeKey([['A', 7], ['B', null]]);
            const rowKey = asInternal(cm).cheapRowKey(row, ['A', 'B']);
            const targetKey = asInternal(cm).cheapKeyFromCompositeKey(key);
            expect(rowKey).toBe(targetKey);
            // null coerces to '' in both, so a 2-field key with a null tail is "7\0"
            expect(rowKey).toBe('7\0');
        });
    });
});
