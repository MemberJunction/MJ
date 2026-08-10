import { describe, it, expect } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
    NavigateAction,
} from '../types/browser.js';
import { RunComputerUseParams, RunPrelude } from '../types/params.js';
import { AppProfile, SettleConfig } from '../types/app-profile.js';
import {
    ControllerPromptRequest,
    ControllerPromptResponse,
    JudgePromptRequest,
    JudgePromptResponse,
} from '../types/controller.js';

/** Fake adapter that records navigations and applies them to CurrentUrl. */
class NavFakeAdapter extends BaseBrowserAdapter {
    public Url = 'http://localhost:4200';
    public navigations: string[] = [];
    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(url: string): Promise<void> { this.Url = url; this.navigations.push(url); }
    public async CaptureScreenshot(): Promise<string> { return 'FAKE'; }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        const r = new ActionExecutionResult(action);
        r.Success = true;
        if (action.Type === 'Navigate') { this.Url = action.Url; this.navigations.push(action.Url); }
        return r;
    }
    public async SetExtraHeaders(): Promise<void> {}
    public async SetCookies(_c: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(): Promise<void> {}
    public get CurrentUrl(): string { return this.Url; }
    public get IsOpen(): boolean { return true; }
    public get ViewportWidth(): number { return 1280; }
    public get ViewportHeight(): number { return 720; }
}

/** Engine that ends the loop at step 1 and records the URL the controller first saw. */
class PreludeProbeEngine extends ComputerUseEngine {
    public firstSeenUrl?: string;
    protected async executeControllerPrompt(request: ControllerPromptRequest): Promise<ControllerPromptResponse> {
        if (this.firstSeenUrl === undefined) this.firstSeenUrl = request.CurrentUrl;
        const resp = new ControllerPromptResponse();
        resp.RequestJudgement = true;   // deliberate "am I done?" — ends the loop without actions
        resp.Reasoning = 'checking';
        return resp;
    }
    protected async executeJudgePrompt(_request: JudgePromptRequest): Promise<JudgePromptResponse> {
        const resp = new JudgePromptResponse();
        resp.RawResponse = JSON.stringify({ done: true, confidence: 1, reason: 'ok' });
        return resp;
    }
}

function fastProfile(): AppProfile {
    const p = new AppProfile();
    const s = new SettleConfig();
    s.MaxWaitMs = 150; s.PollMs = 5; s.NetworkIdleCapMs = 5; s.MinWaitMs = 0;
    p.Settle = s;
    return p;
}

describe('ComputerUseEngine prelude', () => {
    it('runs the scripted prelude before the agentic loop (zero LLM)', async () => {
        const engine = new PreludeProbeEngine();
        const adapter = new NavFakeAdapter();
        engine.SetBrowserAdapter(adapter);

        const params = new RunComputerUseParams();
        params.Goal = 'prelude test';
        params.StartUrl = 'http://localhost:4200';
        params.AppProfile = fastProfile();
        const prelude = new RunPrelude();
        const nav = new NavigateAction(); nav.Url = 'http://localhost:4200/app/data';
        prelude.Actions = [nav];
        prelude.ExpectUrlPattern = '/app/data';
        params.Prelude = prelude;

        const result = await engine.Run(params);

        expect(result.Status).toBe('Completed');
        // The prelude navigated to /app/data BEFORE the controller's first turn.
        expect(adapter.navigations).toContain('http://localhost:4200/app/data');
        expect(engine.firstSeenUrl).toBe('http://localhost:4200/app/data');
    });

    it('is a no-op when no prelude is configured', async () => {
        const engine = new PreludeProbeEngine();
        const adapter = new NavFakeAdapter();
        engine.SetBrowserAdapter(adapter);

        const params = new RunComputerUseParams();
        params.Goal = 'no prelude';
        params.StartUrl = 'http://localhost:4200/app/home';
        params.AppProfile = fastProfile();

        const result = await engine.Run(params);
        expect(result.Status).toBe('Completed');
        // Only the start-URL navigation happened.
        expect(adapter.navigations).toEqual(['http://localhost:4200/app/home']);
    });
});
