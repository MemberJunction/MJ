/**
 * A Flow agent's `Decision` step (plan Task 4.3, the Flow part): what it stores, how its conditions
 * name it, and that it compiles to — and saves back from — a task-graph Decision node without the
 * routing changing on the way.
 *
 * A flow names a Decision step by its `key` (`decisions.triage.intent`); a compiled graph names a
 * node by its tempId, which is the step's ID. Every test that crosses between the two is about one
 * thing: a condition must still name the step it named before, or a fork routes on nothing.
 */
import { describe, it, expect } from 'vitest';
import { DecisionChoiceTestOf, DecisionReferencesIn, RewriteDecisionReferences } from '../task-graph/decision-conditions';
import {
    ReadFlowDecisionStepConfiguration,
    IsDecisionPrompt,
    type FlowDecisionStepConfiguration,
} from '../task-graph/flow-decision-step';
import {
    CollectDecisionStepKeys,
    CompileFlowToTaskGraph,
    type FlowCompilerPath,
    type FlowCompilerStep,
} from '../task-graph/flow-graph-compiler';
import { ConvertTaskGraphToAgentSpec } from '../task-graph/task-graph-to-agent-spec';
import {
    ConfigOf,
    NormalizeDependency,
    TaskNode,
    type TaskGraphDependency,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '../task-graph/task-graph-spec';
import { ValidateTaskGraphSpec } from '../task-graph/task-graph-validator';
import type { AgentSpec, AgentStep } from '../agent-spec';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────

const TRIAGE: FlowDecisionStepConfiguration = {
    key: 'triage',
    state: 'payload.ticket',
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
    },
};

const TRIAGE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const DECISION_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-0000000000ff';

const options = {
    WorkflowName: 'Support triage',
    ResolveAgentName: (id: string) => `Agent ${id}`,
    ResolveActionName: (id: string) => `Action ${id}`,
    ResolvePromptName: (id: string) => (id === DECISION_PROMPT_ID ? 'Triage Decision' : null),
};

const decisionStep = (over: Partial<FlowCompilerStep> = {}): FlowCompilerStep => ({
    ID: TRIAGE_ID,
    Name: 'Triage the ticket',
    StepType: 'Decision',
    StartingStep: true,
    Status: 'Active',
    Configuration: JSON.stringify(TRIAGE),
    ...over,
});

const agentStep = (ID: string, Name = ID): FlowCompilerStep =>
    ({ ID, Name, StepType: 'Sub-Agent', StartingStep: false, Status: 'Active', SubAgentID: `sub-${ID}` });

const path = (ID: string, from: string, to: string, Condition?: string, Priority = 0): FlowCompilerPath =>
    ({ ID, OriginStepID: from, DestinationStepID: to, Condition, Priority });

/** Triage, then one path per intent option. */
const intentFork = (values: string[]): { steps: FlowCompilerStep[]; paths: FlowCompilerPath[] } => ({
    steps: [decisionStep(), ...values.map((v) => agentStep(v, `Handle ${v}`))],
    paths: values.map((v, i) => path(`p-${v}`, TRIAGE_ID, v, `decisions.triage.intent.value === '${v}'`, 10 - i)),
});

const depsOf = (spec: TaskGraphSpec, tempId: string): TaskGraphDependency[] =>
    (spec.tasks.find((t) => t.tempId === tempId)?.dependsOn ?? []).map(NormalizeDependency);

const readError = (json: string | null): string => {
    const read = ReadFlowDecisionStepConfiguration(json);
    return 'Error' in read ? read.Error : '';
};

// ── the stored configuration ────────────────────────────────────────────────────────────────────

describe('ReadFlowDecisionStepConfiguration', () => {
    it('reads a valid configuration', () => {
        expect(ReadFlowDecisionStepConfiguration(JSON.stringify(TRIAGE))).toEqual({ Config: TRIAGE });
    });

    it('leaves state out when the step does not set it — the whole payload is the default', () => {
        const withoutState: FlowDecisionStepConfiguration = { key: TRIAGE.key, questions: TRIAGE.questions };
        expect(ReadFlowDecisionStepConfiguration(JSON.stringify(withoutState))).toEqual({ Config: withoutState });
    });

    it('refuses a missing key, saying what one is for', () => {
        const keyless = { state: TRIAGE.state, questions: TRIAGE.questions };
        expect(readError(JSON.stringify(keyless))).toMatch(/it has no key; give it one that path conditions can name it by/);
    });

    it.each(['1triage', 'triage-step', 'tri age', 'tri.age'])('refuses the key %p, which a condition cannot name', (key) => {
        expect(readError(JSON.stringify({ ...TRIAGE, key }))).toMatch(/cannot be named in a path condition/);
    });

    it('refuses no questions, absent or empty', () => {
        expect(readError(JSON.stringify({ key: 'triage' }))).toBe('it asks no questions');
        expect(readError(JSON.stringify({ key: 'triage', questions: {} }))).toBe('it asks no questions');
    });

    it('holds each question to the checks a task-graph Decision node gets at submit', () => {
        const error = readError(JSON.stringify({
            key: 'triage',
            questions: {
                intent: { kind: 'Choice', instructions: 'Pick one', options: [{ value: 'only', description: 'The only one' }] },
                urgent: { kind: 'Likelihood', instructions: ' ' },
                size: { kind: 'Size', instructions: 'How big?' },
            },
        }));
        expect(error).toContain('Choice question "intent" needs at least two options');
        expect(error).toContain('question "urgent" has no instructions');
        expect(error).toContain('question "size" has kind "Size"; use Likelihood, Choice or Score');
    });

    it('refuses a state that is not the payload or a path into it', () => {
        expect(readError(JSON.stringify({ ...TRIAGE, state: 'ticket' }))).toBe('its state "ticket" is not "payload" or "payload.<path>"');
    });

    it('reports every problem at once', () => {
        const error = readError(JSON.stringify({ key: '9', questions: {} }));
        expect(error).toContain('its key "9" cannot be named in a path condition');
        expect(error).toContain('it asks no questions');
    });

    it.each([
        [null, /it has no configuration/],
        ['not json', /not valid JSON/],
        ['[1, 2]', /not a JSON object/],
    ])('refuses %p', (json, message) => {
        expect(readError(json)).toMatch(message);
    });
});

// ── naming a step in a condition ────────────────────────────────────────────────────────────────

describe('RewriteDecisionReferences', () => {
    const RENAMES: Record<string, string> = { triage: TRIAGE_ID, route: 'route_2' };
    const rename = (key: string): string | undefined => RENAMES[key];

    it('rewrites a dot reference, in brackets when the new name cannot follow a dot', () => {
        expect(RewriteDecisionReferences("decisions.triage.intent.value === 'billing'", rename).Expression)
            .toBe(`decisions['${TRIAGE_ID}'].intent.value === 'billing'`);
        expect(RewriteDecisionReferences('decisions.route.q.probability > 0.5', rename).Expression)
            .toBe('decisions.route_2.q.probability > 0.5');
    });

    it('keeps optional chaining', () => {
        expect(RewriteDecisionReferences('decisions?.triage?.urgent?.probability >= 0.8', rename).Expression)
            .toBe(`decisions?.['${TRIAGE_ID}']?.urgent?.probability >= 0.8`);
        expect(RewriteDecisionReferences("decisions?.['route'].q.value", rename).Expression).toBe("decisions?.['route_2'].q.value");
    });

    it('rewrites bracket references, keeping their quote', () => {
        expect(RewriteDecisionReferences("decisions['triage']['intent'].value", rename).Expression)
            .toBe(`decisions['${TRIAGE_ID}']['intent'].value`);
        expect(RewriteDecisionReferences('decisions["triage"].intent.value', rename).Expression)
            .toBe(`decisions["${TRIAGE_ID}"].intent.value`);
    });

    it('leaves string literals and a payload key of the same name untouched', () => {
        const condition = "payload.note === 'decisions.triage.intent' && payload.decisions.triage.intent === \"decisions.route.q\"";
        const rewrite = RewriteDecisionReferences(condition, rename);
        expect(rewrite.Expression).toBe(condition);
        expect(rewrite.Unknown).toEqual([]);
    });

    it('rewrites every reference in the condition, and nothing between them', () => {
        const rewrite = RewriteDecisionReferences("decisions.triage.intent.value === 'refund' && decisions.route.q.probability > 0.5", rename);
        expect(rewrite.Expression).toBe(`decisions['${TRIAGE_ID}'].intent.value === 'refund' && decisions.route_2.q.probability > 0.5`);
    });

    it('reports each key it cannot map once, and leaves its references as written', () => {
        const condition = "decisions.nobody.q.value === 'a' || decisions.nobody.q.value === 'b' || decisions.ghost.q.value";
        const rewrite = RewriteDecisionReferences(condition, rename);
        expect(rewrite.Unknown).toEqual(['nobody', 'ghost']);
        expect(rewrite.Expression).toBe(condition);
    });

    it('leaves a use that names no question alone, for the validator or the hold to report', () => {
        const rewrite = RewriteDecisionReferences('!!decisions.triage', rename);
        expect(rewrite.Expression).toBe('!!decisions.triage');
        expect(rewrite.Unknown).toEqual([]);
    });

    it('yields references the scanner reads back to the new name', () => {
        const rewritten = RewriteDecisionReferences("decisions.triage.intent.value === 'billing'", rename).Expression;
        expect(DecisionReferencesIn(rewritten).References).toEqual([{ NodeId: TRIAGE_ID, QuestionKey: 'intent', Field: 'value' }]);
    });
});

// ── dispatch: the compiler ──────────────────────────────────────────────────────────────────────

describe('compiling a Decision step', () => {
    it('becomes a Decision node carrying its state and questions, under its step ID', () => {
        const res = CompileFlowToTaskGraph([decisionStep()], [], options);
        expect(res.Success).toBe(true);
        const node = res.Spec!.tasks[0];
        expect(node.tempId).toBe(TRIAGE_ID);
        expect(node.kind).toBe('Decision');
        expect(node.configuration).toEqual({ state: 'payload.ticket', questions: TRIAGE.questions });
    });

    it('resolves the step\'s prompt by name, and emits none for a NULL PromptID so the node defaults', () => {
        const withPrompt = CompileFlowToTaskGraph([decisionStep({ PromptID: DECISION_PROMPT_ID })], [], options);
        expect(ConfigOf(withPrompt.Spec!.tasks[0], 'Decision')?.promptName).toBe('Triage Decision');

        const withoutPrompt = CompileFlowToTaskGraph([decisionStep({ PromptID: null })], [], options);
        expect(ConfigOf(withoutPrompt.Spec!.tasks[0], 'Decision')).not.toHaveProperty('promptName');
    });

    it('refuses a prompt that no longer exists', () => {
        const res = CompileFlowToTaskGraph([decisionStep({ PromptID: 'gone' })], [], options);
        expect(res.Success).toBe(false);
        expect(res.Errors[0]).toMatchObject({ Code: 'UnresolvedReference', StepID: TRIAGE_ID });
    });

    it('refuses a configuration it cannot read, naming the step and the problem', () => {
        const res = CompileFlowToTaskGraph([decisionStep({ Configuration: JSON.stringify({ key: 'triage', questions: {} }) })], [], options);
        expect(res.Success).toBe(false);
        expect(res.Errors[0]).toMatchObject({
            Code: 'InvalidDecisionStep',
            Message: 'Decision step "Triage the ticket" cannot run: it asks no questions.',
            StepID: TRIAGE_ID,
        });
    });

    it('refuses two Decision steps with one key — a condition could not say which it reads', () => {
        const second = decisionStep({ ID: 'second', Name: 'Triage again', StartingStep: false });
        const res = CompileFlowToTaskGraph([decisionStep(), second], [path('p', TRIAGE_ID, 'second')], options);
        expect(res.Success).toBe(false);
        expect(res.Errors).toEqual([expect.objectContaining({ Code: 'DuplicateDecisionKey', StepID: 'second' })]);
        expect(res.Errors[0].Message).toContain('"Triage the ticket" and "Triage again" both use the key "triage"');
    });

    it('rewrites every path condition to name the Decision node by its step ID', () => {
        const { steps, paths } = intentFork(['billing', 'refund', 'other']);
        const res = CompileFlowToTaskGraph(steps, paths, options);
        expect(res.Success).toBe(true);
        expect(depsOf(res.Spec!, 'billing')[0].condition).toBe(`decisions['${TRIAGE_ID}'].intent.value === 'billing'`);
        // …which is what the dispatcher keys answers by, so the engine's own validator accepts it.
        expect(ValidateTaskGraphSpec(res.Spec!).Errors).toEqual([]);
    });

    it('keeps every field of a path whose fields are getters, as an entity row\'s are', () => {
        // A spread of an entity copies none of its fields, so a rewritten path built that way lost
        // its ID, and two tied paths then failed to sort ("reading 'localeCompare'").
        class GetterPath {
            constructor(private readonly row: FlowCompilerPath) {}
            get ID(): string { return this.row.ID; }
            get OriginStepID(): string { return this.row.OriginStepID; }
            get DestinationStepID(): string { return this.row.DestinationStepID; }
            get Condition(): string | null | undefined { return this.row.Condition; }
            get Priority(): number { return this.row.Priority; }
            get PathPoints(): string | null | undefined { return this.row.PathPoints; }
        }
        const { steps, paths } = intentFork(['billing', 'refund']);
        const tied: FlowCompilerPath[] = paths.map((p) => new GetterPath({ ...p, Priority: 0 }));

        const res = CompileFlowToTaskGraph(steps, tied, options);

        expect(res.Success).toBe(true);
        expect(depsOf(res.Spec!, 'billing')[0].condition).toBe(`decisions['${TRIAGE_ID}'].intent.value === 'billing'`);
        expect(depsOf(res.Spec!, 'refund')[0].condition).toBe(`decisions['${TRIAGE_ID}'].intent.value === 'refund'`);
    });

    it('rewrites a later step\'s path that reads an earlier Decision step', () => {
        const steps = [decisionStep(), agentStep('gather', 'Gather'), agentStep('escalate', 'Escalate')];
        const paths = [path('p1', TRIAGE_ID, 'gather'), path('p2', 'gather', 'escalate', 'decisions.triage.urgent.probability >= 0.8')];
        const res = CompileFlowToTaskGraph(steps, paths, options);
        expect(depsOf(res.Spec!, 'escalate')[0].condition).toBe(`decisions['${TRIAGE_ID}'].urgent.probability >= 0.8`);
        expect(ValidateTaskGraphSpec(res.Spec!).Valid).toBe(true);
    });

    it('refuses a key no Decision step has, naming the path\'s origin step and the key', () => {
        const steps = [decisionStep(), agentStep('next', 'Next')];
        const res = CompileFlowToTaskGraph(steps, [path('p', TRIAGE_ID, 'next', "decisions.triag.intent.value === 'billing'")], options);
        expect(res.Success).toBe(false);
        expect(res.Errors[0]).toMatchObject({ Code: 'UnknownDecisionKey', StepID: TRIAGE_ID });
        expect(res.Errors[0].Message).toContain('A path from step "Triage the ticket" reads decisions.triag');
        expect(res.Errors[0].Message).toContain('(keys: "triage")');
    });

    it('compiles an incomplete Choice fork, which the validator then refuses on submit', () => {
        const { steps, paths } = intentFork(['billing', 'refund']);
        const res = CompileFlowToTaskGraph(steps, paths, options);
        expect(res.Success).toBe(true);

        const errors = ValidateTaskGraphSpec(res.Spec!).Errors;
        expect(errors).toHaveLength(1);
        expect(errors[0].Code).toBe('IncompleteFork');
        expect(errors[0].Message).toContain('no path for "other"');
    });
});

describe('CollectDecisionStepKeys', () => {
    it('maps each key to its step, skipping steps it cannot read and steps that are not decisions', () => {
        const keys = CollectDecisionStepKeys([
            decisionStep(),
            decisionStep({ ID: 'broken', Configuration: '{' }),
            agentStep('agent'),
        ]);
        expect([...keys.StepIDByKey]).toEqual([['triage', TRIAGE_ID]]);
        expect(keys.Errors).toEqual([]);
    });
});

// ── save a graph as a workflow ──────────────────────────────────────────────────────────────────

const node = (tempId: string, dependsOn: Array<string | TaskGraphDependency> = [], name = tempId): TaskGraphSpecNode =>
    TaskNode.Agent({ tempId, name, description: '', dependsOn }, { agentName: `Agent ${tempId}` });

const saveOptions = () => {
    let n = 0;
    return {
        AgentID: 'agent-1',
        ResolveAgentID: (name: string) => `id-${name}`,
        ResolvePromptID: (name: string) => (name === 'Triage Decision' ? DECISION_PROMPT_ID : null),
        NextID: () => `step-${++n}`,
    };
};

/** A graph whose Decision node's tempId is not a valid key, forking on its Choice. */
const graphWith = (tempId: string, promptName?: string): TaskGraphSpec => {
    const config = { state: TRIAGE.state, questions: TRIAGE.questions };
    const fork = (value: string, priority: number): TaskGraphSpecNode =>
        node(value, [{ tempId, condition: `decisions['${tempId}'].intent.value === '${value}'`, priority }], `Handle ${value}`);
    return {
        workflowName: 'Support triage',
        tasks: [
            TaskNode.Decision({ tempId, name: 'Triage the ticket', description: '', dependsOn: [] }, { ...config, ...(promptName ? { promptName } : {}) }),
            fork('billing', 3), fork('refund', 2), fork('other', 1),
        ],
    };
};

/** The stored configuration of a saved Decision step. */
const decisionConfigOf = (step: AgentStep | undefined): FlowDecisionStepConfiguration => {
    const read = ReadFlowDecisionStepConfiguration(step?.Configuration);
    if ('Error' in read) throw new Error(read.Error);
    return read.Config;
};

/** The stored configuration of a saved workflow's first Decision step. */
const configOf = (spec: AgentSpec | undefined): FlowDecisionStepConfiguration =>
    decisionConfigOf(spec?.Steps?.find((s) => s.StepType === 'Decision'));

describe('Save as Workflow — a Decision node becomes a Decision step', () => {
    it('keeps a tempId that is already a valid key, with its state, questions and prompt', () => {
        const result = ConvertTaskGraphToAgentSpec(graphWith('triage', 'Triage Decision'), saveOptions());
        const step = result.Spec?.Steps?.find((s) => s.StepType === 'Decision');
        expect(result.Losses).toEqual([]);
        expect(step).toMatchObject({ Name: 'Triage the ticket', StepType: 'Decision', PromptID: DECISION_PROMPT_ID, StartingStep: true });
        expect(configOf(result.Spec)).toEqual(TRIAGE);
        expect(result.Spec?.Paths?.map((p) => p.Condition)).toContain("decisions['triage'].intent.value === 'billing'");
    });

    it('saves no PromptID when the node names no prompt, so the step runs on Default Decision', () => {
        const result = ConvertTaskGraphToAgentSpec(graphWith('triage'), saveOptions());
        expect(result.Spec?.Steps?.find((s) => s.StepType === 'Decision')?.PromptID).toBeUndefined();
        expect(result.Losses).toEqual([]);
    });

    it('reports a prompt it cannot resolve, rather than quietly running on Default Decision', () => {
        const result = ConvertTaskGraphToAgentSpec(graphWith('triage', 'Gone Decision'), saveOptions());
        expect(result.Losses).toEqual([expect.objectContaining({ Kind: 'UnknownPrompt', TempId: 'triage' })]);
    });

    it('derives a valid key from a tempId that is not one, and rewrites every condition that names it', () => {
        const result = ConvertTaskGraphToAgentSpec(graphWith('triage-step'), saveOptions());
        expect(configOf(result.Spec).key).toBe('triage_step');
        expect(result.Spec?.Paths?.map((p) => p.Condition).sort()).toEqual([
            "decisions['triage_step'].intent.value === 'billing'",
            "decisions['triage_step'].intent.value === 'other'",
            "decisions['triage_step'].intent.value === 'refund'",
        ]);
    });

    it('derives a key no other Decision step has', () => {
        const graph: TaskGraphSpec = {
            workflowName: 'Two decisions',
            tasks: [
                TaskNode.Decision({ tempId: 'triage_1', name: 'First', description: '', dependsOn: [] }, { questions: TRIAGE.questions }),
                TaskNode.Decision({ tempId: 'triage-1', name: 'Second', description: '', dependsOn: ['triage_1'] }, { questions: TRIAGE.questions }),
                node('after', [{ tempId: 'triage-1', condition: "decisions['triage-1'].urgent.probability > 0.5 && decisions.triage_1.urgent.probability > 0.5" }]),
            ],
        };
        const result = ConvertTaskGraphToAgentSpec(graph, saveOptions());
        const keys = (result.Spec?.Steps ?? []).filter((s) => s.StepType === 'Decision').map((s) => decisionConfigOf(s).key);
        expect(keys).toEqual(['triage_1', 'triage_1_2']);
        expect(result.Spec?.Paths?.find((p) => p.Condition?.includes('urgent'))?.Condition)
            .toBe("decisions['triage_1_2'].urgent.probability > 0.5 && decisions.triage_1.urgent.probability > 0.5");
    });

    it('round-trips graph → workflow → compiled graph with the same routing', () => {
        const original = graphWith('triage-step');
        const saved = ConvertTaskGraphToAgentSpec(original, saveOptions()).Spec!;
        const steps: FlowCompilerStep[] = (saved.Steps ?? []).map((s) => ({
            ID: s.ID, Name: s.Name, StepType: s.StepType, StartingStep: s.StartingStep, Status: 'Active',
            SubAgentID: s.SubAgentID, PromptID: s.PromptID, Configuration: s.Configuration,
        }));
        const paths: FlowCompilerPath[] = (saved.Paths ?? []).map((p) => ({
            ID: p.ID, OriginStepID: p.OriginStepID, DestinationStepID: p.DestinationStepID, Condition: p.Condition, Priority: p.Priority,
        }));
        const compiled = CompileFlowToTaskGraph(steps, paths, options);
        expect(compiled.Success).toBe(true);
        expect(ValidateTaskGraphSpec(compiled.Spec!).Errors).toEqual([]);

        // Routing by NAME, because every id changed on the way: which step each path leaves, which
        // decision and question it tests, which option it takes, and how it ranks.
        const routing = (spec: TaskGraphSpec) => {
            const nameOf = (tempId: string) => spec.tasks.find((t) => t.tempId === tempId)?.name;
            return spec.tasks.flatMap((t) => t.dependsOn.map(NormalizeDependency).map((d) => {
                const test = DecisionChoiceTestOf(d.condition ?? '');
                return { to: t.name, from: nameOf(d.tempId), decision: test && nameOf(test.NodeId), question: test?.QuestionKey, values: test?.Values, priority: d.priority };
            })).sort((a, b) => String(a.to).localeCompare(String(b.to)));
        };
        expect(routing(compiled.Spec!)).toEqual(routing(original));
        expect(ConfigOf(compiled.Spec!.tasks.find((t) => t.kind === 'Decision')!, 'Decision')?.questions).toEqual(TRIAGE.questions);
    });
});

describe('IsDecisionPrompt', () => {
    const decisionTypeId = '11111111-2222-3333-4444-555555555555';

    it('returns false for null or undefined', () => {
        expect(IsDecisionPrompt(null)).toBe(false);
        expect(IsDecisionPrompt(undefined)).toBe(false);
    });

    it('matches when both decisionModelTypeID and prompt.AIModelTypeID are set and match', () => {
        expect(IsDecisionPrompt({ AIModelTypeID: decisionTypeId, AIModelType: null }, decisionTypeId)).toBe(true);
        expect(IsDecisionPrompt({ AIModelTypeID: decisionTypeId, AIModelType: 'Decision' }, decisionTypeId)).toBe(true);
    });

    it('returns false on ID mismatch even when the name says Decision', () => {
        const otherId = '99999999-9999-9999-9999-999999999999';
        expect(IsDecisionPrompt({ AIModelTypeID: otherId, AIModelType: 'Decision' }, decisionTypeId)).toBe(false);
        expect(IsDecisionPrompt({ AIModelTypeID: otherId, AIModelType: 'decision' }, decisionTypeId)).toBe(false);
    });

    it('falls back to AIModelType when either ID is absent', () => {
        // No decisionModelTypeID passed
        expect(IsDecisionPrompt({ AIModelType: 'Decision', AIModelTypeID: null })).toBe(true);
        expect(IsDecisionPrompt({ AIModelType: 'decision', AIModelTypeID: null })).toBe(true);
        expect(IsDecisionPrompt({ AIModelType: '  DECISION  ', AIModelTypeID: null })).toBe(true);
        expect(IsDecisionPrompt({ AIModelType: 'Chat', AIModelTypeID: null })).toBe(false);

        // decisionModelTypeID passed, but prompt has no AIModelTypeID
        expect(IsDecisionPrompt({ AIModelType: 'Decision', AIModelTypeID: null }, decisionTypeId)).toBe(true);
        expect(IsDecisionPrompt({ AIModelType: 'Chat', AIModelTypeID: null }, decisionTypeId)).toBe(false);
        expect(IsDecisionPrompt({ AIModelType: 'Decision', AIModelTypeID: undefined }, decisionTypeId)).toBe(true);
    });
});
