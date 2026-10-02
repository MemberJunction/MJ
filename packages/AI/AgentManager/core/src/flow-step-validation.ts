/**
 * @fileoverview Validation for the flow step types the Architect authors, and for a flow as a whole.
 *
 * **Why loops needed their own module.** The Architect's spec taught three step types
 * (`Action`, `Prompt`, `Sub-Agent`) while `AIAgentStep.StepType` has accepted five for releases —
 * `ForEach` and `While` were executable but unauthorable, so anything built through the Agent Manager
 * could not repeat itself. Closing that gap means teaching the prompt *and* checking what comes back,
 * because a loop is the one step type that saves perfectly well while doing nothing at all: a
 * `ForEach` with no `collectionPath` iterates over nothing, and at runtime that reads as the agent
 * declining to work rather than as a malformed step.
 *
 * **A flow as a whole is checked by the runtime's own code.** {@link ValidateFlowGraph} compiles the
 * flow with `CompileFlowToTaskGraph` and validates the result with `ValidateTaskGraphSpec`, as a Flow
 * agent is before it runs, rather than re-implementing any of their rules. A second copy of those
 * rules is a copy that drifts: it passed conditions the runtime refused and refused forks the
 * runtime ran.
 *
 * Pure: no database and no engine, so the rules are unit-testable without an agent run.
 *
 * @module @memberjunction/ai-agent-manager
 */
import type {
    AgentStep,
    AgentStepPath,
    FlowCompileError,
    FlowCompilerOptions,
    FlowCompilerPath,
    FlowCompilerStep,
    TaskGraphSpec,
    TaskGraphValidationError,
} from '@memberjunction/ai-core-plus';
import { CollectDecisionStepKeys, CompileFlowToTaskGraph, ValidateTaskGraphSpec } from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';

/** The step types that wrap a body and repeat it. */
export type LoopStepType = Extract<AgentStep['StepType'], 'ForEach' | 'While'>;

/** True when this step repeats a body rather than being one. */
export function IsLoopStep(step: Pick<AgentStep, 'StepType'>): boolean {
    return step.StepType === 'ForEach' || step.StepType === 'While';
}

/** True when this step is a fast typed decision. */
export function IsDecisionStep(step: Pick<AgentStep, 'StepType'>): boolean {
    return step.StepType === 'Decision';
}

/**
 * Which field carries the body's id, per body type.
 *
 * The body's id lives in the SAME field a plain step of that type would use — a `ForEach` whose body
 * is an Action still puts it in `ActionID`. Introducing a parallel `LoopBodyActionID` would have been
 * a second place an action id can live, and the two would drift.
 */
const BODY_ID_FIELD: Record<NonNullable<AgentStep['LoopBodyType']>, 'ActionID' | 'PromptID' | 'SubAgentID'> = {
    Action: 'ActionID',
    Prompt: 'PromptID',
    'Sub-Agent': 'SubAgentID',
};

/**
 * Checks one `ForEach` / `While` step, returning every problem rather than the first.
 *
 * Returns messages rather than throwing, matching how the Architect reports the rest of its
 * validation — one pass gives the model everything it has to fix, instead of a fix-and-retry loop
 * that surfaces one error per round trip.
 */
export function ValidateLoopStep(step: AgentStep, index: number): string[] {
    const errors: string[] = [];
    if (!IsLoopStep(step)) return errors;

    const where = `${step.StepType} step "${step.Name}" (index ${index})`;

    validateLoopBody(step, where, errors);
    const config = parseLoopConfiguration(step, where, errors);
    if (config) validateLoopBounds(step, config, where, errors);

    return errors;
}

/** The loop must name what it repeats, and that thing must exist. */
function validateLoopBody(step: AgentStep, where: string, errors: string[]): void {
    if (!step.LoopBodyType) {
        errors.push(
            `❌ ${where} must have LoopBodyType — one of "Action", "Prompt" or "Sub-Agent" — naming what runs on each pass`,
        );
        return;
    }

    const field = BODY_ID_FIELD[step.LoopBodyType];
    if (step[field]) return;

    // Two legitimate reasons the id is still empty:
    //  - a Sub-Agent body that AgentSpecSync will link by name once the sub-agent is created, exactly
    //    as it already does for a plain Sub-Agent step;
    //  - a Prompt body supplied inline as PromptText, which becomes an AIPrompt on save.
    const linkedLater = step.LoopBodyType === 'Sub-Agent';
    const inlinePrompt = step.LoopBodyType === 'Prompt' && !!step.PromptText?.trim();
    if (linkedLater || inlinePrompt) return;

    errors.push(`❌ ${where} has LoopBodyType "${step.LoopBodyType}" but no ${field} to run`);
}

/** ForEach needs something to iterate; While needs something to test; both need a name for the item. */
function validateLoopBounds(
    step: AgentStep,
    config: Record<string, unknown>,
    where: string,
    errors: string[],
): void {
    if (step.StepType === 'ForEach' && !config['collectionPath']) {
        errors.push(`❌ ${where} must set Configuration.collectionPath — the payload path holding the items to iterate`);
    }
    if (step.StepType === 'While' && !config['condition']) {
        errors.push(`❌ ${where} must set Configuration.condition — the expression checked before each pass`);
    }
    if (!config['itemVariable']) {
        errors.push(`❌ ${where} must set Configuration.itemVariable — the name the body refers to the current item by`);
    }
}

/**
 * Reads a loop's `Configuration`, reporting rather than throwing. Null when unusable.
 *
 * Accepts an object as well as a JSON string — the same latitude the action mappings already get,
 * because a model that has just been shown an object literal in the prompt will send one.
 */
function parseLoopConfiguration(step: AgentStep, where: string, errors: string[]): Record<string, unknown> | null {
    const raw: unknown = step.Configuration;
    if (raw == null || raw === '') {
        errors.push(`❌ ${where} must have a Configuration object describing the loop's bounds`);
        return null;
    }

    if (typeof raw === 'object') {
        if (Array.isArray(raw)) {
            errors.push(`❌ ${where} has a Configuration that is an array rather than an object`);
            return null;
        }
        return raw as Record<string, unknown>;
    }

    if (typeof raw !== 'string') {
        errors.push(`❌ ${where} has a Configuration that is neither an object nor JSON text`);
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            errors.push(`❌ ${where} has a Configuration that is not a JSON object`);
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch (e) {
        errors.push(`❌ ${where} has invalid Configuration JSON: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

/**
 * Normalizes a Decision step's configuration so the aliases a model tends to write (`text` for a
 * question's `instructions`, and `text` for an option's `description`) read as the fields
 * `ReadFlowDecisionStepConfiguration` expects. Returns a copy; the input is not changed.
 */
export function NormalizeDecisionConfiguration(raw: Record<string, unknown>): Record<string, unknown> {
    const cloned = structuredClone(raw);
    const questions = cloned.questions;
    if (!isPlainObject(questions)) {
        return cloned;
    }
    for (const question of Object.values(questions)) {
        if (!isPlainObject(question)) continue;
        copyAlias(question, 'text', 'instructions');
        if (Array.isArray(question.options)) {
            for (const option of question.options) {
                if (isPlainObject(option)) copyAlias(option, 'text', 'description');
            }
        }
    }
    return cloned;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sets `record[to]` from `record[from]` when only the alias is present. */
function copyAlias(record: Record<string, unknown>, from: string, to: string): void {
    if (!record[to] && typeof record[from] === 'string') {
        record[to] = record[from];
    }
}

/**
 * A Decision step's configuration as JSON text, normalized. A model may write the configuration as
 * an object rather than as JSON text, as it may for a loop; text that is not a JSON object is
 * returned unchanged, so `ReadFlowDecisionStepConfiguration` reports why it cannot be read.
 */
export function DecisionConfigurationText(raw: AgentStep['Configuration'] | null): string | null {
    if (raw == null) return null;
    if (typeof raw !== 'string') {
        // Typed as an object, but it is a model's JSON: an array or a number can arrive here too, and
        // is written as the JSON it is so the reader can say it is not an object.
        return isPlainObject(raw) ? JSON.stringify(NormalizeDecisionConfiguration(raw)) : JSON.stringify(raw);
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return isPlainObject(parsed) ? JSON.stringify(NormalizeDecisionConfiguration(parsed)) : raw;
    } catch {
        return raw;
    }
}

/**
 * A step's `Configuration` as the JSON text `AIAgentStep.Configuration` stores, which is what the
 * runtime reads. An object is written as text, and a Decision step's is normalized
 * ({@link DecisionConfigurationText}). `AgentSpecSync` saves this and {@link ValidateFlowGraph}
 * compiles it, so what is validated is what is saved.
 */
export function StepConfigurationText(step: Pick<AgentStep, 'StepType' | 'Configuration'>): string | null {
    if (step.StepType === 'Decision') return DecisionConfigurationText(step.Configuration);
    const raw = step.Configuration;
    if (raw == null || raw === '') return null;
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

/**
 * Every problem the runtime would refuse a Flow agent's steps and paths for, as messages that name
 * the steps. Empty when the flow can run.
 *
 * The flow is compiled with `CompileFlowToTaskGraph` and the result validated with
 * `ValidateTaskGraphSpec`, exactly as a Flow agent is before it runs, so a flow this passes is one
 * the runtime runs and a flow it refuses is one the runtime refuses. That covers every Decision step
 * the flow can reach: its configuration, its key, each condition that reads `decisions.<key>` (the
 * key, the question, and whether that question's answer has the field read), and a fork on a Choice
 * question that has no path for one of its options.
 *
 * Two checks come from outside the compiler, because it cannot see what they catch:
 *  - a path whose origin or destination names no step, which the compiler drops without a word and
 *    `AgentSpecSync` cannot save;
 *  - a key two Decision steps share when the flow cannot reach one of them. The compiler checks only
 *    the steps it compiles, but the in-run walker checks every step, since it can start at any.
 *
 * Names behind IDs are not resolved here: each ID stands in for its own name. The Architect checks
 * a spec's actions, and a Decision step's prompt, separately. It also accepts a step whose sub-agent
 * or inline prompt has no ID until the spec is saved, so a placeholder stands in for that ID.
 *
 * @param steps the flow's steps
 * @param paths the flow's paths: `AgentSpec.Paths`, which is what `AgentSpecSync` saves
 * @param workflowName the agent's name, which the compiled workflow carries
 */
export function ValidateFlowGraph(
    steps: readonly AgentStep[],
    paths: readonly AgentStepPath[],
    workflowName: string | undefined,
): string[] {
    const compilerSteps = steps.map(toCompilerStep);
    const resolved = resolvePaths(paths, steps);
    const compiled = CompileFlowToTaskGraph(compilerSteps, resolved.Paths, compilerOptions(workflowName));
    return [
        ...resolved.Errors,
        // Over every step, as the in-run walker checks them. The compiler's own check covers only the
        // steps it compiles, so every step it flags is flagged here too.
        ...CollectDecisionStepKeys(compilerSteps).Errors.map(compileErrorMessage),
        ...compiled.Errors.filter((e) => e.Code !== 'DuplicateDecisionKey').map(compileErrorMessage),
        ...(compiled.Spec ? graphErrorMessages(compiled.Spec) : []),
    ];
}

/** What stands in for an ID the Architect lets a spec leave empty until it is saved. */
const FILLED_ON_SAVE = '(set when the spec is saved)';

/** A step's identity in a spec: its ID, or its name for a step not yet saved. */
function stepRef(step: Pick<AgentStep, 'ID' | 'Name'>): string {
    return step.ID || step.Name;
}

/** A spec step as the compiler reads it: the row `AgentSpecSync` would save. */
function toCompilerStep(step: AgentStep): FlowCompilerStep {
    return {
        ID: stepRef(step),
        Name: step.Name,
        Description: step.Description ?? null,
        StepType: step.StepType,
        StartingStep: step.StartingStep === true,
        // AgentSpecSync saves every step Active.
        Status: 'Active',
        ActionID: step.ActionID || null,
        SubAgentID: step.SubAgentID || (runsSubAgent(step) ? FILLED_ON_SAVE : null),
        PromptID: step.PromptID || (hasInlinePrompt(step) ? FILLED_ON_SAVE : null),
        LoopBodyType: step.LoopBodyType,
        Configuration: StepConfigurationText(step),
        ActionInputMapping: mappingText(step.ActionInputMapping),
        ActionOutputMapping: mappingText(step.ActionOutputMapping),
    };
}

/** A Sub-Agent step, or a loop whose body is one. The Architect accepts either with no sub-agent ID yet. */
function runsSubAgent(step: AgentStep): boolean {
    return step.StepType === 'Sub-Agent' || (IsLoopStep(step) && step.LoopBodyType === 'Sub-Agent');
}

/** A Prompt step, or a loop whose body is one, with its prompt written inline as `PromptText`. */
function hasInlinePrompt(step: AgentStep): boolean {
    const runsPrompt = step.StepType === 'Prompt' || (IsLoopStep(step) && step.LoopBodyType === 'Prompt');
    return runsPrompt && !!step.PromptText?.trim();
}

/** An action mapping as the JSON text the column stores. */
function mappingText(mapping: AgentStep['ActionInputMapping']): string | null {
    if (mapping == null || mapping === '') return null;
    return typeof mapping === 'string' ? mapping : JSON.stringify(mapping);
}

/**
 * The spec's paths with both ends resolved to their steps, and a message for each path that names a
 * step no spec step has. An end names a step by its ID, compared as a UUID, or by its name, exactly
 * as written — the match `AgentSpecSync` makes when it saves the path.
 */
function resolvePaths(
    paths: readonly AgentStepPath[],
    steps: readonly AgentStep[],
): { Paths: FlowCompilerPath[]; Errors: string[] } {
    const resolved: { Paths: FlowCompilerPath[]; Errors: string[] } = { Paths: [], Errors: [] };
    paths.forEach((path, index) => {
        const origin = findStep(steps, path.OriginStepID);
        const destination = findStep(steps, path.DestinationStepID);
        if (!origin || !destination) {
            resolved.Errors.push(unknownEndMessage(path, !origin, !destination));
            return;
        }
        resolved.Paths.push({
            // A new path has no ID yet, and the compiler tells a fork's paths apart by ID.
            ID: path.ID || `new-path-${index}`,
            OriginStepID: stepRef(origin),
            DestinationStepID: stepRef(destination),
            Condition: path.Condition ?? null,
            Priority: Number.isFinite(path.Priority) ? path.Priority : 0,
            PathPoints: path.PathPoints ?? null,
        });
    });
    return resolved;
}

/** The step a path end names, if any. */
function findStep(steps: readonly AgentStep[], ref: string | undefined): AgentStep | undefined {
    if (!ref) return undefined;
    return steps.find((s) => !!s.ID && UUIDsEqual(s.ID, ref)) ?? steps.find((s) => s.Name === ref);
}

function unknownEndMessage(path: AgentStepPath, originUnknown: boolean, destinationUnknown: boolean): string {
    const ends = [originUnknown ? 'origin' : null, destinationUnknown ? 'destination' : null].filter((e) => e !== null);
    return `❌ The path from "${path.OriginStepID}" to "${path.DestinationStepID}" names no step as its ${ends.join(' or ')}. `
        + 'Name each end by a step\'s exact Name, or by its ID for a step that already exists.';
}

/** The compiler's settings: names are placeholders, and a fork is an exclusive choice, as when a Flow agent runs. */
function compilerOptions(workflowName: string | undefined): FlowCompilerOptions {
    const placeholderName = (id: string): string => id;
    return {
        WorkflowName: workflowName?.trim() || 'Flow agent',
        ResolveAgentName: placeholderName,
        ResolveActionName: placeholderName,
        ResolvePromptName: placeholderName,
        TraversalMode: 'sequential',
    };
}

function compileErrorMessage(error: FlowCompileError): string {
    return `❌ [${error.Code}] ${error.Message}`;
}

/**
 * What `ValidateTaskGraphSpec` refuses in the compiled workflow. A compiled step is named by its
 * spec step's ID where it has one, so each ID in a message becomes the step's name, as the Flow agent
 * does when it reports these.
 */
function graphErrorMessages(spec: TaskGraphSpec): string[] {
    return ValidateTaskGraphSpec(spec).Errors.map((e: TaskGraphValidationError) => `❌ [${e.Code}] ${namedBySteps(e.Message, spec)}`);
}

function namedBySteps(message: string, spec: TaskGraphSpec): string {
    return spec.tasks.reduce(
        (text, task) => (task.tempId && task.name && task.tempId !== task.name ? text.split(task.tempId).join(task.name) : text),
        message,
    );
}
