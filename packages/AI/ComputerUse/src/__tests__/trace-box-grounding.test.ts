import { describe, it, expect } from 'vitest';
import { ResolveElementByBox, IsRecordableRun, RecordTrace } from '../engine/trace.js';
import { ComputerUseResult } from '../types/results.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import {
    ActionExecutionResult,
    BoundingBox,
    BrowserAction,
    ClickAction,
    TypeAction,
    InteractiveElement,
} from '../types/browser.js';

/**
 * Grounding a coordinate click at record time.
 *
 * The controller can emit a coordinate `Click` (x/y + a bounding box) instead of
 * a DOM-grounded `ClickElement`. Recorded as-is, that produces a trace step whose
 * target carries only a box — no selector for `planReplayActions` to act on and no
 * role/name for the healer to re-resolve, so the step is permanently unreplayable
 * AND unhealable. It measured 35 of 270 steps across the MJ suite, poisoning 13 of
 * 25 scripts.
 *
 * The fix costs nothing at replay time: the recorder already holds the step's
 * extracted elements, and each one carries a box alongside its role/name/selector.
 * Hit-testing the click's box against that list recovers the semantic identity that
 * the coordinate action threw away.
 */

const RECORDED_AT = '2026-09-11T10:00:00.000Z';

function box(xMin: number, yMin: number, xMax: number, yMax: number): BoundingBox {
    return Object.assign(new BoundingBox(), { XMin: xMin, YMin: yMin, XMax: xMax, YMax: yMax });
}

function element(index: number, role: string, name: string, selector: string, b?: BoundingBox): InteractiveElement {
    const el = new InteractiveElement();
    el.Index = index; el.Role = role; el.Name = name; el.Selector = selector; el.BoundingBox = b;
    return el;
}

function coordinateClick(b?: BoundingBox): ClickAction {
    const a = new ClickAction();
    a.X = 250; a.Y = 515;
    a.BoundingBox = b;
    return a;
}

function ok(action: BrowserAction): ActionExecutionResult {
    const r = new ActionExecutionResult(action);
    r.Success = true;
    return r;
}

function completedStep(action: BrowserAction, elements: InteractiveElement[]): StepRecord {
    const s = new StepRecord();
    s.StepNumber = 1;
    s.ActionResults = [ok(action)];
    s.InteractiveElements = elements;
    s.Url = 'http://localhost:4200/app/data-explorer/Data';
    s.UrlAfter = 'http://localhost:4200/app/data-explorer/Data';
    return s;
}

function completedResult(steps: StepRecord[]): ComputerUseResult {
    const r = new ComputerUseResult();
    r.Status = 'Completed'; r.Success = true; r.Steps = steps;
    const v = new JudgeVerdict();
    v.Done = true; v.Confidence = 1;
    r.FinalJudgeVerdict = v;
    return r;
}

describe('resolveElementByBox', () => {
    const target = element(3, 'button', 'Events', '#events-card', box(141, 490, 390, 544));
    const other = element(4, 'button', 'Accounts', '#accounts-card', box(141, 560, 390, 614));

    it('recovers the element the click landed on', () => {
        expect(ResolveElementByBox(box(141, 490, 390, 544), [other, target])?.Name).toBe('Events');
    });

    it('tolerates a slightly shifted box rather than demanding an exact match', () => {
        expect(ResolveElementByBox(box(143, 492, 388, 542), [other, target])?.Name).toBe('Events');
    });

    it('picks the best overlap when several elements intersect the box', () => {
        const wrapper = element(2, 'group', 'Entity cards', '#cards', box(100, 400, 400, 700));
        expect(ResolveElementByBox(box(141, 490, 390, 544), [wrapper, target])?.Name).toBe('Events');
    });

    it('refuses to guess when nothing overlaps enough', () => {
        expect(ResolveElementByBox(box(800, 100, 900, 140), [target, other])).toBeUndefined();
    });

    it('refuses when the click carried no box at all', () => {
        expect(ResolveElementByBox(undefined, [target])).toBeUndefined();
    });

    it('refuses when the elements carry no boxes to test against', () => {
        const boxless = element(3, 'button', 'Events', '#events-card');
        expect(ResolveElementByBox(box(141, 490, 390, 544), [boxless])).toBeUndefined();
    });
});

describe('recordTrace — coordinate clicks', () => {
    it('records a coordinate click with the semantic identity of the element it hit', () => {
        const el = element(3, 'button', 'Events', '#events-card', box(141, 490, 390, 544));
        const trace = RecordTrace({
            result: completedResult([completedStep(coordinateClick(box(141, 490, 390, 544)), [el])]),
            testId: 'T042',
            goal: 'Open the Events entity',
            recordedAt: RECORDED_AT,
        });

        const target = trace.Steps[0].Action.Target;
        expect(target?.Selector).toBe('#events-card');
        expect(target?.Role).toBe('button');
        expect(target?.Name).toBe('Events');
    });
});

describe('isRecordableRun — ungroundable clicks', () => {
    it('refuses a run whose coordinate click cannot be tied to any element', () => {
        // Nothing to replay and nothing to heal from: storing it guarantees a
        // script that dies mid-trajectory on every future run.
        const el = element(3, 'button', 'Events', '#events-card', box(141, 490, 390, 544));
        const result = completedResult([completedStep(coordinateClick(box(800, 100, 900, 140)), [el])]);

        const gate = IsRecordableRun(result);

        expect(gate.recordable).toBe(false);
        expect(gate.reason).toMatch(/click/i);
    });

    it('refuses a run whose type action names no element', () => {
        // A coordinate Type carries no bounding box at all, so unlike a click there
        // is nothing to hit-test — it can never be grounded, replayed, or healed.
        // Four scripts slipped through the click-only gate this way.
        const el = element(3, 'textbox', 'Name', '#name', box(141, 490, 390, 544));
        const typeAction = new TypeAction();
        typeAction.Text = 'hello';
        const result = completedResult([completedStep(typeAction, [el])]);

        const gate = IsRecordableRun(result);

        expect(gate.recordable).toBe(false);
        expect(gate.reason).toMatch(/type/i);
    });

    it('accepts a type action that names its element', () => {
        const el = element(3, 'textbox', 'Name', '#name', box(141, 490, 390, 544));
        const typeAction = new TypeAction();
        typeAction.Text = 'hello';
        typeAction.Selector = '#name';

        expect(IsRecordableRun(completedResult([completedStep(typeAction, [el])])).recordable).toBe(true);
    });

    it('accepts a run whose coordinate click resolves to an element', () => {
        const el = element(3, 'button', 'Events', '#events-card', box(141, 490, 390, 544));
        const result = completedResult([completedStep(coordinateClick(box(141, 490, 390, 544)), [el])]);

        expect(IsRecordableRun(result).recordable).toBe(true);
    });
});

describe('recordTrace — the region an element lives in', () => {
    // Role + name are not always a unique identity: the app launcher lists each
    // app under BOTH a usage-ordered "Recent applications" grid and an
    // alphabetical "All applications" grid. Recording only role/name/selector
    // left replay with a positional path into a grid that reorders between runs,
    // and a heal that could only call the twins ambiguous. The region is the
    // missing discriminator, and it must reach the stored script to be usable.
    function scoped(index: number, name: string, selector: string, scope: string): InteractiveElement {
        const el = element(index, 'link', name, selector, box(0, 0, 10, 10));
        el.Scope = scope;
        return el;
    }

    it('records the region alongside role, name and selector', () => {
        const click = new ClickAction();
        click.X = 5; click.Y = 5; click.BoundingBox = box(0, 0, 10, 10);
        const result = completedResult([
            completedStep(click, [scoped(0, 'AI', '#all-ai', 'group:All applications')]),
        ]);

        const trace = RecordTrace({ result, testId: 'T1', goal: 'g', recordedAt: RECORDED_AT });

        expect(trace.Steps[0].Action.Target?.Scope).toBe('group:All applications');
    });

    it('leaves the region undefined when the element sits in no named region', () => {
        const click = new ClickAction();
        click.X = 5; click.Y = 5; click.BoundingBox = box(0, 0, 10, 10);
        const result = completedResult([
            completedStep(click, [element(0, 'link', 'AI', '#ai', box(0, 0, 10, 10))]),
        ]);

        const trace = RecordTrace({ result, testId: 'T1', goal: 'g', recordedAt: RECORDED_AT });

        expect(trace.Steps[0].Action.Target?.Scope).toBeUndefined();
    });
});
