/**
 * A schema build materializes the CONNECTION's field rows, read for the build, not whatever the
 * engine happens to hold in memory.
 *
 * A connection's per-object field rows are warmed on demand, and the only site that warms them is
 * the sync loop — so an apply reading them from the engine found `[]` for every object and built a
 * migration with no tables: "Reusing 364 persisted IOs", then `[tables: ]` in 4 ms, no error.
 *
 * These pin the loader the five build paths now share: when it reads, what it reads, that a failed
 * read is loud, and that with no per-connection catalog in scope nothing changes. The wiring into
 * the resolver is pinned at the bottom against the source, because the resolver needs a provider,
 * a connector and an RSU pipeline to invoke.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunView, type UserInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { WithCatalogScope } from '@memberjunction/integration-engine';
import { LoadScopedFieldsForBuild, FieldsForBuild, SCOPED_FIELDS_CHUNK } from '../integration/ScopedFieldsForBuild.js';

const USER = { ID: 'user-1' } as UserInfo;
type RunViewParams = Parameters<RunView['RunView']>[0];
type RunViewResult = Awaited<ReturnType<RunView['RunView']>>;

/** A per-connection field row as the per-connection field view returns it. */
const storedField = (objectID: string, Name: string, Status = 'Active', related: string | null = null) => ({
    ID: `${objectID}-${Name}`, Name, DisplayName: Name, Description: null, Type: 'nvarchar', Length: 100,
    Precision: null, Scale: null, AllowsNull: true, DefaultValue: null, IsPrimaryKey: Name === 'id',
    IsUniqueKey: false, IsReadOnly: false, IsRequired: false, Status,
    CompanyIntegrationObjectID: objectID, RelatedCompanyIntegrationObjectID: related,
});

/** An engine whose per-connection FIELD cache is cold — the state an apply runs in. */
function installEngine(objectIDs: string[], hasCatalog = true) {
    const getFields = vi.fn(() => []);
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        HasCompanyIntegrationCatalog: () => hasCatalog,
        GetActiveIntegrationObjects: () => objectIDs.map(ID => ({ ID, Name: `obj-${ID}` })),
        GetIntegrationObjectFields: getFields,
    } as unknown as IntegrationEngineBase);
    return getFields;
}

describe('LoadScopedFieldsForBuild', () => {
    let runView: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        runView = vi.spyOn(RunView.prototype, 'RunView');
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('reads nothing outside a catalog scope — the build reads the shared catalog as before', async () => {
        installEngine(['CIO-1']);
        expect(await LoadScopedFieldsForBuild('INT-1', USER)).toBeNull();
        expect(runView).not.toHaveBeenCalled();
    });

    it('reads nothing for a connection in scope that has no catalog of its own', async () => {
        installEngine(['CIO-1'], false);
        const loaded = await WithCatalogScope('CI-1', () => LoadScopedFieldsForBuild('INT-1', USER));
        expect(loaded).toBeNull();
        expect(runView).not.toHaveBeenCalled();
    });

    it('reads the connection\'s field rows from the database, bypassing the cache and the row cap', async () => {
        installEngine(['CIO-1', 'CIO-2']);
        runView.mockResolvedValue({
            Success: true,
            Results: [storedField('CIO-1', 'id'), storedField('CIO-1', 'parent', 'Active', 'CIO-2'), storedField('CIO-2', 'id')],
        } as unknown as RunViewResult);

        const loaded = await WithCatalogScope('CI-1', () => LoadScopedFieldsForBuild('INT-1', USER));

        const params = runView.mock.calls[0][0] as RunViewParams;
        expect(params.EntityName).toBe('MJ: Company Integration Object Fields');
        expect(params.ExtraFilter).toBe("CompanyIntegrationObjectID IN ('CIO-1','CIO-2')");
        expect(params.ResultType).toBe('simple');
        expect(params.BypassCache).toBe(true);
        expect(params.IgnoreMaxRows).toBe(true);
        // Keyed by lower-cased object id, and carrying the legacy names the build reads.
        const rows = loaded?.get('cio-1') ?? [];
        expect(rows.map(r => r.Name)).toEqual(['id', 'parent']);
        expect(rows[1].IntegrationObjectID).toBe('CIO-1');
        expect(rows[1].RelatedIntegrationObjectID).toBe('CIO-2');
        expect(loaded?.get('cio-2')?.map(r => r.Name)).toEqual(['id']);
    });

    it(`reads ${SCOPED_FIELDS_CHUNK} objects per query`, async () => {
        installEngine(Array.from({ length: 2 * SCOPED_FIELDS_CHUNK + 50 }, (_, i) => `CIO-${i}`));
        runView.mockResolvedValue({ Success: true, Results: [] } as unknown as RunViewResult);

        await WithCatalogScope('CI-1', () => LoadScopedFieldsForBuild('INT-1', USER));

        expect(runView).toHaveBeenCalledTimes(3);
    });

    it('THROWS on a failed read rather than building a schema from an empty field list', async () => {
        installEngine(['CIO-1']);
        runView.mockResolvedValue({ Success: false, ErrorMessage: 'timeout', Results: [] } as unknown as RunViewResult);

        await expect(WithCatalogScope('CI-1', () => LoadScopedFieldsForBuild('INT-1', USER)))
            .rejects.toThrow(/PER_CONNECTION_FIELDS_UNREADABLE/);
    });
});

describe('FieldsForBuild', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('with loaded rows, answers from them and never asks the (cold) engine', async () => {
        const getFields = installEngine(['CIO-1']);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(
            { Success: true, Results: [storedField('CIO-1', 'id'), storedField('CIO-1', 'name')] } as unknown as RunViewResult,
        );
        const loaded = await WithCatalogScope('CI-1', () => LoadScopedFieldsForBuild('INT-1', USER));

        expect(FieldsForBuild('CIO-1', loaded, IntegrationEngineBase.Instance).map(f => f.Name)).toEqual(['id', 'name']);
        expect(getFields).not.toHaveBeenCalled();
    });

    it('without loaded rows, reads the engine exactly as before', () => {
        const getFields = installEngine(['IO-1']);
        FieldsForBuild('IO-1', null, IntegrationEngineBase.Instance);
        expect(getFields).toHaveBeenCalledWith('IO-1');
    });
});

describe('every schema build reads its fields through the loader', () => {
    const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');

    it('all five build paths pass the loaded rows to the rebuild', () => {
        const calls = SRC.match(/this\.buildSourceSchemaFromPersistedRows\([\s\S]*?\);/g) ?? [];
        // ApplySchema, ApplyAll, buildSchemaForConnector, ApplyAllBatch, SchemaEvolution.
        expect(calls.length).toBe(5);
        for (const call of calls) {
            expect(call).toMatch(/await LoadScopedFieldsForBuild\(companyIntegration\.IntegrationID, user\)/);
        }
    });

    it('the rebuild reads fields only through FieldsForBuild, never the engine directly', () => {
        const start = SRC.indexOf('private buildSourceSchemaFromPersistedRows(');
        expect(start).toBeGreaterThan(-1);
        const body = SRC.slice(start, SRC.indexOf('private async runSchemaRefreshPipeline(', start));
        expect(body).toMatch(/FieldsForBuild\(io\.ID, scopedFields, engine\)/);
        expect(body).not.toMatch(/engine\.GetIntegrationObjectFields\(/);
    });
});
