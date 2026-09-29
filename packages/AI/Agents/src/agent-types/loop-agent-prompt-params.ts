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
     * Auto-aligns with includeDecisionsDocs unless explicitly set.
     * @default true
     */
    decisions?: boolean;

    /**
     * Include finishIf field in the nextStep response interface.
     * Auto-aligns with includeFinishIfDocs unless explicitly set.
     * @default true
     */
    finishIf?: boolean;

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
    finishIf: true,
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
     * Include decision-making documentation in the prompt.
     * Disable for agents that should never request inline decisions.
     * @default true
     */
    includeDecisionsDocs?: boolean;

    /**
     * Maximum number of items to process when `forEachItemIn` is used.
     * Items beyond this limit are truncated.
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
     * Name of the decision prompt used for evaluating decisions.
     * @default 'Default Decision'
     */
    decisionPromptName?: string;

    /**
     * Include conditional completion (finishIf) documentation in the prompt.
     * Disable for agents that should never request inline completion gates.
     * @default true
     */
    includeFinishIfDocs?: boolean;

    /**
     * Probability threshold (0.0 to 1.0) required for each finishIf question to pass.
     * If all questions evaluate to a probability >= this threshold, the agent completes immediately.
     * @default 0.9
     */
    finishIfThreshold?: number;

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
     * N = when the agent has more than N sub-agents, show the N most useful for the run's opening
     *     request, judged once per run by one decision call, plus any with MinExecutionsPerRun set.
     * Narrowing only hides: every permitted sub-agent can still be called, and a failed decision
     * shows them all.
     * @default -1
     */
    maxSubAgentsInPrompt?: number;

    /**
     * Catalog narrowing for actions and skills (plan Task 3.7).
     * -1 or 0 = include all (default: narrowing is off)
     * N = when the agent has more than N actions (or skills), show the N most useful for the run's
     *     opening request, judged once per run by one decision call, plus any action with
     *     MinExecutionsPerRun set and Find Candidate Actions / Find Candidate Agents.
     * Narrowing only hides: every permitted action can still be called, and a failed decision shows
     * them all.
     * @default -1
     */
    maxActionsInPrompt?: number;

    /**
     * Decision discovery (plan Task 3.1): suggest the agent to delegate to before the first prompt.
     * When true, and the run's opening request does not @mention an agent, one decision call runs
     * once per run, in parallel with the rest of pre-execution. It asks which of the agents the user
     * may run (the Find Candidate Agents set, minus this agent, and only those the host's
     * `ALL_AVAILABLE_AGENTS` allows when it sends one) should handle the request, and whether the
     * request needs a specialist at all. When both answers are confident it adds a
     * `<suggested_agent>` system message to the first prompt, so the agent can delegate in its first
     * turn instead of calling Find Candidate Agents first. Otherwise, and on any error or timeout, the
     * prompt is unchanged.
     * @default false
     */
    decisionDiscovery?: boolean;
}

/**
 * The most decision requests answered from one agent turn, unless `decisionsMaxRequests` overrides
 * it. Each request can itself make up to `decisionsMaxItems` calls through `forEachItemIn`, so this
 * bounds how many decision calls one turn can start.
 */
export const MAX_DECISION_REQUESTS_PER_TURN = 8;

/**
 * Default values for LoopAgentTypePromptParams.
 * All section flags default to true (include), limits default to -1 (include all).
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
    scratchpadMaxTasks: 50,
    includeArtifactToolsDocs: true,
    includeConversationToolsDocs: true,
    includePipelineDocs: true,
    includeDecisionsDocs: true,
    decisionsMaxItems: 100,
    decisionsMaxRequests: MAX_DECISION_REQUESTS_PER_TURN,
    decisionPromptName: 'Default Decision',
    includeFinishIfDocs: true,
    finishIfThreshold: 0.9,
    // Deliberately false — a capability gate, not a token-savings flag (D3).
    enableTaskGraphs: false,
    maxSubAgentsInPrompt: -1,
    maxActionsInPrompt: -1,
    decisionDiscovery: false
};
