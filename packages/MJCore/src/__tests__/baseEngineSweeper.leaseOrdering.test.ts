/**
 * The fleet sweeper must not pay for engines that have nothing to sweep.
 *
 * Each engine costs a cross-process lease per interval — a Redis round trip — before anything is
 * compared. Since the sweep visits only entities that declare `TrustServerCacheCompletely = false`,
 * an installation where nothing declares out-of-band writes has nothing for any engine to compare;
 * claiming a lease per engine per interval to discover that is pure churn. Observed on a live pair:
 * 21 lease keys, renewed every interval, for no work at all.
 *
 * What is saved is the **lease**, not a database query: `SweepAgainstDatabase` already returns early
 * when it has no sweepable configs. The fake engines below record every call, so the assertions here
 * are about the sweeper's decisions rather than the real engine's internal guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEngineSweeper } from '../generic/baseEngineSweeper';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import { LocalCacheManager } from '../generic/localCacheManager';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { EngineSweepResult } from '../generic/baseEngine';

/** Minimal stand-in for what the sweeper uses of an engine. */
function fakeEngine(name: string, hasWork: boolean, swept: string[]) {
    const engine = {
        Loaded: true,
        HasSweepableConfigs: () => hasWork,
        SweepAgainstDatabase: async (): Promise<EngineSweepResult> => {
            swept.push(name);
            return { EngineClass: name, Checked: 1, Reloaded: [], Errors: [] };
        },
    };
    Object.defineProperty(engine.constructor, 'name', { value: name });
    return engine;
}

describe('BaseEngineSweeper lease ordering', () => {
    let leases: string[];

    beforeEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__BaseEngineSweeper'];
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        leases = [];
        vi.spyOn(LocalCacheManager.Instance, 'TryAcquireSharedLease').mockImplementation(async (name: string) => {
            leases.push(name);
            return true;
        });
    });

    function registry(engines: unknown[]): void {
        vi.spyOn(BaseEngineRegistry.Instance, 'GetAllEngines').mockReturnValue(engines as never);
    }

    it('claims no lease for an engine with nothing to sweep', async () => {
        const swept: string[] = [];
        registry([fakeEngine('TrustingEngine', false, swept), fakeEngine('AlsoTrusting', false, swept)]);

        const results = await BaseEngineSweeper.Instance.SweepOnce(10_000);

        expect(leases).toEqual([]);     // no Redis round trip at all
        expect(swept).toEqual([]);      // and the engine is not even asked
        expect(results).toEqual([]);
    });

    it('still leases and sweeps an engine that has work', async () => {
        const swept: string[] = [];
        registry([fakeEngine('TrustingEngine', false, swept), fakeEngine('DriftingEngine', true, swept)]);

        await BaseEngineSweeper.Instance.SweepOnce(10_000);

        expect(leases).toEqual(['engine-sweep:DriftingEngine']);
        expect(swept).toEqual(['DriftingEngine']);
    });

    it('sweeps without a lease when none is requested, and still skips idle engines', async () => {
        const swept: string[] = [];
        registry([fakeEngine('TrustingEngine', false, swept), fakeEngine('DriftingEngine', true, swept)]);

        await BaseEngineSweeper.Instance.SweepOnce();

        expect(leases).toEqual([]);
        expect(swept).toEqual(['DriftingEngine']);
    });
});
