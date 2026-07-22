/**
 * Integration: saved queries (RunQuery) against the live backend.
 *
 * loadQueries() reads approved queries from metadata; if any exist, runQuery()
 * executes the first one and we assert a clean result (success with columns/rows,
 * or a clean empty result). We do not assume a specific query is seeded.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initLiveProvider, hasToken } from './setup-live';
import { loadQueries, runQuery } from '@/data/services/explorer';

describe.skipIf(!hasToken())('integration: queries', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('loadQueries returns the runnable (approved) queries as a sorted list', () => {
        const queries = loadQueries();
        expect(Array.isArray(queries)).toBe(true);
        // Shape check on whatever is present.
        for (const q of queries) {
            expect(q.id).toBeTruthy();
            expect(typeof q.name).toBe('string');
        }
        const names = queries.map((q) => q.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('runQuery on the first approved query returns a clean result', async () => {
        const queries = loadQueries();
        if (queries.length === 0) {
            // No approved queries seeded — nothing to run, but the API must not throw.
            expect(queries.length).toBe(0);
            return;
        }

        const result = await runQuery(queries[0].id, undefined, undefined, 25);
        // runQuery never throws; it reports status on the object.
        expect(result).toBeTruthy();
        expect(typeof result.success).toBe('boolean');

        if (result.success) {
            expect(Array.isArray(result.columns)).toBe(true);
            expect(Array.isArray(result.rows)).toBe(true);
            expect(result.rowCount).toBeGreaterThanOrEqual(0);
            // Columns are derived from the first row; consistency check.
            if (result.rows.length > 0) {
                expect(result.columns.length).toBeGreaterThan(0);
                expect(Object.keys(result.rows[0])).toEqual(result.columns);
            }
        } else {
            // A failure must carry an error message (e.g. required parameters).
            expect(result.errorMessage).toBeTruthy();
        }
    });
});
