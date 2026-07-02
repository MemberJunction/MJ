import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { QueryResultEnricherBase, resolveQueryResultEnricher } from '../generic/queryResultEnricher';

/**
 * A throwaway enricher registered under a test key, used to prove the ClassFactory
 * resolution path in {@link resolveQueryResultEnricher}.
 */
@RegisterClass(QueryResultEnricherBase, 'Test Query Enricher')
class FakeQueryEnricher extends QueryResultEnricherBase {
    public async EnrichResults(opts: { rows: Record<string, unknown>[] }): Promise<Record<string, unknown>[]> {
        for (const row of opts.rows) {
            row.__enriched = true;
        }
        return opts.rows;
    }
}

describe('resolveQueryResultEnricher', () => {
    it('returns null when no enricher is registered under the key', () => {
        expect(resolveQueryResultEnricher('No Such Enricher Key')).toBeNull();
    });

    it('returns null for an empty key (RunQuery no-ops)', () => {
        expect(resolveQueryResultEnricher('')).toBeNull();
    });

    it('returns the registered enricher instance for a known key', () => {
        const enricher = resolveQueryResultEnricher('Test Query Enricher');
        expect(enricher).toBeInstanceOf(FakeQueryEnricher);
    });

    it('the resolved enricher actually enriches rows', async () => {
        const enricher = resolveQueryResultEnricher('Test Query Enricher');
        const rows = [{ ID: 'a' }, { ID: 'b' }];
        const out = await enricher!.EnrichResults({ rows, config: {} });
        expect(out.every((r) => r.__enriched === true)).toBe(true);
    });
});
