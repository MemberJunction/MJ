/**
 * The per-connection catalog store reads the way the writer does.
 *
 * - A failed read is an ERROR, never an empty catalog. `CatalogWriter.viewRows` already throws
 *   `CompanyIntegrationCatalogReadFailed`; a store that returned `[]` / `false` instead would hand
 *   its first caller "this connection has no catalog" on a database error.
 * - Reads go through the provider the store was given, the same one its writes use, so a server
 *   with more than one provider never reads from one and writes to another.
 * - Filter values are escaped with the one shared rule (`EscapeSQLString`).
 * - `CatalogRow.LastError` carries a validation failure's reason, which lives in `Errors`, not
 *   `Message`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Params = { EntityName: string; ExtraFilter?: string; ResultType?: string };
const calls: Params[] = [];
const constructedWith: unknown[] = [];
let nextResult: { Success: boolean; Results?: unknown[]; TotalRowCount?: number; ErrorMessage?: string } = { Success: true, Results: [], TotalRowCount: 0 };

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            constructor(provider?: unknown) {
                constructedWith.push(provider);
            }
            async RunView(p: Params) {
                calls.push(p);
                return nextResult;
            }
        },
    };
});

const { CompanyIntegrationCatalogStore, CatalogRow } = await import('../CompanyIntegrationCatalogStore.js');
const { CompanyIntegrationCatalogReadFailed } = await import('../CatalogWriter.js');
const { CATALOG_OBJECT_COLUMNS, ENTITY_COMPANY_INTEGRATION_OBJECTS } = await import('@memberjunction/integration-engine-base');

const PROVIDER = { name: 'bound-provider' };
const store = () => new CompanyIntegrationCatalogStore({ ID: 'u-1' } as never, PROVIDER as never);

beforeEach(() => {
    calls.length = 0;
    constructedWith.length = 0;
    nextResult = { Success: true, Results: [], TotalRowCount: 0 };
});

describe('CompanyIntegrationCatalogStore — a failed read throws', () => {
    beforeEach(() => {
        nextResult = { Success: false, ErrorMessage: 'connection reset' };
    });

    it('ObjectsForConnection', async () => {
        await expect(store().ObjectsForConnection('ci-1')).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
    });

    it('FieldsForObject', async () => {
        await expect(store().FieldsForObject('obj-1')).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
    });

    it('HasCatalog — a failed count is not "no catalog"', async () => {
        await expect(store().HasCatalog('ci-1')).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
    });
});

describe('CompanyIntegrationCatalogStore — reads use the store provider and escape their values', () => {
    it('constructs every RunView with the provider the store was given', async () => {
        await store().ObjectsForConnection('ci-1');
        await store().FieldsForObject('obj-1');
        await store().HasCatalog('ci-1');
        expect(constructedWith).toEqual([PROVIDER, PROVIDER, PROVIDER]);
    });

    it('escapes a quote in a filter value', async () => {
        await store().ObjectsForConnection("ci-'1");
        expect(calls[0].ExtraFilter).toBe("CompanyIntegrationID = 'ci-''1'");
    });
});

describe('CatalogRow.LastError', () => {
    it('reports a validation failure, whose reason is in CompleteMessage rather than Message', () => {
        const row = {
            Fields: CATALOG_OBJECT_COLUMNS.map(Name => ({ Name })),
            LatestResult: { Message: '', CompleteMessage: 'Name is required' },
        };
        const wrapped = CatalogRow.Wrap(ENTITY_COMPANY_INTEGRATION_OBJECTS, row as never);
        expect(wrapped.LastError).toBe('Name is required');
    });
});
