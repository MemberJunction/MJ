import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntegrationConnectorCreationPipeline } from '../IntegrationConnectorCreationPipeline.js';
import type { ConnectorCreationPipelineOptions } from '../IntegrationConnectorCreationPipeline.js';

/**
 * A run must END.
 *
 * `complete()` and `fail()` are the only writers of `result.json`, and both sit inside the try/catch
 * around the stages — so a stage that never returns reaches neither. Since a run is reported in-flight
 * precisely when `result.json` is ABSENT, one stalled `await` made the run claim to be running for the
 * rest of the process's life: no client could learn otherwise and no retry cleared it.
 *
 * The deadline cannot cancel the stalled work — a promise is not cancellable — so what is pinned here
 * is narrower and is the part that matters: the pipeline stops WAITING, fails honestly, and writes the
 * artifact that makes the run retryable.
 *
 * Verified live on 2026-08-15 against a real database and real artifacts before being pinned here.
 */

const CI_ID = 'ci-deadline';

/** Clears the coalescing caches — a cached result would short-circuit `Run()` before any stage ran. */
const clearCaches = () => {
    const cls = IntegrationConnectorCreationPipeline as unknown as {
        inFlightRuns: Map<string, unknown>;
        recentRuns: Map<string, unknown>;
    };
    cls.inFlightRuns.clear();
    cls.recentRuns.clear();
};

describe('IntegrationConnectorCreationPipeline — the run deadline', () => {
    let rootDir: string;

    /**
     * Hangs in the FIRST stage, so nothing downstream needs stubbing: `StageConnectionTest` awaits
     * `TestConnection` directly.
     */
    const hangingOpts = (deadlineMs: number): ConnectorCreationPipelineOptions => ({
        CompanyIntegration: { ID: CI_ID, IntegrationID: 'int-1', Integration: 'Synthetic' },
        Connector: { TestConnection: () => new Promise(() => { /* never settles */ }) },
        ContextUser: {},
        ArtifactRootDir: rootDir,
        RunDeadlineMs: deadlineMs,
    } as unknown as ConnectorCreationPipelineOptions);

    beforeEach(() => { rootDir = mkdtempSync(join(tmpdir(), 'mj-deadline-')); clearCaches(); });
    afterEach(() => { rmSync(rootDir, { recursive: true, force: true }); clearCaches(); });

    it('fails a stage that never returns, and WRITES result.json so the run stops reporting itself in-flight', async () => {
        const result = await new IntegrationConnectorCreationPipeline().Run(hangingOpts(200));

        expect(result.Success).toBe(false);
        expect(result.FailureMessage).toContain('ConnectionTest');

        // The artifact is the whole point: in-flight is computed as "result.json is absent".
        const resultFile = join(rootDir, result.RunID, 'result.json');
        expect(existsSync(resultFile)).toBe(true);
        expect(JSON.parse(readFileSync(resultFile, 'utf-8'))).toMatchObject({ success: false });
    });

    it('reports a sub-minute deadline in seconds', async () => {
        // RunDeadlineMs is a public knob and the default is 45min, so minutes read well there — but
        // rounding a 200ms deadline to minutes reported "a deadline of 0min", which reads as a bug in
        // the pipeline rather than the limit the caller asked for.
        const result = await new IntegrationConnectorCreationPipeline().Run(hangingOpts(200));
        expect(result.FailureMessage).toContain('0.2s');
        expect(result.FailureMessage).not.toContain('0min');
    });

    it('honours 0 as "no deadline" — the run stays pending rather than failing immediately', async () => {
        // Guards the disable path: reading 0 as "already expired" would fail every run that opted out.
        const run = new IntegrationConnectorCreationPipeline().Run(hangingOpts(0));
        const settled = await Promise.race([
            run.then(() => 'settled' as const),
            new Promise<'pending'>(r => { const t = setTimeout(() => r('pending'), 300); t.unref?.(); }),
        ]);
        expect(settled).toBe('pending');
    });
});

describe('IntegrationConnectorCreationPipeline — where the deadline comes from', () => {
    /**
     * The ceiling is the OUTERMOST discovery bound and the only one that can fail a whole run, yet it
     * was the only one with no configuration path: `discoveryTimeBudgetMs`, `discoveryBatchSize` and
     * `discoveryMaxRecords` all read from the connection, while this read a constant. Changing it meant
     * editing source and redeploying — so a NetForum catalog of 888 objects was failed at object 336 and
     * its introspection discarded, with no way to raise the limit for that one connection.
     *
     * These pin the precedence, not the numbers.
     */
    const resolve = (opts: unknown): number =>
        (IntegrationConnectorCreationPipeline as unknown as {
            ResolveRunDeadlineMs: (o: unknown) => number;
        }).ResolveRunDeadlineMs(opts);

    const withConfig = (cfg: unknown, rest: Record<string, unknown> = {}) => ({
        CompanyIntegration: { Configuration: typeof cfg === 'string' ? cfg : JSON.stringify(cfg) },
        ...rest,
    });

    const ENV = 'MJ_INTEGRATION_RUN_DEADLINE_MS';
    afterEach(() => { delete process.env[ENV]; });

    it('falls back to the default when nothing is set', () => {
        expect(resolve({})).toBe(45 * 60_000);
    });

    it('reads the connection Configuration — the case that had no path before', () => {
        expect(resolve(withConfig({ runDeadlineMs: 3 * 60 * 60_000 }))).toBe(3 * 60 * 60_000);
    });

    it('lets an explicit argument win over the connection', () => {
        expect(resolve(withConfig({ runDeadlineMs: 999 }, { RunDeadlineMs: 123 }))).toBe(123);
    });

    it('lets the connection win over the environment', () => {
        process.env[ENV] = '5000';
        expect(resolve(withConfig({ runDeadlineMs: 7000 }))).toBe(7000);
    });

    it('reads the environment when the connection says nothing', () => {
        process.env[ENV] = '5000';
        expect(resolve({})).toBe(5000);
    });

    it('honours 0 as "no ceiling" from the connection — the positive-only readers cannot express this', () => {
        expect(resolve(withConfig({ runDeadlineMs: 0 }))).toBe(0);
    });

    it('ignores a negative and falls through rather than disabling the ceiling by accident', () => {
        expect(resolve(withConfig({ runDeadlineMs: -1 }))).toBe(45 * 60_000);
    });

    it('ignores a non-numeric and falls through', () => {
        expect(resolve(withConfig({ runDeadlineMs: '3h' }))).toBe(45 * 60_000);
    });

    it('survives a malformed Configuration instead of throwing mid-run', () => {
        expect(resolve(withConfig('{not json'))).toBe(45 * 60_000);
    });

    it('survives a connection with no Configuration at all', () => {
        expect(resolve({ CompanyIntegration: {} })).toBe(45 * 60_000);
    });
});
