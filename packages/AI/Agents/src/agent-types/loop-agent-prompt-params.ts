/**
 * @fileoverview Type definitions for Loop Agent Type parameters.
 *
 * This module defines the per-agent configuration interface for Loop-type agents.
 * These parameters are stored in the `AgentTypePromptParams` JSON field on the
 * `MJ: AI Agents` entity and control:
 *
 * - **Prompt inclusion**: Which sections are included in the system prompt
 *   (enables token savings by excluding unused documentation)
 * - **Client tools**: Browser-side tools the agent can invoke (navigation, UI actions)
 * - **Content limits**: Max sub-agents/actions to include in prompts
 *
 * Parameters are merged with three-level precedence:
 * 1. Schema defaults (from AIAgentType.PromptParamsSchema) — lowest priority
 * 2. Agent config (from AIAgent.AgentTypePromptParams) — medium priority
 * 3. Runtime override (from ExecuteAgentParams.data.__agentTypePromptParams) — highest priority
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.131.0
 */



/**
 * Granular control over which parts of the response type definition to include.
 * When specified as an object, enables fine-grained control over type sections.
 * Sections auto-align with their corresponding documentation flags unless explicitly overridden.
 *
 * @example
 * ```typescript
 * // Minimal response type - only core fields
 * const minimal: ResponseTypeInclusionRules = {
 *     payload: false,
 *     responseForms: false,
 *     commands: false,
 *     forEach: false,
 *     while: false
 * };
 * ```
 */
export interface ResponseTypeInclusionRules {
    /**
     * Include payloadChangeRequest type definition in the response interface.
     * Auto-aligns with includePayloadInPrompt unless explicitly set.
     * @default true
     */
    payload?: boolean;

    /**
     * Include responseForm type definition in the response interface.
     * Auto-aligns with includeResponseFormDocs unless explicitly set.
     * @default true
     */
    responseForms?: boolean;

    /**
     * Include actionableCommands/automaticCommands type definitions.
     * Auto-aligns with includeCommandDocs unless explicitly set.
     * @default true
     */
    commands?: boolean;

    /**
     * Include ForEach operation in nextStep.type union and forEach property.
     * Auto-aligns with includeForEachDocs unless explicitly set.
     * @default true
     */
    forEach?: boolean;

    /**
     * Include While operation in nextStep.type union and while property.
     * Auto-aligns with includeWhileDocs unless explicitly set.
     * @default true
     */
    while?: boolean;

    /**
     * Include scratchpad field in the response interface.
     * Auto-aligns with includeScratchpadDocs unless explicitly set.
     * @default true
     */
    scratchpad?: boolean;

    /**
     * Include artifactToolCalls field in the response interface.
     * Auto-aligns with includeArtifactToolsDocs unless explicitly set.
     * @default true
     */
    artifactToolCalls?: boolean;

    /**
     * Include the pipeline field in the response interface.
     * Auto-aligns with includePipelineDocs unless explicitly set.
     * @default true
     */
    pipeline?: boolean;

    /**
     * Include decisions field in the response interface.
     * Auto-aligns with includeDecisionsDocs unless explicitly set, and so is off unless the agent
     * opts in with `includeDecisionsDocs: true`.
     * @default true
     */
    decisions?: boolean;

    /**
     * Include `'Tasks'` in the nextStep.type union and the `tasks` property.
     * Auto-aligns with `enableTaskGraphs` unless explicitly set.
     *
     * Unlike its siblings this defaults to **false**, because `enableTaskGraphs` does: an agent
     * that has not opted in must not even see the type, or the model will reach for it.
     * @default false
     */
    tasks?: boolean;
}

/**
 * Default values for ResponseTypeInclusionRules.
 * All sections default to true (include).
 */
export const DEFAULT_RESPONSE_TYPE_INCLUSION_RULES: Required<ResponseTypeInclusionRules> = {
    payload: true,
    responseForms: true,
    commands: true,
    forEach: true,
    while: true,
    scratchpad: true,
    artifactToolCalls: true,
    pipeline: true,
    decisions: true,
    // The one section that defaults OFF — see `enableTaskGraphs` (D3).
    tasks: false
};

/**
 * Configuration parameters for Loop Agent Type.
 *
 * Controls prompt content (which sections are included), client tool availability,
 * and content limits. Stored in `AIAgent.AgentTypePromptParams` as JSON.
 *
 * All boolean prompt-inclusion properties default to true (include section).
 * Set to false to exclude a section from the prompt and save tokens.
 *
 * These parameters are configured at three levels with merge precedence:
 * 1. Schema defaults (from AIAgentType.PromptParamsSchema) - lowest priority
 * 2. Agent config (from AIAgent.AgentTypePromptParams) - medium priority
 * 3. Runtime override (from ExecuteAgentParams.data.__agentTypePromptParams) - highest priority
 *
 * @example
 * ```typescript
 * // Agent configuration to disable unused features
 * const agentConfig: LoopAgentTypePromptParams = {
 *     includeForEachDocs: false,      // Agent never iterates collections
 *     includeWhileDocs: false,        // Agent never polls/retries
 *     includeResponseFormDocs: false, // Agent never collects user input
 *     includeCommandDocs: false       // Agent doesn't trigger UI actions
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Runtime override to enable a feature for a specific execution
 * const result = await agent.Execute({
 *     agent: myAgent,
 *     conversationMessages: messages,
 *     data: {
 *         __agentTypePromptParams: {
 *             includeForEachDocs: true  // Enable for this run only
 *         }
 *     }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Minimal response type with granular control
 * const minimalConfig: LoopAgentTypePromptParams = {
 *     includeResponseTypeDefinition: {
 *         payload: true,        // Keep payload in type
 *         responseForms: false, // Exclude responseForm from type
 *         commands: false,      // Exclude commands from type
 *         forEach: false,       // Exclude ForEach from nextStep.type
 *         while: false          // Exclude While from nextStep.type
 *     },
 *     includeForEachDocs: false,
 *     includeWhileDocs: false
 * };
 * ```
 */
/**
 * Where the agent's specialization (its child prompt) is placed.
 *
 * Background: the loop agent's per-iteration ("volatile") state — current date/time, Scratchpad
 * State, and the Payload — is never rendered in the system prompt. It is delivered as a single
 * framework-authored `user`-role message appended as the **final** message of the request, wrapped
 * in `<mj-runtime-state>` tags, with a static pointer in the system prompt telling the model where
 * to find it. This is not configurable: provider prompt caching is a prefix match over
 * `tools → system → messages`, and anything volatile in `system` renders ahead of the entire
 * message history, so the whole (growing) history would miss the cache on every iteration.
 * Measured on Sage, 2026-09-14: cache reads plateaued at ~21.5K tokens while uncached input grew
 * to 73K per call. Moving the volatile tail after the history lets the history cache incrementally.
 *
 * - `'auto'` (default): relocate the specialization into the trailing message ONLY if its template
 *   references a volatile placeholder (`_CURRENT_DATE*`, `_CURRENT_TIME*`, `_CURRENT_PAYLOAD`,
 *   `_SCRATCHPAD_*`). A static child prompt stays in the cached system prompt.
 * - `'systemPrompt'`: never relocate.
 * - `'trailingMessage'`: always relocate.
 *
 * Why: the OS prompt cannot control what an agent designer puts in a child prompt. Six active
 * Loop agents embed a volatile placeholder in theirs, which mutates the system prompt every
 * iteration from a position ahead of the catalogs and the whole history — moving the runtime-state
 * tail does nothing for them. Measured (Gemini 2.5 Flash, volatile specialization): keeping it in
 * the system prompt caches 19%; relocating it caches 70%. For a STATIC child prompt, relocation
 * costs ≈3,100 uncached tokens per call for nothing, hence `'auto'`. Decided once per run so the
 * layout never flips mid-run. Resolved through {@link ResolveSpecializationPlacement}.
 */
export type SpecializationPlacement = 'auto' | 'systemPrompt' | 'trailingMessage';

/**
 * How the trailing runtime-state message is carried across loop iterations.
 *
 * Background: the fragment described under {@link SpecializationPlacement} is rebuilt every
 * iteration. Providers with block-level or sliding prefix caches (Anthropic, Gemini, Cerebras) are
 * happiest when the previous iteration's fragment is REPLACED, so the history stays compact.
 * OpenAI's automatic cache is different: it reuses a prior request only when that request's
 * entire prompt is a byte prefix of the new one, so replacing the fragment breaks the prefix
 * right after the system prompt and caps the cached share at the system prompt (~22% measured).
 * Retaining prior fragments and APPENDING the new one makes each request an exact prefix
 * extension of the last (~93% measured).
 *
 * - `'auto'` (default): append-only when the model catalog says the serving path's cache is a
 *   byte-prefix cache — the `PrefixPromptCache` flag in `ModelConfiguration.LLM`, resolved
 *   through the catalog cascade (Model Types < Models < Vendors' `Configuration.ModelDefaults` <
 *   Model Vendors: the vendor's defaults beat the model's own bag and the inference provider's
 *   model-vendor row is the tie-breaker) is `true` — otherwise replace-in-place. Nothing about a
 *   provider is hard-coded: a new host, or one model on a host that caches differently from the
 *   rest, is a metadata change. The answer is taken from a runtime model override, else the FIRST
 *   iteration's model selection, and then frozen for the rest of the run so a failover cannot flip
 *   the layout mid-run. On turn 1, before any selection is known, the layout is replace-in-place;
 *   if turn 2 resolves to append-only, turn 1's fragment is restored at the turn-1 boundary, so
 *   deferring loses nothing. The prompt's bound models are deliberately not consulted: prompts
 *   commonly bind several vendors for failover.
 * - `'appendOnly'`: always retain prior fragments. Use this for a serving path whose catalog rows
 *   carry no flag yet — an OpenAI-compatible gateway, say — until its metadata is filled in.
 * - `'replace'`: always replace. Use this to keep context compact on a run whose catalog rows say
 *   `true` but where context growth matters more than cache hits.
 *
 * Resolved by `BaseAgent.shouldUseAppendOnlyTrailingState` via `BaseAgent.resolvePrefixPromptCache`.
 */
export type TrailingStateMode = 'auto' | 'appendOnly' | 'replace';

export interface LoopAgentTypePromptParams {
    // === Section Inclusion Flags ===

    /**
     * Control response type definition inclusion in the prompt.
     *
     * - `undefined` or object with all defaults: Include full type definition
     * - Object with granular rules: Include specific sections based on rules
     *   - Sections auto-align with their corresponding docs flags unless explicitly set
     *   - e.g., if includeForEachDocs=false and forEach not set, forEach type is excluded
     *
     * @default { payload: true, responseForms: true, commands: true, forEach: true, while: true }
     */
    includeResponseTypeDefinition?: ResponseTypeInclusionRules;

    /**
     * Include ForEach operation documentation and examples.
     * ForEach enables efficient batch processing of collections
     * (e.g., processing all items in an array with a single LLM decision).
     * Disable for agents that never need to iterate over collections.
     * @default true
     */
    includeForEachDocs?: boolean;

    /**
     * Include While operation documentation and examples.
     * While loops enable polling, retrying, and conditional iteration
     * (e.g., waiting for a job to complete).
     * Disable for agents that never need polling or conditional loops.
     * @default true
     */
    includeWhileDocs?: boolean;

    /**
     * Include response form documentation for collecting user input.
     * Response forms allow agents to request specific information from users
     * via text fields, dropdowns, buttons, etc.
     * Disable for agents that only output results and never need user input.
     * @default true
     */
    includeResponseFormDocs?: boolean;

    /**
     * Include actionable/automatic commands documentation.
     * Actionable commands create clickable buttons (e.g., 'Open Record'),
     * automatic commands trigger UI updates (e.g., refresh cache, show notification).
     * Disable for agents that don't need to provide navigation or trigger UI actions.
     * @default true
     */
    includeCommandDocs?: boolean;

    /**
     * Include message expansion documentation.
     * Message expansion allows agents to request full content from previously
     * compacted messages.
     * Disable for agents that don't use message compaction or don't need to
     * access compacted content.
     * @default true
     */
    includeMessageExpansionDocs?: boolean;

    /**
     * Include variable references documentation (payload.*, item.*, etc).
     * These explain how to reference data in action parameters and loop contexts.
     * Disable if agent has custom examples showing variable usage patterns.
     * @default true
     */
    includeVariableRefsDocs?: boolean;

    /**
     * Include the current payload state in the prompt.
     * The payload is the agent's working memory that persists across iterations.
     * Disable for agents that don't use the payload pattern or work purely from
     * conversation context. Can save significant tokens for agents with large payloads.
     * @default true
     */
    includePayloadInPrompt?: boolean;

    /**
     * Include current date, time, and day of week in the prompt.
     * Provides the LLM with accurate temporal context so it doesn't hallucinate
     * dates or claim it doesn't know the current time.
     * Disable for agents where temporal context is irrelevant.
     * @default true
     */
    includeDateTimeInPrompt?: boolean;

    /**
     * Include scratchpad documentation and current scratchpad state in the prompt.
     * The scratchpad is private working memory for notes and task tracking.
     * Disable for agents that don't need internal task management or reasoning notes.
     * @default true
     */
    includeScratchpadDocs?: boolean;

    /**
     * Where the child prompt goes: `'auto'` relocates it into the trailing runtime-state message only
     * when its template is volatile; `'systemPrompt'` never; `'trailingMessage'` always.
     * See {@link SpecializationPlacement}.
     * @default 'auto'
     */
    specializationPlacement?: SpecializationPlacement;

    /**
     * How the trailing runtime-state message is carried across iterations: `'auto'` appends for
     * OpenAI and replaces otherwise; `'appendOnly'` and `'replace'` force one behaviour.
     * See {@link TrailingStateMode}.
     * @default 'auto'
     */
    trailingStateMode?: TrailingStateMode;

    /**
     * Maximum number of tasks allowed in the scratchpad task list.
     * When exceeded, completed tasks are auto-pruned oldest first.
     * @default 50
     */
    scratchpadMaxTasks?: number;

    /**
     * Include artifact tools documentation and artifact manifest in the prompt.
     * Artifact tools allow agents to explore input artifacts on demand.
     * Only emitted when artifacts are present in the run.
     * Disable for agents that never work with artifacts.
     * @default true
     */
    includeArtifactToolsDocs?: boolean;

    /**
     * Include conversation-history retrieval tool documentation in the prompt (the
     * `_CONVERSATION_TOOLS` block). Only emitted when the run has a conversationId —
     * these tools page exact pre-summary messages back in by their persisted Sequence
     * handles. Disable for agents that should never dig into conversation history.
     * @default true
     */
    includeConversationToolsDocs?: boolean;

    /**
     * Include tool-pipeline documentation in the prompt (the `_PIPELINE_TOOLS` block).
     * Only emitted when at least one pipeline source — an Action or artifact tool — is available.
     * Disable for agents that should never compose pipelines.
     * @default true
     */
    includePipelineDocs?: boolean;

    /**
     * Teach the model to request inline decisions: the `decisions` docs, and the field in the
     * response type. Opt-in: anything but `true` leaves both out. They add about 1,200 tokens to every
     * turn, and on the Prompt Eval corpus no model used them (typed-decision plan, Task 4.7).
     * @default false
     */
    includeDecisionsDocs?: boolean;

    /**
     * Maximum number of items to process when `forEachItemIn` is used.
     * Items beyond this limit are truncated. `decisionsMaxCallsPerTurn` can cut a request shorter.
     * @default 100
     */
    decisionsMaxItems?: number;

    /**
     * Maximum number of decision requests answered from one agent turn. Requests beyond this
     * limit are not run; each gets a failed result saying why.
     * @default MAX_DECISION_REQUESTS_PER_TURN (8)
     */
    decisionsMaxRequests?: number;

    /**
     * Maximum number of decision calls one agent turn's requests make in total, counting every
     * `forEachItemIn` item. The budget is handed out in request order before any call is made. A
     * `forEachItemIn` request it cuts short asks its first items and reports the rest in
     * `skippedCount`. A request it leaves no calls for is not run, and gets a failed result saying why.
     * 0 turns decision calls off: every request gets a failed result that says so, and does not
     * invite the agent to ask again.
     * @default MAX_DECISION_CALLS_PER_TURN (100)
     */
    decisionsMaxCallsPerTurn?: number;

    /**
     * Name of the decision prompt used for evaluating decisions.
     * @default 'Default Decision'
     */
    decisionPromptName?: string;

    /**
     * Check the agent's own payload changes that the payload analyzer flags as needing feedback
     * (large truncations, removed keys, type changes). Each flagged change becomes one Likelihood
     * ("was this change intended?"), all asked in one decision call with the `decisionPromptName`
     * prompt and recorded as a `Payload change check` Decision step. The changes judged unintended
     * are listed on the agent's next turn, which asks it to confirm or restore them.
     *
     * A change is never reverted or blocked automatically: the agent decides. When the decision
     * fails or takes longer than 30 seconds, every change is accepted, as it is when this is off. A
     * step that ends the run (`Success`, `Chat`, or any step that terminates) is not checked, since
     * no turn would read the result.
     *
     * Off by default: each check costs an extra decision call.
     * @default false
     */
    payloadFeedbackCheck?: boolean;

    /**
     * Allow this agent to emit durable task graphs (`nextStep.type === 'Tasks'`).
     *
     * **Defaults to false, unlike every other flag here, and is enforced rather than advisory.**
     * The other flags only shape the prompt: turning one off saves tokens, and an agent that
     * ignores the omission and emits the feature anyway still works. This one is a capability
     * gate. A task graph creates durable Task rows that outlive the run, execute on a server-side
     * dispatcher under the submitting user, and can spawn further agent runs — so an agent
     * acquiring that reach through prompt drift rather than through deliberate configuration is a
     * real problem, not a token-budget one. `LoopAgentType` therefore *rejects* a `'Tasks'` step
     * from a disabled agent with a corrective, on top of omitting the type from the prompt.
     *
     * Rollout is per-agent (D3): the launch opt-ins are Sage, Query Builder, and the Research
     * Agent + its sub-agents, declared in their `AgentTypePromptParams` metadata.
     *
     * @default false
     */
    enableTaskGraphs?: boolean;

    // === Content Limiting ===

    /**
     * Catalog narrowing for sub-agents (plan Task 3.7).
     * -1 or 0 = include all (default: narrowing is off)
     * N = when the agent has more than N sub-agents, describe the N most useful for the run's opening
     *     request, judged once per run by one decision call, plus any with MinExecutionsPerRun set.
     *     The list starts with a line naming the sub-agents it hides.
     * Narrowing only hides: every permitted sub-agent can still be called by name, `subAgentCount`
     * still counts them all, and a failed decision shows them all.
     * Narrowing is prose-only: it shortens the described list, never the native tool set. With native
     * tool calling under implicit control flow, every sub-agent is still declared as a
     * `delegate_to_` tool, since a call to an undeclared tool is refused.
     * @default -1
     */
    maxSubAgentsInPrompt?: number;

    /**
     * Catalog narrowing for actions and skills (plan Task 3.7).
     * -1 or 0 = include all (default: narrowing is off)
     * N = when the agent has more than N actions (or skills), describe the N most useful for the
     *     run's opening request, judged once per run by one decision call, plus any action with
     *     MinExecutionsPerRun set and Find Candidate Actions / Find Candidate Agents. Each narrowed
     *     list starts with a line saying how many it hides and how to reach them: hidden skills are
     *     named, and hidden actions are found with Find Candidate Actions, so actions are narrowed
     *     only when the agent has that action (skills still are).
     * Narrowing only hides: every permitted action can still be called, `actionCount` and
     * `skillCount` still count them all, and a failed decision shows them all.
     * Narrowing is prose-only: it shortens the described list, never the native tool set. With native
     * tool calling, every action is still declared as a tool, since a call to an undeclared tool is
     * refused and that mode has no `Actions` step to fall back on.
     * @default -1
     */
    maxActionsInPrompt?: number;

    /**
     * Decision discovery (plan Task 3.1): suggest the agent to delegate to before the first prompt.
     * When true, and the run answers its conversation's opening request (its messages hold one user
     * message) without @mentioning an agent, one decision call runs once per run, in parallel with the
     * rest of pre-execution. It asks which of the agents the user may run (the Find Candidate Agents
     * set, minus this agent, and only those the host's `ALL_AVAILABLE_AGENTS` allows when it sends
     * one) should handle the request, and whether the request needs a specialist at all. When both
     * answers are confident it adds a `<suggested_agent>` system message to the first prompt, so the
     * agent can delegate in its first turn instead of calling Find Candidate Agents first. Otherwise,
     * and on any error, timeout or cancellation, the prompt is unchanged. A follow-up turn is never
     * asked about, so a suggestion never pulls the agent away from one it has already engaged, and
     * fewer than three candidate agents ask nothing.
     * @default false
     */
    decisionDiscovery?: boolean;
}

/**
 * The most decision requests answered from one agent turn, unless `decisionsMaxRequests` overrides
 * it. Each request can itself make up to `decisionsMaxItems` calls through `forEachItemIn`, so the
 * total number of calls is bounded separately, by {@link MAX_DECISION_CALLS_PER_TURN}.
 */
export const MAX_DECISION_REQUESTS_PER_TURN = 8;

/**
 * The most decision calls one agent turn's requests make in total, counting every `forEachItemIn`
 * item, unless `decisionsMaxCallsPerTurn` overrides it. Without it, 8 requests of 100 items each
 * could send 800 calls, each with its own step and prompt run, before the run's cost guardrails
 * (checked between steps) could stop them.
 */
export const MAX_DECISION_CALLS_PER_TURN = 100;

/**
 * Default values for LoopAgentTypePromptParams.
 * Section flags default to true (include) and the prompt-content limits to -1 (include all); the
 * TSDoc on each property gives its own default.
 */
export const DEFAULT_LOOP_AGENT_PROMPT_PARAMS: Required<LoopAgentTypePromptParams> = {
    includeResponseTypeDefinition: { ...DEFAULT_RESPONSE_TYPE_INCLUSION_RULES },
    includeForEachDocs: true,
    includeWhileDocs: true,
    includeResponseFormDocs: true,
    includeCommandDocs: true,
    includeMessageExpansionDocs: true,
    includeVariableRefsDocs: true,
    includePayloadInPrompt: true,
    includeDateTimeInPrompt: true,
    includeScratchpadDocs: true,
    specializationPlacement: 'auto',
    trailingStateMode: 'auto',
    scratchpadMaxTasks: 50,
    includeArtifactToolsDocs: true,
    includeConversationToolsDocs: true,
    includePipelineDocs: true,
    includeDecisionsDocs: false,
    decisionsMaxItems: 100,
    decisionsMaxRequests: MAX_DECISION_REQUESTS_PER_TURN,
    decisionsMaxCallsPerTurn: MAX_DECISION_CALLS_PER_TURN,
    decisionPromptName: 'Default Decision',
    // Off: an opt-in check that costs a decision call per flagged payload change.
    payloadFeedbackCheck: false,
    // Deliberately false — a capability gate, not a token-savings flag (D3).
    enableTaskGraphs: false,
    maxSubAgentsInPrompt: -1,
    maxActionsInPrompt: -1,
    decisionDiscovery: false
};
