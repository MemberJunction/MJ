/**
 * Tests for PayloadManager — deepMerge, applyAgentChangeRequest, autoCorrectStrayKeys,
 * and array operations.
 *
 * Test philosophy: Tests are written against the JSDoc CONTRACT, not the current code.
 * This means they can catch bugs where the code diverges from its documented intent.
 *
 * Informed by git history bug patterns:
 * - Array boundary bugs (empty array + updateElements, off-by-one)
 * - newElements append vs. replace semantics
 * - Deep merge object vs. array behavior divergence
 * - Stray key auto-correction (LLM output mistakes)
 * - Silent data loss from incorrect merge
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayloadManager } from '../PayloadManager';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

describe('PayloadManager', () => {
    let pm: PayloadManager;

    beforeEach(() => {
        pm = new PayloadManager();
    });

    // ════════════════════════════════════════════════════════════════════
    // deepMerge
    // ════════════════════════════════════════════════════════════════════

    describe('deepMerge', () => {
        it('should merge two flat objects, source overriding destination', () => {
            const result = pm.deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
            expect(result).toEqual({ a: 1, b: 3, c: 4 });
        });

        it('should recursively merge nested objects (documented example)', () => {
            // From JSDoc: dest = { decision: { Y: 4, Z: 2 } }, src = { decision: { x: "string" } }
            // Expected: { decision: { x: "string", Y: 4, Z: 2 } }
            const dest = { decision: { Y: 4, Z: 2 } };
            const src = { decision: { x: 'string' } };
            const result = pm.deepMerge(dest, src);
            expect(result).toEqual({ decision: { x: 'string', Y: 4, Z: 2 } });
        });

        it('should return destination when source is null', () => {
            const dest = { a: 1 };
            const result = pm.deepMerge(dest, null);
            expect(result).toEqual({ a: 1 });
        });

        it('should return deep clone of source when destination is null', () => {
            const src = { a: { b: 1 } };
            const result = pm.deepMerge(null, src);
            expect(result).toEqual({ a: { b: 1 } });
            // Should be a clone, not the same reference
            expect(result).not.toBe(src);
        });

        it('should REPLACE arrays entirely — NOT recursively merge them', () => {
            // This is documented: "Arrays of primitives still use replacement behavior"
            const dest = { items: [1, 2, 3] };
            const src = { items: [4, 5] };
            const result = pm.deepMerge(dest, src);
            expect(result.items).toEqual([4, 5]);
        });

        it('should not mutate original objects', () => {
            const dest = { a: { b: 1 } };
            const src = { a: { c: 2 } };
            pm.deepMerge(dest, src);
            expect(dest).toEqual({ a: { b: 1 } }); // dest unchanged
            expect(src).toEqual({ a: { c: 2 } });   // src unchanged
        });

        it('should handle deeply nested merge (3+ levels)', () => {
            const dest = { l1: { l2: { l3: { existing: true } } } };
            const src = { l1: { l2: { l3: { added: 'new' } } } };
            const result = pm.deepMerge(dest, src);
            expect(result.l1.l2.l3).toEqual({ existing: true, added: 'new' });
        });

        it('should replace object with primitive when source is primitive', () => {
            const dest = { x: { nested: true } };
            const src = { x: 'replaced' };
            const result = pm.deepMerge(dest, src);
            expect(result.x).toBe('replaced');
        });

        it('should replace primitive with object when source is object', () => {
            const dest = { x: 'was-string' };
            const src = { x: { now: 'object' } };
            const result = pm.deepMerge(dest, src);
            expect(result.x).toEqual({ now: 'object' });
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // applyAgentChangeRequest — Object Operations
    // ════════════════════════════════════════════════════════════════════

    describe('applyAgentChangeRequest — objects', () => {
        it('should add new top-level keys via newElements', () => {
            const result = pm.applyAgentChangeRequest(
                { existing: 'value' },
                { newElements: { added: 'new' } },
            );
            expect(result.result).toEqual({ existing: 'value', added: 'new' });
            expect(result.applied.additions).toBe(1);
        });

        it('should update existing keys via updateElements', () => {
            const result = pm.applyAgentChangeRequest(
                { status: 'draft' },
                { updateElements: { status: 'published' } },
            );
            expect(result.result.status).toBe('published');
            expect(result.applied.updates).toBe(1);
        });

        it('should remove keys via removeElements with __DELETE__ sentinel', () => {
            const result = pm.applyAgentChangeRequest(
                { keep: 'yes', remove: 'me' },
                { removeElements: { remove: '__DELETE__' } },
            );
            expect(result.result.keep).toBe('yes');
            expect('remove' in result.result).toBe(false);
            expect(result.applied.deletions).toBe(1);
        });

        it('should handle __DELETE__ in updateElements (deletion within update)', () => {
            const result = pm.applyAgentChangeRequest(
                { a: 1, b: 2, c: 3 },
                { updateElements: { a: 10, b: '__DELETE__' } },
            );
            expect(result.result.a).toBe(10);
            expect('b' in result.result).toBe(false);
            expect(result.result.c).toBe(3);
        });

        it('should deep-merge nested objects in updateElements', () => {
            const result = pm.applyAgentChangeRequest(
                { config: { host: 'localhost', port: 3000 } },
                { updateElements: { config: { port: 4000 } } },
            );
            // Host should be preserved, port updated
            expect(result.result.config).toEqual({ host: 'localhost', port: 4000 });
        });

        it('should replace entirely via replaceElements', () => {
            const result = pm.applyAgentChangeRequest(
                { data: { a: 1, b: 2, c: 3 } },
                { replaceElements: { data: { x: 99 } } },
            );
            // Replace should wipe old keys and set new value
            expect(result.result.data).toEqual({ x: 99 });
        });

        it('should not mutate the original payload', () => {
            const original = { status: 'draft', items: [1, 2] };
            const copy = JSON.parse(JSON.stringify(original));
            pm.applyAgentChangeRequest(original, { updateElements: { status: 'published' } });
            expect(original).toEqual(copy);
        });

        it('should handle combined newElements + updateElements + removeElements', () => {
            const result = pm.applyAgentChangeRequest(
                { a: 1, b: 2, c: 3 },
                {
                    newElements: { d: 4 },
                    updateElements: { a: 10 },
                    removeElements: { c: '__DELETE__' },
                },
            );
            expect(result.result).toEqual({ a: 10, b: 2, d: 4 });
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // applyAgentChangeRequest — Array Operations
    // (Informed by git bug fix: commit 6c0250cd13)
    // ════════════════════════════════════════════════════════════════════

    describe('applyAgentChangeRequest — arrays', () => {
        it('should handle empty array + updateElements (the original bug)', () => {
            // Bug: When target array is empty and updateElements has items,
            // the overflow loop (i >= target.length) should add them all
            const result = pm.applyAgentChangeRequest(
                { facts: [] },
                { updateElements: { facts: [{ id: 1, text: 'fact one' }, { id: 2, text: 'fact two' }] } },
            );
            expect(result.result.facts).toHaveLength(2);
            expect(result.result.facts[0]).toEqual({ id: 1, text: 'fact one' });
            expect(result.result.facts[1]).toEqual({ id: 2, text: 'fact two' });
        });

        it('should append items via newElements (not positional replace)', () => {
            // Bug: newElements used to do positional replacement instead of append
            const result = pm.applyAgentChangeRequest(
                { items: ['a', 'b'] },
                { newElements: { items: ['c', 'd'] } },
            );
            expect(result.result.items).toEqual(['a', 'b', 'c', 'd']);
        });

        it('should positionally update existing array elements via updateElements', () => {
            const result = pm.applyAgentChangeRequest(
                { items: ['old1', 'old2', 'old3'] },
                { updateElements: { items: ['new1', undefined, 'new3'] } },
            );
            expect(result.result.items[0]).toBe('new1');
            expect(result.result.items[1]).toBe('old2'); // undefined = no change
            expect(result.result.items[2]).toBe('new3');
        });

        it('should deep-merge object elements in arrays (preserve existing properties)', () => {
            // Documented: Original [{id: 1, name: "Test", value: 100}] + Update [{value: 200}]
            // Result: [{id: 1, name: "Test", value: 200}]
            const result = pm.applyAgentChangeRequest(
                { items: [{ id: 1, name: 'Test', value: 100 }] },
                { updateElements: { items: [{ value: 200 }] } },
            );
            expect(result.result.items[0]).toEqual({ id: 1, name: 'Test', value: 200 });
        });

        it('should delete array elements via __DELETE__ sentinel in removeElements', () => {
            const result = pm.applyAgentChangeRequest(
                { items: ['a', 'b', 'c'] },
                { removeElements: { items: [undefined, '__DELETE__', undefined] } },
            );
            expect(result.result.items).toEqual(['a', 'c']);
        });

        it('should delete array elements via __DELETE__ in updateElements', () => {
            const result = pm.applyAgentChangeRequest(
                { items: ['a', 'b', 'c'] },
                { updateElements: { items: ['a', '__DELETE__', 'c'] } },
            );
            expect(result.result.items).toEqual(['a', 'c']);
        });

        it('should handle mixed update + append (overflow items treated as additions)', () => {
            const result = pm.applyAgentChangeRequest(
                { items: ['existing'] },
                { updateElements: { items: ['updated', 'new-via-overflow'] } },
            );
            expect(result.result.items).toEqual(['updated', 'new-via-overflow']);
            expect(result.applied.additions).toBeGreaterThanOrEqual(1);
        });

        it('should deep-merge nested arrays within object elements (positional update)', () => {
            // Deep merge semantics: updating facts[0] deep-merges the object.
            // Within that, citations array gets positional update:
            // position 0: 'cite1' → 'new-cite', position 1: 'cite2' stays
            const result = pm.applyAgentChangeRequest(
                {
                    facts: [
                        { text: 'Original fact', citations: ['cite1', 'cite2'] },
                    ],
                },
                {
                    updateElements: {
                        facts: [
                            { text: 'Updated fact', citations: ['new-cite'] },
                        ],
                    },
                },
            );
            expect(result.result.facts[0].text).toBe('Updated fact');
            // Positional: position 0 updated, position 1 preserved
            expect(result.result.facts[0].citations[0]).toBe('new-cite');
            expect(result.result.facts[0].citations[1]).toBe('cite2');
        });

        it('should NOT merge newElements into individual existing array elements', () => {
            // Bug fix: processChangeRequest for existing elements omits newElements
            // to prevent append semantics from being applied to individual items
            const result = pm.applyAgentChangeRequest(
                { items: [{ id: 1, tags: ['a'] }] },
                {
                    newElements: { items: [{ id: 2, tags: ['b'] }] },
                },
            );
            // The new item should be appended, not merged into items[0]
            expect(result.result.items).toHaveLength(2);
            expect(result.result.items[0].id).toBe(1);
            expect(result.result.items[1].id).toBe(2);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // autoCorrectStrayKeys (LLM output error recovery)
    // ════════════════════════════════════════════════════════════════════

    describe('autoCorrectStrayKeys', () => {
        it('should move stray keys to updateElements when key exists on payload', () => {
            const result = pm.applyAgentChangeRequest(
                { status: 'draft', title: 'Original' },
                {
                    updateElements: { title: 'Updated' },
                    status: 'published', // Stray key — exists on payload
                } as Record<string, unknown>,
            );
            expect(result.result.status).toBe('published');
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('stray key') || w.includes('Auto-corrected'))).toBe(true);
        });

        it('should move stray keys to newElements when key does NOT exist on payload', () => {
            const result = pm.applyAgentChangeRequest(
                { existing: 'value' },
                {
                    brandNew: 'data', // Stray key — NOT on payload
                } as Record<string, unknown>,
            );
            expect(result.result.brandNew).toBe('data');
        });

        it('should not auto-correct keys starting with _ or $', () => {
            const result = pm.applyAgentChangeRequest(
                { status: 'draft' },
                {
                    _internal: 'marker',
                    $meta: 'info',
                } as Record<string, unknown>,
            );
            // These should NOT be moved to updateElements or newElements
            // They won't appear in the result payload
            expect('_internal' in result.result).toBe(false);
            expect('$meta' in result.result).toBe(false);
        });

        it('should not overwrite explicit updateElements entries with stray values', () => {
            const result = pm.applyAgentChangeRequest(
                { title: 'Original' },
                {
                    updateElements: { title: 'Explicit Update' },
                    title: 'Stray Value', // Should not override explicit
                } as Record<string, unknown>,
            );
            expect(result.result.title).toBe('Explicit Update');
        });

        it('should skip auto-correction when ignoreStrayKeys is true', () => {
            const result = pm.applyAgentChangeRequest(
                { status: 'draft' },
                {
                    status: 'published', // Stray key
                } as Record<string, unknown>,
                { ignoreStrayKeys: true },
            );
            // With ignoreStrayKeys, the stray key should be ignored
            expect(result.result.status).toBe('draft');
        });

        it('should preserve recognized keys (reasoning, newElements, etc.)', () => {
            const result = pm.applyAgentChangeRequest(
                { data: 'original' },
                {
                    updateElements: { data: 'updated' },
                    reasoning: 'This is my reasoning', // Recognized key, not stray
                },
            );
            // reasoning should be preserved as-is, not moved
            expect(result.result.data).toBe('updated');
            // No warning about reasoning being stray
            expect(result.warnings.every(w => !w.includes('reasoning'))).toBe(true);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Edge cases from bug history
    // ════════════════════════════════════════════════════════════════════

    describe('edge cases (from bug history patterns)', () => {
        it('should handle completely empty changeRequest', () => {
            const result = pm.applyAgentChangeRequest(
                { data: 'value' },
                {},
            );
            expect(result.result).toEqual({ data: 'value' });
            expect(result.applied.additions).toBe(0);
            expect(result.applied.updates).toBe(0);
            expect(result.applied.deletions).toBe(0);
        });

        it('should handle null/undefined in updateElements gracefully', () => {
            const result = pm.applyAgentChangeRequest(
                { a: 1, b: 2 },
                { updateElements: { a: null } },
            );
            // null is a valid value — should be set
            expect(result.result.a).toBeNull();
            expect(result.result.b).toBe(2);
        });

        it('should handle deeply nested updateElements', () => {
            const result = pm.applyAgentChangeRequest(
                {
                    level1: {
                        level2: {
                            level3: { value: 'old', other: 'preserved' },
                        },
                    },
                },
                {
                    updateElements: {
                        level1: { level2: { level3: { value: 'new' } } },
                    },
                },
            );
            expect(result.result.level1.level2.level3.value).toBe('new');
            expect(result.result.level1.level2.level3.other).toBe('preserved');
        });
    });
});
