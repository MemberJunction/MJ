import { describe, it, expect, vi } from 'vitest';
import { NoopReRanker } from '../generic/NoopReRanker';
import { SearchResultItem } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

function makeItem(id: string, score: number): SearchResultItem {
    return {
        ID: id,
        EntityName: 'E',
        RecordID: id,
        SourceType: 'vector',
        ResultType: 'entity-record',
        Title: id,
        Snippet: '',
        Score: score,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
    };
}

describe('NoopReRanker', () => {
    const fakeUser = { ID: 'u1' } as unknown as UserInfo;

    it('advertises its DriverClass for ClassFactory lookup', () => {
        const rr = new NoopReRanker();
        expect(rr.DriverClass).toBe('NoopReRanker');
    });

    it('returns empty when input is empty', async () => {
        const rr = new NoopReRanker();
        const result = await rr.ReRank('q', [], 10, fakeUser);
        expect(result).toEqual([]);
    });

    it('returns empty when topN <= 0', async () => {
        const rr = new NoopReRanker();
        const items = [makeItem('a', 0.9)];
        const result = await rr.ReRank('q', items, 0, fakeUser);
        expect(result).toEqual([]);
    });

    it('returns candidates unchanged when topN >= candidate count', async () => {
        const rr = new NoopReRanker();
        const items = [makeItem('a', 0.9), makeItem('b', 0.8)];
        const result = await rr.ReRank('q', items, 10, fakeUser);
        expect(result).toHaveLength(2);
        expect(result[0].RecordID).toBe('a');
        expect(result[1].RecordID).toBe('b');
    });

    it('slices to topN when topN < candidate count', async () => {
        const rr = new NoopReRanker();
        const items = [
            makeItem('a', 0.9),
            makeItem('b', 0.8),
            makeItem('c', 0.7),
            makeItem('d', 0.6),
        ];
        const result = await rr.ReRank('q', items, 2, fakeUser);
        expect(result).toHaveLength(2);
        expect(result[0].RecordID).toBe('a');
        expect(result[1].RecordID).toBe('b');
    });

    it('does not mutate the input array', async () => {
        const rr = new NoopReRanker();
        const items = [makeItem('a', 0.9), makeItem('b', 0.8)];
        await rr.ReRank('q', items, 1, fakeUser);
        expect(items).toHaveLength(2);
    });

    describe('P2D.1 contract additions', () => {
        it('exposes Name (defaults to DriverClass) and Version', () => {
            const rr = new NoopReRanker();
            expect(rr.Name).toBe('NoopReRanker');
            expect(rr.Version).toBe('1');
        });

        it('reports zero estimated cost regardless of result count', () => {
            const rr = new NoopReRanker();
            expect(rr.EstimateCostCents(0)).toBe(0);
            expect(rr.EstimateCostCents(1000)).toBe(0);
        });

        it('returns Number.MAX_SAFE_INTEGER for GetMaxResultCount (no cap)', () => {
            const rr = new NoopReRanker();
            expect(rr.GetMaxResultCount()).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('CostReporter callback defaults to null and can be set externally', () => {
            const rr = new NoopReRanker();
            expect(rr.CostReporter).toBeNull();
            const sink: number[] = [];
            rr.CostReporter = (c) => sink.push(c);
            // NoopReRanker doesn't charge so reportCost is never invoked internally —
            // verifying the property assignment + callable contract is enough here.
            expect(typeof rr.CostReporter).toBe('function');
            rr.CostReporter(0.25);
            expect(sink).toEqual([0.25]);
        });
    });

    describe('BaseReRanker.GetAvailableRerankers (P2D.7 dropdown helper)', () => {
        it('introspects manually-registered subclasses and reports DriverClass / Name / HasCost', async () => {
            // The file's vitest mock replaces @RegisterClass with a no-op so the decorator
            // doesn't auto-register NoopReRanker against the real ClassFactory. To exercise
            // GetAvailableRerankers we register the class explicitly here against the real
            // factory.
            const realGlobal = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
            const { BaseReRanker } = await import('../generic/BaseReRanker');
            realGlobal.MJGlobal.Instance.ClassFactory.Register(BaseReRanker, NoopReRanker, 'NoopReRanker', 0);

            const list = BaseReRanker.GetAvailableRerankers();
            const noop = list.find(e => e.DriverClass === 'NoopReRanker');
            expect(noop).toBeDefined();
            expect(noop?.Name).toBe('NoopReRanker');
            expect(noop?.HasCost).toBe(false);
        });
    });
});
