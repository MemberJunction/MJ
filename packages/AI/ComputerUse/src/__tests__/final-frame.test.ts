import { describe, expect, it } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import { ActionExecutionResult, type BrowserAction, type CookieEntry } from '../types/browser.js';
import { RunComputerUseParams } from '../types/params.js';
import { AppProfile, SettleConfig } from '../types/app-profile.js';
import { ControllerPromptResponse, JudgePromptResponse, type ControllerPromptRequest, type JudgePromptRequest } from '../types/controller.js';

/** Returns a different frame on each capture so the final frame can be told apart. */
class CountingAdapter extends BaseBrowserAdapter {
    public captures = 0;
    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(): Promise<void> {}
    public async CaptureScreenshot(): Promise<string> { this.captures += 1; return `FRAME-${this.captures}`; }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> { const r = new ActionExecutionResult(action); r.Success = true; return r; }
    public async SetExtraHeaders(): Promise<void> {}
    public async SetCookies(_c: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(): Promise<void> {}
    public get CurrentUrl(): string { return 'http://localhost:4200'; }
    public get IsOpen(): boolean { return true; }
    public get ViewportWidth(): number { return 1280; }
    public get ViewportHeight(): number { return 720; }
}

/** Ends the loop at step 1 with a judged Done. */
class DoneAtOnceEngine extends ComputerUseEngine {
    protected async executeControllerPrompt(_request: ControllerPromptRequest): Promise<ControllerPromptResponse> {
        const resp = new ControllerPromptResponse();
        resp.RequestJudgement = true;
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

describe('final frame', () => {
    it('captures one more frame after the last step and reports it as the final screenshot', async () => {
        const engine = new DoneAtOnceEngine();
        const adapter = new CountingAdapter();
        engine.SetBrowserAdapter(adapter);
        const params = new RunComputerUseParams();
        params.Goal = 'final frame';
        params.StartUrl = 'http://localhost:4200';
        params.AppProfile = fastProfile();
        params.MaxSteps = 2;
        const result = await engine.Run(params);
        expect(result.Status).toBe('Completed');
        expect(result.FinalFrameCapturedAfterActions).toBe(true);
        expect(result.FinalScreenshot).toBe(`FRAME-${adapter.captures}`);
        expect(result.Steps[result.Steps.length - 1].Screenshot).not.toBe(result.FinalScreenshot);
    });
});
