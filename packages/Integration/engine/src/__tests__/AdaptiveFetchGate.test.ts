/**
 * The adaptive fetch gate: a per-connection cap on SIMULTANEOUS vendor fetches that finds the
 * account's real concurrency grant by detecting throttles.
 *
 * The failure mode this prevents was measured live: an account granting 5 concurrent requests,
 * an engine firing ~16 (lanes × prefetch), and every overflow request serving a ~31s backoff
 * INSIDE the fetch — invisible to every resource metric, because a backoff is idle. The gate
 * queues the overflow client-side (milliseconds) instead, and its cap is AIMD: halve on a
 * detected throttle, +1 per clean outcome, so it converges on the grant with zero configuration.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { RunConfiguration } from '../IntegrationEngine.js';

type GateHost = {
    getFetchGate: (config: RunConfiguration) => { ceiling: number; controller: { Cap: number }; inFlight: number; waiters: unknown[] };
    withFetchGate: <T>(config: RunConfiguration, fn: () => Promise<T>) => Promise<T>;
    reportRateOutcome: (config: RunConfiguration, throttledErr?: unknown) => void;
};

function makeHost(): GateHost {
    // Prototype-based construction reaches the private members without a live engine run.
    // Object.create skips class-field initializers, so seed the one field reportRateOutcome
    // dereferences unconditionally (the real constructor initializes it).
    const host = Object.create(IntegrationEngine.prototype) as unknown as GateHost;
    (host as unknown as { _rateLimiters: Map<string, unknown> })._rateLimiters = new Map();
    return host;
}

function makeConfig(id: string, hint?: number, fetchConcurrency?: number): RunConfiguration {
    return {
        companyIntegration: {
            ID: id,
            Configuration: fetchConcurrency !== undefined ? JSON.stringify({ fetchConcurrency }) : null,
        },
        connector: {
            MaxConcurrencyHint: hint,
            ExtractRetryAfterMs: () => undefined,
        },
    } as unknown as RunConfiguration;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('adaptive fetch gate', () => {
    it('caps simultaneous fetches at the configured ceiling and completes everything', async () => {
        const host = makeHost();
        const config = makeConfig('C1', undefined, 3);
        let inFlight = 0;
        let maxSeen = 0;
        let done = 0;
        const work = () => host.withFetchGate(config, async () => {
            inFlight++;
            maxSeen = Math.max(maxSeen, inFlight);
            await new Promise((r) => setTimeout(r, 15));
            inFlight--;
            done++;
        });
        await Promise.all(Array.from({ length: 12 }, work));
        expect(maxSeen).toBe(3);
        expect(done).toBe(12);
    });

    it('defaults to MaxConcurrencyHint, then to 5', () => {
        const host = makeHost();
        expect(host.getFetchGate(makeConfig('H1', 2)).controller.Cap).toBe(2);
        expect(host.getFetchGate(makeConfig('H2')).controller.Cap).toBe(5);
    });

    it('halves the cap when a throttle is reported — including connector-reported ones', () => {
        const host = makeHost();
        const config = makeConfig('T1', undefined, 8);
        const gate = host.getFetchGate(config);
        expect(gate.controller.Cap).toBe(8);
        // This is the same entry point ctx.RateLimitReport routes to, so a throttle the
        // connector absorbed inside its own retry still teaches the gate.
        host.reportRateOutcome(config, new Error('429 concurrency limit'));
        expect(gate.controller.Cap).toBe(4);
        host.reportRateOutcome(config, new Error('429 again'));
        expect(gate.controller.Cap).toBe(2);
    });

    it('creeps back up on clean outcomes, never past the ceiling', () => {
        const host = makeHost();
        const config = makeConfig('G1', undefined, 6);
        const gate = host.getFetchGate(config);
        host.reportRateOutcome(config, new Error('429'));
        expect(gate.controller.Cap).toBe(3);
        for (let i = 0; i < 10; i++) host.reportRateOutcome(config);
        expect(gate.controller.Cap).toBe(6); // clamped at the ceiling, not 13
    });

    it('a shrunken cap immediately constrains new admissions', async () => {
        const host = makeHost();
        const config = makeConfig('S1', undefined, 4);
        let inFlight = 0;
        let maxAfterShrink = 0;
        let shrunk = false;
        const work = () => host.withFetchGate(config, async () => {
            inFlight++;
            if (shrunk) maxAfterShrink = Math.max(maxAfterShrink, inFlight);
            await new Promise((r) => setTimeout(r, 20));
            inFlight--;
        });
        const first = [work(), work(), work(), work()]; // fills the gate at cap 4
        await tick();
        host.reportRateOutcome(config, new Error('429')); // cap 4 → 2
        shrunk = true;
        const second = [work(), work(), work(), work()];
        await Promise.all([...first, ...second]);
        expect(maxAfterShrink).toBeLessThanOrEqual(2);
    });

    it('releases its slot when the fetch throws', async () => {
        const host = makeHost();
        const config = makeConfig('E1', undefined, 1);
        await expect(host.withFetchGate(config, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        // The slot must be free again — a second call completes rather than deadlocking.
        const result = await host.withFetchGate(config, async () => 'ok');
        expect(result).toBe('ok');
    });
});
