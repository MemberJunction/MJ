import { describe, it, expect } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
    ContextSeed,
} from '../types/browser.js';
import { RunComputerUseParams } from '../types/params.js';
import { ComputerUseTrace } from '../types/trace.js';

/** Records SeedContext calls; the seed capability is otherwise inert. */
class SeedFakeAdapter extends BaseBrowserAdapter {
    public seedCalls: ContextSeed[] = [];
    public seedShouldThrow = false;
    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(): Promise<void> {}
    public async CaptureScreenshot(): Promise<string> { return 'FAKE'; }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        const r = new ActionExecutionResult(action); r.Success = true; return r;
    }
    public override async SeedContext(seed: ContextSeed): Promise<void> {
        if (this.seedShouldThrow) throw new Error('seed boom');
        this.seedCalls.push(seed);
    }
    public async SetExtraHeaders(): Promise<void> {}
    public async SetCookies(_c: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(): Promise<void> {}
    public get CurrentUrl(): string { return 'http://localhost:4200'; }
    public get IsOpen(): boolean { return true; }
    public get ViewportWidth(): number { return 1280; }
    public get ViewportHeight(): number { return 720; }
}

/** Minimal adapter leaving the G4 seam at its BaseBrowserAdapter defaults. */
class MinimalAdapter extends BaseBrowserAdapter {
    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(): Promise<void> {}
    public async CaptureScreenshot(): Promise<string> { return ''; }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> { return new ActionExecutionResult(action); }
    public async SetExtraHeaders(): Promise<void> {}
    public async SetCookies(_c: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(): Promise<void> {}
    public get CurrentUrl(): string { return ''; }
    public get IsOpen(): boolean { return false; }
    public get ViewportWidth(): number { return 0; }
    public get ViewportHeight(): number { return 0; }
}

function seed(): ContextSeed {
    const s = new ContextSeed();
    s.Origin = 'http://localhost:4200';
    s.LocalStorage = [{ name: 'k', value: 'v' }];
    return s;
}

describe('BaseBrowserAdapter warm-seed defaults', () => {
    it('CaptureContextSeed defaults to null; SeedContext to a no-op', async () => {
        const a = new MinimalAdapter();
        await expect(a.CaptureContextSeed('http://x')).resolves.toBeNull();
        await expect(a.SeedContext(seed())).resolves.toBeUndefined();
    });
});

describe('ComputerUseEngine warm-seed plumbing', () => {
    async function runReplay(params: RunComputerUseParams, adapter: SeedFakeAdapter) {
        const engine = new ComputerUseEngine();
        engine.SetBrowserAdapter(adapter);
        const trace = new ComputerUseTrace();   // empty trace → Completed immediately
        trace.TestId = 'T1';
        return engine.Replay(trace, params);
    }

    it('restores the context seed after launch when one is supplied', async () => {
        const adapter = new SeedFakeAdapter();
        const params = new RunComputerUseParams();
        params.ContextSeed = seed();
        const result = await runReplay(params, adapter);
        expect(result.Status).toBe('Completed');
        expect(adapter.seedCalls).toHaveLength(1);
        expect(adapter.seedCalls[0].Origin).toBe('http://localhost:4200');
    });

    it('does not seed when no ContextSeed is supplied', async () => {
        const adapter = new SeedFakeAdapter();
        await runReplay(new RunComputerUseParams(), adapter);
        expect(adapter.seedCalls).toHaveLength(0);
    });

    it('a failing SeedContext does not abort the run (cold-boot fallback)', async () => {
        const adapter = new SeedFakeAdapter();
        adapter.seedShouldThrow = true;
        const params = new RunComputerUseParams();
        params.ContextSeed = seed();
        const result = await runReplay(params, adapter);
        expect(result.Status).toBe('Completed');   // run proceeded despite the seed failure
    });
});
