/**
 * governedFetch is the single envelope both the loop-top fetch and the pipelined prefetch run
 * through: rate-limit token, adaptive fetch gate, per-attempt timeout, transient-only retry with
 * Retry-After pacing, and ONE throttle report per episode. These tests pin that envelope, because
 * the prefetch pipelining is only safe if a prefetched page is indistinguishable from a loop-top
 * fetch in pacing and error semantics — a prefetch with weaker semantics would be a second,
 * unguarded path to the vendor.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { RunConfiguration } from '../IntegrationEngine.js';
import type { FetchContext, FetchBatchResult } from '../BaseIntegrationConnector.js';

type Host = {
    governedFetch: (
        config: RunConfiguration,
        ctx: FetchContext,
        objectName: string | null,
        fetchTimeoutMs: number,
        batchIndex: number,
    ) => Promise<FetchBatchResult>;
    rateLimit: (config: RunConfiguration) => Promise<void>;
    reportRateOutcome: (config: RunConfiguration, throttledErr?: unknown) => void;
};

function makeHost() {
    // Prototype-based construction reaches the private members without a live engine run.
    // Object.create skips class-field initializers, so seed what reportRateOutcome dereferences.
    const host = Object.create(IntegrationEngine.prototype) as unknown as Host;
    (host as unknown as { _rateLimiters: Map<string, unknown> })._rateLimiters = new Map();
    const counters = { rateLimitAcquires: 0, throttleReports: 0, cleanReports: 0 };
    host.rateLimit = async () => { counters.rateLimitAcquires++; };
    host.reportRateOutcome = (_config, throttledErr?: unknown) => {
        if (throttledErr === undefined) counters.cleanReports++;
        else counters.throttleReports++;
    };
    return { host, counters };
}

function makeConfig(fetch: (ctx: FetchContext) => Promise<FetchBatchResult>, calls: { count: number }): RunConfiguration {
    return {
        companyIntegration: { ID: 'CI-1', Configuration: null },
        connector: {
            FetchChanges: (ctx: FetchContext) => { calls.count++; return fetch(ctx); },
            ExtractRetryAfterMs: () => 1, // keep retry pacing at 1ms in tests
        },
    } as unknown as RunConfiguration;
}

const ctx = {} as FetchContext;
const okBatch = { Records: [], HasMore: false } as unknown as FetchBatchResult;

describe('governedFetch', () => {
    it('clean fetch: one connector call, one rate-limit token, no rate reports of its own', async () => {
        const { host, counters } = makeHost();
        const calls = { count: 0 };
        const batch = await host.governedFetch(makeConfig(async () => okBatch, calls), ctx, 'Obj', 1000, 1);
        expect(batch).toBe(okBatch);
        expect(calls.count).toBe(1);
        expect(counters.rateLimitAcquires).toBe(1);
        // The CALLER reports the clean outcome (the loop-top does it once per consumed page,
        // whether the page was fetched inline or prefetched) — governedFetch never does.
        expect(counters.cleanReports).toBe(0);
        expect(counters.throttleReports).toBe(0);
    });

    it('persistent throttle: retries with Retry-After pacing, ONE decrease for the whole episode, every retry re-passes the rate limiter', async () => {
        const { host, counters } = makeHost();
        const calls = { count: 0 };
        const config = makeConfig(async () => { throw new Error('429 Too Many Requests'); }, calls);
        await expect(host.governedFetch(config, ctx, 'Obj', 1000, 1)).rejects.toThrow('429');
        expect(calls.count).toBe(3); // default MaxAttempts
        expect(counters.throttleReports).toBe(1); // one congestion EVENT, not three
        expect(counters.rateLimitAcquires).toBe(3); // initial + BeforeRetry × 2 — retries cannot bypass a freeze
    });

    it('our own page timeout is terminal — no retry stacks a second full page on a too-slow source', async () => {
        const { host } = makeHost();
        const calls = { count: 0 };
        const config = makeConfig(() => new Promise<FetchBatchResult>(() => { /* hangs */ }), calls);
        await expect(host.governedFetch(config, ctx, 'Obj', 20, 1)).rejects.toThrow(/timed out/i);
        expect(calls.count).toBe(1);
    });

    it('a transport error IS retried and succeeds on a later attempt', async () => {
        const { host, counters } = makeHost();
        const calls = { count: 0 };
        let failures = 1;
        const config = makeConfig(async () => {
            if (failures-- > 0) throw new Error('read ECONNRESET');
            return okBatch;
        }, calls);
        const batch = await host.governedFetch(config, ctx, 'Obj', 1000, 1);
        expect(batch).toBe(okBatch);
        expect(calls.count).toBe(2);
        expect(counters.throttleReports).toBe(0); // a reset socket is not a throttle
    });
});
