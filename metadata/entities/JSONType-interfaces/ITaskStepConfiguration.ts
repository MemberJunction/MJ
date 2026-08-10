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

    /**
     * Where this step sat on the canvas when a person drew it.
     *
     * **Only ever the author's own arrangement — never a computed one.** A graph produced by an
     * agent or a remote caller has no geometry, and its positions are derived at render time from
     * the graph's shape. Persisting a derived layout would freeze one rendering of a graph that can
     * still change, and the stored coordinates would quietly go stale.
     *
     * So the rule for anything drawing a run is: use this when it is present, compute a layout when
     * it is not. That is what makes a workflow someone laid out by hand run — and appear in history —
     * in the shape they drew, while a machine-authored graph still renders legibly.
     */
    layout?: ITaskStepLayout;

    /**
     * What actually happened when this step ran — written by the dispatcher, never by an author.
     *
     * Everything else in this bag is a step's *definition*; this is its *history*. It lives here
     * rather than in columns of its own for the same reason as the rest: nothing in it is ever a SQL
     * predicate, and a column per runtime artefact would be a migration every time a new step kind
     * produced one.
     */
    runtime?: ITaskStepRuntime;
}

/**
 * The runtime artefacts a completed step points at.
 *
 * **This exists because cost was unreachable for prompt steps.** A workflow's spend is aggregated by
 * walking the run tree: an Agent step reaches its cost through `Task.AgentRunID` → the run's own
 * totals. A Prompt step has no agent run — the dispatcher executes the prompt directly — so its
 * `AIPromptRun`, and with it every token and dollar it spent, had no path back from the Task at all.
 * The runner returned the id and the dispatcher dropped it on the floor.
 */
export interface ITaskStepRuntime {
    /**
     * The `MJ: AI Prompt Runs` row this step produced, when it was a Prompt step.
     *
     * Set on the step's LAST execution. A retried step overwrites it rather than accumulating: the
     * prompt runs themselves are the durable history, and this is the pointer to the one whose
     * output the payload actually carries.
     */
    promptRunID?: string;

    /**
     * One entry per pass of a loop step, in iteration order.
     *
     * **Without this a loop's work does not exist anywhere the platform can see it.** The run tree
     * reaches nested work through exactly six links — a run's steps, a task-graph step's graph, a
     * graph's tasks, a Sub-Agent step's run, and a task's own `AgentRunID` — and a loop iteration is
     * none of them. `AIAgentRun.ParentRunID` does not help either: it records parentage but is not a
     * link the tree traverses. So a `While` that spent real money across three passes reported one
     * childless node with no cost, the settlement rollup under-counted every loop-bearing workflow,
     * and the timeline offered nothing to expand — the work had happened and was unreachable.
     *
     * Recorded by the dispatcher as each pass completes, so a loop that is still running already has
     * its finished iterations here.
     */
    iterations?: ITaskLoopIteration[];
}

/**
 * What one pass of a loop produced.
 *
 * Deliberately just pointers plus outcome: the `AIPromptRun` / `AIAgentRun` rows are the durable
 * record of what happened, and copying their cost here would create a second number to disagree with
 * the first — the exact failure this whole area has been fixing.
 */
export interface ITaskLoopIteration {
    /** Zero-based pass number, so iterations render in the order they ran. */
    index: number;
    /** The `MJ: AI Prompt Runs` row this pass produced, when the loop body is a prompt. */
    promptRunID?: string;
    /** The `MJ: AI Agent Runs` row this pass started, when the loop body is a sub-agent. */
    agentRunID?: string;
    /** Whether the pass succeeded. A loop with `continueOnError` can have failed passes and still finish. */
    success?: boolean;
    /** Why the pass failed, when it did. */
    errorMessage?: string;
}

/** A step's position and size on the canvas, in canvas units. */
export interface ITaskStepLayout {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
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
    /** A prompt run once per loop iteration. */
    prompt?: ITaskLoopPromptBody;
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
    /** A prompt run once per loop iteration. */
    prompt?: ITaskLoopPromptBody;
}

/**
 * A prompt run once per loop iteration.
 *
 * The cheapest loop body there is — one model call per item, with no agent wrapper, no reasoning
 * loop and no run record. Right when an iteration is a single transformation (classify this,
 * describe this column); wrong the moment an iteration has to decide what to do next.
 */
export interface ITaskLoopPromptBody {
    /** Prompt name. Resolved to `Task.PromptID` at submission, so it is a real foreign key. */
    name: string;
    /** Values bound into the template, alongside the loop's own item and index bindings. */
    templateParameters?: Record<string, string>;
    /** JSON mapping from the prompt's response into the payload, applied per iteration. */
    outputMapping?: string;
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

    /**
     * How long the person has to answer before the step gives up, in hours.
     *
     * **Without this the deadline machinery is unreachable.** `AIAgentRequest.ExpiresAt` exists, and
     * the dispatcher already expires overdue requests and fails the step so a give-up edge can route
     * around it — but nothing ever set the column, so that path had never run outside a test. A
     * workflow waiting on someone who left the company waited forever.
     *
     * Omitted means no deadline, which stays the default: a step that silently expired on a timeout
     * its author never chose would be worse than one that waits.
     */
    expiresInHours?: number;
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
