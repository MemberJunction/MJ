import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions, ConnectorCreationPipelineResult } from '../IntegrationConnectorCreationPipeline.js';

/**
 * One hung run must not make a connector permanently unrefreshable.
 *
 * `Run()` coalesces concurrent callers onto one promise, and removes the map entry in a `finally` —
 * which only fires when that promise SETTLES. A run that hangs therefore owned its slot forever, and
 * every later refresh took the `if (inFlight) return inFlight` path and attached to a promise that
 * would never resolve. No new run started, no `run.start` was emitted, nothing reached the workspace
 * log: from outside, the request simply vanished.
 *
 * That is the entire explanation for two days of "wildly inconsistent" behaviour. A fresh process
 * discovers in ~4 minutes; one hang poisons the slot; everything after it hangs; a restart clears the
 * in-memory map and it appears fixed — until the next hang. Observed live 2026-08-12: a run stuck at
 * EventCount 5 with healthy runs on either side of it.
 */

const CI_ID = 'ci-stuck';
const opts = (): ConnectorCreationPipelineOptions => ({
    CompanyIntegration: { ID: CI_ID, IntegrationID: 'int1' },
    Connector: {},
    ContextUser: {},
} as unknown as ConnectorCreationPipelineOptions);

/** Reaches into the private statics — this behaviour has no public surface, and it is worth pinning. */
const inFlightMap = () =>
    (IntegrationConnectorCreationPipeline as unknown as {
        inFlightRuns: Map<string, { promise: Promise<unknown>; at: number }>;
    }).inFlightRuns;

/** The just-completed-run cache. Must be cleared too: it is checked BEFORE the in-flight map, so a
 *  result left by an earlier test short-circuits Run() inside the coalesce window and the test never
 *  exercises the path it is about. */
const recentMap = () =>
    (IntegrationConnectorCreationPipeline as unknown as {
        recentRuns: Map<string, unknown>;
    }).recentRuns;

const clearCaches = () => { inFlightMap().clear(); recentMap().clear(); };

describe('IntegrationConnectorCreationPipeline — a hung run must not poison later refreshes', () => {
    beforeEach(clearCaches);
    afterEach(() => { vi.restoreAllMocks(); clearCaches(); });

    it('coalesces a genuinely concurrent duplicate onto the same run', async () => {
        // The behaviour being preserved: two callers at once must NOT start two discoveries.
        let resolve!: (r: ConnectorCreationPipelineResult) => void;
        const pending = new Promise<ConnectorCreationPipelineResult>(r => { resolve = r; });
        const p = new IntegrationConnectorCreationPipeline();
        const spy = vi.spyOn(p as unknown as { runInternal: () => Promise<ConnectorCreationPipelineResult> }, 'runInternal')
            .mockReturnValue(pending);

        const a = p.Run(opts());
        const b = p.Run(opts());
        expect(spy).toHaveBeenCalledTimes(1);      // second caller joined the first

        resolve({ RunID: 'r1', Success: true } as ConnectorCreationPipelineResult);
        expect((await a).RunID).toBe('r1');
        expect((await b).RunID).toBe('r1');
    });

    it('starts a FRESH run once the in-flight entry is too old to believe', async () => {
        const p = new IntegrationConnectorCreationPipeline();
        // A promise that never settles — the hung run. Its finally never fires, so without eviction
        // its map entry is permanent.
        const neverSettles = new Promise<ConnectorCreationPipelineResult>(() => { /* forever */ });
        const spy = vi.spyOn(p as unknown as { runInternal: () => Promise<ConnectorCreationPipelineResult> }, 'runInternal')
            .mockReturnValueOnce(neverSettles)
            .mockResolvedValueOnce({ RunID: 'r-fresh', Success: true } as ConnectorCreationPipelineResult);

        void p.Run(opts());                        // hangs, owns the slot
        expect(inFlightMap().has(CI_ID)).toBe(true);

        // Age the entry past the trust window rather than waiting 20 real minutes.
        const entry = inFlightMap().get(CI_ID)!;
        entry.at = Date.now() - (21 * 60_000);

        const second = await p.Run(opts());
        expect(spy).toHaveBeenCalledTimes(2);      // it did NOT attach to the dead promise
        expect(second.RunID).toBe('r-fresh');
    });

    it('a settling run does not delete a newer run’s slot', async () => {
        // After an eviction the slot belongs to a newer run. The older one finishing must not clear
        // it, or a third caller would start yet another duplicate.
        const p = new IntegrationConnectorCreationPipeline();
        let resolveOld!: (r: ConnectorCreationPipelineResult) => void;
        const oldRun = new Promise<ConnectorCreationPipelineResult>(r => { resolveOld = r; });
        vi.spyOn(p as unknown as { runInternal: () => Promise<ConnectorCreationPipelineResult> }, 'runInternal')
            .mockReturnValueOnce(oldRun)
            .mockReturnValueOnce(new Promise<ConnectorCreationPipelineResult>(() => { /* the newer run, still going */ }));

        const first = p.Run(opts());
        inFlightMap().get(CI_ID)!.at = Date.now() - (21 * 60_000);
        void p.Run(opts());                        // evicts, installs its own entry

        const newerEntry = inFlightMap().get(CI_ID);
        resolveOld({ RunID: 'r-old', Success: true } as ConnectorCreationPipelineResult);
        await first;

        expect(inFlightMap().get(CI_ID)).toBe(newerEntry);   // the newer run still owns the slot
    });
});
