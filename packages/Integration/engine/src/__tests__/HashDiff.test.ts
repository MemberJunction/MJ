import { describe, it, expect } from 'vitest';
import { PartitionRecords, PartitionRollupHash, DiffPartitions, PartitionKeyForIdentity } from '../HashDiff.js';

describe('partitionKeyForIdentity', () => {
    it('is deterministic — same identity always maps to the same partition', () => {
        expect(PartitionKeyForIdentity('ext-123')).toBe(PartitionKeyForIdentity('ext-123'));
        expect(PartitionKeyForIdentity('ext-123', 64)).toBe(PartitionKeyForIdentity('ext-123', 64));
    });
    it('stays within [0, partitionCount)', () => {
        for (let i = 0; i < 500; i++) {
            const p = Number(PartitionKeyForIdentity(`id-${i}`, 16));
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(16);
        }
    });
    it('distributes across buckets (not all in one)', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 1000; i++) seen.add(PartitionKeyForIdentity(`id-${i}`, 256));
        expect(seen.size).toBeGreaterThan(100); // ~256 expected; assert it's clearly spread
    });
    it('defaults to 256 buckets', () => {
        for (let i = 0; i < 200; i++) expect(Number(PartitionKeyForIdentity(`id-${i}`))).toBeLessThan(256);
    });
    it('partition is stable under content change (keyed by identity, not content)', () => {
        // The same ExternalID lands in the same bucket regardless of any other attribute.
        expect(PartitionKeyForIdentity('contact-9')).toBe(PartitionKeyForIdentity('contact-9'));
    });

    it('fullSync semantics: diffing against an EMPTY snapshot re-applies EVERY partition (all added)', () => {
        // applyViaPartitionReconcile treats the stored snapshot as empty when config.fullSync is true, so
        // every partition becomes "added" → applied. This is the repair path: fullSync redoes everything,
        // never skipping a partition whose MJ row drifted out-of-band from the snapshot.
        const newRollups = new Map([['0', 'a'], ['1', 'b'], ['2', 'c']]);
        const diff = DiffPartitions(newRollups, new Map());
        expect(diff.added.sort()).toEqual(['0', '1', '2']);
        expect(diff.changed).toEqual([]);
        expect(diff.removed).toEqual([]);
        // toApply = changed ∪ added = all three → nothing skipped.
    });
});

type Rec = { id: string; partition: string; name: string; score: number };

const fieldsOf = (r: Rec): Record<string, unknown> => ({ name: r.name, score: r.score });
const keyOf = (r: Rec): string => r.id;
const partitionOf = (r: Rec): string => r.partition;

describe('partitionRecords', () => {
    it('buckets records by partition key, preserving encounter order within a bucket', () => {
        const recs: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'B', name: 'b', score: 2 },
            { id: '3', partition: 'A', name: 'c', score: 3 },
        ];
        const buckets = PartitionRecords(recs, keyOf, partitionOf);
        expect([...buckets.keys()].sort()).toEqual(['A', 'B']);
        expect(buckets.get('A')!.map(r => r.id)).toEqual(['1', '3']);
        expect(buckets.get('B')!.map(r => r.id)).toEqual(['2']);
    });

    it('returns an empty map for empty input', () => {
        const buckets = PartitionRecords<Rec>([], keyOf, partitionOf);
        expect(buckets.size).toBe(0);
    });
});

describe('partitionRollupHash', () => {
    it('produces a 64-char hex SHA-256 string', () => {
        const recs: Rec[] = [{ id: '1', partition: 'A', name: 'a', score: 1 }];
        expect(PartitionRollupHash(recs, fieldsOf)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is the SAME for the same records in a different order (order-independent)', () => {
        const forward: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'A', name: 'b', score: 2 },
            { id: '3', partition: 'A', name: 'c', score: 3 },
        ];
        const reversed = [...forward].reverse();
        expect(PartitionRollupHash(reversed, fieldsOf)).toBe(PartitionRollupHash(forward, fieldsOf));
    });

    it('changes when exactly one record in the partition changes', () => {
        const before: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'A', name: 'b', score: 2 },
        ];
        const after: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'A', name: 'b', score: 99 }, // score changed
        ];
        expect(PartitionRollupHash(after, fieldsOf)).not.toBe(PartitionRollupHash(before, fieldsOf));
    });

    it('rolls an empty partition up to a stable empty-string SHA-256 sentinel', () => {
        const emptyHash = PartitionRollupHash<Rec>([], fieldsOf);
        // SHA-256 of the empty string.
        expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(PartitionRollupHash<Rec>([], fieldsOf)).toBe(emptyHash);
    });

    it('distinguishes partitions with different record sets', () => {
        const a: Rec[] = [{ id: '1', partition: 'A', name: 'a', score: 1 }];
        const b: Rec[] = [{ id: '2', partition: 'B', name: 'b', score: 2 }];
        expect(PartitionRollupHash(a, fieldsOf)).not.toBe(PartitionRollupHash(b, fieldsOf));
    });
});

describe('diffPartitions', () => {
    it('flags ONLY the changed partition when one partitions rollup differs', () => {
        const local = new Map([
            ['A', 'hashA'],
            ['B', 'hashB'],
            ['C', 'hashC'],
        ]);
        const remote = new Map([
            ['A', 'hashA'],
            ['B', 'hashB-DIFFERENT'],
            ['C', 'hashC'],
        ]);
        const diff = DiffPartitions(local, remote);
        expect(diff.changed).toEqual(['B']);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
    });

    it('detects added partitions (local-only) and removed partitions (remote-only)', () => {
        const local = new Map([
            ['A', 'hashA'],
            ['NEW', 'hashNew'],
        ]);
        const remote = new Map([
            ['A', 'hashA'],
            ['GONE', 'hashGone'],
        ]);
        const diff = DiffPartitions(local, remote);
        expect(diff.changed).toEqual([]);
        expect(diff.added).toEqual(['NEW']);
        expect(diff.removed).toEqual(['GONE']);
    });

    it('reports changed, added, and removed simultaneously, sorted', () => {
        const local = new Map([
            ['shared-same', 'x'],
            ['shared-diff', 'local'],
            ['add-2', 'a2'],
            ['add-1', 'a1'],
        ]);
        const remote = new Map([
            ['shared-same', 'x'],
            ['shared-diff', 'remote'],
            ['rm-2', 'r2'],
            ['rm-1', 'r1'],
        ]);
        const diff = DiffPartitions(local, remote);
        expect(diff.changed).toEqual(['shared-diff']);
        expect(diff.added).toEqual(['add-1', 'add-2']);
        expect(diff.removed).toEqual(['rm-1', 'rm-2']);
    });

    it('returns all-empty arrays for two empty maps', () => {
        const diff = DiffPartitions(new Map(), new Map());
        expect(diff).toEqual({ changed: [], added: [], removed: [] });
    });

    it('treats an empty local map as all-remote-removed and vice versa', () => {
        const remote = new Map([['A', 'h']]);
        expect(DiffPartitions(new Map(), remote)).toEqual({ changed: [], added: [], removed: ['A'] });
        expect(DiffPartitions(remote, new Map())).toEqual({ changed: [], added: ['A'], removed: [] });
    });
});

describe('HashDiff end-to-end', () => {
    it('a re-fetch that only reorders rows produces zero changed partitions', () => {
        const original: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'A', name: 'b', score: 2 },
            { id: '3', partition: 'B', name: 'c', score: 3 },
        ];
        const reordered: Rec[] = [
            { id: '3', partition: 'B', name: 'c', score: 3 },
            { id: '2', partition: 'A', name: 'b', score: 2 },
            { id: '1', partition: 'A', name: 'a', score: 1 },
        ];
        const rollup = (recs: Rec[]): Map<string, string> => {
            const out = new Map<string, string>();
            for (const [part, bucket] of PartitionRecords(recs, keyOf, partitionOf)) {
                out.set(part, PartitionRollupHash(bucket, fieldsOf));
            }
            return out;
        };
        const diff = DiffPartitions(rollup(reordered), rollup(original));
        expect(diff).toEqual({ changed: [], added: [], removed: [] });
    });

    it('a single changed record flags only its partition for deep re-sync', () => {
        const original: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'B', name: 'b', score: 2 },
        ];
        const updated: Rec[] = [
            { id: '1', partition: 'A', name: 'a', score: 1 },
            { id: '2', partition: 'B', name: 'b', score: 999 }, // changed, lives in partition B
        ];
        const rollup = (recs: Rec[]): Map<string, string> => {
            const out = new Map<string, string>();
            for (const [part, bucket] of PartitionRecords(recs, keyOf, partitionOf)) {
                out.set(part, PartitionRollupHash(bucket, fieldsOf));
            }
            return out;
        };
        const diff = DiffPartitions(rollup(updated), rollup(original));
        expect(diff.changed).toEqual(['B']);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
    });
});
