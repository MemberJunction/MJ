import { describe, it, expect } from 'vitest';
import {
    isCheckpointRun,
    latchDeterministic,
    latchVisualFromVerdict,
    unlatchedVisualCriteria,
    allCheckpointsMet,
    countMetCheckpoints,
    synthesizeCheckpointVerdict,
    findCheckpoint,
    checkpointVisualCriteria,
    CheckpointLatch,
} from '../engine/checkpoint.js';
import { RunCheckpoint } from '../types/params.js';
import { GoalPostcondition, TraceTarget } from '../types/trace.js';
import { JudgeVerdict } from '../types/judge.js';
import { InteractiveElement } from '../types/browser.js';
import type { CriterionVerdict } from '../judge/rubric.js';

// ─── fixtures ──────────────────────────────────────────────
function urlCp(name: string, pattern: string): RunCheckpoint {
    const cp = new RunCheckpoint();
    cp.Name = name;
    cp.Instruction = `reach ${name}`;
    const p = new GoalPostcondition();
    p.Kind = 'url';
    p.UrlPattern = pattern;
    cp.Assertions = [p];
    return cp;
}

function visibleCp(name: string, role: string, label: string): RunCheckpoint {
    const cp = new RunCheckpoint();
    cp.Name = name;
    const p = new GoalPostcondition();
    p.Kind = 'visible';
    const t = new TraceTarget();
    t.Role = role;
    t.Name = label;
    p.Target = t;
    cp.Assertions = [p];
    return cp;
}

function visualCp(name: string, criteria: string[]): RunCheckpoint {
    const cp = new RunCheckpoint();
    cp.Name = name;
    cp.VisualCriteria = criteria;
    return cp;
}

function el(role: string, name: string): InteractiveElement {
    const e = new InteractiveElement();
    e.Role = role;
    e.Name = name;
    return e;
}

function verdict(criteria: Array<{ criterion: string; met: boolean }>): JudgeVerdict {
    const v = new JudgeVerdict();
    v.CriteriaVerdicts = criteria.map<CriterionVerdict>(c => ({ criterion: c.criterion, met: c.met, evidence: c.met ? 'seen' : 'not seen' }));
    return v;
}

const noElements: InteractiveElement[] = [];

describe('isCheckpointRun', () => {
    it('is false for undefined / empty, true for ≥1 checkpoint', () => {
        expect(isCheckpointRun(undefined)).toBe(false);
        expect(isCheckpointRun([])).toBe(false);
        expect(isCheckpointRun([urlCp('a', '/a')])).toBe(true);
    });
});

describe('latchDeterministic', () => {
    it('latches a URL checkpoint when the observed URL matches', () => {
        const cps = [urlCp('agents', '/app/agents')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/app/agents', elements: noElements }, 3);
        expect(latches.get('agents')?.met).toBe(true);
        expect(latches.get('agents')?.assertionsMet).toBe(true);
        expect(latches.get('agents')?.stepLatched).toBe(3);
    });

    it('does NOT latch when the URL does not match', () => {
        const cps = [urlCp('agents', '/app/agents')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/app/prompts', elements: noElements }, 1);
        expect(latches.get('agents')?.met).toBe(false);
    });

    it('is sticky — stays met after the agent navigates away', () => {
        const cps = [urlCp('agents', '/app/agents')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/app/agents', elements: noElements }, 2);
        latchDeterministic(cps, latches, { url: 'http://host/app/models', elements: noElements }, 5);
        const l = latches.get('agents');
        expect(l?.met).toBe(true);
        expect(l?.stepLatched).toBe(2); // stamped at first latch, not overwritten
    });

    it('latches a visible checkpoint when the element is present', () => {
        const cps = [visibleCp('agents', 'heading', 'Agents')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/x', elements: [el('heading', 'Agents')] }, 4);
        expect(latches.get('agents')?.met).toBe(true);
    });

    it('does NOT latch a visible checkpoint when no elements are available (grounding off)', () => {
        const cps = [visibleCp('agents', 'heading', 'Agents')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/x', elements: noElements }, 4);
        expect(latches.get('agents')?.met).toBe(false);
    });
});

describe('latchVisualFromVerdict', () => {
    it('latches a visual checkpoint only when ALL its criteria are met', () => {
        const cps = [visualCp('chart', ['bars rendered', 'legend visible'])];
        const latches = new Map<string, CheckpointLatch>();

        latchVisualFromVerdict(cps, latches, verdict([{ criterion: 'bars rendered', met: true }, { criterion: 'legend visible', met: false }]), 2);
        expect(latches.get('chart')?.met).toBe(false);

        latchVisualFromVerdict(cps, latches, verdict([{ criterion: 'bars rendered', met: true }, { criterion: 'legend visible', met: true }]), 4);
        expect(latches.get('chart')?.met).toBe(true);
        expect(latches.get('chart')?.stepLatched).toBe(4);
    });
});

describe('latchVisualFromVerdict scalar fallback (judge omitted the per-criterion breakdown)', () => {
    /** LLMJudge.applyRubric leaves CriteriaVerdicts undefined on a malformed/absent `criteria` array. */
    function scalarVerdict(done: boolean): JudgeVerdict {
        const v = new JudgeVerdict();
        v.Done = done;
        v.Reason = done ? 'looks right' : 'not there';
        return v;   // no CriteriaVerdicts
    }

    it('latches pending visual criteria when the scalar verdict says Done', () => {
        const cps = [visualCp('chart', ['bars rendered', 'legend visible'])];
        const latches = new Map<string, CheckpointLatch>();
        latchVisualFromVerdict(cps, latches, scalarVerdict(true), 3);
        expect(latches.get('chart')?.met).toBe(true);
        expect(latches.get('chart')?.evidence).toContain('looks right');
    });

    it('does NOT latch when the scalar verdict says not-Done', () => {
        const cps = [visualCp('chart', ['bars rendered'])];
        const latches = new Map<string, CheckpointLatch>();
        latchVisualFromVerdict(cps, latches, scalarVerdict(false), 3);
        expect(latches.get('chart')?.met).toBe(false);
    });

    it('prefers the per-criterion breakdown over the scalar when present', () => {
        // Done=true but the breakdown says one criterion is unmet → must NOT latch.
        const cps = [visualCp('chart', ['bars rendered', 'legend visible'])];
        const latches = new Map<string, CheckpointLatch>();
        const v = verdict([{ criterion: 'bars rendered', met: true }, { criterion: 'legend visible', met: false }]);
        v.Done = true;
        latchVisualFromVerdict(cps, latches, v, 2);
        expect(latches.get('chart')?.met).toBe(false);
    });
});

describe('checkpoint with both assertions AND visual criteria', () => {
    it('requires both sub-conditions before it is met', () => {
        const cp = urlCp('prompt', '/app/prompts/');
        cp.VisualCriteria = ['run-history chart rendered'];
        const cps = [cp];
        const latches = new Map<string, CheckpointLatch>();

        // assertions pass but visual still pending → not met
        latchDeterministic(cps, latches, { url: 'http://host/app/prompts/123', elements: noElements }, 1);
        expect(latches.get('prompt')?.assertionsMet).toBe(true);
        expect(latches.get('prompt')?.met).toBe(false);

        // visual now met → fully met
        latchVisualFromVerdict(cps, latches, verdict([{ criterion: 'run-history chart rendered', met: true }]), 3);
        expect(latches.get('prompt')?.met).toBe(true);
        expect(latches.get('prompt')?.stepLatched).toBe(3);
    });
});

describe('unlatchedVisualCriteria', () => {
    it('returns the union of pending visual criteria (dedup), empty when none pending', () => {
        const cps = [visualCp('a', ['x', 'y']), visualCp('b', ['y', 'z']), urlCp('c', '/c')];
        const latches = new Map<string, CheckpointLatch>();
        expect(unlatchedVisualCriteria(cps, latches)).toEqual(['x', 'y', 'z']);

        // latch 'a' visually → its criteria drop out; 'b' still pending
        latchVisualFromVerdict(cps, latches, verdict([{ criterion: 'x', met: true }, { criterion: 'y', met: true }]), 1);
        expect(unlatchedVisualCriteria(cps, latches)).toEqual(['y', 'z']);
    });

    it('is empty for a pure-deterministic tour (no judge needed)', () => {
        const cps = [urlCp('a', '/a'), urlCp('b', '/b')];
        expect(unlatchedVisualCriteria(cps, new Map())).toEqual([]);
    });
});

describe('findCheckpoint + checkpointVisualCriteria (CU-D8 Phase B scoping)', () => {
    it('findCheckpoint matches case-insensitively and trims', () => {
        const cps = [visualCp('Agents List', ['x'])];
        expect(findCheckpoint(cps, '  agents list ')?.Name).toBe('Agents List');
        expect(findCheckpoint(cps, 'nope')).toBeUndefined();
    });

    it('scopes to a single checkpoint’s pending visual criteria', () => {
        const cps = [visualCp('a', ['x', 'y']), visualCp('b', ['z'])];
        const latches = new Map<string, CheckpointLatch>();
        expect(checkpointVisualCriteria(cps, latches, 'a')).toEqual(['x', 'y']);
        expect(checkpointVisualCriteria(cps, latches, 'b')).toEqual(['z']);
    });

    it('returns empty for unknown name, deterministic-only checkpoint, or already-latched visual', () => {
        const cps = [visualCp('a', ['x']), urlCp('det', '/d')];
        const latches = new Map<string, CheckpointLatch>();
        expect(checkpointVisualCriteria(cps, latches, 'unknown')).toEqual([]);
        expect(checkpointVisualCriteria(cps, latches, 'det')).toEqual([]);

        latchVisualFromVerdict(cps, latches, verdict([{ criterion: 'x', met: true }]), 1);
        expect(checkpointVisualCriteria(cps, latches, 'a')).toEqual([]);
    });
});

describe('allCheckpointsMet + synthesizeCheckpointVerdict', () => {
    it('a partial tour is not Done and reports unmet sections', () => {
        const cps = [urlCp('agents', '/app/agents'), urlCp('models', '/app/models')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/app/agents', elements: noElements }, 1);

        expect(allCheckpointsMet(cps, latches)).toBe(false);
        const v = synthesizeCheckpointVerdict(cps, latches);
        expect(v.Done).toBe(false);
        expect(v.Confidence).toBe(0.5);
        expect(v.CriteriaVerdicts).toHaveLength(2);
        expect(v.CriteriaVerdicts?.find(c => c.criterion === 'reach models')?.met).toBe(false);
        expect(v.Reason).toContain('1/2 checkpoints reached');
        expect(v.Reason).toContain('reach models');
    });

    it('a fully-reached tour is Done with confidence 1', () => {
        const cps = [urlCp('agents', '/app/agents'), urlCp('models', '/app/models')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'http://host/app/agents', elements: noElements }, 1);
        latchDeterministic(cps, latches, { url: 'http://host/app/models', elements: noElements }, 2);

        expect(allCheckpointsMet(cps, latches)).toBe(true);
        const v = synthesizeCheckpointVerdict(cps, latches);
        expect(v.Done).toBe(true);
        expect(v.Confidence).toBe(1);
        expect(v.CriteriaVerdicts?.every(c => c.met)).toBe(true);
    });

    it('an empty checkpoint (no checks) latches vacuously', () => {
        const empty = new RunCheckpoint();
        empty.Name = 'noop';
        const latches = new Map<string, CheckpointLatch>();
        expect(allCheckpointsMet([empty], latches)).toBe(true);
    });
});

describe('countMetCheckpoints', () => {
    it('counts zero when nothing has latched', () => {
        const cps = [urlCp('a', '/a'), urlCp('b', '/b')];
        expect(countMetCheckpoints(cps, new Map())).toBe(0);
    });

    it('counts each checkpoint as it latches', () => {
        const cps = [urlCp('a', '/a'), urlCp('b', '/b')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'https://app/a', elements: [] }, 1);
        expect(countMetCheckpoints(cps, latches)).toBe(1);
        latchDeterministic(cps, latches, { url: 'https://app/b', elements: [] }, 2);
        expect(countMetCheckpoints(cps, latches)).toBe(2);
    });

    it('agrees with allCheckpointsMet at full coverage', () => {
        const cps = [urlCp('only', '/only')];
        const latches = new Map<string, CheckpointLatch>();
        latchDeterministic(cps, latches, { url: 'https://app/only', elements: [] }, 1);
        expect(countMetCheckpoints(cps, latches)).toBe(cps.length);
        expect(allCheckpointsMet(cps, latches)).toBe(true);
    });

    it('returns 0 for an empty checkpoint list', () => {
        expect(countMetCheckpoints([], new Map())).toBe(0);
    });
});
