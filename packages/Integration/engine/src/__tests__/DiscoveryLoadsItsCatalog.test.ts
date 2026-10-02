/**
 * A discovery loads its connection's catalog before any stage reads it (MJ-RUN-43).
 *
 * The per-connection rows are no longer resident, and the getters every stage reads through are
 * synchronous, so the pipeline loads the connection's objects and edges itself — inside the run,
 * not at `Run()` entry. Entry stays synchronous so the de-dup still registers a run before the
 * caller's next statement; and a failed load becomes a failed RUN (result.json written, retryable)
 * rather than an exception thrown past every caller's error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CATALOG_OBJECT_COLUMNS, ENTITY_COMPANY_INTEGRATION_OBJECTS, IntegrationEngineBase } from '@memberjunction/integration-engine-base';

let objectsAnswer: { Success: boolean; Results?: unknown[]; ErrorMessage?: string } = { Success: true, Results: [] };

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => {},
        RunView: class {
            async RunView(p: { EntityName: string }) {
                return p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECTS ? objectsAnswer : { Success: true, Results: [] };
            }
        },
        Metadata: class {
            static get Provider() { return { EntityByName: (n: string) => ({ Name: n }) }; }
        },
    };
});

const { IntegrationConnectorCreationPipeline } = await import('../IntegrationConnectorCreationPipeline.js');
const { EvictCatalogScope } = await import('../CatalogScope.js');

const CI_ID = 'CCCCCCCC-0000-0000-0000-000000000001';
const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';

function objectRow(id: string, name: string) {
    const all: Record<string, unknown> = {};
    for (const c of CATALOG_OBJECT_COLUMNS) all[c] = null;
    Object.assign(all, { ID: id, CompanyIntegrationID: CI_ID, IntegrationID: INTEGRATION, Name: name, Status: 'Active', Sequence: 1 });
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] };
}

const clearCaches = () => {
    const cls = IntegrationConnectorCreationPipeline as unknown as { inFlightRuns: Map<string, unknown>; recentRuns: Map<string, unknown> };
    cls.inFlightRuns.clear();
    cls.recentRuns.clear();
};

describe('a discovery loads its connection\'s catalog inside the run', () => {
    let rootDir: string;
    let seenInConnectionTest: string[] | undefined;

    const opts = () => ({
        CompanyIntegration: { ID: CI_ID, IntegrationID: INTEGRATION, Integration: 'Synthetic' },
        Connector: {
            TestConnection: async () => {
                // The first stage: what the getters answer here is what every stage after it sees.
                seenInConnectionTest = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name);
                return { Success: false, Message: 'stop after the first stage' };
            },
        },
        ContextUser: { ID: 'u-1' },
        ArtifactRootDir: rootDir,
    } as never);

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'mj-catalog-load-'));
        clearCaches();
        EvictCatalogScope();
        seenInConnectionTest = undefined;
        IntegrationEngineBase.Instance.SeedForTesting({ IntegrationObjects: [], CompanyIntegrationObjects: [], CompanyIntegrationObjectFields: [] });
    });
    afterEach(() => { rmSync(rootDir, { recursive: true, force: true }); clearCaches(); EvictCatalogScope(); });

    it('the stages read the connection\'s own objects', async () => {
        objectsAnswer = { Success: true, Results: [objectRow('BBBBBBBB-0000-0000-0000-000000000001', 'Members')] };
        await new IntegrationConnectorCreationPipeline().Run(opts());
        expect(seenInConnectionTest).toEqual(['Members']);
    });

    it('a failed catalog read is a failed run, not a throw', async () => {
        objectsAnswer = { Success: false, ErrorMessage: 'permission denied for relation' };
        const result = await new IntegrationConnectorCreationPipeline().Run(opts());
        expect(result.Success).toBe(false);
        expect(result.FailureMessage).toMatch(/permission denied for relation/);
        expect(seenInConnectionTest).toBeUndefined();
    });
});
