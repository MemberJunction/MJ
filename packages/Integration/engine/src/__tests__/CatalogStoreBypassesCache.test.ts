/**
 * The per-connection catalog store reads around the query-result cache.
 *
 * The cache is keyed by the exact query text and filled by whoever asks first. Within one
 * discovery that is Introspect, which asks for an object's fields BEFORE Persist has written any,
 * so the cached answer is the empty set; Persist writes the rows; the reads after it issue the
 * byte-identical query and are handed the stale empty answer. These entities are registered by a
 * migration rather than CodeGen, so nothing invalidates that entry when the rows are saved — and
 * where the cache is shared and external to the process, a restart does not clear it either.
 *
 * Observed 2026-09-27: one discovery skipped all 34 objects for having no primary key although
 * the 30 declared objects each carried one; on another tenant, fetch after fetch aborted with
 * "no columns persisted" for objects holding 41, 81, 31 and 704 persisted fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENTITY_COMPANY_INTEGRATION_OBJECTS, ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS } from '@memberjunction/integration-engine-base';

type Params = {
    EntityName: string; ExtraFilter?: string; ResultType?: string; BypassCache?: boolean;
    Telemetry?: { Exempt?: boolean; Reason?: string };
};
const calls: Params[] = [];

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(p: Params) {
                calls.push(p);
                return { Success: true, Results: [], TotalRowCount: 0 };
            }
        },
    };
});

const { CompanyIntegrationCatalogStore } = await import('../CompanyIntegrationCatalogStore.js');
const store = () => new CompanyIntegrationCatalogStore({ ID: 'u-1' } as never);

beforeEach(() => { calls.length = 0; });

describe('CompanyIntegrationCatalogStore reads bypass the query cache', () => {
    it('ObjectsForConnection', async () => {
        await store().ObjectsForConnection('ci-1');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS, BypassCache: true });
        expect(calls[0].Telemetry?.Exempt).toBe(true);
    });

    it('FieldsForObject', async () => {
        await store().FieldsForObject('obj-1');
        expect(calls[0]).toMatchObject({ EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, BypassCache: true });
        expect(calls[0].Telemetry?.Exempt).toBe(true);
    });

    it('the HasCatalog existence count — a cached zero would route the run down the no-catalog path', async () => {
        await store().HasCatalog('ci-1');
        expect(calls[0]).toMatchObject({ EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS, ResultType: 'count_only', BypassCache: true });
        expect(calls[0].Telemetry?.Exempt).toBe(true);
    });
});
