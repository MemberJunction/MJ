import { describe, it, expect } from 'vitest';
import { MJTestEntity_IReplayScript, MJTestEntity_IReplayScriptStep } from '@memberjunction/core-entities';
import { summarizeScriptDrift } from '../utils/script-drift';

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
        const d = summarizeScriptDrift(undefined, script([step(), step()]));
        expect(d.addedSteps).toBe(2);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.summary).toContain('new script');
    });

    it('reports no drift when the two scripts agree', () => {
        const d = summarizeScriptDrift(script([step()]), script([step()]));
        expect(d.changes).toHaveLength(0);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.summary).toBe('identical to the promoted script');
    });

    it('calls a selector change with role and name intact routine churn', () => {
        const d = summarizeScriptDrift(
            script([step({ selector: '#save' })]),
            script([step({ selector: 'button.save-v2' })])
        );
        expect(d.changes).toEqual([
            { index: 0, kind: 'selector-drift', detail: '#save → button.save-v2' },
        ]);
        expect(d.meaningfulDrift).toBe(0);
        expect(d.summary).toContain('routine churn');
    });

    it('flags a changed target as meaningful — the UI moved, not the selector', () => {
        const d = summarizeScriptDrift(
            script([step({ name: 'Save' })]),
            script([step({ name: 'Save changes' })])
        );
        expect(d.changes[0].kind).toBe('target-changed');
        expect(d.meaningfulDrift).toBe(1);
    });

    it('flags a changed verb', () => {
        const d = summarizeScriptDrift(script([step({ method: 'click' })]), script([step({ method: 'type' })]));
        expect(d.changes[0]).toMatchObject({ kind: 'method-changed', detail: 'click → type' });
        expect(d.meaningfulDrift).toBe(1);
    });

    it('flags a changed navigation URL', () => {
        const d = summarizeScriptDrift(
            script([step({ method: 'navigate', url: 'http://app/a' })]),
            script([step({ method: 'navigate', url: 'http://app/b' })])
        );
        expect(d.changes[0].kind).toBe('url-changed');
        expect(d.meaningfulDrift).toBe(1);
    });

    it('reports a verb change ahead of the target change that came with it', () => {
        const d = summarizeScriptDrift(
            script([step({ method: 'click', name: 'Save' })]),
            script([step({ method: 'type', name: 'Search' })])
        );
        expect(d.changes).toHaveLength(1);
        expect(d.changes[0].kind).toBe('method-changed');
    });

    it('counts added and removed steps as meaningful', () => {
        const grew = summarizeScriptDrift(script([step()]), script([step(), step()]));
        expect(grew.addedSteps).toBe(1);
        expect(grew.meaningfulDrift).toBe(1);

        const shrank = summarizeScriptDrift(script([step(), step()]), script([step()]));
        expect(shrank.removedSteps).toBe(1);
        expect(shrank.meaningfulDrift).toBe(1);
    });

    it('separates routine churn from real movement in one summary', () => {
        const d = summarizeScriptDrift(
            script([step({ selector: '#a' }), step({ name: 'Save' })]),
            script([step({ selector: '#a-v2' }), step({ name: 'Submit' })])
        );
        expect(d.meaningfulDrift).toBe(1);
        expect(d.summary).toContain('1 selector-only change(s)');
        expect(d.summary).toContain('1 target/verb/URL change(s)');
    });

    it('survives a script with no steps at all', () => {
        expect(summarizeScriptDrift(script([]), script([])).summary).toBe('identical to the promoted script');
    });
});
