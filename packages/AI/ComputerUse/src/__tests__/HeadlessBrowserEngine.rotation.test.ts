import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Browser rotation — the fix for the unbounded Chromium RSS growth that killed
 * three full-suite regression runs (run-20260729T172418Z died at test 93/155,
 * run-20260729T223603Z at 130/155, run-20260730T200139Z at 153/155). Closing a
 * BrowserContext does not return its memory to the OS, so RSS climbs
 * monotonically; only replacing the process reclaims it.
 *
 * The engine **retires** rather than drains. An earlier version closed the
 * browser in place, so it first had to wait for every in-flight context to be
 * released — a moment when all N workers are simultaneously idle. That moment
 * essentially never arrives while workers cycle continuously, so rotation fired
 * ONCE in 3.9 hours and RSS reached 17.5 GB. Retirement needs no such moment:
 * new contexts immediately come from a fresh process, and the old one is closed
 * the instant its last straggler releases.
 *
 * These specs pin that contract: retire on a context threshold, never close a
 * process out from under a running test, always close it once it goes idle, never
 * launch two replacements for one retirement, never touch an attached browser,
 * and never at the cost of captured auth (a rotation that forced re-logins would
 * trade a memory bug for an Auth0 throttling bug).
 */

const { launch, connectOverCDP } = vi.hoisted(() => ({ launch: vi.fn(), connectOverCDP: vi.fn() }));
vi.mock('playwright', () => ({
    chromium: { launch, connect: vi.fn(), connectOverCDP },
}));

import { HeadlessBrowserEngine } from '../browser/HeadlessBrowserEngine.js';

interface MockBrowser {
    newContext: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    id: number;
}

let browsers: MockBrowser[];
/**
 * What every mock context reports from `storageState()`. Set once per test — each
 * release captures it into the worker's cache, so the value the engine replays
 * after a rotation is this one.
 */
let currentStorageState: unknown;

function makeContext() {
    return {
        newPage: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined), isClosed: () => false }),
        close: vi.fn().mockResolvedValue(undefined),
        storageState: vi.fn().mockImplementation(() => Promise.resolve(currentStorageState)),
    };
}

function makeBrowser(id: number): MockBrowser {
    return {
        id,
        newContext: vi.fn().mockImplementation(() => Promise.resolve(makeContext())),
        close: vi.fn().mockResolvedValue(undefined),
    };
}

beforeEach(async () => {
    vi.clearAllMocks();
    browsers = [];
    currentStorageState = { cookies: [], origins: [] };
    launch.mockImplementation(() => {
        const b = makeBrowser(browsers.length);
        browsers.push(b);
        return Promise.resolve(b);
    });
    await HeadlessBrowserEngine.Instance.Shutdown();
    // Small threshold keeps the specs fast and the intent legible.
    HeadlessBrowserEngine.Instance.RotateBrowserAfterContexts = 3;
});

afterEach(async () => {
    await HeadlessBrowserEngine.Instance.Shutdown();
    HeadlessBrowserEngine.Instance.RotateBrowserAfterContexts = 25;
});

/** One full serial test cycle: check a context out, then hand it back. */
async function cycle(workerKey = 'worker-0'): Promise<void> {
    const engine = HeadlessBrowserEngine.Instance;
    const adapter = await engine.GetIsolated(workerKey);
    await engine.ReleaseIsolated(adapter);
}

describe('HeadlessBrowserEngine browser rotation', () => {
    it('launches exactly one browser below the threshold', async () => {
        await cycle();
        await cycle();
        expect(browsers.length).toBe(1);
        expect(browsers[0].close).not.toHaveBeenCalled();
    });

    it('replaces the browser once the context threshold is reached', async () => {
        // Threshold 3: the 3rd checkout reaches it, the 4th retires and relaunches.
        await cycle();
        await cycle();
        await cycle();
        expect(browsers.length).toBe(1);

        await cycle();
        expect(browsers.length).toBe(2);
        expect(browsers[0].close).toHaveBeenCalledTimes(1);
        expect(browsers[1].close).not.toHaveBeenCalled();
    });

    it('resets its counter after rotating, so it takes another full threshold to rotate again', async () => {
        for (let i = 0; i < 4; i++) await cycle();
        expect(browsers.length).toBe(2);

        await cycle();
        await cycle();
        expect(browsers.length).toBe(2); // not yet — counter restarted
        await cycle();
        expect(browsers.length).toBe(3);
    });

    /**
     * The regression test for the starvation bug. A worker holding a context must
     * not block the *retirement* — only the old process's close. Previously the
     * held context blocked everything, and because some worker is essentially
     * always mid-test, rotation never happened at all.
     */
    it('retires and relaunches even while another worker still holds a context', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await cycle();
        await cycle();
        // Worker 1 checks out and HOLDS — this is the in-flight test.
        const held = await engine.GetIsolated('worker-1');
        expect(browsers.length).toBe(1);

        // Due to rotate. The new context comes from a fresh process immediately...
        const next = await engine.GetIsolated('worker-0');
        expect(browsers.length).toBe(2);
        // ...but the old one stays alive while the held context is still running.
        expect(browsers[0].close).not.toHaveBeenCalled();

        await engine.ReleaseIsolated(next);
        expect(browsers[0].close).not.toHaveBeenCalled(); // `held` is on browser 0

        // The last straggler releases — this is where the RSS actually comes back.
        await engine.ReleaseIsolated(held);
        expect(browsers[0].close).toHaveBeenCalledTimes(1);
        expect(browsers[1].close).not.toHaveBeenCalled();
    });

    /**
     * Workers never all go idle at once — exactly the condition the drain-based
     * implementation required and never got. Overlapping checkouts must still
     * rotate, repeatedly.
     */
    it('keeps rotating when the pool never goes fully idle', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        // Always at least one context outstanding: acquire the next before
        // releasing the previous, for 12 tests across a threshold of 3.
        let prev = await engine.GetIsolated('worker-0');
        for (let i = 0; i < 11; i++) {
            const nextAdapter = await engine.GetIsolated(`worker-${i % 3}`);
            await engine.ReleaseIsolated(prev);
            prev = nextAdapter;
        }
        await engine.ReleaseIsolated(prev);

        // 12 contexts at a threshold of 3 — several rotations, not one.
        expect(browsers.length).toBeGreaterThanOrEqual(4);
        // Every retired process was closed; only the current one survives.
        const closed = browsers.filter((b) => b.close.mock.calls.length > 0).length;
        expect(closed).toBe(browsers.length - 1);
    });

    it('launches only ONE replacement when several workers hit the rotation window together', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        for (let i = 0; i < 3; i++) await cycle();
        expect(browsers.length).toBe(1);

        // Three workers race into the rotation window simultaneously. Without the
        // in-flight launch guard each would start its own process and all but the
        // last would be orphaned.
        const adapters = await Promise.all([
            engine.GetIsolated('worker-0'),
            engine.GetIsolated('worker-1'),
            engine.GetIsolated('worker-2'),
        ]);
        expect(browsers.length).toBe(2);
        expect(browsers[0].close).toHaveBeenCalledTimes(1);
        expect(browsers[1].close).not.toHaveBeenCalled();

        for (const a of adapters) await engine.ReleaseIsolated(a);
    });

    it('preserves captured per-worker auth across a rotation (no forced re-login)', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        const captured = { cookies: [{ name: 'appSession', value: 'tok' }], origins: [] };
        // Every context reports the authenticated state, so each release captures
        // it — mirroring a suite where the session stays valid throughout.
        currentStorageState = captured;

        await cycle('worker-0');
        await cycle('worker-0');
        await cycle('worker-0');
        // This checkout rotates; the new browser must still be seeded with the
        // captured state for worker-0.
        const afterRotate = await engine.GetIsolated('worker-0');
        expect(browsers.length).toBe(2);
        const seededWith = browsers[1].newContext.mock.calls[0][0];
        expect(seededWith.storageState).toEqual(captured);

        await engine.ReleaseIsolated(afterRotate);
    });

    it('closes a retired browser at shutdown even if a context never released', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await cycle();
        await cycle();
        // Wedged test: acquired and never handed back.
        await engine.GetIsolated('worker-1');
        await engine.GetIsolated('worker-0'); // retires browser 0
        expect(browsers.length).toBe(2);
        expect(browsers[0].close).not.toHaveBeenCalled();

        await engine.Shutdown();
        // Shutdown owns every process it launched — a wedged context must not leak
        // a whole Chromium.
        expect(browsers[0].close).toHaveBeenCalledTimes(1);
        expect(browsers[1].close).toHaveBeenCalledTimes(1);
    });

    it('never rotates a browser it merely attached to (caller owns that process)', async () => {
        const attached = makeBrowser(99);
        connectOverCDP.mockResolvedValue(attached);
        const engine = HeadlessBrowserEngine.Instance;
        await engine.Initialize(true, 'http://localhost:9222');

        for (let i = 0; i < 6; i++) await cycle();

        expect(attached.close).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
    });
});
