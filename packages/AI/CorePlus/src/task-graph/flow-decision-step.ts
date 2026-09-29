/**
 * @fileoverview What a Flow agent's `Decision` step stores, and the one place it is read.
 *
 * A Decision step is one typed decision call. It answers a fixed set of Likelihood, Choice or Score
 * questions about one state, and its outgoing paths route on the answers through the `decisions`
 * condition root: `decisions.triage.intent.value === 'billing'`. The decision prompt is the step's
 * `PromptID` column (NULL means `Default Decision`); everything else is `AIAgentStep.Configuration`.
 *
 * Both of a flow's engines read it through {@link ReadFlowDecisionStepConfiguration}: the compiler,
 * which turns the step into a task-graph Decision node, and the in-run walker, which runs it through
 * the agent's own decision execution. The questions are held to the same checks a task-graph
 * Decision node gets at submit, so a step one engine accepts the other cannot refuse.
 *
 * @module @memberjunction/ai-core-plus
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { MJAIPromptEntity } from '@memberjunction/core-entities';
import type { TaskGraphDecisionQuestion } from './task-graph-spec';
import { DecisionConfigurationProblems } from './task-graph-validator';

/** A Flow agent Decision step's `AIAgentStep.Configuration`. */
export type FlowDecisionStepConfiguration = {
    /**
     * Names the step in path conditions: `decisions.<key>.<question>`. A step's name is not unique
     * and may not be an identifier, so conditions use this instead. Unique among a flow's Decision
     * steps, and matches {@link FLOW_DECISION_KEY_PATTERN}.
     */
    key: string;
    /** What the questions are about: `payload` (the default, the whole payload) or `payload.<path>`. */
    state?: string;
    /**
     * The questions, all answered in one call. The key is how conditions name the answer; the model
     * never sees it, so put everything it needs in `instructions` and the option descriptions.
     */
    questions: Record<string, TaskGraphDecisionQuestion>;
};

/** What a Decision step key must look like: letters, digits and underscores, not starting with a digit. */
export const FLOW_DECISION_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Reads a Decision step's stored configuration, or says what is wrong with it.
 *
 * Pure. Every problem is reported at once, joined with `; `, as phrases that complete
 * "Decision step "X" cannot run: …".
 *
 * @param json the step's `Configuration` column
 */
export function ReadFlowDecisionStepConfiguration(
    json: string | null | undefined,
): { Config: FlowDecisionStepConfiguration } | { Error: string } {
    const parsed = parseConfigurationObject(json);
    if ('Error' in parsed) return parsed;

    const candidate = parsed.Object as FlowDecisionStepConfiguration;
    const problems = keyProblems(parsed.Object.key);
    if (parsed.Object.questions === undefined || parsed.Object.questions === null) {
        problems.push('it asks no questions');
    }
    problems.push(...DecisionConfigurationProblems({ state: candidate.state, questions: candidate.questions }));

    return problems.length > 0
        ? { Error: problems.join('; ') }
        : { Config: { key: candidate.key, ...(candidate.state !== undefined ? { state: candidate.state } : {}), questions: candidate.questions } };
}

/** The configuration as a JSON object, or why it is not one. */
function parseConfigurationObject(json: string | null | undefined): { Object: Record<string, unknown> } | { Error: string } {
    if (!json?.trim()) return { Error: 'it has no configuration; it needs a key and at least one question' };
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { Error: 'its configuration is not valid JSON' };
    }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { Object: parsed as Record<string, unknown> }
        : { Error: 'its configuration is not a JSON object' };
}

/** What is wrong with a step's key, as phrases. Empty when it is usable. */
function keyProblems(key: unknown): string[] {
    if (typeof key !== 'string' || !key.trim()) {
        return ['it has no key; give it one that path conditions can name it by, such as "triage"'];
    }
    return FLOW_DECISION_KEY_PATTERN.test(key)
        ? []
        : [`its key "${key}" cannot be named in a path condition; use letters, digits and underscores, not starting with a digit`];
}

/**
 * Whether a prompt is for a Decision model type, so an editor offers it as a decision prompt. Prefer the ID: `AIModelType` is
 * a view column, and cached engine entities may not populate it (see RunAIPromptResolver). The name is the fallback for rows
 * read from the view without the ID. The runtime enforces the type on the models themselves
 * (`AIDecisionRunner.RequiredModelType`); this only filters a picker.
 */
export function IsDecisionPrompt(
    prompt: Pick<MJAIPromptEntity, 'AIModelType' | 'AIModelTypeID'> | null | undefined,
    decisionModelTypeID?: string | null,
): boolean {
    if (!prompt) return false;
    if (decisionModelTypeID && prompt.AIModelTypeID) {
        return UUIDsEqual(prompt.AIModelTypeID, decisionModelTypeID);
    }
    const typeName = typeof prompt.AIModelType === 'string' ? prompt.AIModelType.trim().toLowerCase() : '';
    return typeName === 'decision';
}
