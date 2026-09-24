import { describe, it, expect } from 'vitest';
import { MJTestEntity_IReplayScript, MJTestEntity_IReplayScriptStep } from '@memberjunction/core-entities';
import { SummarizeScriptDrift } from '../utils/script-drift';

function step(overrides: {
    method?: string;
    url?: string;
    role?: string;
    name?: string;
    selector?: string;
} = {}): MJTestEntity_IReplayScriptStep {
    return {
        Instruction: 'do the thing',
        UrlBefore: 'http://app/{uuid}',
        Action: {
            Method: (overrides.method ?? 'click') as MJTestEntity_IReplayScriptStep['Action']['Method'],
            Url: overrides.url,
            Target: {
                Role: overrides.role ?? 'button',
                Name: overrides.name ?? 'Save',
                Selector: overrides.selector ?? '#save',
            },
        },
        Precondition: { WaitForTarget: true, ReadyBeacon: false },
    };
}

function script(steps: MJTestEntity_IReplayScriptStep[]): MJTestEntity_IReplayScript {
    return {
        TestId: 'T042',
        AppBuildHash: 'abc',
        AppVersion: '6.1.0',
        GoalHash: 'goal',
        RecordedAt: '2026-09-08T00:00:00.000Z',
        Viewport: { Width: 1280, Height: 720 },
        Variables: [],
        Steps: steps,
        GoalPostconditions: [],
    };
}

describe('summarizeScriptDrift', () => {
    it('treats a first script as new, with nothing to compare', () => {
        const d = SummarizeScriptDrift(undefined, script([step(), step()]));
        expect(d.AddedSteps).toBe(2);
        expect(d.MeaningfulDrift).toBe(0);
        expect(d.Summary).toContain('new script');
    });

    it('reports no drift when the two scripts agree', () => {
        const d = SummarizeScriptDrift(script([step()]), script([step()]));
        expect(d.Changes).toHaveLength(0);
        expect(d.MeaningfulDrift).toBe(0);
        expect(d.Summary).toBe('identical to the promoted script');
    });

    it('calls a selector change with role and name intact routine churn', () => {
        const d = SummarizeScriptDrift(
            script([step({ selector: '#save' })]),
            script([step({ selector: 'button.save-v2' })])
        );
        expect(d.Changes).toEqual([
            { index: 0, kind: 'selector-drift', detail: '#save → button.save-v2' },
        ]);
        expect(d.MeaningfulDrift).toBe(0);
        expect(d.Summary).toContain('routine churn');
    });

    it('flags a changed target as meaningful — the UI moved, not the selector', () => {
        const d = SummarizeScriptDrift(
            script([step({ name: 'Save' })]),
            script([step({ name: 'Save changes' })])
        );
        expect(d.Changes[0].kind).toBe('target-changed');
        expect(d.MeaningfulDrift).toBe(1);
    });

    it('flags a changed verb', () => {
        const d = SummarizeScriptDrift(script([step({ method: 'click' })]), script([step({ method: 'type' })]));
        expect(d.Changes[0]).toMatchObject({ kind: 'method-changed', detail: 'click → type' });
        expect(d.MeaningfulDrift).toBe(1);
    });

    it('flags a changed navigation URL', () => {
        const d = SummarizeScriptDrift(
            script([step({ method: 'navigate', url: 'http://app/a' })]),
            script([step({ method: 'navigate', url: 'http://app/b' })])
        );
        expect(d.Changes[0].kind).toBe('url-changed');
        expect(d.MeaningfulDrift).toBe(1);
    });

    it('reports a verb change ahead of the target change that came with it', () => {
        const d = SummarizeScriptDrift(
            script([step({ method: 'click', name: 'Save' })]),
            script([step({ method: 'type', name: 'Search' })])
        );
        expect(d.Changes).toHaveLength(1);
        expect(d.Changes[0].kind).toBe('method-changed');
    });

    it('counts added and removed steps as meaningful', () => {
        const grew = SummarizeScriptDrift(script([step()]), script([step(), step()]));
        expect(grew.AddedSteps).toBe(1);
        expect(grew.MeaningfulDrift).toBe(1);

        const shrank = SummarizeScriptDrift(script([step(), step()]), script([step()]));
        expect(shrank.RemovedSteps).toBe(1);
        expect(shrank.MeaningfulDrift).toBe(1);
    });

    it('separates routine churn from real movement in one summary', () => {
        const d = SummarizeScriptDrift(
            script([step({ selector: '#a' }), step({ name: 'Save' })]),
            script([step({ selector: '#a-v2' }), step({ name: 'Submit' })])
        );
        expect(d.MeaningfulDrift).toBe(1);
        expect(d.Summary).toContain('1 selector-only change(s)');
        expect(d.Summary).toContain('1 target/verb/URL change(s)');
    });

    it('survives a script with no steps at all', () => {
        expect(SummarizeScriptDrift(script([]), script([])).Summary).toBe('identical to the promoted script');
    });
});

describe('fields the comparison used to ignore (review: non-blocking)', () => {
    /** A full step, so each test can change exactly one field. */
    function full(): MJTestEntity_IReplayScriptStep {
        return {
            Instruction: 'type the name',
            UrlBefore: 'http://app/data',
            Action: {
                Method: 'type' as MJTestEntity_IReplayScriptStep['Action']['Method'],
                Text: 'Widget',
                Key: 'Enter',
                PressEnter: true,
                Target: { Role: 'textbox', Name: 'Name', Selector: '#n', Scope: 'group:Details' },
            },
            Precondition: { WaitForTarget: true },
            Postcondition: { UrlPattern: 'http://app/data/saved' },
        } as MJTestEntity_IReplayScriptStep;
    }

    const scriptOf = (s: MJTestEntity_IReplayScriptStep): MJTestEntity_IReplayScript =>
        ({ TestId: 'T1', Steps: [s] } as MJTestEntity_IReplayScript);

    function driftFor(mutate: (s: MJTestEntity_IReplayScriptStep) => void) {
        const after = full();
        mutate(after);
        return SummarizeScriptDrift(scriptOf(full()), scriptOf(after));
    }

    it('reports changed typed text — the recording no longer enters the same value', () => {
        expect(driftFor(s => { s.Action.Text = 'Gadget'; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('reports a changed key', () => {
        expect(driftFor(s => { s.Action.Key = 'Tab'; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('reports a changed PressEnter', () => {
        expect(driftFor(s => { s.Action.PressEnter = false; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('reports a changed Scope — the twin-disambiguating region moved', () => {
        expect(driftFor(s => { s.Action.Target!.Scope = 'group:Other'; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('reports a changed UrlBefore', () => {
        expect(driftFor(s => { s.UrlBefore = 'http://app/home'; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('reports a changed postcondition — the step now asserts something else', () => {
        expect(driftFor(s => { s.Postcondition = { UrlPattern: 'http://app/elsewhere' } as never; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('reports a dropped postcondition', () => {
        expect(driftFor(s => { s.Postcondition = undefined; }).MeaningfulDrift).toBeGreaterThan(0);
    });

    it('still reports two identical steps as no drift', () => {
        const drift = SummarizeScriptDrift(scriptOf(full()), scriptOf(full()));
        expect(drift.Changes).toHaveLength(0);
        expect(drift.MeaningfulDrift).toBe(0);
    });
});
