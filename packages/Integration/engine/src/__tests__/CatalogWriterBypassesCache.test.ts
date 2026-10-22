/**
 * The catalog writer's reads bypass the query-result cache.
 *
 * `BuildCatalogWriter` hands the classify stage a PerConnectionCatalogWriter, so `viewRows` — not
 * the store — is the read on that path. Adding the bypass to the store alone changed nothing in
 * the incident that proved this: 34 objects classified in 59 ms (about 1.7 ms per read, which no
 * database round trip achieves) and every one reported keyless while the rows plainly existed.
 * With the bypass on `viewRows`: FieldsCreated 207 -> 0, FieldsUpdated 0 -> 76, unresolved 34 -> 4,
 * and those 4 genuinely carry no key.
 *
 * The keyed-object scan the classify stage asks first is the same kind of read at the same moment
 * — straight after Persist — and repeats byte-identical text on every re-discovery of the same
 * objects, so it bypasses too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENTITY_COMPANY_INTEGRATION_OBJECTS, ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS } from '@memberjunction/integration-engine-base';

type Params = { EntityName: string; ResultType?: string; BypassCache?: boolean; Telemetry?: { Exempt?: boolean } };
const calls: Params[] = [];

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => {},
        RunView: class {
            async RunView(p: Params) { calls.push(p); return { Success: true, Results: [] }; }
        },
    };
});

const { PerConnectionCatalogWriter, SharedCatalogWriter } = await import('../CatalogWriter.js');
const perConnection = () => new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date(0));
const shared = () => new SharedCatalogWriter({} as never, 'int-1', {} as never);

beforeEach(() => { calls.length = 0; });

describe('catalog writer reads bypass the query cache', () => {
    it('per-connection FieldsForObject — the read the classify stage was served stale', async () => {
        await perConnection().FieldsForObject('obj-1');
        expect(calls[0]).toMatchObject({ EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, BypassCache: true });
        expect(calls[0].Telemetry?.Exempt).toBe(true);
    });

    it('per-connection ObjectsInScope', async () => {
        await perConnection().ObjectsInScope();
        expect(calls[0]).toMatchObject({ EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS, BypassCache: true });
    });

    it('the shared writer\'s reads too — one viewRows serves both', async () => {
        await shared().FieldsForObject('obj-1');
        expect(calls[0]).toMatchObject({ EntityName: 'MJ: Integration Object Fields', BypassCache: true });
    });

    it('the keyed-object scan the classify stage asks first', async () => {
        await perConnection().KeyedObjectIDs(['A1', 'B2']);
        expect(calls[0]).toMatchObject({ EntityName: ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS, ResultType: 'simple', BypassCache: true });
        expect(calls[0].Telemetry?.Exempt).toBe(true);
    });
});
