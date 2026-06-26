import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// HeadlessBrowserEngine dynamically imports 'playwright'; mock it so these
// tests never touch a real browser. Each newContext() returns a fresh mock
// context with a storageState() spy so we can assert capture behaviour.
const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({
    chromium: { launch, connect: vi.fn(), connectOverCDP: vi.fn() },
}));

import { HeadlessBrowserEngine } from '../browser/HeadlessBrowserEngine.js';

// A representative Playwright storageState (cookies + per-origin localStorage),
// the shape the auth bootstrap writes and the driver seeds from.
const SEED = {
    cookies: [
        { name: 'appSession', value: 'tok', domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' },
    ],
    origins: [
        { origin: 'http://localhost:4200', localStorage: [{ name: '@@auth0spajs@@::x', value: '{}' }] },
    ],
};

// Only the fields of Playwright's BrowserContextOptions that these tests read.
type CtxOpts = {
    viewport?: { width: number; height: number };
    userAgent?: string;
    storageState?: typeof SEED;
};

interface MockContext {
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    storageState: ReturnType<typeof vi.fn>;
}

let newContextCalls: CtxOpts[];
let createdContexts: MockContext[];

function makeContext(): MockContext {
    return {
        newPage: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined), isClosed: () => false }),
        close: vi.fn().mockResolvedValue(undefined),
        storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
    };
}

const seedFile = join(tmpdir(), 'mj-shared-seed-test.json');
const missingFile = join(tmpdir(), 'mj-shared-seed-does-not-exist.json');

beforeEach(async () => {
    vi.clearAllMocks();
    newContextCalls = [];
    createdContexts = [];
    const browser = {
        newContext: vi.fn().mockImplementation((opts: CtxOpts) => {
            newContextCalls.push(opts ?? {});
            const ctx = makeContext();
            createdContexts.push(ctx);
            return Promise.resolve(ctx);
        }),
        close: vi.fn().mockResolvedValue(undefined),
    };
    launch.mockResolvedValue(browser);
    // Start from a fully-reset singleton (also clears any shared seed).
    await HeadlessBrowserEngine.Instance.Shutdown();
    writeFileSync(seedFile, JSON.stringify(SEED), 'utf8');
});

afterEach(async () => {
    await HeadlessBrowserEngine.Instance.Shutdown();
    try { rmSync(seedFile); } catch { /* ignore */ }
});

describe('HeadlessBrowserEngine shared seed (single-login mode)', () => {
    it('starts with no shared seed', () => {
        expect(HeadlessBrowserEngine.Instance.HasSharedStorageState).toBe(false);
    });

    it('EnsureSharedStorageStateFromFile loads a valid file and is idempotent', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        expect(await engine.EnsureSharedStorageStateFromFile(seedFile)).toBe(true);
        expect(engine.HasSharedStorageState).toBe(true);
        // Repeat for the same path is a no-op that still reports active.
        expect(await engine.EnsureSharedStorageStateFromFile(seedFile)).toBe(true);
        expect(engine.HasSharedStorageState).toBe(true);
    });

    it('EnsureSharedStorageStateFromFile returns false for a missing file (graceful fallback)', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        expect(await engine.EnsureSharedStorageStateFromFile(missingFile)).toBe(false);
        expect(engine.HasSharedStorageState).toBe(false);
    });

    it('SetSharedStorageState(null) clears an active seed', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await engine.EnsureSharedStorageStateFromFile(seedFile);
        expect(engine.HasSharedStorageState).toBe(true);
        engine.SetSharedStorageState(null);
        expect(engine.HasSharedStorageState).toBe(false);
    });

    it('GetIsolated seeds every context from the shared seed, regardless of worker', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await engine.EnsureSharedStorageStateFromFile(seedFile);

        await engine.GetIsolated('worker-0');
        await engine.GetIsolated('worker-1');

        expect(newContextCalls).toHaveLength(2);
        // Both workers' contexts are seeded with the same shared state.
        expect(newContextCalls[0].storageState).toEqual(SEED);
        expect(newContextCalls[1].storageState).toEqual(SEED);
    });

    it('GetIsolated uses no seed when single-login mode is off and the worker has no capture', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await engine.GetIsolated('worker-0');
        expect(newContextCalls).toHaveLength(1);
        expect(newContextCalls[0].storageState).toBeUndefined();
    });

    it('ReleaseIsolated skips per-worker capture when a shared seed is active', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        await engine.EnsureSharedStorageStateFromFile(seedFile);

        const adapter = await engine.GetIsolated('worker-0');
        const ctx = createdContexts[0];
        await engine.ReleaseIsolated(adapter);

        // Capture is bypassed (the pristine seed must not be overwritten), and
        // the context is still closed.
        expect(ctx.storageState).not.toHaveBeenCalled();
        expect(ctx.close).toHaveBeenCalled();
    });

    it('ReleaseIsolated captures per-worker state when single-login mode is off', async () => {
        const engine = HeadlessBrowserEngine.Instance;
        const adapter = await engine.GetIsolated('worker-0');
        const ctx = createdContexts[0];
        await engine.ReleaseIsolated(adapter);

        expect(ctx.storageState).toHaveBeenCalled();
    });
});
