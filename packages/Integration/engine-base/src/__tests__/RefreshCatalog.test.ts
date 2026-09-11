/**
 * Contract tests for {@link IntegrationEngineBase.RefreshCatalog}.
 *
 * A sync run reads IntegrationObject/IntegrationObjectField out of this engine's BaseEngine
 * arrays, which are loaded once at process start. Everything else a run touches is re-read per
 * run, so a catalog edit made outside this process (direct SQL, a sproc-based sync push, a
 * second host) stayed invisible until a restart. RefreshCatalog closes that window; these tests
 * pin the three properties that make it safe to call at the head of every run.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntegrationEngineBase } from '../IntegrationEngineBase';

type LoadedConfig = { PropertyName: string };

describe('RefreshCatalog', () => {
    let engine: IntegrationEngineBase;
    let loaded: Array<{ prop: string; bypassCache: unknown; user: unknown }>;

    beforeEach(() => {
        engine = IntegrationEngineBase.Instance;
        loaded = [];
        // The engine under test was never Config()'d, so stand in for the descriptor list that
        // Load() records — RefreshCatalog re-loads through the SAME descriptors the engine
        // loaded with, so it can never diverge from Config()'s definition of these datasets.
        vi.spyOn(engine, 'Configs', 'get').mockReturnValue([
            { PropertyName: '_integrations', EntityName: 'MJ: Integrations' },
            { PropertyName: '_fieldMaps', EntityName: 'MJ: Company Integration Field Maps' },
            { PropertyName: '_integrationObjects', EntityName: 'MJ: Integration Objects' },
            { PropertyName: '_integrationObjectFields', EntityName: 'MJ: Integration Object Fields' },
        ] as never);
        vi.spyOn(engine as unknown as { LoadSingleConfig: (...a: unknown[]) => Promise<void> }, 'LoadSingleConfig')
            .mockImplementation(async (cfg: unknown, user: unknown, bypassCache: unknown) => {
                loaded.push({ prop: (cfg as LoadedConfig).PropertyName, bypassCache, user });
            });
    });

    it('reloads exactly the two catalog datasets — not the other six', async () => {
        await engine.RefreshCatalog({ ID: 'u1' } as never);
        expect(loaded.map(l => l.prop)).toEqual(['_integrationObjects', '_integrationObjectFields']);
    });

    it('bypasses the local dataset cache, which is the thing that goes stale', async () => {
        await engine.RefreshCatalog({ ID: 'u1' } as never);
        expect(loaded.every(l => l.bypassCache === true)).toBe(true);
    });

    it('loads as the caller’s user when one is supplied', async () => {
        const user = { ID: 'u-42' };
        await engine.RefreshCatalog(user as never);
        expect(loaded.every(l => l.user === user)).toBe(true);
    });

    it('falls back to the engine’s own context user when none is supplied', async () => {
        const engineUser = { ID: 'u-engine' };
        vi.spyOn(engine, 'ContextUser', 'get').mockReturnValue(engineUser as never);
        await engine.RefreshCatalog();
        expect(loaded.every(l => l.user === engineUser)).toBe(true);
    });

    it('is a no-op on an engine that was never configured — there is no cache to go stale', async () => {
        vi.spyOn(engine, 'Configs', 'get').mockReturnValue([] as never);
        await engine.RefreshCatalog({ ID: 'u1' } as never);
        expect(loaded).toEqual([]);
    });
});
