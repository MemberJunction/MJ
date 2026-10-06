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
import { AppProfile, SettleConfig, LoopConfig } from '../types/app-profile.js';
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

/**
 * Adapter whose clicks navigate on a delay, the way a client-side router does:
 * the click resolves, then guards/resolvers run, and only then does the URL
 * change. A single-sample postcondition check reads the pre-navigation URL.
 */
class SlowNavAdapter extends FakeAdapter {
    /** selector → [destination, delay before the URL changes]. */
    private readonly delayed = new Map<string, [string, number]>();

    public clickNavigatesAfter(selector: string, url: string, afterMs: number): void {
        this.delayed.set(selector, [url, afterMs]);
    }

    public override async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        const plan = action.Type === 'Click' && action.Selector ? this.delayed.get(action.Selector) : undefined;
        const r = await super.ExecuteAction(action);
        if (plan && r.Success) {
            const [url, afterMs] = plan;
            setTimeout(() => { this.Url = url; }, afterMs);
        }
        return r;
    }
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

    it('waits for a client-side route change to land before judging the postcondition', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new SlowNavAdapter();
        adapter.visible.set('#nav', true);
        // The route resolves after the click returns — as an Angular/React
        // router does. Sampling the URL once, immediately, reads the old one.
        adapter.clickNavigatesAfter('#nav', 'http://localhost:4200/app/data', 40);
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('#nav', { postUrl: '/app/data' })]);
        const result = await engine.Replay(t, baseParams());

        expect(result.Replay?.Steps[0].Outcome).toBe('hit');
        expect(result.Replay?.Diverged).toBe(0);
    });

    it('replays a step whose recorded URL carried a one-time token, when that param is declared volatile', async () => {
        // The MJ suite's login step recorded Auth0's `?state=<nonce>`, which is
        // regenerated per login transaction. Declaring `state` volatile is what
        // makes the recorded pattern matchable on a later run.
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#login', true);
        adapter.clickNavigates.set('#login', 'https://idp.example.com/u/login?state=FRESH_NONCE');
        engine.SetBrowserAdapter(adapter);

        const params = baseParams();
        const loop = new LoopConfig();
        loop.VolatileParams = ['state'];
        params.AppProfile!.Loop = loop;

        const t = trace([clickStep('#login', { postUrl: 'https://idp.example.com/u/login?state=RECORDED_NONCE' })]);
        const result = await engine.Replay(t, params);

        expect(result.Replay?.Steps[0].Outcome).toBe('hit');
        expect(result.Replay?.Diverged).toBe(0);
    });

    it('clicks the element the step recorded, not whatever its stale selector now resolves to', async () => {
        // The recorded selector is an absolute xpath. After a DOM reshuffle it still
        // resolves — to a different element — so the click "succeeds" and silently
        // does the wrong thing; only the postcondition notices, and by then healing
        // is refused as flow drift. The trace records role+name precisely so replay
        // can check what it is about to click.
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#stale', true);
        adapter.visible.set('#actions-link', true);
        // Only the genuine 'Actions' link navigates; the stale selector is inert.
        adapter.clickNavigates.set('#actions-link', 'http://localhost:4200/app/actions/Overview');
        adapter.elements = [
            Object.assign(new InteractiveElement(), { Index: 0, Role: 'link', Name: 'Reports', Selector: '#stale' }),
            Object.assign(new InteractiveElement(), { Index: 1, Role: 'link', Name: 'Actions', Selector: '#actions-link' }),
        ];
        engine.SetBrowserAdapter(adapter);

        const step = clickStep('#stale', { postUrl: '/app/actions/Overview' });
        step.Action.Target = Object.assign(new TraceTarget(), {
            Selector: '#stale', Role: 'link', Name: 'Actions',
        });

        const result = await engine.Replay(trace([step]), baseParams());

        expect(result.Replay?.Steps[0].Outcome).not.toBe('diverged');
        expect(adapter.Url).toBe('http://localhost:4200/app/actions/Overview');
    });

    it('keeps the recorded selector when it still points at the recorded element', async () => {
        // Guard: re-resolution must not fire when nothing drifted, or every replay
        // would depend on role+name being unique across the whole page.
        const engine = new ComputerUseEngine();
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        adapter.elements = [
            Object.assign(new InteractiveElement(), { Index: 0, Role: 'link', Name: 'Data', Selector: '#nav' }),
            Object.assign(new InteractiveElement(), { Index: 1, Role: 'link', Name: 'Data', Selector: '#decoy' }),
        ];
        engine.SetBrowserAdapter(adapter);

        const step = clickStep('#nav', { postUrl: '/app/data' });
        step.Action.Target = Object.assign(new TraceTarget(), { Selector: '#nav', Role: 'link', Name: 'Data' });

        const result = await engine.Replay(trace([step]), baseParams());

        expect(result.Replay?.Steps[0].Outcome).toBe('hit');
        expect(adapter.Url).toBe('http://localhost:4200/app/data');
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

    function visibleCheckpoint(name: string, role: string, elementName: string): RunCheckpoint {
        const cp = new RunCheckpoint();
        cp.Name = name;
        cp.Instruction = `reach ${name}`;
        const p = new GoalPostcondition();
        p.Kind = 'visible';
        p.Target = Object.assign(new TraceTarget(), { Role: role, Name: elementName });
        cp.Assertions = [p];
        return cp;
    }

    it('latches a checkpoint whose element only appears after the final action', async () => {
        // Replay settles at the START of each step, so nothing ever observes the
        // effect of the LAST action. T138 hit exactly this: all 9 steps replayed
        // clean, the Compare button was clicked, and the checkpoint that the
        // comparison had run could never latch — the result renders after the click
        // and the loop had already ended.
        const engine = new JudgeScriptEngine(false);
        const adapter = new FakeAdapter();
        adapter.visible.set('#compare', true);
        adapter.clickNavigates.set('#compare', 'http://localhost:4200/app/diff');
        adapter.elements = [
            Object.assign(new InteractiveElement(), { Index: 0, Role: 'button', Name: 'Compare', Selector: '#compare' }),
        ];
        // The comparison result only exists once Compare has been clicked.
        const origExecute = adapter.ExecuteAction.bind(adapter);
        adapter.ExecuteAction = async (action: BrowserAction) => {
            const r = await origExecute(action);
            if (action.Type === 'Click' && action.Selector === '#compare') {
                adapter.elements = [
                    ...adapter.elements,
                    Object.assign(new InteractiveElement(), { Index: 1, Role: 'region', Name: 'Comparison result', Selector: '#result' }),
                ];
            }
            return r;
        };
        engine.SetBrowserAdapter(adapter);

        const params = baseParams();
        params.Checkpoints = [visibleCheckpoint('compared', 'region', 'Comparison result')];

        const result = await engine.Replay(trace([clickStep('#compare', { postUrl: '/app/diff' })]), params);

        expect(result.FinalJudgeVerdict?.Reason).toContain('1/1 checkpoints reached');
        expect(result.Success).toBe(true);
    });

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

describe('ComputerUseEngine.Replay — a tour section only on screen mid-trajectory', () => {
    /**
     * Pending visual criteria were all judged against ONE end-state frame. A tour
     * visits each section in turn, so that frame can show at most the last one —
     * an 11-section tour whose every step replayed correctly still scored 0/11.
     * Replay already captures a frame per step; each checkpoint must be judged
     * against the frame where it was actually on screen.
     */
    class UrlRecordingJudgeEngine extends ComputerUseEngine {
        public judgedUrls: string[] = [];
        constructor(private readonly doneAtUrl?: string) { super(); }
        protected async executeJudgePrompt(r: JudgePromptRequest): Promise<JudgePromptResponse> {
            this.judgedUrls.push(r.CurrentUrl);
            const done = this.doneAtUrl === undefined || r.CurrentUrl.includes(this.doneAtUrl);
            const resp = new JudgePromptResponse();
            resp.RawResponse = JSON.stringify({ done, confidence: 0.9, reason: done ? 'met' : 'not met' });
            return resp;
        }
    }

    function visualUrlCheckpoint(name: string, pattern: string, criterion: string): RunCheckpoint {
        const cp = new RunCheckpoint();
        cp.Name = name;
        cp.Instruction = `reach ${name}`;
        cp.VisualCriteria = [criterion];
        cp.Assertions = [Object.assign(new GoalPostcondition(), { Kind: 'url' as const, UrlPattern: pattern })];
        return cp;
    }

    /** One click that leaves /app/home for /app/data — 'home' is only ever seen before it. */
    function twoSectionSetup(engine: ComputerUseEngine): RunComputerUseParams {
        const adapter = new FakeAdapter();
        adapter.visible.set('#nav', true);
        adapter.clickNavigates.set('#nav', 'http://localhost:4200/app/data');
        engine.SetBrowserAdapter(adapter);
        const params = baseParams();
        params.Checkpoints = [
            visualUrlCheckpoint('home', '/app/home', 'the home banner is visible'),
            visualUrlCheckpoint('data', '/app/data', 'the data grid is visible'),
        ];
        return params;
    }

    it('judges the mid-trajectory section against its own frame, not the end state', async () => {
        const engine = new UrlRecordingJudgeEngine();
        const params = twoSectionSetup(engine);

        await engine.Replay(trace([clickStep('#nav', { postUrl: '/app/data' })]), params);

        expect(engine.judgedUrls.some(u => u.includes('/app/home'))).toBe(true);
    });

    it('latches a section whose evidence existed only before the final action', async () => {
        // The judge confirms ONLY at /app/home — so 'home' can latch if and only if
        // it is judged against the frame captured while the run was there.
        const engine = new UrlRecordingJudgeEngine('/app/home');
        const params = twoSectionSetup(engine);

        const result = await engine.Replay(trace([clickStep('#nav', { postUrl: '/app/data' })]), params);

        // 1/2, not 0/2: 'home' latched from its own frame while 'data' — judged at
        // the end state, where this judge says no — correctly did not.
        expect(result.FinalJudgeVerdict?.Reason).toContain('1/2 checkpoints reached');
    });
});

describe('ComputerUseEngine.Replay — goal postconditions and a navigation still in flight', () => {
    /**
     * Step postconditions poll (`waitForUrlMatch`); goal postconditions read
     * `CurrentUrl` once, with no settle. A final navigation still in flight
     * therefore fails the goal even though every step hit — seen live on the
     * login smoke test, which replayed 4 steps with 0 diverged and then failed
     * the goal on the Auth0 callback URL (`/?code=…&state=…`) because the SPA had
     * not finished routing to `/app/home/Home` yet.
     */
    const SETTLE_AFTER_MS = 400;
    class LateRedirectAdapter extends FakeAdapter {
        private readonly startedAt = Date.now();
        /**
         * Reports the callback URL until the redirect completes. Time-based, not
         * read-count-based: the engine reads CurrentUrl several times per step, so
         * a counter would settle on its own and the test would pass vacuously.
         */
        public override get CurrentUrl(): string {
            return Date.now() - this.startedAt >= SETTLE_AFTER_MS
                ? 'http://localhost:4200/app/home/Home'
                : this.Url;
        }
    }

    function goalUrl(pattern: string): GoalPostcondition {
        return Object.assign(new GoalPostcondition(), { Kind: 'url' as const, UrlPattern: pattern });
    }

    it('waits for the in-flight navigation instead of failing on the callback URL', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new LateRedirectAdapter();
        adapter.Url = 'http://localhost:4200/?code=abc123&state=xyz789';
        adapter.visible.set('#nav', true);
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('#nav')]);
        t.GoalPostconditions = [goalUrl('http://localhost:4200/app/home/Home')];

        // Give the guard a real budget; baseParams() uses 80ms to keep
        // precondition-timeout divergences fast, which is shorter than any
        // real redirect and would make this untestable either way.
        const params = baseParams();
        params.BrowserConfig!.ActionTimeoutMs = 2000;
        const result = await engine.Replay(t, params);

        // Every step must have hit — otherwise this test is about step guards,
        // not the goal check, and would pass or fail for the wrong reason.
        expect(result.Replay?.AllStepsSucceeded).toBe(true);
        expect(result.Status).toBe('Completed');
    });
});
