import { describe, it, expect } from 'vitest';
import {
    distillGoalPostconditions,
    executeGoalPostconditions,
    evaluatePreludeLanding,
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
    makeJudgeCacheKey,
    JudgeVerdictCache,
    gateImpossibleVerdict,
    DEFAULT_IMPOSSIBLE_QUORUM,
    buildFailureMemo,
    DEFAULT_FAILURE_MEMO_MAX_CHARS,
} from '../engine/verdict.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import { InteractiveElement } from '../types/browser.js';
import { GoalPostcondition, TraceTarget } from '../types/trace.js';
import { RunCheckpoint } from '../types/params.js';
import type { CriterionVerdict } from '../judge/rubric.js';

// ─── from postcondition ───

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function el(role: string, name: string, selector = ''): InteractiveElement {
    const e = new InteractiveElement();
    e.Role = role; e.Name = name; e.Selector = selector;
    return e;
}

describe('distillGoalPostconditions', () => {
    it('distills a normalized final-URL postcondition', () => {
        const step = new StepRecord();
        step.UrlAfter = `http://localhost:4200/app/record/${UUID}`;
        const posts = distillGoalPostconditions({ finalStep: step });
        expect(posts[0].Kind).toBe('url');
        expect(posts[0].UrlPattern).toBe('http://localhost:4200/app/record/{uuid}');
    });

    it('distills up to 3 landmark heading presence postconditions', () => {
        const step = new StepRecord();
        step.UrlAfter = 'http://x/app/data';
        step.InteractiveElements = [
            el('heading', 'Data Explorer', '#h1'),
            el('heading', 'Members', '#h2'),
            el('heading', 'Details', '#h3'),
            el('heading', 'Extra', '#h4'),   // 4th ignored (cap 3)
            el('button', 'Save', '#save'),   // non-heading ignored
        ];
        const posts = distillGoalPostconditions({ finalStep: step });
        const visible = posts.filter(p => p.Kind === 'visible');
        expect(visible).toHaveLength(3);
        expect(visible.map(p => p.Target?.Name)).toEqual(['Data Explorer', 'Members', 'Details']);
    });

    it('returns [] when there is no URL and no headings', () => {
        expect(distillGoalPostconditions({})).toEqual([]);
    });
});

describe('executeGoalPostconditions', () => {
    function urlPost(pattern: string): GoalPostcondition {
        return Object.assign(new GoalPostcondition(), { Kind: 'url', UrlPattern: pattern });
    }
    function visiblePost(role: string, name: string): GoalPostcondition {
        const p = new GoalPostcondition();
        p.Kind = 'visible';
        p.Target = Object.assign(new TraceTarget(), { Role: role, Name: name });
        return p;
    }

    it('passes when the URL matches and the element is present', () => {
        const r = executeGoalPostconditions(
            [urlPost('/app/data'), visiblePost('heading', 'Data Explorer')],
            { url: 'http://x/app/data/list', elements: [el('heading', 'Data Explorer Page')] },
        );
        expect(r.passed).toBe(true);
    });

    it('fails when the URL does not match', () => {
        const r = executeGoalPostconditions([urlPost('/app/data')], { url: 'http://x/app/home', elements: [] });
        expect(r.passed).toBe(false);
        expect(r.results[0].detail).toContain('did not match');
    });

    it('fails when an expected element is absent', () => {
        const r = executeGoalPostconditions([visiblePost('heading', 'Missing')], { url: 'http://x', elements: [el('heading', 'Present')] });
        expect(r.passed).toBe(false);
    });

    it("supports 'absent' postconditions (e.g. no error toast)", () => {
        const absent = Object.assign(new GoalPostcondition(), {
            Kind: 'absent',
            Target: Object.assign(new TraceTarget(), { Role: 'alert', Name: 'Error' }),
        });
        expect(executeGoalPostconditions([absent], { url: 'http://x', elements: [el('heading', 'OK')] }).passed).toBe(true);
        expect(executeGoalPostconditions([absent], { url: 'http://x', elements: [el('alert', 'Error occurred')] }).passed).toBe(false);
    });
});


describe('evaluatePreludeLanding', () => {
    it('lands trivially when nothing is declared', () => {
        expect(evaluatePreludeLanding({ hasSelector: false, selectorVisible: false, hasUrl: false, urlMatched: false }).landed).toBe(true);
    });
    it('fails when a declared selector is not visible', () => {
        const r = evaluatePreludeLanding({ hasSelector: true, selectorVisible: false, hasUrl: false, urlMatched: false });
        expect(r.landed).toBe(false);
        expect(r.reason).toContain('element not visible');
    });
    it('fails when a declared URL pattern does not match', () => {
        const r = evaluatePreludeLanding({ hasSelector: false, selectorVisible: false, hasUrl: true, urlMatched: false });
        expect(r.landed).toBe(false);
        expect(r.reason).toContain('unexpected URL');
    });
    it('lands when the declared selector is visible and URL matches', () => {
        expect(evaluatePreludeLanding({ hasSelector: true, selectorVisible: true, hasUrl: true, urlMatched: true }).landed).toBe(true);
    });
});

// ─── from checkpoint ───

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

describe('findCheckpoint + checkpointVisualCriteria (checkpoint scoping)', () => {
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

// ─── from judge-cache ───

const UUID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const UUID_B = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('makeJudgeCacheKey', () => {
    it('is stable for the same goal/url/state', () => {
        expect(makeJudgeCacheKey('g1', 'http://x/app/data', 's1')).toBe(makeJudgeCacheKey('g1', 'http://x/app/data', 's1'));
    });

    it('normalizes the URL (per-record UUIDs key the same)', () => {
        const a = makeJudgeCacheKey('g1', `http://x/r/${UUID_A}`, 's1');
        const b = makeJudgeCacheKey('g1', `http://x/r/${UUID_B}`, 's1');
        expect(a).toBe(b);
    });

    it('differs when the state hash differs', () => {
        expect(makeJudgeCacheKey('g1', 'http://x', 's1')).not.toBe(makeJudgeCacheKey('g1', 'http://x', 's2'));
    });
});

describe('JudgeVerdictCache', () => {
    it('stores and retrieves verdicts by key', () => {
        const cache = new JudgeVerdictCache();
        const v = Object.assign(new JudgeVerdict(), { Impossible: true, Reason: 'no permission' });
        const key = makeJudgeCacheKey('g', 'http://x', 's');

        expect(cache.has(key)).toBe(false);
        cache.set(key, v);
        expect(cache.has(key)).toBe(true);
        expect(cache.get(key)).toBe(v);
        expect(cache.size).toBe(1);
    });

    it('clears', () => {
        const cache = new JudgeVerdictCache();
        cache.set(makeJudgeCacheKey('g', 'http://x', 's'), new JudgeVerdict());
        cache.clear();
        expect(cache.size).toBe(0);
    });
});

// ─── from terminal-verdict ───

describe('gateImpossibleVerdict', () => {
    const base = { impossible: true, pageLoading: false, priorCount: 0, quorum: 2 };

    it('does not accept the first Impossible (needs a quorum)', () => {
        const r = gateImpossibleVerdict(base);
        expect(r.accept).toBe(false);
        expect(r.newCount).toBe(1);
        expect(r.suppressed).toBe(false);
    });

    it('accepts the second concurring Impossible', () => {
        const r = gateImpossibleVerdict({ ...base, priorCount: 1 });
        expect(r.accept).toBe(true);
        expect(r.newCount).toBe(2);
    });

    it('resets the count on a non-Impossible verdict', () => {
        const r = gateImpossibleVerdict({ ...base, impossible: false, priorCount: 1 });
        expect(r.accept).toBe(false);
        expect(r.newCount).toBe(0);
    });

    it('suppresses Impossible while the page is loading and holds the count', () => {
        const r = gateImpossibleVerdict({ ...base, pageLoading: true, priorCount: 1 });
        expect(r.accept).toBe(false);
        expect(r.suppressed).toBe(true);
        expect(r.newCount).toBe(1); // held — neither built toward nor cleared
    });

    it('a loading boot screen never reaches quorum on its own', () => {
        let count = 0;
        for (let i = 0; i < 5; i++) {
            const r = gateImpossibleVerdict({ impossible: true, pageLoading: true, priorCount: count, quorum: 2 });
            count = r.newCount;
            expect(r.accept).toBe(false);
        }
        expect(count).toBe(0);
    });

    it('honors a quorum of 1 (accept immediately)', () => {
        expect(gateImpossibleVerdict({ ...base, quorum: 1 }).accept).toBe(true);
    });

    it('exposes a sane default quorum', () => {
        expect(DEFAULT_IMPOSSIBLE_QUORUM).toBe(2);
    });
});

// ─── from failure-memo ───

describe('buildFailureMemo', () => {
    it('states the terminal status and reason', () => {
        const memo = buildFailureMemo({ status: 'Failed', failureReason: 'LoopDetected', finalUrl: 'http://x/app/data' });
        expect(memo).toContain('Failed (LoopDetected)');
        expect(memo).toContain('/app/data');
    });

    it('includes judge reason + distinct feedback', () => {
        const memo = buildFailureMemo({
            status: 'MaxStepsReached',
            judgeReason: 'the record was never saved',
            judgeFeedback: 'click Save, not Cancel',
        });
        expect(memo).toContain('the record was never saved');
        expect(memo).toContain('click Save, not Cancel');
    });

    it('does not duplicate feedback identical to the reason', () => {
        const memo = buildFailureMemo({ status: 'Failed', judgeReason: 'same', judgeFeedback: 'same' });
        expect(memo.match(/same/g)).toHaveLength(1);
    });

    it('surfaces loop evidence as "avoid repeating"', () => {
        const memo = buildFailureMemo({ status: 'Failed', loopEvidence: 'visited /app/switcher 4×' });
        expect(memo).toContain('Avoid repeating: visited /app/switcher 4×');
    });

    it('renders a deduped recent-path trail excluding the final URL', () => {
        const memo = buildFailureMemo({
            status: 'Failed',
            finalUrl: 'http://x/app/data',
            recentUrls: ['http://x/app/home', 'http://x/app/home', 'http://x/app/switcher', 'http://x/app/data'],
        });
        expect(memo).toContain('Recent path: /app/home → /app/switcher');
        expect(memo).not.toContain('/app/data →');   // final excluded from the trail
    });

    it('bounds the memo to the char cap', () => {
        const memo = buildFailureMemo({
            status: 'Failed',
            judgeReason: 'x'.repeat(2000),
        }, 120);
        expect(memo.length).toBeLessThanOrEqual(120);
        expect(memo.endsWith('…')).toBe(true);
    });

    it('uses the default cap when unspecified', () => {
        const memo = buildFailureMemo({ status: 'Failed', judgeReason: 'y'.repeat(5000) });
        expect(memo.length).toBeLessThanOrEqual(DEFAULT_FAILURE_MEMO_MAX_CHARS);
    });
});
