import { describe, it, expect } from 'vitest';
import { isRecordableRun, recordTrace, hashGoal } from '../engine/trace-recorder.js';
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
