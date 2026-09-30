/**
 * @fileoverview Validation for the flow step types the Architect authors — specifically loops.
 *
 * **Why loops needed their own module.** The Architect's spec taught three step types
 * (`Action`, `Prompt`, `Sub-Agent`) while `AIAgentStep.StepType` has accepted five for releases —
 * `ForEach` and `While` were executable but unauthorable, so anything built through the Agent Manager
 * could not repeat itself. Closing that gap means teaching the prompt *and* checking what comes back,
 * because a loop is the one step type that saves perfectly well while doing nothing at all: a
 * `ForEach` with no `collectionPath` iterates over nothing, and at runtime that reads as the agent
 * declining to work rather than as a malformed step.
 *
 * Pure and dependency-free so the rules are unit-testable without an agent run.
 *
 * @module @memberjunction/ai-agent-manager
 */
import type { AgentStep, AgentStepPath } from '@memberjunction/ai-core-plus';
import {
    ReadFlowDecisionStepConfiguration,
    CollectDecisionStepKeys,
    DecisionReferencesIn,
    DecisionChoiceTestOf,
} from '@memberjunction/ai-core-plus';

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

/** Context for validating Decision steps within a flow. */
export interface DecisionValidationContext {
    /** The flow's steps, for the key and reference checks. */
    Steps?: readonly AgentStep[];
    /** The flow's paths, for the reference and Choice-fork checks. */
    Paths?: readonly AgentStepPath[];
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
 * {@link ReadFlowDecisionStepConfiguration} expects. Returns a copy; the input is not changed.
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
 * returned unchanged, so {@link ReadFlowDecisionStepConfiguration} reports why it cannot be read.
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
 * ({@link DecisionConfigurationText}).
 */
export function StepConfigurationText(step: Pick<AgentStep, 'StepType' | 'Configuration'>): string | null {
    if (step.StepType === 'Decision') return DecisionConfigurationText(step.Configuration);
    const raw = step.Configuration;
    if (raw == null || raw === '') return null;
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

/** A step's identity in a spec: its ID, or its name for a step not yet saved. */
function stepRef(step: Pick<AgentStep, 'ID' | 'Name'>): string {
    return step.ID || step.Name;
}

/** The step's Decision configuration, or why it cannot be read. */
function readDecisionStep(step: AgentStep): ReturnType<typeof ReadFlowDecisionStepConfiguration> {
    return ReadFlowDecisionStepConfiguration(DecisionConfigurationText(step.Configuration));
}

/**
 * Checks one Decision step, returning every problem rather than the first. A Decision step is valid
 * when its configuration can be read, its key is unique across the flow's Decision steps, every
 * outgoing path condition that reads `decisions.<key>` names a key that exists, and a Choice fork
 * (every outgoing path testing one Choice question's value) covers every option.
 *
 * @param index the step's position in the spec, named in every message so the model can find it
 * @param context the flow's steps and paths; without them only the configuration is checked
 */
export function ValidateDecisionStep(step: AgentStep, index: number, context: DecisionValidationContext = {}): string[] {
    if (!IsDecisionStep(step)) return [];
    const where = `Decision step "${step.Name}" (index ${index})`;
    const read = readDecisionStep(step);
    const steps = context.Steps ?? [step];
    const outgoing = outgoingPaths(step, context.Paths ?? []);
    return [
        ...('Error' in read ? [`❌ ${where} cannot run: ${read.Error}`] : []),
        ...duplicateKeyErrors(step, steps, where),
        ...unknownReferenceErrors(outgoing, decisionKeys(steps), where),
        ...choiceForkErrors(outgoing, steps, where),
    ];
}

/** The duplicate-key problems {@link CollectDecisionStepKeys} finds that involve this step's key. */
function duplicateKeyErrors(step: AgentStep, steps: readonly AgentStep[], where: string): string[] {
    const read = readDecisionStep(step);
    if ('Error' in read) return [];
    const keyed = steps.map((s) => ({ ID: stepRef(s), Name: s.Name, StepType: s.StepType, Configuration: DecisionConfigurationText(s.Configuration) }));
    const keyOf = new Map(steps.map((s) => [stepRef(s), readDecisionStep(s)] as const));
    return CollectDecisionStepKeys(keyed).Errors
        .filter((e) => {
            const other = e.StepID ? keyOf.get(e.StepID) : undefined;
            return other !== undefined && 'Config' in other && other.Config.key === read.Config.key;
        })
        .map((e) => `❌ ${where} has a duplicate key: ${e.Message}`);
}

/** The keys of every readable Decision step in the flow. */
function decisionKeys(steps: readonly AgentStep[]): Set<string> {
    const keys = new Set<string>();
    for (const s of steps) {
        if (!IsDecisionStep(s)) continue;
        const read = readDecisionStep(s);
        if ('Config' in read) keys.add(read.Config.key);
    }
    return keys;
}

/**
 * The paths leaving this step, from the flow's paths and the step's own `Paths`, each once. A spec
 * names a path's origin by the step's ID, or by its name for a step not yet saved.
 */
function outgoingPaths(step: AgentStep, flowPaths: readonly AgentStepPath[]): AgentStepPath[] {
    const refs = new Set([step.ID?.toLowerCase(), step.Name].filter((r): r is string => !!r));
    const seen = new Set<string>();
    const outgoing: AgentStepPath[] = [];
    for (const path of [...flowPaths, ...(step.Paths ?? [])]) {
        const origin = path.OriginStepID;
        if (!origin || !(refs.has(origin.toLowerCase()) || refs.has(origin))) continue;
        const identity = `${path.ID ?? ''}|${origin}|${path.DestinationStepID}|${path.Condition ?? ''}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        outgoing.push(path);
    }
    return outgoing;
}

/** Every `decisions.<key>` a condition reads that no Decision step has, and every malformed reference. */
function unknownReferenceErrors(outgoing: readonly AgentStepPath[], knownKeys: ReadonlySet<string>, where: string): string[] {
    const errors: string[] = [];
    for (const path of outgoing) {
        const condition = path.Condition?.trim();
        if (!condition) continue;
        const scan = DecisionReferencesIn(condition);
        const target = `Outgoing path from ${where} to "${path.DestinationStepID}"`;
        for (const ref of scan.References) {
            if (!knownKeys.has(ref.NodeId)) {
                errors.push(`❌ ${target} reads decisions.${ref.NodeId}, but no Decision step in this workflow has the key "${ref.NodeId}". The condition was: ${condition}`);
            }
        }
        for (const malformed of scan.Malformed) {
            errors.push(`❌ ${target} has a malformed decision reference "${malformed}". The condition was: ${condition}`);
        }
    }
    return errors;
}

/**
 * The missing options of a Choice fork: when every outgoing path tests the same Choice question's
 * `value`, the paths together must cover every one of its options.
 */
function choiceForkErrors(outgoing: readonly AgentStepPath[], steps: readonly AgentStep[], where: string): string[] {
    const tests = outgoing.map((p) => (p.Condition?.trim() ? DecisionChoiceTestOf(p.Condition) : null));
    const first = tests[0];
    if (!first || !tests.every((t) => t !== null && t.NodeId === first.NodeId && t.QuestionKey === first.QuestionKey)) {
        return [];
    }
    const options = choiceOptions(steps, first.NodeId, first.QuestionKey);
    if (!options) return [];
    const covered = new Set(tests.flatMap((t) => t?.Values ?? []));
    const missing = options.filter((o) => !covered.has(o));
    if (missing.length === 0) return [];
    const quoted = missing.map((v) => `"${v}"`).join(', ');
    return [`❌ ${where} has an incomplete Choice fork on question "${first.QuestionKey}": no path for ${quoted}. A Choice fork must cover every option.`];
}

/** The option values of the Choice question `questionKey` on the Decision step keyed `key`, if there is one. */
function choiceOptions(steps: readonly AgentStep[], key: string, questionKey: string): string[] | null {
    for (const s of steps) {
        if (!IsDecisionStep(s)) continue;
        const read = readDecisionStep(s);
        if (!('Config' in read) || read.Config.key !== key) continue;
        const question = read.Config.questions[questionKey];
        return question?.kind === 'Choice' ? question.options.map((o) => o.value) : null;
    }
    return null;
}

/** Validates every Decision step in a flow, returning every problem across them. */
export function ValidateDecisionSteps(steps: readonly AgentStep[], paths?: readonly AgentStepPath[]): string[] {
    return steps.flatMap((step, i) => ValidateDecisionStep(step, i, { Steps: steps, Paths: paths }));
}
