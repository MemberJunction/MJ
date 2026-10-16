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
import { RunComputerUseParams } from '../types/params.js';
import { AppProfile, SettleConfig } from '../types/app-profile.js';
import { ComputerUseTrace, TraceStep, TraceTarget, StepPostcondition, StepPrecondition } from '../types/trace.js';
import type { ReplayHealPolicy } from '../types/params.js';

/** Fake adapter that can drift a selector and expose a fresh element list for healing. */
class HealFakeAdapter extends BaseBrowserAdapter {
    public Url = 'http://localhost:4200/app/home';
    public visible = new Map<string, boolean>();
    public elements: InteractiveElement[] = [];
    public clicked: string[] = [];
    public clickNavigates = new Map<string, string>();

    public async Launch(): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(url: string): Promise<void> { this.Url = url; }
    public async CaptureScreenshot(): Promise<string> { return 'FAKE'; }
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
        r.Success = true;
        if (action.Type === 'Click' && action.Selector) {
            this.clicked.push(action.Selector);
            if (this.clickNavigates.has(action.Selector)) {
                this.Url = this.clickNavigates.get(action.Selector)!;
            }
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

function fastProfile(): AppProfile {
    const p = new AppProfile();
    const s = new SettleConfig();
    s.MaxWaitMs = 150; s.PollMs = 5; s.NetworkIdleCapMs = 5; s.MinWaitMs = 0;
    p.Settle = s;
    return p;
}
function params(): RunComputerUseParams {
    const p = new RunComputerUseParams();
    p.Goal = 'heal test';
    p.AppProfile = fastProfile();
    const bc = new BrowserConfig();
    bc.ActionTimeoutMs = 40;   // fast precondition-timeout
    p.BrowserConfig = bc;
    return p;
}
function el(index: number, role: string, name: string, selector: string): InteractiveElement {
    const e = new InteractiveElement();
    e.Index = index; e.Role = role; e.Name = name; e.Selector = selector;
    return e;
}
function clickStep(role: string, name: string, selector: string, postUrl?: string): TraceStep {
    const s = new TraceStep();
    s.Instruction = `click ${name}`;
    s.Action.Method = 'click';
    s.Action.Target = Object.assign(new TraceTarget(), { Role: role, Name: name, Selector: selector });
    s.Precondition.WaitForTarget = true;
    if (postUrl) s.Postcondition = Object.assign(new StepPostcondition(), { UrlPattern: postUrl });
    return s;
}
function trace(steps: TraceStep[]): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = 'T1'; t.Steps = steps;
    return t;
}

describe('ComputerUseEngine.Replay self-heal', () => {
    it('heals a drifted selector by re-resolving role+name, then rewrites the trace', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        // Recorded selector '#old' is gone; the Save button moved to '#new'.
        adapter.visible.set('#new', true);   // '#old' absent
        adapter.elements = [el(0, 'button', 'Save', '#new')];
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('button', 'Save', '#old')]);
        const result = await engine.Replay(t, params());

        expect(result.Status).toBe('Completed');
        expect(result.Replay?.Healed).toBe(1);
        expect(result.Replay?.Steps[0].Outcome).toBe('healed');
        expect(adapter.clicked).toContain('#new');           // executed the corrected action
        expect(t.Steps[0].Action.Target?.Selector).toBe('#new');   // cache rewritten in place
    });

    it('declines an ambiguous heal (no LLM seam) and diverges', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        adapter.elements = [el(0, 'button', 'Save', '#a'), el(1, 'button', 'Save', '#b')];
        engine.SetBrowserAdapter(adapter);

        const result = await engine.Replay(trace([clickStep('button', 'Save', '#old')]), params());
        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
        expect(result.Replay?.Healed).toBe(0);
    });

    it('does NOT selector-heal a flow divergence (failed postcondition)', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        adapter.visible.set('#nav', true);          // selector still resolves — the click runs
        adapter.elements = [el(0, 'link', 'Data', '#nav')];
        engine.SetBrowserAdapter(adapter);

        // Click succeeds but does NOT navigate → postcondition '/app/data' fails.
        const result = await engine.Replay(trace([clickStep('link', 'Data', '#nav', '/app/data')]), params());
        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
        expect(result.Replay?.Steps[0].Detail).toContain('postcondition');
        // Flow drift is not selector-healable → the click fired exactly once (no re-click).
        expect(adapter.clicked.filter(s => s === '#nav')).toHaveLength(1);
    });
});

/** Engine whose LLM heal seam is live, and counts how often it was consulted. */
class CountingLlmHealEngine extends ComputerUseEngine {
    public asked = 0;
    protected async healTargetViaLLM(): Promise<{ index?: number; confidence: number }> {
        this.asked++;
        return { index: 1, confidence: 0.95 };
    }
}

function paramsWithHeal(policy: ReplayHealPolicy): RunComputerUseParams {
    const p = params();
    p.ReplayHeal = policy;
    return p;
}

describe('ComputerUseEngine.Replay heal policy', () => {
    it("'off' diverges on drift the default would have healed, and never clicks the corrected target", async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        adapter.visible.set('#new', true);                    // '#old' is gone
        adapter.elements = [el(0, 'button', 'Save', '#new')];  // unambiguous — 'llm' heals this
        engine.SetBrowserAdapter(adapter);

        const t = trace([clickStep('button', 'Save', '#old')]);
        const result = await engine.Replay(t, paramsWithHeal('off'));

        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
        expect(result.Replay?.Healed).toBe(0);
        expect(adapter.clicked).not.toContain('#new');            // nothing was executed
        expect(t.Steps[0].Action.Target?.Selector).toBe('#old');  // trace left as recorded
    });

    it("'deterministic' still heals an unambiguous role+name match", async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        adapter.visible.set('#new', true);
        adapter.elements = [el(0, 'button', 'Save', '#new')];
        engine.SetBrowserAdapter(adapter);

        const result = await engine.Replay(trace([clickStep('button', 'Save', '#old')]), paramsWithHeal('deterministic'));

        expect(result.Status).toBe('Completed');
        expect(result.Replay?.Healed).toBe(1);
        expect(adapter.clicked).toContain('#new');
    });

    it("'deterministic' does NOT consult the LLM seam on an ambiguous match", async () => {
        const engine = new CountingLlmHealEngine();
        const adapter = new HealFakeAdapter();
        adapter.visible.set('#b', true);
        adapter.elements = [el(0, 'button', 'Save', '#a'), el(1, 'button', 'Save', '#b')];
        engine.SetBrowserAdapter(adapter);

        const result = await engine.Replay(trace([clickStep('button', 'Save', '#old')]), paramsWithHeal('deterministic'));

        expect(engine.asked).toBe(0);
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
    });

    it("the default DOES consult the LLM seam on the same ambiguous match", async () => {
        const engine = new CountingLlmHealEngine();
        const adapter = new HealFakeAdapter();
        adapter.visible.set('#b', true);
        adapter.elements = [el(0, 'button', 'Save', '#a'), el(1, 'button', 'Save', '#b')];
        engine.SetBrowserAdapter(adapter);

        const result = await engine.Replay(trace([clickStep('button', 'Save', '#old')]), params());

        expect(engine.asked).toBe(1);
        expect(result.Replay?.Steps[0].Outcome).toBe('healed');
        expect(adapter.clicked).toContain('#b');
    });

    it("'off' skips the seam entirely", async () => {
        const engine = new CountingLlmHealEngine();
        const adapter = new HealFakeAdapter();
        adapter.visible.set('#b', true);
        adapter.elements = [el(0, 'button', 'Save', '#a'), el(1, 'button', 'Save', '#b')];
        engine.SetBrowserAdapter(adapter);

        await engine.Replay(trace([clickStep('button', 'Save', '#old')]), paramsWithHeal('off'));
        expect(engine.asked).toBe(0);
    });
});

describe('ComputerUseEngine.Replay flow drift is not selector drift', () => {
    /** A step recorded on one page, whose precondition pins the entry URL. */
    function stepOnPage(entryUrl: string, role: string, name: string, selector: string): TraceStep {
        const st = new TraceStep();
        st.Instruction = `click ${name}`;
        st.Action.Method = 'click';
        st.Action.Target = Object.assign(new TraceTarget(), { Role: role, Name: name, Selector: selector });
        st.Precondition = Object.assign(new StepPrecondition(), { WaitForTarget: true, UrlPattern: entryUrl });
        return st;
    }

    it('diverges when replayed on the wrong page, even though a same-named target is right there', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        adapter.Url = 'http://localhost:4200/app/home';     // recorded at /app/data
        adapter.visible.set('#save-home', true);
        adapter.elements = [el(0, 'button', 'Save', '#save-home')];
        engine.SetBrowserAdapter(adapter);

        const t = trace([stepOnPage('http://localhost:4200/app/data', 'button', 'Save', '#save-data')]);
        const result = await engine.Replay(t, params());

        expect(result.Status).toBe('Failed');
        expect(result.Replay?.Steps[0].Outcome).toBe('diverged');
        expect(result.Replay?.Steps[0].Detail).toContain('entry URL does not match');
        expect(result.Replay?.Healed).toBe(0);
        // The critical assertion: nothing was clicked on the page we should not be on.
        expect(adapter.clicked).toHaveLength(0);
        expect(t.Steps[0].Action.Target?.Selector).toBe('#save-data');
    });

    it('still heals a missing target when the page IS the recorded one', async () => {
        const engine = new ComputerUseEngine();
        const adapter = new HealFakeAdapter();
        adapter.Url = 'http://localhost:4200/app/data';
        adapter.visible.set('#save-new', true);
        adapter.elements = [el(0, 'button', 'Save', '#save-new')];
        engine.SetBrowserAdapter(adapter);

        const t = trace([stepOnPage('http://localhost:4200/app/data', 'button', 'Save', '#save-old')]);
        const result = await engine.Replay(t, params());

        expect(result.Status).toBe('Completed');
        expect(result.Replay?.Healed).toBe(1);
        expect(adapter.clicked).toContain('#save-new');
    });
});
