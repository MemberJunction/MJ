/**
 * The `Decision` node kind, the `decisions` condition root, and exhaustive Choice forks (plan 4.2–4.4).
 *
 * The fork tests are the heart of this file. A condition is untyped truthiness, so an exclusive group
 * has never had a notion of coverage: when the model picks an option no edge tests, every edge loses
 * and the branch ends with nothing to say why. A Choice enumerates its options when the graph is
 * written, so the missing path is knowable at submit — and these tests pin that it is refused there,
 * by name, and that nothing that is not a Choice fork is refused by the same rule.
 */
import { describe, it, expect } from 'vitest';
import { ValidateTaskGraphSpec } from '../task-graph/task-graph-validator';
import { CONDITION_ROOTS } from '../task-graph/condition-roots';
import {
    DecisionChoiceTestOf,
    DecisionReferencesIn,
    DecisionsReadAsProperty,
    DecisionValueComparisonsIn,
} from '../task-graph/decision-conditions';
import { ProjectTaskRowsToSpec } from '../task-graph/task-rows-to-spec';
import { ConvertTaskGraphToAgentSpec } from '../task-graph/task-graph-to-agent-spec';
import {
    TaskNode,
    type TaskGraphDependency,
    type TaskGraphNodeConfigMap,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type TaskGraphValidationError,
} from '../task-graph/task-graph-spec';

const base = (tempId: string, dependsOn: Array<string | TaskGraphDependency> = [], name = tempId) =>
    ({ tempId, name, description: '', dependsOn });

/** A triage decision: one Choice, one Likelihood, one Score. */
const TRIAGE: TaskGraphNodeConfigMap['Decision'] = {
    questions: {
        intent: {
            kind: 'Choice',
            instructions: 'Which team should handle this ticket?',
            options: [
                { value: 'billing', description: 'A question about an invoice or a charge.' },
                { value: 'refund', description: 'A request for money back.' },
                { value: 'other', description: 'Anything else.' },
            ],
            minConfidence: 0.7,
        },
        urgent: { kind: 'Likelihood', instructions: 'The customer cannot work until this is fixed.' },
        severity: { kind: 'Score', instructions: 'How bad is it?', levels: ['minor: cosmetic', 'major: blocks one user', 'critical: blocks everyone'] },
    },
};

const triage = (config: TaskGraphNodeConfigMap['Decision'] = TRIAGE): TaskGraphSpecNode =>
    TaskNode.Decision(base('triage', [], 'Triage the ticket'), config);

const agentStep = (tempId: string, dependsOn: Array<string | TaskGraphDependency>): TaskGraphSpecNode =>
    TaskNode.Agent(base(tempId, dependsOn), { agentName: 'Some Agent' });

/** A fork edge out of `triage` in exclusive group `route`. */
const fork = (condition: string | undefined, priority = 0): TaskGraphDependency =>
    ({ tempId: 'triage', condition, exclusiveGroup: 'route', priority });

const spec = (tasks: TaskGraphSpecNode[]): TaskGraphSpec => ({ workflowName: 'Support triage', tasks });

const errorsOf = (s: TaskGraphSpec): TaskGraphValidationError[] => ValidateTaskGraphSpec(s).Errors;
const codesOf = (s: TaskGraphSpec) => errorsOf(s).map((e) => e.Code);

describe('TaskNode.Decision', () => {
    it('builds a node of the Decision kind carrying its configuration', () => {
        const node = triage();
        expect(node.kind).toBe('Decision');
        expect(node.configuration).toBe(TRIAGE);
    });

    it('validates a Decision step with well-formed questions', () => {
        expect(ValidateTaskGraphSpec(spec([triage()])).Valid).toBe(true);
    });

    it('accepts a promptName and a payload-path state', () => {
        const node = triage({ ...TRIAGE, promptName: 'Triage Decision', state: 'payload.ticket' });
        expect(ValidateTaskGraphSpec(spec([node])).Valid).toBe(true);
    });
});

describe('Decision configuration is checked at submit', () => {
    it('requires questions, like every kind requires what it cannot default', () => {
        const node = { ...base('triage'), kind: 'Decision', configuration: {} } as TaskGraphSpecNode;
        const error = errorsOf(spec([node])).find((e) => e.Code === 'InvalidConfiguration');
        expect(error?.Message).toContain('questions');
    });

    it('refuses an empty question set', () => {
        expect(codesOf(spec([triage({ questions: {} })]))).toContain('InvalidConfiguration');
    });

    it('refuses a Choice with fewer than two options', () => {
        const node = triage({ questions: { intent: { kind: 'Choice', instructions: 'Which?', options: [{ value: 'a', description: 'A.' }] } } });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/at least two options/);
    });

    it('refuses a Choice with the same option value twice — a fork could not tell them apart', () => {
        const node = triage({
            questions: {
                intent: {
                    kind: 'Choice', instructions: 'Which?',
                    options: [{ value: 'a', description: 'A.' }, { value: 'a', description: 'Also A.' }],
                },
            },
        });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/"a" twice/);
    });

    it('refuses an option with no description — the model reads descriptions, not values', () => {
        const node = triage({
            questions: { intent: { kind: 'Choice', instructions: 'Which?', options: [{ value: 'a', description: '' }, { value: 'b', description: 'B.' }] } },
        });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/option 1 .* has no description/);
    });

    it('refuses a Score with fewer than two levels', () => {
        const node = triage({ questions: { severity: { kind: 'Score', instructions: 'How bad?', levels: ['only'] } } });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/at least two levels/);
    });

    it('refuses a question with no instructions', () => {
        const node = triage({ questions: { urgent: { kind: 'Likelihood', instructions: '  ' } } });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/"urgent" has no instructions/);
    });

    it.each([-0.1, 1.5, Number.NaN])('refuses a minConfidence of %p', (minConfidence) => {
        const node = triage({ questions: { urgent: { kind: 'Likelihood', instructions: 'Blocked?', minConfidence } } });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/minConfidence/);
    });

    it('refuses a state that is not a payload path', () => {
        const node = triage({ ...TRIAGE, state: 'the ticket text' });
        expect(errorsOf(spec([node])).map((e) => e.Message).join('\n')).toMatch(/not "payload" or "payload.<path>"/);
    });

    it('refuses an empty promptName rather than silently using the default', () => {
        expect(codesOf(spec([triage({ ...TRIAGE, promptName: ' ' })]))).toContain('InvalidConfiguration');
    });
});

describe('the decisions condition root', () => {
    it('is a declared root', () => {
        expect(CONDITION_ROOTS.has('decisions')).toBe(true);
    });

    it('accepts an edge reading a Choice value and a Likelihood probability', () => {
        const s = spec([
            triage(),
            agentStep('billing', [{ tempId: 'triage', condition: "decisions.triage.intent.value === 'billing'" }]),
            agentStep('escalate', [{ tempId: 'triage', condition: 'decisions.triage.urgent.probability >= 0.8' }]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('still refuses an unknown root at submit', () => {
        const s = spec([triage(), agentStep('next', [{ tempId: 'triage', condition: "verdicts.triage.intent.value === 'billing'" }])]);
        const error = errorsOf(s).find((e) => e.Code === 'InvalidCondition');
        expect(error?.Message).toContain('"verdicts"');
        expect(error?.Message).toContain('decisions');
    });

    it('refuses a reference to a step that is not a Decision step, naming the ones that are', () => {
        const s = spec([triage(), agentStep('next', [{ tempId: 'triage', condition: "decisions.triag.intent.value === 'billing'" }])]);
        const error = errorsOf(s).find((e) => e.Code === 'InvalidCondition');
        expect(error?.Message).toContain('"triag"');
        expect(error?.Message).toContain('"triage"');
    });

    it('refuses a question the step does not ask, naming the ones it does', () => {
        const s = spec([triage(), agentStep('next', [{ tempId: 'triage', condition: "decisions.triage.intnet.value === 'billing'" }])]);
        const error = errorsOf(s).find((e) => e.Code === 'InvalidCondition');
        expect(error?.Message).toContain('"intnet"');
        expect(error?.Message).toContain('"intent"');
    });

    it('refuses a field the answer does not have — a Likelihood has no value, so the test would always be false', () => {
        const s = spec([triage(), agentStep('next', [{ tempId: 'triage', condition: 'decisions.triage.urgent.value === true' }])]);
        const error = errorsOf(s).find((e) => e.Code === 'InvalidCondition');
        expect(error?.Message).toMatch(/"value" from the Likelihood question "urgent"/);
    });

    it.each(['decisions.triage', 'Object.keys(decisions).length > 0'])('refuses %s, which names no question', (condition) => {
        const s = spec([triage(), agentStep('next', [{ tempId: 'triage', condition }])]);
        expect(errorsOf(s).find((e) => e.Code === 'InvalidCondition')?.Message).toMatch(/without naming a Decision step/);
    });

    it('accepts bracket notation for a step whose tempId is not an identifier', () => {
        const s = spec([
            TaskNode.Decision(base('triage-step'), TRIAGE),
            agentStep('next', [{ tempId: 'triage-step', condition: "decisions['triage-step'].intent.value == 'refund'" }]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('refuses decisions in a While loop condition, which is evaluated where there is no decisions root', () => {
        const loop = TaskNode.While(base('loop', ['triage']), {
            condition: "decisions.triage.intent.value === 'billing'",
            action: { name: 'Do Thing', params: {} },
        });
        const error = errorsOf(spec([triage(), loop])).find((e) => e.Code === 'InvalidCondition');
        expect(error?.Message).toMatch(/Only an edge condition can read/);
    });
});

describe('a decision must be able to answer before the edge that reads it is decided', () => {
    const reads = (tempId: string, condition = "decisions.triage.intent.value === 'billing'"): TaskGraphDependency =>
        ({ tempId, condition });
    const timingErrors = (s: TaskGraphSpec) =>
        errorsOf(s).filter((e) => e.Code === 'InvalidCondition' && /wait for it forever|does not wait for:/.test(e.Message));

    it('REFUSES a decision that depends on the edge\'s target — the probe: A→B reads triage, triage depends on B', () => {
        const s = spec([
            agentStep('A', []),
            agentStep('B', [reads('A')]),
            TaskNode.Decision(base('triage', ['B'], 'Triage the ticket'), TRIAGE),
        ]);
        const result = ValidateTaskGraphSpec(s);
        expect(result.Valid).toBe(false);
        const [error] = timingErrors(s);
        expect(error.Message).toContain('"Triage the ticket", which comes after "B"');
        expect(error.TempId).toBe('B');
    });

    it('REFUSES a decision further downstream of the target', () => {
        const s = spec([
            agentStep('A', []),
            agentStep('B', [reads('A')]),
            agentStep('C', ['B']),
            TaskNode.Decision(base('triage', ['C'], 'Triage the ticket'), TRIAGE),
        ]);
        expect(timingErrors(s)[0]?.Message).toContain('which comes after "B"');
    });

    it('REFUSES an edge that reads its own target\'s decision', () => {
        const s = spec([
            agentStep('A', []),
            TaskNode.Decision(base('triage', [reads('A')], 'Triage the ticket'), TRIAGE),
        ]);
        expect(timingErrors(s)[0]?.Message).toContain('the step this edge leads to');
    });

    it('REFUSES a decision on a sibling branch of a fork, which is skipped whenever the other branch wins', () => {
        const s = spec([
            agentStep('X', []),
            TaskNode.Decision(base('triage', [{ tempId: 'X', condition: 'payload.kind === "ticket"', exclusiveGroup: 'kind' }], 'Triage the ticket'), TRIAGE),
            agentStep('E', [{ tempId: 'X', condition: 'payload.kind !== "ticket"', exclusiveGroup: 'kind' }]),
            agentStep('F', [reads('E')]),
        ]);
        expect(timingErrors(s)[0]?.Message).toContain('"E" does not wait for: it may not have answered');
    });

    it('REFUSES a decision upstream of a join it is not certain for — its branch can be skipped while the join runs', () => {
        const s = spec([
            agentStep('X', []),
            TaskNode.Decision(base('triage', [{ tempId: 'X', condition: 'payload.kind === "ticket"', exclusiveGroup: 'kind' }], 'Triage the ticket'), TRIAGE),
            agentStep('E', [{ tempId: 'X', condition: 'payload.kind !== "ticket"', exclusiveGroup: 'kind' }]),
            agentStep('J', ['triage', 'E']),
            agentStep('K', [reads('J')]),
        ]);
        expect(timingErrors(s)[0]?.Message).toContain('on a branch that can be skipped while "J" still runs');
    });

    it('REFUSES a decision running in parallel that the origin does not wait for', () => {
        const s = spec([
            agentStep('A', []),
            triage(),
            agentStep('B', [reads('A')]),
        ]);
        expect(timingErrors(s)[0]?.Message).toContain('"A" does not wait for: it may not have answered');
    });

    it('reports one timing error per decision, however many of its questions the condition reads', () => {
        const s = spec([
            agentStep('A', []),
            agentStep('B', [reads('A', "decisions.triage.intent.value === 'billing' && decisions.triage.urgent.probability > 0.5")]),
            TaskNode.Decision(base('triage', ['B'], 'Triage the ticket'), TRIAGE),
        ]);
        expect(timingErrors(s)).toHaveLength(1);
    });

    it('accepts an edge leaving the Decision step itself', () => {
        expect(ValidateTaskGraphSpec(spec([triage(), agentStep('B', [reads('triage')])])).Errors).toEqual([]);
    });

    it('accepts an edge leaving a step that runs only after the decision', () => {
        const s = spec([triage(), agentStep('gather', ['triage']), agentStep('B', [reads('gather')])]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('accepts a join after a fork on the decision — every branch ran after it', () => {
        const s = spec([
            triage(),
            agentStep('billing', [fork("decisions.triage.intent.value === 'billing'")]),
            agentStep('refund', [fork("decisions.triage.intent.value === 'refund'")]),
            agentStep('other', [fork("decisions.triage.intent.value === 'other'")]),
            agentStep('wrap', ['billing', 'refund', 'other']),
            agentStep('escalate', [reads('wrap', 'decisions.triage.urgent.probability >= 0.8')]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('accepts an AND-join that waits for a decision made in parallel', () => {
        const s = spec([
            agentStep('fetch', []),
            triage(),
            agentStep('merge', ['fetch', 'triage']),
            agentStep('B', [reads('merge')]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });
});

describe('a condition may read Decision answers only through the decisions root', () => {
    const reading = (condition: string, tasks: TaskGraphSpecNode[] = [triage()]) =>
        errorsOf(spec([...tasks, agentStep('next', [{ tempId: tasks[0].tempId, condition }])]))
            .filter((e) => e.Code === 'InvalidCondition');

    it.each([
        ["payload.decisions.triage.intent.value === 'billing'", 'payload.decisions'],
        ["output.decisions.triage.intent.value === 'billing'", 'output.decisions'],
        ["stepResult.result.decisions.triage.intent.value === 'billing'", 'stepResult.result.decisions'],
        ["payload?.decisions?.triage?.intent?.value !== 'billing'", 'payload?.decisions'],
        ["payload['decisions'].triage.intent.value === 'billing'", "payload['decisions']"],
        ['Object.keys(payload.decisions).length > 0', 'payload.decisions'],
    ])('REFUSES %s, naming %s', (condition, read) => {
        const [error] = reading(condition);
        expect(error?.Message).toContain(`through "${read}"`);
        expect(error?.Message).toContain('decisions root');
    });

    it('leaves a payload field called decisions alone in a graph with no Decision step', () => {
        expect(reading('payload.decisions.length > 0', [agentStep('first', [])])).toEqual([]);
    });

    it('refuses the copy in a loop condition too', () => {
        const loop = TaskNode.While(base('loop', ['triage']), {
            condition: "payload.decisions.triage.intent.value === 'billing'",
            action: { name: 'Do Thing', params: {} },
        });
        expect(errorsOf(spec([triage(), loop])).find((e) => e.Code === 'InvalidCondition')?.Message)
            .toMatch(/through "payload.decisions". Only an edge condition can read/);
    });
});

describe('a Choice compared with a value it does not offer', () => {
    const edgeReading = (condition: string) =>
        errorsOf(spec([triage(), agentStep('next', [{ tempId: 'triage', condition }])])).filter((e) => e.Code === 'InvalidCondition');

    it.each([
        "decisions.triage.intent.value === 'biling'",
        "decisions.triage.intent.value !== 'biling'",
        "'biling' == decisions.triage.intent.value",
        "payload.vip && decisions.triage.intent.value === 'biling'",
    ])('is refused on an ordinary edge: %s', (condition) => {
        const [error] = edgeReading(condition);
        expect(error?.Message).toContain('with "biling", which is not one of its options ("billing", "refund", "other")');
    });

    it('accepts an option it does offer, however it is compared', () => {
        expect(edgeReading("decisions.triage.intent.value !== 'refund' && 'other' != decisions.triage.intent.value")).toEqual([]);
    });
});

describe('an escaped quote in a Choice literal', () => {
    const QUOTED: TaskGraphNodeConfigMap['Decision'] = {
        questions: {
            tone: {
                kind: 'Choice', instructions: 'What is the tone?',
                options: [{ value: "it's fine", description: 'Calm.' }, { value: 'angry', description: 'Upset.' }],
            },
        },
    };

    it('reads as the option it spells', () => {
        expect(DecisionChoiceTestOf("decisions.t.q.value === 'it\\'s fine'")?.Values).toEqual(["it's fine"]);
    });

    it('covers that option in an exhaustive fork, and is not refused as an unknown value', () => {
        const s = spec([
            TaskNode.Decision(base('triage'), QUOTED),
            agentStep('calm', [fork("decisions.triage.tone.value === 'it\\'s fine'")]),
            agentStep('upset', [fork("decisions.triage.tone.value === 'angry'")]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });
});

describe('DecisionValueComparisonsIn', () => {
    it('finds comparisons with a literal on either side, anywhere in the condition', () => {
        expect(DecisionValueComparisonsIn("payload.x && (decisions.a.q.value !== 'x' || 'y' === decisions.b.r.value)")).toEqual([
            { NodeId: 'a', QuestionKey: 'q', Value: 'x' },
            { NodeId: 'b', QuestionKey: 'r', Value: 'y' },
        ]);
    });

    it.each([
        "decisions.a.q.value === 'x' + payload.suffix",
        "decisions.a.q.confidence === 'x'",
        "decisions.a.q.value.startsWith('x')",
        "decisions.a.q.value === payload.expected",
    ])('does not read %s as a comparison with a literal', (condition) => {
        expect(DecisionValueComparisonsIn(condition)).toEqual([]);
    });
});

describe('DecisionsReadAsProperty', () => {
    it('finds every property read of decisions, with the chain it hangs off', () => {
        expect(DecisionsReadAsProperty("payload.decisions.a && stepResult.result?.['decisions']")).toEqual([
            'payload.decisions',
            "stepResult.result?.['decisions']",
        ]);
    });

    it.each([
        "decisions.a.q.value === 'x'",
        "payload.note === 'see payload.decisions'",
        "['decisions'].includes(payload.kind)",
        'payload.decisionsMade > 0',
    ])('ignores %s', (condition) => {
        expect(DecisionsReadAsProperty(condition)).toEqual([]);
    });
});

describe('DecisionReferencesIn', () => {
    it('finds every reference, with its field', () => {
        const scan = DecisionReferencesIn("decisions.a.q.value === 'x' && decisions.b?.r?.probability > 0.5");
        expect(scan.References).toEqual([
            { NodeId: 'a', QuestionKey: 'q', Field: 'value' },
            { NodeId: 'b', QuestionKey: 'r', Field: 'probability' },
        ]);
        expect(scan.Malformed).toEqual([]);
    });

    it('ignores the word inside a string, and a payload key of the same name', () => {
        const scan = DecisionReferencesIn("payload.note === 'see decisions.a.q' && payload.decisions.a.q.value === 'x'");
        expect(scan.References).toEqual([]);
        expect(scan.Malformed).toEqual([]);
    });

    it('reports a use that names no step and question as malformed', () => {
        expect(DecisionReferencesIn('decisions.a').Malformed).toEqual(['decisions.a']);
        expect(DecisionReferencesIn('!!decisions').Malformed).toEqual(['decisions']);
    });
});

describe('DecisionChoiceTestOf', () => {
    it.each([
        ["decisions.t.q.value === 'a'", ['a']],
        ["decisions.t.q.value == 'a'", ['a']],
        ["'a' === decisions.t.q.value", ['a']],
        ["(decisions.t.q.value === 'a')", ['a']],
        ["decisions.t.q.value === 'a' || decisions.t.q.value === \"b\"", ['a', 'b']],
        ["(decisions.t.q.value === 'a') || ('b' == decisions.t.q.value)", ['a', 'b']],
        ["decisions['t']['q'].value === 'a'", ['a']],
    ])('reads %s as a Choice test', (condition, values) => {
        expect(DecisionChoiceTestOf(condition)).toEqual({ NodeId: 't', QuestionKey: 'q', Values: values });
    });

    it.each([
        "decisions.t.q.value !== 'a'",
        "decisions.t.q.value === 'a' && payload.x",
        "decisions.t.q.confidence === 'a'",
        "decisions.t.q.value === payload.expected",
        "decisions.t.q.value === 'a' || decisions.t.other.value === 'b'",
        "decisions.t.q.value === 'a' || payload.fallback === true",
        'payload.intent === \'a\'',
        '',
    ])('does not read %p as a Choice test', (condition) => {
        expect(DecisionChoiceTestOf(condition)).toBeNull();
    });
});

describe('exhaustive Choice forks', () => {
    const route = (...edges: Array<[string, string | undefined]>): TaskGraphSpec =>
        spec([triage(), ...edges.map(([tempId, condition]) => agentStep(tempId, [fork(condition)]))]);

    it('accepts a fork with a path for every option', () => {
        const s = route(
            ['billing', "decisions.triage.intent.value === 'billing'"],
            ['refund', "decisions.triage.intent.value === 'refund'"],
            ['other', "decisions.triage.intent.value === 'other'"],
        );
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('REJECTS a fork missing an option, naming the option', () => {
        const s = route(
            ['billing', "decisions.triage.intent.value === 'billing'"],
            ['refund', "decisions.triage.intent.value === 'refund'"],
        );
        const result = ValidateTaskGraphSpec(s);
        expect(result.Valid).toBe(false);
        const error = result.Errors.find((e) => e.Code === 'IncompleteFork');
        expect(error?.Message).toContain('no path for "other"');
        // Names the fork, the question and the step, so an author can find all three.
        expect(error?.Message).toContain('"route"');
        expect(error?.Message).toContain('"intent"');
        expect(error?.Message).toContain('"Triage the ticket"');
        expect(error?.TempId).toBe('triage');
    });

    it('names every missing option, in the question\'s own order', () => {
        const s = route(['refund', "decisions.triage.intent.value === 'refund'"]);
        expect(errorsOf(s).find((e) => e.Code === 'IncompleteFork')?.Message).toContain('no path for "billing", "other"');
    });

    it('is exactly one error per fork, however many options are missing', () => {
        const s = route(['refund', "decisions.triage.intent.value === 'refund'"]);
        expect(codesOf(s).filter((c) => c === 'IncompleteFork')).toHaveLength(1);
    });

    it('counts one edge testing several options as covering all of them', () => {
        const s = route(
            ['money', "decisions.triage.intent.value === 'billing' || decisions.triage.intent.value === 'refund'"],
            ['other', "'other' == decisions.triage.intent.value"],
        );
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('names a misspelled option alongside the one it failed to cover', () => {
        const s = route(
            ['billing', "decisions.triage.intent.value === 'biling'"],
            ['refund', "decisions.triage.intent.value === 'refund'"],
            ['other', "decisions.triage.intent.value === 'other'"],
        );
        const message = errorsOf(s).find((e) => e.Code === 'IncompleteFork')?.Message ?? '';
        expect(message).toContain('no path for "billing"');
        expect(message).toContain('also test "biling"');
    });

    it('leaves a fork with an unconditional default path alone — it covers everything by construction', () => {
        const s = route(
            ['billing', "decisions.triage.intent.value === 'billing'"],
            ['fallback', undefined],
        );
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('leaves a group with one edge testing something else alone — its coverage is not knowable', () => {
        const s = route(
            ['billing', "decisions.triage.intent.value === 'billing'"],
            ['vip', 'payload.vip === true'],
        );
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('leaves a group on a Likelihood alone — it has no options to cover', () => {
        const s = route(
            ['escalate', 'decisions.triage.urgent.probability >= 0.8'],
            ['queue', 'decisions.triage.urgent.probability < 0.8'],
        );
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('leaves a group testing two different questions alone', () => {
        const extra: TaskGraphNodeConfigMap['Decision'] = {
            questions: {
                ...TRIAGE.questions,
                channel: {
                    kind: 'Choice', instructions: 'Where did it arrive?',
                    options: [{ value: 'email', description: 'By email.' }, { value: 'phone', description: 'By phone.' }],
                },
            },
        };
        const s = spec([
            triage(extra),
            agentStep('billing', [fork("decisions.triage.intent.value === 'billing'")]),
            agentStep('email', [fork("decisions.triage.channel.value === 'email'")]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('leaves an ordinary group of payload conditions exactly as it was', () => {
        const s = spec([
            agentStep('fetch', []),
            agentStep('yes', [{ tempId: 'fetch', condition: 'payload.ok === true', exclusiveGroup: 'g' }]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('does not apply to edges outside an exclusive group — only a fork has to pick exactly one path', () => {
        const s = spec([
            triage(),
            agentStep('billing', [{ tempId: 'triage', condition: "decisions.triage.intent.value === 'billing'" }]),
        ]);
        expect(ValidateTaskGraphSpec(s).Errors).toEqual([]);
    });

    it('checks a fork on the Choice even when it leaves a later step, not the Decision itself', () => {
        const s = spec([
            triage(),
            agentStep('gather', ['triage']),
            agentStep('billing', [{ tempId: 'gather', condition: "decisions.triage.intent.value === 'billing'", exclusiveGroup: 'route' }]),
            agentStep('refund', [{ tempId: 'gather', condition: "decisions.triage.intent.value === 'refund'", exclusiveGroup: 'route' }]),
        ]);
        const error = errorsOf(s).find((e) => e.Code === 'IncompleteFork');
        expect(error?.Message).toContain('no path for "other"');
        expect(error?.TempId).toBe('gather');
    });
});

describe('ProjectTaskRowsToSpec — a Decision row', () => {
    it('comes back as a Decision node with its questions', () => {
        const projection = ProjectTaskRowsToSpec('Support triage', [{
            ID: 'task-1',
            Name: 'Triage the ticket',
            Status: 'Complete',
            StepType: 'Decision',
            Configuration: JSON.stringify({ decision: { ...TRIAGE, state: 'payload.ticket', nodeId: 'triage' } }),
        }], []);
        const node = projection.Spec.tasks[0];
        expect(node.kind).toBe('Decision');
        expect(node.configuration).toEqual({ promptName: undefined, state: 'payload.ticket', questions: TRIAGE.questions });
    });
});

describe('Save as Workflow — a Decision node', () => {
    it('becomes a Decision step keyed by its tempId, not a loss', () => {
        const result = ConvertTaskGraphToAgentSpec(
            spec([agentStep('first', []), TaskNode.Decision(base('triage', ['first'], 'Triage the ticket'), TRIAGE)]),
            { AgentID: 'agent-1', ResolveAgentID: () => 'agent-2', NextID: (() => { let n = 0; return () => `id-${++n}`; })() },
        );
        expect(result.Spec?.Steps).toHaveLength(2);
        expect(result.Losses).toEqual([]);
        const step = result.Spec?.Steps?.find((s) => s.StepType === 'Decision');
        expect(step?.Name).toBe('Triage the ticket');
        const stored = step?.Configuration;
        expect(typeof stored).toBe('string');
        expect(JSON.parse(typeof stored === 'string' ? stored : '{}')).toEqual({ key: 'triage', questions: TRIAGE.questions });
    });
});
