import { describe, it, expect } from 'vitest';
import {
    normalizeTraceUrl,
    traceUrlMatches,
    UUID_TOKEN,
    isRecordableRun,
    recordTrace,
    hashGoal,
    decideReplayTier,
    goalMatchesTrace,
    DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD,
    diffTraces,
} from '../engine/trace.js';
import { ComputerUseResult } from '../types/results.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import {
    ActionExecutionResult,
    ClickElementAction,
    TypeIntoElementAction,
    NavigateAction,
    WaitAction,
    DragAction,
    KeypressAction,
    InteractiveElement,
    BrowserAction,
} from '../types/browser.js';
import { ToolCallRecord } from '../types/tools.js';
import { ComputerUseTrace, TraceStep, TraceTarget, TraceActionMethod } from '../types/trace.js';

// ─── from trace-url ───

const UUID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const UUID_B = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('normalizeTraceUrl', () => {
    it('replaces path UUIDs with a stable token so per-record URLs key equal', () => {
        const a = normalizeTraceUrl(`http://localhost:4200/app/record/${UUID_A}`);
        const b = normalizeTraceUrl(`http://localhost:4200/app/record/${UUID_B}`);
        expect(a).toBe(b);
        expect(a).toBe(`http://localhost:4200/app/record/${UUID_TOKEN}`);
    });

    it('normalizes UUID casing to the same token regardless of source case', () => {
        const lower = normalizeTraceUrl(`http://x/r/${UUID_A.toLowerCase()}`);
        const upper = normalizeTraceUrl(`http://x/r/${UUID_A.toUpperCase()}`);
        expect(lower).toBe(upper);
    });

    it('drops the hash fragment', () => {
        expect(normalizeTraceUrl('http://x/app/home#section-2')).toBe('http://x/app/home');
    });

    it('sorts query params by name for order-independence', () => {
        const a = normalizeTraceUrl('http://x/p?b=2&a=1&c=3');
        const b = normalizeTraceUrl('http://x/p?c=3&a=1&b=2');
        expect(a).toBe(b);
        expect(a).toBe('http://x/p?a=1&b=2&c=3');
    });

    it('drops volatile query params (case-insensitive) but keeps the rest', () => {
        const out = normalizeTraceUrl('http://x/p?keep=1&_ts=999&Token=abc', ['_ts', 'token']);
        expect(out).toBe('http://x/p?keep=1');
    });

    it('replaces UUIDs inside query values too', () => {
        const out = normalizeTraceUrl(`http://x/p?id=${UUID_A}`);
        expect(out).toBe(`http://x/p?id=${UUID_TOKEN}`);
    });

    it('returns empty string for empty/whitespace input', () => {
        expect(normalizeTraceUrl('')).toBe('');
        expect(normalizeTraceUrl('   ')).toBe('');
    });

    it('normalizes UUIDs in an unparseable path-only string without throwing', () => {
        expect(normalizeTraceUrl(`/app/record/${UUID_A}`)).toBe(`/app/record/${UUID_TOKEN}`);
    });
});

describe('traceUrlMatches (guards)', () => {
    it('matches a path-fragment pattern against a full URL', () => {
        expect(traceUrlMatches('/app/data', 'http://localhost:4200/app/data/list?x=1')).toBe(true);
    });

    it('is UUID-insensitive on both sides', () => {
        expect(traceUrlMatches(
            `http://x/r/${UUID_A}`,
            `http://x/r/${UUID_B}`,
        )).toBe(true);
    });

    it('fails when the path does not contain the pattern', () => {
        expect(traceUrlMatches('/app/data', 'http://localhost:4200/app/home')).toBe(false);
    });

    it('an empty pattern matches anything (no constraint recorded)', () => {
        expect(traceUrlMatches('', 'http://x/whatever')).toBe(true);
    });

    it('honors volatile params when comparing', () => {
        expect(traceUrlMatches(
            'http://x/p?a=1',
            'http://x/p?a=1&_ts=12345',
            ['_ts'],
        )).toBe(true);
    });
});

// ─── from trace-recorder ───

const RECORDED_AT = '2026-07-21T10:00:00.000Z';
const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function ok(action: BrowserAction): ActionExecutionResult {
    const r = new ActionExecutionResult(action);
    r.Success = true;
    return r;
}
function fail(action: BrowserAction): ActionExecutionResult {
    const r = new ActionExecutionResult(action);
    r.Success = false;
    return r;
}
function element(index: number, role: string, name: string, selector: string): InteractiveElement {
    const el = new InteractiveElement();
    el.Index = index; el.Role = role; el.Name = name; el.Selector = selector;
    return el;
}
function doneVerdict(): JudgeVerdict {
    const v = new JudgeVerdict();
    v.Done = true; v.Confidence = 1;
    return v;
}
function completedResult(steps: StepRecord[]): ComputerUseResult {
    const r = new ComputerUseResult();
    r.Status = 'Completed'; r.Success = true; r.Steps = steps;
    r.FinalJudgeVerdict = doneVerdict();
    return r;
}

describe('isRecordableRun (gate)', () => {
    it('accepts a clean Completed + Done run', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.ActionResults = [ok(clickEl(0))];
        expect(isRecordableRun(completedResult([step])).recordable).toBe(true);
    });

    it('rejects a non-Completed run', () => {
        const r = completedResult([]);
        r.Status = 'MaxStepsReached';
        expect(isRecordableRun(r)).toMatchObject({ recordable: false });
    });

    it('rejects a run whose final verdict is not Done', () => {
        const r = completedResult([]);
        r.FinalJudgeVerdict = new JudgeVerdict();   // Done=false
        expect(isRecordableRun(r).recordable).toBe(false);
    });

    it('rejects a run carrying a FailureReason (loop / auth detour)', () => {
        const r = completedResult([]);
        r.FailureReason = 'LoopDetected';
        expect(isRecordableRun(r).recordable).toBe(false);
    });

    it('rejects a run with a step error', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.Error = { Category: 'LLMError', Message: 'boom' } as StepRecord['Error'];
        expect(isRecordableRun(completedResult([step])).recordable).toBe(false);
    });

    it('rejects a run with tool calls (not deterministically replayable)', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.ToolCalls = [new ToolCallRecord()];
        expect(isRecordableRun(completedResult([step])).recordable).toBe(false);
    });

    it('rejects a run with a vision-only action (Drag)', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.ActionResults = [ok(new DragAction())];
        const res = isRecordableRun(completedResult([step]));
        expect(res.recordable).toBe(false);
        expect(res.reason).toContain('Drag');
    });

    it('allows Wait/Scroll actions (dropped, not disqualifying)', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.ActionResults = [ok(new WaitAction()), ok(clickEl(0))];
        expect(isRecordableRun(completedResult([step])).recordable).toBe(true);
    });
});

function clickEl(index: number): ClickElementAction {
    const a = new ClickElementAction();
    a.Index = index;
    return a;
}

describe('recordTrace (distillation)', () => {
    it('stamps the envelope fields', () => {
        const trace = recordTrace({
            result: completedResult([]),
            testId: 'T042',
            goal: 'Open the Data Explorer',
            appBuildHash: 'build-abc',
            appVersion: '5.48.0',
            recordedAt: RECORDED_AT,
            variables: ['recordName'],
            viewport: { width: 1024, height: 768 },
        });
        expect(trace.TestId).toBe('T042');
        expect(trace.AppBuildHash).toBe('build-abc');
        expect(trace.AppVersion).toBe('5.48.0');
        expect(trace.GoalHash).toBe(hashGoal('Open the Data Explorer'));
        expect(trace.RecordedAt).toBe(RECORDED_AT);
        expect(trace.Variables).toEqual(['recordName']);
        expect(trace.Viewport).toMatchObject({ Width: 1024, Height: 768 });
    });

    it('resolves a ClickElement index to a role/name/selector target', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.ControllerReasoning = 'Click the Data Explorer nav item\n(and observe)';
        step.UrlBefore = 'http://localhost:4200/app/home';
        step.UrlAfter = 'http://localhost:4200/app/home';
        step.InteractiveElements = [element(12, 'link', 'Data Explorer', 'xpath=/nav/a[3]')];
        step.ActionResults = [ok(clickEl(12))];

        const trace = recordTrace({ result: completedResult([step]), testId: 'T1', goal: 'g', recordedAt: RECORDED_AT });
        expect(trace.Steps).toHaveLength(1);
        const ts = trace.Steps[0];
        expect(ts.Instruction).toBe('Click the Data Explorer nav item');   // first line, bounded
        expect(ts.Action.Method).toBe('click');
        expect(ts.Action.Target).toMatchObject({ Role: 'link', Name: 'Data Explorer', Selector: 'xpath=/nav/a[3]' });
        expect(ts.Precondition.WaitForTarget).toBe(true);
        expect(ts.Precondition.UrlPattern).toBe('http://localhost:4200/app/home');
    });

    it('flattens a batch into per-action steps; URL precondition on first only', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.UrlBefore = 'http://x/form';
        step.UrlAfter = 'http://x/form';
        step.InteractiveElements = [element(1, 'textbox', 'Name', '#name')];
        const type = new TypeIntoElementAction(); type.Index = 1; type.Text = 'Acme';
        step.ActionResults = [ok(type), ok(new KeypressAction())];

        const trace = recordTrace({ result: completedResult([step]), testId: 'T1', goal: 'g', recordedAt: RECORDED_AT });
        expect(trace.Steps).toHaveLength(2);
        expect(trace.Steps[0].Action.Method).toBe('type');
        expect(trace.Steps[0].Precondition.UrlPattern).toBe('http://x/form');
        expect(trace.Steps[1].Action.Method).toBe('keypress');
        expect(trace.Steps[1].Precondition.UrlPattern).toBeUndefined();   // not the first action
    });

    it('drops Wait/Scroll and failed actions', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.InteractiveElements = [element(0, 'button', 'Save', '#save')];
        step.ActionResults = [ok(new WaitAction()), fail(clickEl(0)), ok(clickEl(0))];
        const trace = recordTrace({ result: completedResult([step]), testId: 'T1', goal: 'g', recordedAt: RECORDED_AT });
        // Wait dropped, failed click dropped → exactly one recorded step.
        expect(trace.Steps).toHaveLength(1);
        expect(trace.Steps[0].Action.Method).toBe('click');
    });

    it('adds a navigation postcondition when the step changed URL', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.UrlBefore = 'http://x/app/home';
        step.UrlAfter = 'http://x/app/data';
        step.InteractiveElements = [element(0, 'link', 'Data', '#d')];
        step.ActionResults = [ok(clickEl(0))];
        const trace = recordTrace({ result: completedResult([step]), testId: 'T1', goal: 'g', recordedAt: RECORDED_AT });
        expect(trace.Steps[0].Postcondition?.UrlPattern).toBe('http://x/app/data');
    });

    it('normalizes recorded URLs (UUID token) and tokenizes navigate URLs by variable value', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.UrlBefore = `http://x/app/record/${UUID}`;
        step.UrlAfter = `http://x/app/record/${UUID}`;
        // Normalization decodes query values (URLSearchParams), and tokenization
        // runs after — so the variable value is the decoded form the driver's
        // substitution actually inserted.
        const nav = new NavigateAction(); nav.Url = 'http://x/app/search?q=Acme%20Corp';
        step.ActionResults = [ok(nav)];
        const trace = recordTrace({
            result: completedResult([step]), testId: 'T1', goal: 'g', recordedAt: RECORDED_AT,
            variables: ['company'], variableValues: { company: 'Acme Corp' },
        });
        expect(trace.Steps[0].UrlBefore).toBe('http://x/app/record/{uuid}');
        expect(trace.Steps[0].Action.Url).toBe('http://x/app/search?q=%company%');
    });

    it('tokenizes typed text by variable value', () => {
        const step = new StepRecord();
        step.StepNumber = 1;
        step.InteractiveElements = [element(0, 'textbox', 'Name', '#n')];
        const type = new TypeIntoElementAction(); type.Index = 0; type.Text = 'Widget-1234';
        step.ActionResults = [ok(type)];
        const trace = recordTrace({
            result: completedResult([step]), testId: 'T1', goal: 'g', recordedAt: RECORDED_AT,
            variables: ['recordName'], variableValues: { recordName: 'Widget-1234' },
        });
        expect(trace.Steps[0].Action.Text).toBe('%recordName%');
    });
});

describe('hashGoal (goal freezing)', () => {
    it('is stable and whitespace-insensitive', () => {
        expect(hashGoal('Open the   Data Explorer')).toBe(hashGoal('Open the Data Explorer'));
        expect(hashGoal(' Open the Data Explorer ')).toBe(hashGoal('Open the Data Explorer'));
    });
    it('changes when the goal is reworded', () => {
        expect(hashGoal('Open the Data Explorer')).not.toBe(hashGoal('Close the Data Explorer'));
    });
});

// ─── from trace-keying ───

const GOAL = 'Open the Data Explorer and confirm the heading';

function traceFor(goal: string, buildHash = ''): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = 'T1';
    t.GoalHash = hashGoal(goal);
    t.AppBuildHash = buildHash;
    return t;
}

describe('goalMatchesTrace', () => {
    it('matches identical (whitespace-normalized) goals', () => {
        expect(goalMatchesTrace(traceFor(GOAL), `  ${GOAL}  `)).toBe(true);
    });
    it('does not match a reworded goal', () => {
        expect(goalMatchesTrace(traceFor(GOAL), 'Close the Data Explorer')).toBe(false);
    });
});

describe('decideReplayTier', () => {
    it('→ llm when there is no trace', () => {
        expect(decideReplayTier({ trace: null, currentGoal: GOAL }).tier).toBe('llm');
    });

    it('→ llm when the goal was reworded since record', () => {
        const d = decideReplayTier({ trace: traceFor(GOAL, 'b1'), currentGoal: 'A different goal', currentBuildHash: 'b1' });
        expect(d.tier).toBe('llm');
        expect(d.reason).toContain('goal text changed');
    });

    it('→ llm when the heal rate crossed the demote threshold', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'b1'), currentGoal: GOAL, currentBuildHash: 'b1',
            healRate: DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD,
        });
        expect(d.tier).toBe('llm');
        expect(d.reason).toContain('heal rate');
    });

    it('→ replay on an exact build match (goal unchanged, heal rate low)', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'build-abc'), currentGoal: GOAL, currentBuildHash: 'build-abc', healRate: 0.1,
        });
        expect(d.tier).toBe('replay');
    });

    it('→ replay-with-heal when the build hash differs', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'build-old'), currentGoal: GOAL, currentBuildHash: 'build-new',
        });
        expect(d.tier).toBe('replay-with-heal');
        expect(d.reason).toContain('differs');
    });

    it('→ replay-with-heal (the safe default) when build identity is unavailable', () => {
        const d = decideReplayTier({ trace: traceFor(GOAL), currentGoal: GOAL });
        expect(d.tier).toBe('replay-with-heal');
        expect(d.reason).toContain('unavailable');
    });

    it('does not demote below the threshold', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'b1'), currentGoal: GOAL, currentBuildHash: 'b1',
            healRate: DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD - 0.01,
        });
        expect(d.tier).toBe('replay');
    });
});

// ─── from trace-diff ───

function step(method: TraceActionMethod, opts: { role?: string; name?: string; selector?: string; url?: string } = {}): TraceStep {
    const s = new TraceStep();
    s.Action.Method = method;
    s.UrlBefore = opts.url ?? 'http://x/app/home';
    if (opts.role || opts.name || opts.selector) {
        s.Action.Target = Object.assign(new TraceTarget(), { Role: opts.role, Name: opts.name, Selector: opts.selector });
    }
    return s;
}
function trace(steps: TraceStep[]): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = 'T1'; t.Steps = steps;
    return t;
}

describe('diffTraces', () => {
    it('reports no drift for semantically identical traces', () => {
        const a = trace([step('click', { role: 'button', name: 'Save', selector: '#save' })]);
        const b = trace([step('click', { role: 'button', name: 'Save', selector: '#save' })]);
        const d = diffTraces(a, b);
        expect(d.identical).toBe(true);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.summary).toContain('no drift');
    });

    it('classifies a same-role+name selector change as minor selector-drift (not meaningful)', () => {
        const a = trace([step('click', { role: 'button', name: 'Save', selector: '#old' })]);
        const b = trace([step('click', { role: 'button', name: 'Save', selector: '#new' })]);
        const d = diffTraces(a, b);
        expect(d.identical).toBe(false);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.changedSteps[0].kind).toBe('selector-drift');
        expect(d.summary).toContain('healable');
    });

    it('flags a changed role/name as meaningful target drift', () => {
        const a = trace([step('click', { role: 'button', name: 'Save', selector: '#s' })]);
        const b = trace([step('click', { role: 'button', name: 'Submit', selector: '#s' })]);
        const d = diffTraces(a, b);
        expect(d.meaningfulDrift).toBe(1);
        expect(d.changedSteps[0].kind).toBe('target-changed');
    });

    it('flags a changed action method as meaningful', () => {
        const a = trace([step('click', { role: 'button', name: 'X', selector: '#s' })]);
        const b = trace([step('type', { role: 'button', name: 'X', selector: '#s' })]);
        expect(diffTraces(a, b).changedSteps[0].kind).toBe('method-changed');
    });

    it('flags a changed entry URL as meaningful', () => {
        const a = trace([step('click', { role: 'link', name: 'Go', url: 'http://x/app/home' })]);
        const b = trace([step('click', { role: 'link', name: 'Go', url: 'http://x/app/data' })]);
        expect(diffTraces(a, b).changedSteps[0].kind).toBe('url-changed');
    });

    it('counts added and removed steps as meaningful drift', () => {
        const a = trace([step('click', { role: 'button', name: 'A', selector: '#a' })]);
        const b = trace([
            step('click', { role: 'button', name: 'A', selector: '#a' }),
            step('click', { role: 'button', name: 'B', selector: '#b' }),
        ]);
        const added = diffTraces(a, b);
        expect(added.addedSteps).toBe(1);
        expect(added.meaningfulDrift).toBe(1);

        const removed = diffTraces(b, a);
        expect(removed.removedSteps).toBe(1);
        expect(removed.meaningfulDrift).toBe(1);
    });
});
