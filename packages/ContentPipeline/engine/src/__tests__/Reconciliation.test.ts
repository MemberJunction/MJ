import { describe, expect, it } from 'vitest';
import { HasContentChanged, ReconcileChildren } from '../ChildReconciliation.js';

const child = (id: string, url: string) => ({ RecordID: id, URL: url });
const block = (url: string) => ({ URL: url });

describe('ReconcileChildren', () => {
    it('updates a block that matches an existing child in place', () => {
        const plan = ReconcileChildren([child('C1', 'a')], [block('a')]);
        expect(plan.Update).toEqual([{ RecordID: 'C1', Block: { URL: 'a' } }]);
        expect(plan.Create).toEqual([]);
        expect(plan.Delete).toEqual([]);
    });

    it('creates a block with no existing match', () => {
        const plan = ReconcileChildren([], [block('a')]);
        expect(plan.Create).toEqual([{ URL: 'a' }]);
    });

    it('deletes a child whose block no longer exists', () => {
        const plan = ReconcileChildren([child('C1', 'gone')], []);
        expect(plan.Delete).toEqual([child('C1', 'gone')]);
    });

    it('handles a mixed re-split', () => {
        const plan = ReconcileChildren(
            [child('C1', 'kept'), child('C2', 'removed')],
            [block('kept'), block('added')],
        );
        expect(plan.Update.map((u) => u.RecordID)).toEqual(['C1']);
        expect(plan.Create.map((c) => c.URL)).toEqual(['added']);
        expect(plan.Delete.map((d) => d.RecordID)).toEqual(['C2']);
    });

    it('preserves identity across a re-run, which is the whole point', () => {
        // Delete-and-recreate would lose the child's chunks, vectors and history.
        const first = ReconcileChildren([], [block('stable-key')]);
        expect(first.Create).toHaveLength(1);
        const second = ReconcileChildren([child('C1', 'stable-key')], [block('stable-key')]);
        expect(second.Create).toHaveLength(0);
        expect(second.Delete).toHaveLength(0);
        expect(second.Update[0].RecordID).toBe('C1');
    });

    it('treats an unstable identifier as a full churn, which is why stability is required', () => {
        const plan = ReconcileChildren([child('C1', 'block-1730000000')], [block('block-1730000999')]);
        expect(plan.Create).toHaveLength(1);
        expect(plan.Delete).toHaveLength(1);
    });

    it('does nothing for an empty re-split of an empty parent', () => {
        const plan = ReconcileChildren([], []);
        expect(plan).toEqual({ Update: [], Create: [], Delete: [] });
    });
});

describe('HasContentChanged', () => {
    it('is false for identical checksums — unchanged content is a no-op', () => {
        expect(HasContentChanged('abc', 'abc')).toBe(false);
    });

    it('is true for different checksums', () => {
        expect(HasContentChanged('abc', 'def')).toBe(true);
    });

    it('is true when either checksum is unknown', () => {
        // Reprocessing unnecessarily costs a run; skipping a real change costs correctness.
        expect(HasContentChanged(null, 'abc')).toBe(true);
        expect(HasContentChanged('abc', null)).toBe(true);
        expect(HasContentChanged(null, null)).toBe(true);
    });

    it('treats an empty checksum as unknown rather than as a value', () => {
        expect(HasContentChanged('', 'abc')).toBe(true);
    });
});
