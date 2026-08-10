import { describe, it, expect } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
    ElementInfo,
    InteractiveElement,
} from '../types/browser.js';
import { RunComputerUseParams, RunCheckpoint } from '../types/params.js';
import { AppProfile, SettleConfig } from '../types/app-profile.js';
import { ComputerUseTrace, TraceStep, TraceTarget, StepPostcondition, GoalPostcondition } from '../types/trace.js';
import { JudgePromptRequest, JudgePromptResponse } from '../types/controller.js';

/**
 * Scriptable fake adapter for driving the replay loop without a real browser.
 * - QueryElement resolves from a selector→visibility map (missing = absent).
 * - ExecuteAction records the action; a Navigate updates the URL; a click can be
 *   scripted to change the URL (simulating navigation).
 */
class FakeAdapter extends BaseBrowserAdapter {
    public Url = 'http://localhost:4200/app/home';
    public visible = new Map<string, boolean>();
    public typed: { selector?: string; text: string }[] = [];
    /** selector → URL to move to when a click on it executes. */
    public clickNavigates = new Map<string, string>();
    public failSelectors = new Set<string>();
    /** Elements returned by ExtractInteractiveElements (for goal postconditions). */
    public elements: InteractiveElement[] = [];

    public async Launch(_c: BrowserConfig): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(url: string): Promise<void> { this.Url = url; }
    public async CaptureScreenshot(): Promise<string> { return 'FAKE_SCREENSHOT'; }
    public async QueryElement(selector: string): Promise<ElementInfo> {
        const info = new ElementInfo();
        info.Exists = this.visible.get(selector) ?? false;
        info.Visible = info.Exists;
        return info;
    }
    public async ExtractInteractiveElements(): Promise<InteractiveElement[]> {
        return this.elements;
    }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        const r = new ActionExecutionResult(action);
        if (action.Type === 'Click' && action.Selector && this.failSelectors.has(action.Selector)) {
            r.Success = false; r.Error = 'scripted click failure';
            return r;
        }
        r.Success = true;
        if (action.Type === 'Click' && action.Selector && this.clickNavigates.has(action.Selector)) {
            this.Url = this.clickNavigates.get(action.Selector)!;
        }
        if (action.Type === 'Type') {
            this.typed.push({ selector: action.Selector, text: action.Text });
        }
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

/** Near-instant settle so replay tests don't wait on the 30s default loop. */
function fastProfile(): AppProfile {
    const p = new AppProfile();
    const s = new SettleConfig();
    s.MaxWaitMs = 200; s.PollMs = 5; s.NetworkIdleCapMs = 5; s.MinWaitMs = 0;
    p.Settle = s;
    return p;
}

function baseParams(): RunComputerUseParams {
    const p = new RunComputerUseParams();
    p.Goal = 'replay test';
    p.AppProfile = fastProfile();
    const bc = new BrowserConfig();
    bc.ActionTimeoutMs = 80;   // keep precondition-timeout divergence fast
    p.BrowserConfig = bc;
    return p;
}

function clickStep(selector: string, opts: { urlBefore?: string; postUrl?: string } = {}): TraceStep {
    const s = new TraceStep();
    s.Instruction = `click ${selector}`;
    s.Action.Method = 'click';
    s.Action.Target = Object.assign(new TraceTarget(), { Selector: selector });
    s.Precondition.WaitForTarget = true;
    if (opts.urlBefore) s.Precondition.UrlPattern = opts.urlBefore;
    if (opts.postUrl) {
        s.Postcondition = Object.assign(new StepPostcondition(), { UrlPattern: opts.postUrl });
    }
    return s;
}

function typeStep(selector: string, text: string): TraceStep {
    const s = new TraceStep();
    s.Instruction = `type into ${selector}`;
    s.Action.Method = 'type';
    s.Action.Text = text;
    s.Action.Target = Object.assign(new TraceTarget(), { Selector: selector });
    s.Precondition.WaitForTarget = true;
    return s;
}

function trace(steps: TraceStep[]): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = 'T1';
    t.Steps = steps;
    return t;
}

/**
 * Engine with a scriptable end-state judge verdict so the replay goal-scoring
 * path (Option 1) is deterministic. The end-state judge sets
 * ControllerRequestedJudgement=true, so HybridJudge goes straight to the LLM
 * seam — this override — skipping heuristics.
 */
class JudgeScriptEngine extends ComputerUseEngine {
    public judgeCalls = 0;
    constructor(private readonly done: boolean, private readonly confidence = 0.9) { super(); }
    protected async executeJudgePrompt(_r: JudgePromptRequest): Promise<JudgePromptResponse> {
        this.judgeCalls++;
        const resp = new JudgePromptResponse();
        resp.RawResponse = JSON.stringify({
            done: this.done,
            confidence: this.confidence,
            reason: this.done ? 'goal met' : 'goal not met',
        });
        return resp;
    }
}

describe('ComputerUseEngine.Replay', () => {
    it('replays a happy path to Completed with all steps hit', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        adapter.visible.set('#search', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        engine.SetBrowserAdapter(adapter);

        const t = trace([
            clickStep('#nav', { postUrl: '/app/data' }),
            typeStep('#search', 'hello'),
        ]);
        const result = await engine.Replay(t, baseParams());

        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(true);
        expect(result.Replay?.AllStepsSucceeded).toBe(true);
        expect(result.Replay?.Steps.map(s => s.Outcome)).toEqual(['hit', 'hit']);
        expect(result.Replay?.Diverged).toBe(0);
        expect(result.Steps).toHaveLength(2);
    });

    it('diverges fail-fast when a precondition target never appears', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        // #missing never becomes visible; #later would, but replay must stop at step 1.
        adapter.visible.set('#later', true);
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('#missing'), clickStep('#later')]);
        const result = await engine.Replay(t, baseParams());

        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Diverged).toBe(1);
        expect(result.Replay?.Steps).toHaveLength(1);           // fail-fast: step 2 never ran
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
        expect(result.Replay?.Steps[0].Detail).toContain('precondition');
        // A non-passing terminal carries a retry memo.
        expect(result.FailureMemo).toBeTruthy();
        expect(result.FailureMemo).toContain('Failed');
    });

    it('diverges when a postcondition URL does not match', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        // Click does NOT navigate — the /app/data postcondition will fail.
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('#nav', { postUrl: '/app/data' })]);
        const result = await engine.Replay(t, baseParams());

        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
        expect(result.Replay?.Steps[0].Detail).toContain('postcondition');
    });

    it('diverges when a recorded action fails', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#save', true);
        adapter.failSelectors.add('#save');
        engine.SetBrowserAdapter(adapter);

        const result = await engine.Replay(trace([clickStep('#save')]), baseParams());
        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Steps[0].Detail).toContain('action Click failed');
    });

    it('substitutes fresh variable values into typed text', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#name', true);
        engine.SetBrowserAdapter(adapter);

        const params = baseParams();
        params.VariableValues = { recordName: 'Acme-2026' };
        const result = await engine.Replay(trace([typeStep('#name', 'Co-%recordName%')]), params);

        expect(result.Status).toBe('Completed');
        expect(adapter.typed).toEqual([{ selector: '#name', text: 'Co-Acme-2026' }]);
    });

    it('scores Completed only when goal postconditions are met', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        const heading = new InteractiveElement();
        heading.Role = 'heading'; heading.Name = 'Data Explorer';
        adapter.elements = [heading];
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('#nav', { postUrl: '/app/data' })]);
        t.GoalPostconditions = [
            Object.assign(new GoalPostcondition(), { Kind: 'url', UrlPattern: '/app/data' }),
            Object.assign(new GoalPostcondition(), { Kind: 'visible', Target: Object.assign(new TraceTarget(), { Role: 'heading', Name: 'Data Explorer' }) }),
        ];

        const result = await engine.Replay(t, baseParams());
        expect(result.Status).toBe('Completed');
    });

    it('fails when all steps hit but a goal postcondition is unmet', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        adapter.elements = [];   // the expected heading is NOT present
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('#nav', { postUrl: '/app/data' })]);
        t.GoalPostconditions = [
            Object.assign(new GoalPostcondition(), { Kind: 'visible', Target: Object.assign(new TraceTarget(), { Role: 'heading', Name: 'Data Explorer' }) }),
        ];

        const result = await engine.Replay(t, baseParams());
        expect(result.Status).toBe('Failed');
        expect(result.Replay?.AllStepsSucceeded).toBe(true);   // steps hit — the GOAL check failed
    });
});

describe('ComputerUseEngine.Replay end-state judge (Option 1 — goal-completion parity)', () => {
    function dataGridTrace(): ComputerUseTrace {
        return trace([clickStep('#nav', { postUrl: '/app/data' })]);
    }
    function withGrid(engine: ComputerUseEngine): FakeAdapter {
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        engine.SetBrowserAdapter(adapter);
        return adapter;
    }

    it('passes a clean replay when the judge confirms the goal (ValidationCriteria set)', async () => {
        const engine = new JudgeScriptEngine(true);
        withGrid(engine);
        const params = baseParams();
        params.ValidationCriteria = ['the data grid is visible'];
        const result = await engine.Replay(dataGridTrace(), params);
        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(true);
        expect(result.FinalJudgeVerdict?.Done).toBe(true);
        expect(engine.judgeCalls).toBe(1);
    });

    it('fails a mechanically-clean replay when the judge rejects the goal (→ driver LLM fallback)', async () => {
        const engine = new JudgeScriptEngine(false);
        withGrid(engine);
        const params = baseParams();
        params.ValidationCriteria = ['the data grid is visible'];
        const result = await engine.Replay(dataGridTrace(), params);
        expect(result.Status).toBe('Failed');                  // driver keys LLM fallback on non-Completed
        expect(result.Replay?.AllStepsSucceeded).toBe(true);   // steps hit — the JUDGE rejected the goal
        expect(result.FinalJudgeVerdict?.Done).toBe(false);
    });

    it('skips the judge entirely when no ValidationCriteria are supplied', async () => {
        // The scripted judge would REJECT — proving the gate: with no rubric it is never called.
        const engine = new JudgeScriptEngine(false);
        withGrid(engine);
        const result = await engine.Replay(dataGridTrace(), baseParams());
        expect(result.Status).toBe('Completed');
        expect(engine.judgeCalls).toBe(0);
        expect(result.FinalJudgeVerdict).toBeUndefined();
    });
});

describe('ComputerUseEngine.Replay checkpoint tours (on the replay tier)', () => {
    function tourTrace(): ComputerUseTrace {
        return trace([clickStep('#nav', { postUrl: '/app/data' })]);
    }
    function withGrid(engine: ComputerUseEngine): FakeAdapter {
        const adapter = new FakeAdapter();          // starts on /app/home
        adapter.visible.set('#nav', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        engine.SetBrowserAdapter(adapter);
        return adapter;
    }
    function urlCheckpoint(name: string, pattern: string): RunCheckpoint {
        const cp = new RunCheckpoint();
        cp.Name = name;
        cp.Instruction = `reach ${name}`;
        const p = new GoalPostcondition();
        p.Kind = 'url';
        p.UrlPattern = pattern;
        cp.Assertions = [p];
        return cp;
    }

    it('latches both sections the trajectory passes through and needs NO judge call', async () => {
        // The scripted judge would REJECT — proving a URL-anchored tour never calls it.
        const engine = new JudgeScriptEngine(false);
        withGrid(engine);
        const params = baseParams();
        params.Checkpoints = [urlCheckpoint('home', '/app/home'), urlCheckpoint('data', '/app/data')];

        const result = await engine.Replay(tourTrace(), params);

        expect(result.Status).toBe('Completed');
        expect(result.Success).toBe(true);
        expect(engine.judgeCalls).toBe(0);                       // free — deterministic latching only
        expect(result.FinalJudgeVerdict?.Done).toBe(true);        // synthesized, never absent
        expect(result.FinalJudgeVerdict?.Reason).toContain('2/2 checkpoints reached');
    });

    it('ALWAYS carries a synthesized verdict — the regression that scored replayed tours 0.5', async () => {
        // Pre-fix: the replay tail gated on ValidationCriteria, so a tour (which has
        // none) returned no verdict at all and the oracle reported
        // "Engine succeeded but no judge verdict available" → auto-fail.
        const engine = new JudgeScriptEngine(false);
        withGrid(engine);
        const params = baseParams();
        params.Checkpoints = [urlCheckpoint('data', '/app/data')];

        const result = await engine.Replay(tourTrace(), params);

        expect(result.FinalJudgeVerdict).toBeDefined();
        expect(result.FinalJudgeVerdict?.CriteriaVerdicts).toHaveLength(1);
    });

    it('judges only the PENDING visual criteria, and passes when they are confirmed', async () => {
        const engine = new JudgeScriptEngine(true);
        withGrid(engine);
        const params = baseParams();
        const visual = new RunCheckpoint();
        visual.Name = 'grid-rendered';
        visual.VisualCriteria = ['the data grid rendered with rows'];
        params.Checkpoints = [urlCheckpoint('data', '/app/data'), visual];

        const result = await engine.Replay(tourTrace(), params);

        expect(engine.judgeCalls).toBe(1);                       // one call, for the visual section only
        expect(result.Status).toBe('Completed');
        expect(result.FinalJudgeVerdict?.Done).toBe(true);
    });

    it('stays STRICT: an unmet section fails the replay so the driver falls back to the LLM tier', async () => {
        const engine = new JudgeScriptEngine(false);   // judge rejects the visual criterion
        withGrid(engine);
        const params = baseParams();
        const visual = new RunCheckpoint();
        visual.Name = 'grid-rendered';
        visual.VisualCriteria = ['the data grid rendered with rows'];
        params.Checkpoints = [urlCheckpoint('data', '/app/data'), visual];

        const result = await engine.Replay(tourTrace(), params);

        expect(result.Status).toBe('Failed');                    // strict — not a partial pass
        expect(result.Replay?.AllStepsSucceeded).toBe(true);     // mechanically clean; the TOUR was incomplete
        expect(result.FinalJudgeVerdict?.Done).toBe(false);
        expect(result.FinalJudgeVerdict?.Reason).toContain('1/2 checkpoints reached');
    });

    it('fails a tour whose section the trajectory never visits', async () => {
        const engine = new JudgeScriptEngine(true);
        withGrid(engine);
        const params = baseParams();
        params.Checkpoints = [urlCheckpoint('data', '/app/data'), urlCheckpoint('never', '/app/nowhere')];

        const result = await engine.Replay(tourTrace(), params);

        expect(result.Status).toBe('Failed');
        expect(result.FinalJudgeVerdict?.Reason).toContain('unmet: reach never');
    });
});
