/**
 * @fileoverview Pure validation of a submitted task graph.
 *
 * Kept free of database access on purpose so it runs identically in three places: inside the agent
 * loop (where a failure becomes a retry corrective rather than an exception), inside
 * `TaskGraphService.Submit` as the server-side source of truth, and in unit tests without a
 * database. Agent-name resolution is the one check that genuinely needs the database, so it lives
 * in the service rather than here.
 *
 * Every check returns ALL failures rather than throwing on the first — a producer fixing a
 * malformed graph should see every problem at once, not discover them one round-trip at a time.
 *
 * @module @memberjunction/ai-core-plus
 */
import { SafeExpressionEvaluator } from '@memberjunction/global';
import { CONDITION_ROOTS, UnknownConditionRoots } from './condition-roots';
import { DecisionChoiceTestOf, DecisionReferencesIn, type DecisionReference } from './decision-conditions';
import { DetectCycle, type TaskGraphEdge, type TaskGraphNode } from './graph-algorithms';
import {
    ConfigOf,
    DECISION_ANSWER_FIELDS,
    MAX_TASKS_PER_GRAPH,
    TaskGraphSpec,
    TaskGraphSpecNode,
    TaskGraphValidationError,
    TaskGraphValidationResult,
    NormalizeDependency,
    type TaskGraphDecisionQuestion,
    type TaskGraphNodeConfigMap,
    type TaskGraphNodeKind,
} from './task-graph-spec';

/**
 * One evaluator for the whole module — it caches compiled expressions, and validation is the one
 * caller that sees the same conditions repeatedly (every save of the same workflow).
 */
const CONDITION_SYNTAX = new SafeExpressionEvaluator();

/** Kinds this build knows how to configure. Derived from the map so the two can never drift. */
const KNOWN_KINDS: readonly TaskGraphNodeKind[] = [
    'Agent', 'Action', 'Human', 'Prompt', 'ForEach', 'While', 'External', 'Decision',
];

/** A graph's Decision steps by `tempId`, with their configuration already narrowed. */
type DecisionSteps = ReadonlyMap<string, { Name: string; Config: TaskGraphNodeConfigMap['Decision'] }>;

/** Where a condition sits, for messages that name it the way its author would. */
type ConditionSite = {
    Label: string;
    Where: string;
    TempId: string;
    /** A While loop's condition, which is evaluated per iteration and has no `decisions` root. */
    IsLoopCondition: boolean;
};

/**
 * Refuses an edge condition that cannot parse, at the door.
 *
 * **Syntax only.** An unknown identifier PASSES: the condition envelope is genuinely dynamic
 * (`payload`, `stepResult`, `flowContext`, `data`, `context`), and refusing on identifiers would
 * encode a scope contract here that the runtime may widen later. `payload.x.y` and
 * `payload.title.includes('x')` pass for the same reason — whether they resolve is a question about
 * a run that has not happened yet. `payload.x >` and `foo(` do not pass, because no run makes those
 * mean anything.
 *
 * **Why refuse at all, now that an unevaluable condition HOLDS rather than opening the gate.**
 * P2 made the failure safe; this makes it legible. A typo used to execute the step it was guarding;
 * it now stalls the branch instead — better, but the author still finds out by reading server logs
 * for a graph that silently stopped. Refusing at authoring time, naming the step and quoting the
 * condition, turns that into a sentence.
 *
 * **This can newly refuse a workflow that saved yesterday.** A step whose condition never parsed has
 * been failing at runtime all along; the change is only that the failure now arrives at save time,
 * which is why the message has to carry enough to explain itself to someone who was editing an
 * unrelated step in an old flow.
 */
function checkConditionSyntax(
    task: TaskGraphSpecNode,
    nameByTempId: ReadonlyMap<string, string>,
    decisionSteps: DecisionSteps,
    errors: TaskGraphValidationError[],
): void {
    // C7: name steps the way their author does. On the compiled-flow path `tempId` is a UUID, and a
    // message reading `Task "9f1c2d33-…" has a condition on its dependency "4a7b0e91-…"` is illegible
    // in exactly the place it has to explain itself — to somebody editing an unrelated step in an
    // old flow who has just been told their save failed.
    const label = task.name?.trim() || task.tempId;
    const nameOf = (tempId: string): string => nameByTempId.get(tempId) || tempId;
    const report = (where: string, condition: string, isLoopCondition = false): void => {
        const verdict = CONDITION_SYNTAX.validateSyntax(condition);
        // Undecidable means this host cannot compile at all (a strict CSP) — not that the condition
        // is wrong. Refusing then would reject every condition in the browser while the same spec
        // validated fine on the server.
        if (!verdict.Valid && !verdict.Undecidable) {
            errors.push({
                Code: 'InvalidCondition',
                Message: `Task "${label}" has ${where} that cannot be parsed: ${verdict.Error}. `
                    + `The condition was: ${condition}`,
                TempId: task.tempId,
            });
            return;
        }

        // UNKNOWN ROOTS ARE DECIDABLE NOW, and leaving them to run time earns a permanent stall.
        // Data absence reads as a false verdict since R2-3, so an unknown root is the one remaining
        // way a condition holds a branch forever — on a terminal origin whose output can never
        // change, the identical evaluation repeats until somebody reads a server log. The envelope
        // is a closed set defined in code; this is the same knowledge, applied one step earlier.
        const unknown = UnknownConditionRoots(condition);
        if (unknown.length > 0) {
            errors.push({
                Code: 'InvalidCondition',
                Message: `Task "${label}" has ${where} referring to ${unknown.map((u) => `"${u}"`).join(' and ')}, `
                    + `which a condition cannot see. Available: ${[...CONDITION_ROOTS].sort().join(', ')}. `
                    + `The condition was: ${condition}`,
                TempId: task.tempId,
            });
        }

        // A DECISION REFERENCE IS DECIDABLE NOW TOO. The graph's Decision steps and their questions
        // are all in the spec, so `decisions.triage.intnet.value` is a typo we can name at the door
        // rather than an answer that never arrives and holds the branch forever.
        checkDecisionReferences(condition, { Label: label, Where: where, TempId: task.tempId, IsLoopCondition: isLoopCondition }, decisionSteps, errors);
    };

    for (const raw of task.dependsOn ?? []) {
        const dep = NormalizeDependency(raw);
        if (dep.condition?.trim()) report(`a condition on its dependency "${nameOf(dep.tempId)}"`, dep.condition);
    }

    // A While step's loop condition is the same grammar evaluated by the same evaluator, and a typo
    // there fails the task on iteration one — louder than a held edge, but still only after the run
    // has started and only for whoever reads the error.
    if (task.kind === 'While') {
        const loopCondition = (task.configuration as { condition?: unknown } | undefined)?.condition;
        if (typeof loopCondition === 'string' && loopCondition.trim()) {
            report('a loop condition', loopCondition, true);
        }
    }
}

/**
 * Refuses a condition that reads a decision the graph does not make.
 *
 * Four ways to be wrong, all answerable from the spec alone: a use of `decisions` that names no step
 * and question; a step that is not a Decision step in this graph; a question that step does not
 * ask; and an answer field that question's kind does not have — which would read `undefined` and
 * turn every comparison into a silent `false`.
 *
 * A loop condition may not read `decisions` at all. It is evaluated between iterations against the
 * loop's own payload, where there is no `decisions` root, and none of the hold rules apply there.
 */
function checkDecisionReferences(
    condition: string,
    site: ConditionSite,
    decisionSteps: DecisionSteps,
    errors: TaskGraphValidationError[],
): void {
    const scan = DecisionReferencesIn(condition);
    const refuse = (problem: string): void => {
        errors.push({
            Code: 'InvalidCondition',
            Message: `Task "${site.Label}" has ${site.Where} that ${problem}. The condition was: ${condition}`,
            TempId: site.TempId,
        });
    };

    if (site.IsLoopCondition) {
        if (scan.References.length > 0 || scan.Malformed.length > 0) {
            refuse('reads "decisions". Only an edge condition can read a Decision step\'s answers; route on the decision with a conditional dependency instead');
        }
        return;
    }
    for (const malformed of scan.Malformed) {
        refuse(`reads "decisions" without naming a Decision step and one of its questions (${malformed}). `
            + 'Write it as decisions.<step>.<question>, for example decisions.triage.intent.value');
    }
    for (const reference of scan.References) {
        const problem = decisionReferenceProblem(reference, decisionSteps);
        if (problem) refuse(problem);
    }
}

/** What is wrong with one `decisions.<step>.<question>[.<field>]` reference, or `null`. */
function decisionReferenceProblem(reference: DecisionReference, decisionSteps: DecisionSteps): string | null {
    const step = decisionSteps.get(reference.NodeId);
    if (!step) {
        const known = [...decisionSteps.keys()].map((id) => `"${id}"`).join(', ') || 'none';
        return `reads the decision "${reference.NodeId}", but no Decision step has that tempId (Decision steps in this graph: ${known})`;
    }
    const questions = step.Config.questions ?? {};
    const question = Object.prototype.hasOwnProperty.call(questions, reference.QuestionKey)
        ? questions[reference.QuestionKey]
        : undefined;
    if (!question) {
        const asked = Object.keys(questions).map((k) => `"${k}"`).join(', ') || 'nothing';
        return `reads the question "${reference.QuestionKey}" of Decision step "${step.Name}", which asks only ${asked}`;
    }
    const fields = DECISION_ANSWER_FIELDS[question.kind];
    if (reference.Field && fields && !fields.includes(reference.Field)) {
        return `reads "${reference.Field}" from the ${question.kind} question "${reference.QuestionKey}" of Decision step "${step.Name}", `
            + `whose answer has only ${fields.map((f) => `"${f}"`).join(', ')}`;
    }
    return null;
}

/**
 * Which `configuration` fields each kind requires.
 *
 * `Human` requires nothing — an unassigned person step is a legitimate "somebody needs to look at
 * this", and `assignToUserID` stays optional until self-assignment lands (#3524).
 */
const REQUIRED_CONFIG_FIELDS: Record<TaskGraphNodeKind, readonly string[]> = {
    Agent: ['agentName'],
    Action: ['actionName'],
    Human: [],
    Prompt: ['promptName'],
    // `itemVariable` is NOT required (C6): the type marks it optional and `TaskLoopExecutor` defaults
    // it to `item`, so requiring it here refused compiled legacy flows at Submit for a setting the
    // runtime was always going to supply. `collectionPath` stays — nothing can default a collection.
    ForEach: ['collectionPath'],
    // A While loop has NO items — it repeats until a condition stops holding — so `itemVariable`
    // is a ForEach concept and requiring it here rejected every valid While graph with a message
    // about a setting that does not apply to it.
    While: ['condition'],
    External: ['domain'],
    // `promptName` and `state` both have defaults (`Default Decision`, the whole payload); nothing
    // can default the questions.
    Decision: ['questions'],
};

/** `payload`, or `payload.<path>` — the only states a Decision step can resolve at run time. */
const PAYLOAD_PATH = /^payload(?:\.[^.\s]+)*$/;

/**
 * Reports a Decision step whose configuration could not run, or could not be checked.
 *
 * Checked here rather than left to the decision driver because the rest of the graph depends on it
 * at submit: an exhaustive fork is only as sound as the options it is checked against, and a
 * question the driver will refuse fails the step after the graph has started.
 */
function checkDecisionConfiguration(task: TaskGraphSpecNode, errors: TaskGraphValidationError[]): void {
    const config = ConfigOf(task, 'Decision');
    if (!config) return;

    const problems: string[] = [];
    if (config.promptName !== undefined && !(typeof config.promptName === 'string' && config.promptName.trim())) {
        problems.push('its promptName is empty; omit it to use the Default Decision prompt');
    }
    if (config.state !== undefined && !(typeof config.state === 'string' && PAYLOAD_PATH.test(config.state.trim()))) {
        problems.push(`its state "${String(config.state)}" is not "payload" or "payload.<path>"`);
    }
    // Absent questions are already reported as missing configuration; only a present-but-empty or
    // malformed set is reported here.
    const questions: unknown = config.questions;
    if (questions !== undefined && questions !== null) {
        if (typeof questions !== 'object' || Array.isArray(questions) || Object.keys(questions).length === 0) {
            problems.push('it asks no questions');
        } else {
            for (const [key, question] of Object.entries(config.questions)) problems.push(...questionProblems(key, question));
        }
    }

    if (problems.length > 0) {
        errors.push({
            Code: 'InvalidConfiguration',
            Message: `Decision step "${task.name?.trim() || task.tempId}" cannot run: ${problems.join('; ')}.`,
            TempId: task.tempId,
        });
    }
}

/** What is wrong with one question, as phrases naming it. Empty when it is well formed. */
function questionProblems(key: string, question: TaskGraphDecisionQuestion): string[] {
    const problems: string[] = [];
    // Read through `unknown`: a spec arrives as JSON from a model or a canvas, and nothing but this
    // check stands between a malformed question and the decision driver.
    const value: unknown = question;
    if (!value || typeof value !== 'object') return [`question "${key}" is not an object`];
    const raw = value as Record<string, unknown>;
    if (typeof raw.instructions !== 'string' || !raw.instructions.trim()) {
        problems.push(`question "${key}" has no instructions`);
    }
    if (raw.kind === 'Choice') problems.push(...choiceOptionProblems(key, raw.options));
    else if (raw.kind === 'Score') problems.push(...scoreLevelProblems(key, raw.levels));
    else if (raw.kind !== 'Likelihood') {
        problems.push(`question "${key}" has kind "${String(raw.kind)}"; use Likelihood, Choice or Score`);
    }
    const min = raw.minConfidence;
    if (min !== undefined && !(typeof min === 'number' && min >= 0 && min <= 1)) {
        problems.push(`question "${key}" has minConfidence ${String(min)}; use a number from 0 to 1`);
    }
    return problems;
}

/** A Choice needs two or more options, each with a distinct value and a description. */
function choiceOptionProblems(key: string, options: unknown): string[] {
    if (!Array.isArray(options) || options.length < 2) return [`Choice question "${key}" needs at least two options`];
    const problems: string[] = [];
    const seen = new Set<string>();
    options.forEach((option: unknown, index) => {
        const record = option && typeof option === 'object' ? option as Record<string, unknown> : {};
        const value = record.value;
        if (typeof value !== 'string' || !value.trim()) {
            problems.push(`option ${index + 1} of Choice question "${key}" has no value`);
        } else if (seen.has(value)) {
            problems.push(`Choice question "${key}" has the option value "${value}" twice`);
        } else {
            seen.add(value);
        }
        if (typeof record.description !== 'string' || !record.description.trim()) {
            problems.push(`option ${index + 1} of Choice question "${key}" has no description`);
        }
    });
    return problems;
}

/** A Score needs two or more levels, each a description. */
function scoreLevelProblems(key: string, levels: unknown): string[] {
    if (!Array.isArray(levels) || levels.length < 2) return [`Score question "${key}" needs at least two levels`];
    return levels.some((level: unknown) => typeof level !== 'string' || !level.trim())
        ? [`Score question "${key}" has an empty level`]
        : [];
}

/**
 * A fork on a Choice must have a path for every option.
 *
 * **The one correctness property here that ordinary conditions cannot have.** A condition is
 * untyped truthiness over whatever lands in the payload, so an `exclusiveGroup` has no notion of
 * coverage: when no edge is satisfied every edge loses and the fork silently ends the branch. A
 * Choice enumerates its options when the graph is written, so when every edge of a group tests one
 * Choice question's `value`, which options have no path is known before anything runs.
 *
 * Applies only to that shape. A group with an unconditional (default) edge, an edge testing anything
 * else, or edges testing different questions is left alone — it either covers everything by
 * construction or cannot be checked.
 */
function checkExhaustiveForks(
    tasks: readonly TaskGraphSpecNode[],
    decisionSteps: DecisionSteps,
    errors: TaskGraphValidationError[],
): void {
    for (const [group, edges] of exclusiveEdgesByGroup(tasks)) {
        const fork = choiceForkOf(edges, decisionSteps);
        if (!fork) continue;
        const missing = fork.Options.filter((option) => !fork.Covered.has(option));
        if (missing.length === 0) continue;

        const unknown = [...fork.Covered].filter((value) => !fork.Options.includes(value));
        const quoted = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(', ');
        errors.push({
            Code: 'IncompleteFork',
            Message: `Exclusive group "${group}" routes on the Choice question "${fork.QuestionKey}" of Decision step `
                + `"${fork.StepName}" but has no path for ${quoted(missing)}. A choice always picks one of its options, `
                + 'so whenever the model picks a missing one every path loses and the branch ends silently. '
                + 'Add a path for each missing option, or an unconditional path in the group as the default.'
                + (unknown.length > 0 ? ` Its paths also test ${quoted(unknown)}, which the question does not offer (its options: ${quoted(fork.Options)}).` : ''),
            TempId: edges[0].Origin,
        });
    }
}

/** Every exclusive edge's origin and condition, grouped by `exclusiveGroup`. */
function exclusiveEdgesByGroup(
    tasks: readonly TaskGraphSpecNode[],
): Map<string, Array<{ Origin: string; Condition: string | undefined }>> {
    const groups = new Map<string, Array<{ Origin: string; Condition: string | undefined }>>();
    for (const task of tasks) {
        for (const raw of task.dependsOn ?? []) {
            const dep = NormalizeDependency(raw);
            if (!dep.exclusiveGroup) continue;
            const edges = groups.get(dep.exclusiveGroup) ?? [];
            edges.push({ Origin: dep.tempId, Condition: dep.condition });
            groups.set(dep.exclusiveGroup, edges);
        }
    }
    return groups;
}

/**
 * The Choice a group forks on and the options its edges cover, or `null` when the group is not a
 * fork on exactly one Choice question.
 */
function choiceForkOf(
    edges: ReadonlyArray<{ Condition: string | undefined }>,
    decisionSteps: DecisionSteps,
): { StepName: string; QuestionKey: string; Options: string[]; Covered: Set<string> } | null {
    const tests = edges.map((e) => (e.Condition?.trim() ? DecisionChoiceTestOf(e.Condition) : null));
    const first = tests[0];
    if (!first || tests.some((t) => !t || t.NodeId !== first.NodeId || t.QuestionKey !== first.QuestionKey)) return null;

    const step = decisionSteps.get(first.NodeId);
    const questions = step?.Config.questions ?? {};
    const question = Object.prototype.hasOwnProperty.call(questions, first.QuestionKey) ? questions[first.QuestionKey] : undefined;
    if (!step || question?.kind !== 'Choice' || !Array.isArray(question.options)) return null;

    return {
        StepName: step.Name,
        QuestionKey: first.QuestionKey,
        Options: question.options.map((o) => o.value),
        Covered: new Set(tests.flatMap((t) => t?.Values ?? [])),
    };
}

/** The graph's Decision steps by `tempId`. */
function collectDecisionSteps(tasks: readonly TaskGraphSpecNode[]): DecisionSteps {
    const steps = new Map<string, { Name: string; Config: TaskGraphNodeConfigMap['Decision'] }>();
    for (const task of tasks) {
        const config = ConfigOf(task, 'Decision');
        if (config && task.tempId) steps.set(task.tempId, { Name: task.name?.trim() || task.tempId, Config: config });
    }
    return steps;
}

/** Reports a node whose `configuration` is missing something its `kind` needs. */
function checkConfiguration(task: TaskGraphSpecNode, errors: TaskGraphValidationError[]): void {
    if (!task.kind) return;   // absence is reported as NoAssignment, not as a configuration fault

    if (!KNOWN_KINDS.includes(task.kind)) {
        errors.push({
            Code: 'UnknownKind',
            Message: `Task "${task.tempId}" has kind "${task.kind}", which this version does not know how to run.`,
            TempId: task.tempId,
        });
        return;
    }

    const config = (task.configuration ?? {}) as Record<string, unknown>;
    const missing = REQUIRED_CONFIG_FIELDS[task.kind].filter((f) => {
        const v = config[f];
        return v === undefined || v === null || (typeof v === 'string' && v.trim().length === 0);
    });
    if (missing.length > 0) {
        errors.push({
            Code: 'InvalidConfiguration',
            Message: `Task "${task.tempId}" is a ${task.kind} step but its configuration is missing ${missing.join(' and ')}.`,
            TempId: task.tempId,
        });
    }
}

/**
 * Exclusive groups must be sibling edges — every member has to leave the SAME origin.
 *
 * A group spanning two origins is not an exclusive choice at all: the two origins complete
 * independently, so "pick one winner" has no single moment at which to be decided, and the loser
 * subtree would be Skipped on the say-so of a branch that never ran.
 */
function checkExclusiveGroups(tasks: readonly TaskGraphSpecNode[], errors: TaskGraphValidationError[]): void {
    // group key -> the set of origin tempIds its member edges leave from
    const originsByGroup = new Map<string, Set<string>>();
    for (const task of tasks) {
        for (const raw of task.dependsOn ?? []) {
            const dep = NormalizeDependency(raw);
            if (!dep.exclusiveGroup) continue;
            let origins = originsByGroup.get(dep.exclusiveGroup);
            if (!origins) { origins = new Set<string>(); originsByGroup.set(dep.exclusiveGroup, origins); }
            origins.add(dep.tempId);
        }
    }
    for (const [group, origins] of originsByGroup) {
        if (origins.size > 1) {
            errors.push({
                Code: 'InvalidExclusiveGroup',
                Message: `Exclusive group "${group}" contains edges from ${origins.size} different origins (${[...origins].join(', ')}). An exclusive choice is decided at one origin; edges from different origins cannot be alternatives to each other.`,
            });
        }
    }
}

/**
 * Validates a spec's structure.
 *
 * Does NOT verify that agent names resolve — that requires metadata and is done by the service,
 * which reports unresolvable agents as a hard error rather than silently dropping those nodes.
 */
export function ValidateTaskGraphSpec(spec: TaskGraphSpec): TaskGraphValidationResult {
    const errors: TaskGraphValidationError[] = [];

    if (!spec.workflowName || spec.workflowName.trim().length === 0) {
        errors.push({ Code: 'MissingWorkflowName', Message: 'workflowName is required.' });
    }

    const tasks = spec.tasks ?? [];
    if (tasks.length === 0) {
        errors.push({ Code: 'EmptyGraph', Message: 'A task graph must contain at least one task.' });
        // Nothing further is meaningful without nodes.
        return { Valid: errors.length === 0, Errors: errors };
    }

    if (tasks.length > MAX_TASKS_PER_GRAPH) {
        errors.push({
            Code: 'TooManyTasks',
            Message: `A task graph may contain at most ${MAX_TASKS_PER_GRAPH} tasks; received ${tasks.length}.`,
        });
    }

    // --- per-node checks -----------------------------------------------------
    // Built once so every message can name a step the way its author does rather than by tempId,
    // which is a UUID on the compiled-flow path. C7.
    const nameByTempId = new Map<string, string>(
        tasks.filter((t) => t.tempId && t.name?.trim()).map((t) => [t.tempId, t.name.trim()]),
    );
    // Built once, before any condition is read: a condition may read a Decision step declared
    // anywhere in the graph, including after the task that carries it.
    const decisionSteps = collectDecisionSteps(tasks);
    const seen = new Set<string>();
    for (const task of tasks) {
        if (!task.tempId || task.tempId.trim().length === 0) {
            errors.push({ Code: 'MissingTempId', Message: `Task "${task.name ?? '(unnamed)'}" has no tempId.` });
            continue;
        }
        if (seen.has(task.tempId)) {
            errors.push({
                Code: 'DuplicateTempId',
                Message: `Duplicate tempId "${task.tempId}". Each task needs a unique handle so dependencies resolve unambiguously.`,
                TempId: task.tempId,
            });
        }
        seen.add(task.tempId);

        // A node carries exactly one `kind`, so a CONFLICTING assignment is unrepresentable — there
        // is no rule to write, which is the point of the union. Only absence is still reachable, and
        // only from a JavaScript caller the compiler never saw.
        if (!task.kind) {
            errors.push({
                Code: 'NoAssignment',
                Message: `Task "${task.tempId}" has no kind; nothing would execute it.`,
                TempId: task.tempId,
            });
        }

        checkConfiguration(task, errors);
        checkDecisionConfiguration(task, errors);
        checkConditionSyntax(task, nameByTempId, decisionSteps, errors);

        for (const raw of task.dependsOn ?? []) {
            // NORMALISE before comparing. The object form `{ tempId: <own> }` used to slip past this
            // check (it compared the raw union against a string), and because a self-dependency is
            // then excluded from BOTH the UnknownDependency check and cycle detection, an
            // object-form self-edge passed validation entirely and produced a task that could never
            // become eligible.
            if (NormalizeDependency(raw).tempId === task.tempId) {
                errors.push({
                    Code: 'SelfDependency',
                    Message: `Task "${task.tempId}" depends on itself.`,
                    TempId: task.tempId,
                });
            }
        }
    }

    checkExclusiveGroups(tasks, errors);
    checkExhaustiveForks(tasks, decisionSteps, errors);

    // --- graph-level checks --------------------------------------------------
    const known = new Set(tasks.map((t) => t.tempId).filter(Boolean));
    for (const task of tasks) {
        for (const raw of task.dependsOn ?? []) {
            const dep = NormalizeDependency(raw).tempId;
            if (dep !== task.tempId && !known.has(dep)) {
                errors.push({
                    Code: 'UnknownDependency',
                    Message: `Task "${task.tempId}" depends on "${dep}", which is not a task in this graph.`,
                    TempId: task.tempId,
                });
            }
        }
    }

    // Cycle detection reuses the Phase 1 algorithm rather than reimplementing traversal — the same
    // code that guards execution guards submission, so the two can never disagree.
    const nodes: TaskGraphNode[] = tasks.filter((t) => !!t.tempId).map((t) => ({ id: t.tempId, status: 'Pending' }));
    const edges: TaskGraphEdge[] = tasks.flatMap((t) =>
        (t.dependsOn ?? [])
            .map(NormalizeDependency)
            .filter((d) => known.has(d.tempId) && d.tempId !== t.tempId)
            .map((d) => ({ taskId: t.tempId, dependsOnTaskId: d.tempId, dependencyType: d.dependencyType })),
    );
    const cycle = DetectCycle(nodes, edges);
    if (cycle.hasCycle) {
        errors.push({
            Code: 'CycleDetected',
            Message: `Dependency cycle detected: ${cycle.path.join(' -> ')}. A cyclic graph can never execute — nothing would ever become eligible.`,
        });
    }

    return { Valid: errors.length === 0, Errors: errors };
}

/** Renders validation errors as one human/LLM-readable message. */
export function FormatValidationErrors(errors: readonly TaskGraphValidationError[]): string {
    return errors.map((e) => `[${e.Code}] ${e.Message}`).join('\n');
}
