/**
 * Everything a workflow step needs that has no column of its own — stored on Task.Configuration.
 *
 * A workflow compiles to a task graph and runs on the dispatcher, so each Task row IS a workflow
 * step. Three parts of a step have their own columns because SQL needs them: `StepType` (the
 * discriminator the claiming query routes on) and the `AgentID` / `ActionID` / `PromptID` / `UserID`
 * foreign keys. Everything else lives here.
 *
 * **Why a JSON bag rather than more columns.** None of the fields below is ever a SQL predicate —
 * the dispatcher loads the row and reads them in TypeScript. Made into columns they would be eight
 * more migrations' worth of surface for no query benefit, and every new step kind or policy knob
 * would need another one. As a typed bag, growth is a change to this file plus CodeGen.
 *
 * **Which member is populated follows `Task.StepType`.** TypeScript cannot discriminate on a sibling
 * column, so the kind-specific members are individually optional rather than a discriminated union.
 * Read them through the `StepType` you already have; do not infer the kind by probing for whichever
 * member happens to be present, which is the exact mistake that used to turn every unrecognized
 * step into a person's approval task.
 */
export interface ITaskStepConfiguration {
    /** Settings for an Agent step. The agent itself is `Task.AgentID`. */
    agent?: ITaskAgentConfiguration;

    /** Settings for a Prompt step. The prompt itself is `Task.PromptID`. */
    prompt?: ITaskPromptConfiguration;

    /** The loop definition for a ForEach step. Mirrors ForEachOperation in @memberjunction/ai-core-plus. */
    forEach?: ITaskForEachConfiguration;

    /** The loop definition for a While step. Mirrors WhileOperation in @memberjunction/ai-core-plus. */
    while?: ITaskWhileConfiguration;

    /** Settings for a step a person completes. The assignee is `Task.UserID`. */
    human?: ITaskHumanConfiguration;

    /** Settings for a step completed by a system outside MemberJunction. */
    external?: ITaskExternalConfiguration;

    /**
     * How this step's inputs are built from the workflow payload, as a JSON object mapping the
     * step's parameter names to payload paths.
     *
     * Evaluated when the step is dispatched, never when the workflow is submitted: a step's input
     * routinely depends on what an earlier step produced, which does not exist yet at submission.
     */
    inputMapping?: string;

    /**
     * How this step's results are written back into the workflow payload, as a JSON object mapping
     * result field names to payload paths.
     *
     * This is the only way a later step — or a branch condition — can see what this step produced.
     * A workflow that branches on `payload.stockPrice` gets that value because some earlier step
     * mapped it there.
     */
    outputMapping?: string;

    /** Timeout, retries, and what failure means for the rest of the workflow. */
    policy?: ITaskExecutionPolicy;
}

/** Settings for an Agent step, beyond which agent to run. */
export interface ITaskAgentConfiguration {
    /** What to tell the agent. Omitted means the agent works from the payload alone. */
    message?: string;
    /** Values bound into the agent's prompt template. */
    templateParameters?: Record<string, string>;
}

/** Settings for a Prompt step, beyond which prompt to run. */
export interface ITaskPromptConfiguration {
    /** Values bound into the prompt template. */
    templateParameters?: Record<string, string>;
}

/**
 * A ForEach step: run the body once per item in a collection.
 *
 * **This mirrors `ForEachOperation` in @memberjunction/ai-core-plus field for field, on purpose.**
 * That interface is already the universal loop shape every agent type uses — flow agents convert
 * their stored step configuration into it, loop agents receive it from the model. Defining a second,
 * near-identical shape here is how the two would drift: a field added to one and not the other makes
 * the compile silently lossy, and the loss shows up as a loop that ignores a setting its author set.
 * Keep them identical; if `ForEachOperation` gains a field, add it here in the same edit.
 */
export interface ITaskForEachConfiguration {
    /** Path in the payload to the array to iterate over. */
    collectionPath: string;
    /** Variable name for the current item (default: "item"). */
    itemVariable?: string;
    /** Variable name for the loop index (default: "index"). */
    indexVariable?: string;
    /** Maximum iterations (undefined = 1000, 0 = unlimited, >0 = limit). */
    maxIterations?: number;
    /** Keep going if an iteration fails (default: false). */
    continueOnError?: boolean;
    /** Delay between iterations, in milliseconds (default: 0). */
    delayBetweenIterationsMs?: number;
    /** One at a time, or several at once (default: 'sequential'). */
    executionMode?: 'sequential' | 'parallel';
    /** Ceiling on concurrent iterations when executionMode is 'parallel' (default: 10). */
    maxConcurrency?: number;
    /** Run this action once per iteration. */
    action?: ITaskLoopActionBody;
    /** Run this sub-agent once per iteration. */
    subAgent?: ITaskLoopSubAgentBody;
}

/**
 * A While step: run the body until a condition stops being true.
 *
 * Mirrors `WhileOperation` in @memberjunction/ai-core-plus field for field — see the note on
 * {@link ITaskForEachConfiguration} for why that matters.
 */
export interface ITaskWhileConfiguration {
    /** Boolean expression evaluated before each iteration. */
    condition: string;
    /** Variable name for the attempt context (default: "attempt"). */
    itemVariable?: string;
    /** Maximum iterations (undefined = 100, 0 = unlimited, >0 = limit). */
    maxIterations?: number;
    /** Keep going if an iteration fails (default: false). */
    continueOnError?: boolean;
    /** Delay between iterations, in milliseconds (default: 0). */
    delayBetweenIterationsMs?: number;
    /** Run this action once per iteration. */
    action?: ITaskLoopActionBody;
    /** Run this sub-agent once per iteration. */
    subAgent?: ITaskLoopSubAgentBody;
}

/** An action run once per loop iteration. */
export interface ITaskLoopActionBody {
    /** Action name. */
    name: string;
    /** Parameters passed to the action. */
    params: Record<string, unknown>;
    /** JSON mapping from the action's outputs back into the payload. */
    outputMapping?: string;
}

/** A sub-agent run once per loop iteration. */
export interface ITaskLoopSubAgentBody {
    /** Sub-agent name. */
    name: string;
    /** What to tell the sub-agent. */
    message: string;
    /** Values bound into the sub-agent's prompt template. */
    templateParameters?: Record<string, string>;
    /** Runtime context propagated to the sub-agent — API keys, environment settings, and the like. */
    context?: unknown;
}

/** A step a person completes. */
export interface ITaskHumanConfiguration {
    /** What the person is being asked to do. */
    instructions?: string;
}

/** A step completed by a system outside MemberJunction, which reports back when it is done. */
export interface ITaskExternalConfiguration {
    /** Which external system owns this step. */
    domain: string;
    /** That system's own identifier for the work, for correlation. */
    ref?: string;
}

/** What the dispatcher does about time and failure for a single step. */
export interface ITaskExecutionPolicy {
    /** How long the step may run before the dispatcher abandons it, in seconds. */
    timeoutSeconds?: number;
    /** How many times to retry before the failure is final. */
    retryCount?: number;
    /**
     * What a failure means for the rest of the workflow.
     *
     * `fail` stops dependents; `continue` records the failure and releases them anyway, which is
     * what lets a workflow draw a recovery path instead of stopping dead; `retry` re-runs up to
     * `retryCount` before deciding.
     */
    onError?: 'continue' | 'fail' | 'retry';
}
