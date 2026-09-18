import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import { BrowserAction, ActionExecutionResult, CookieEntry } from '../types/browser.js';
import { RunComputerUseParams } from '../types/params.js';
import { AppProfile, SettleConfig } from '../types/app-profile.js';
import { JudgePromptRequest, JudgePromptResponse } from '../types/controller.js';
import { wallClockCeilingMs } from '../engine/step-control.js';

/**
 * The engine must be able to stop WAITING on a step it cannot finish.
 *
 * Perception runs on every step and reaches the page through calls the engine
 * does not own. When one of those goes silent, two containment gaps turn a
 * stuck call into a stuck run:
 *
 *  - the time budget is consulted only at the TOP of the step loop ("never
 *    START a step past budget"), so a step that blocks internally is never
 *    re-checked and the run never self-expires; and
 *  - `Stop()` is cooperative — its abort signal reaches the LLM calls but no
 *    browser work — so it only lands at the next checkpoint, which a blocked
 *    step never reaches.
 *
 * Both were observed together: a suite run logged `engine did not self-expire
 * at 1080000ms`, the driver's failsafe then called `Stop()`, and the test still
 * never completed — stranding its worker and every test queued behind it.
 *
 * These drive the real `Run` loop with an adapter that never answers, so each
 * test hangs forever if its containment path regresses.
 */

/** Adapter whose screenshot never returns — a renderer that accepts and goes silent. */
class SilentAdapter extends BaseBrowserAdapter {
    public Url = 'http://localhost:4200';
    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(url: string): Promise<void> {
        this.Url = url;
    }
    public async CaptureScreenshot(): Promise<string> {
        return new Promise<string>(() => {});
    }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        const r = new ActionExecutionResult(action);
        r.Success = true;
        return r;
    }
    public async SetExtraHeaders(): Promise<void> {}
    public async SetCookies(_c: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(): Promise<void> {}
    public get CurrentUrl(): string {
        return this.Url;
    }
    public get IsOpen(): boolean {
        return true;
    }
    public get ViewportWidth(): number {
        return 1280;
    }
    public get ViewportHeight(): number {
        return 720;
    }
}

/** Judge stub so graceful expiry's forced final verdict needs no model. */
class StubJudgeEngine extends ComputerUseEngine {
    protected async executeJudgePrompt(_request: JudgePromptRequest): Promise<JudgePromptResponse> {
        const resp = new JudgePromptResponse();
        resp.RawResponse = JSON.stringify({ done: false, confidence: 0, reason: 'expired' });
        return resp;
    }
}

const BUDGET_MS = 1000;

function hangingParams(): RunComputerUseParams {
    const p = new RunComputerUseParams();
    p.Goal = 'step deadline test';
    p.StartUrl = 'http://localhost:4200';
    p.MaxExecutionTimeMs = BUDGET_MS;
    const profile = new AppProfile();
    const s = new SettleConfig();
    s.MaxWaitMs = 50;
    s.PollMs = 5;
    s.NetworkIdleCapMs = 5;
    s.MinWaitMs = 0;
    profile.Settle = s;
    p.AppProfile = profile;
    return p;
}

afterEach(() => {
    vi.useRealTimers();
});

describe('ComputerUseEngine — a blocked step cannot strand the run', () => {
    it('expires gracefully as TimeBudgetExceeded when a step blocks past the wall-clock ceiling', async () => {
        vi.useFakeTimers();
        const engine = new StubJudgeEngine();
        engine.SetBrowserAdapter(new SilentAdapter());

        const run = engine.Run(hangingParams());
        // Past the ceiling the run was always supposed to end by. Without a
        // deadline that races the step, nothing here ever resolves.
        await vi.advanceTimersByTimeAsync(wallClockCeilingMs(BUDGET_MS) + 1000);

        const result = await run;

        expect(result.Status).toBe('TimeBudgetExceeded');
        expect(result.Success).toBe(false);
    }, 20_000);

    it('unwinds to Cancelled when Stop() is called while a step is blocked', async () => {
        const engine = new StubJudgeEngine();
        engine.SetBrowserAdapter(new SilentAdapter());

        const run = engine.Run(hangingParams());
        // Give the loop a moment to enter the step and block inside perception,
        // so Stop() lands where no cooperative checkpoint can observe it.
        await new Promise(resolve => setTimeout(resolve, 100));
        engine.Stop();

        const result = await run;

        expect(result.Status).toBe('Cancelled');
        expect(result.Success).toBe(false);
    }, 10_000);
});

/**
 * Adapter that counts the browser work it is asked to do, and whose screenshot
 * blocks the FIRST time only — so the orphaned step can be observed continuing
 * after the run has already been scored.
 */
class CountingSilentAdapter extends SilentAdapter {
    public actions = 0;
    private blocked = false;
    public override async CaptureScreenshot(): Promise<string> {
        if (!this.blocked) {
            this.blocked = true;
            return new Promise<string>(() => {});
        }
        return 'FAKE';
    }
    public override async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        this.actions++;
        return super.ExecuteAction(action);
    }
}

describe('expiry aborts the orphaned step (review: non-blocking)', () => {
    it('marks the run cancelled and aborts when the budget expires mid-step', async () => {
        vi.useFakeTimers();
        const engine = new StubJudgeEngine();
        const adapter = new CountingSilentAdapter();
        engine.SetBrowserAdapter(adapter);

        const run = engine.Run(hangingParams());
        await vi.advanceTimersByTimeAsync(wallClockCeilingMs(BUDGET_MS) + 1000);
        const result = await run;

        expect(result.Status).toBe('TimeBudgetExceeded');
        // The step we abandoned must not still be allowed to drive the browser.
        // Without an abort it reaches its next cooperative checkpoint and carries
        // on — a model call per expiry, and on a shared context it can click into
        // whatever test is using the page next.
        expect(engine.IsStopped).toBe(true);
    }, 20_000);
});

describe('Replay is bounded the same way as the LLM tier (review: non-blocking)', () => {
    it('unwinds to Cancelled when Stop() lands while a replay step is blocked', async () => {
        const engine = new StubJudgeEngine();
        engine.SetBrowserAdapter(new SilentAdapter());

        const trace = { TestId: 'T1', GoalHash: '', AppBuildHash: '', Steps: [
            { Instruction: 'click Save', Action: { Method: 'click', Target: { Role: 'button', Name: 'Save', Selector: '#s' } }, Precondition: {}, Postcondition: undefined },
        ] } as never;

        const replay = engine.Replay(trace, hangingParams());
        await new Promise(resolve => setTimeout(resolve, 100));
        engine.Stop();

        const result = await replay;
        expect(result.Status).toBe('Cancelled');
    }, 10_000);

    it('self-expires a replay step that blocks past the wall-clock ceiling', async () => {
        vi.useFakeTimers();
        const engine = new StubJudgeEngine();
        engine.SetBrowserAdapter(new SilentAdapter());

        const trace = { TestId: 'T1', GoalHash: '', AppBuildHash: '', Steps: [
            { Instruction: 'click Save', Action: { Method: 'click', Target: { Role: 'button', Name: 'Save', Selector: '#s' } }, Precondition: {}, Postcondition: undefined },
        ] } as never;

        const replay = engine.Replay(trace, hangingParams());
        await vi.advanceTimersByTimeAsync(wallClockCeilingMs(BUDGET_MS) + 1000);

        const result = await replay;
        expect(result.Status).toBe('TimeBudgetExceeded');
    }, 20_000);
});
