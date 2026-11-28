/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IAgentConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in AICorePlus to refresh.
 */

/**
 * Unified typed AI Agent configuration bag stored across the 3-table settings cascade:
 *   - `MJ: AI Agents.Configuration`
 *   - `MJ: AI Agent Categories.DefaultConfiguration`
 *   - `MJ: AI Agent Types.DefaultAgentConfiguration`
 *
 * Resolution precedence:
 *   Instance -> BaseAgent Chain (root..leaf) -> Category -> Parent Categories -> AgentType -> System Default
 *
 * Narrow-only security invariants (`supportsPlanMode`, `requirePlanMode`, `skills.activationMode`,
 * `scope.searchScopeAccess`, `clientTools.allowEphemeral`, `attachments.acceptUnregisteredFiles`,
 * and numeric execution/consult ceilings) can never be loosened down the chain or via category/type
 * defaults.
 *
 * **Single source of truth**: this file is canonical for both CodeGen (`MJCoreEntities`) and
 * `@memberjunction/ai-core-plus`, which auto-copies it into
 * `packages/AI/CorePlus/src/JSONType-interfaces/` during `prebuild`
 * (`npm run sync:json-types`). Do not maintain separate physical copies.
 */
export interface IAgentConfiguration {
    /**
     * Core execution, planning, model selection, and tool-calling protocol settings.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    execution?: {
        /**
         * Controls which model selection hierarchy is consulted for the agent's prompts:
         * - `'Agent'`: uses the agent's own prompt/model bindings.
         * - `'Agent Type'`: defers to the agent type's default prompt model selection.
         *
         * When a derived agent owns no active prompts, resolution falls back to the nearest
         * prompt-owning ancestor before category/type defaults. Default: `'Agent Type'`.
         * Supersedes `AIAgent.ModelSelectionMode`.
         */
        modelSelectionMode?: 'Agent' | 'Agent Type' | null;

        /**
         * Default reasoning / thinking effort level (typically `1`–`100`, where higher values
         * allocate more model reasoning budget) applied to prompt runs when neither the caller
         * nor the prompt overrides it. `null` leaves effort selection to the prompt or model
         * default. Supersedes `AIAgent.DefaultPromptEffortLevel`.
         */
        defaultPromptEffortLevel?: number | null;

        /**
         * Determines how `BaseAgent` handles a plain conversational chat response when a
         * structured action or completion was expected:
         * - `'Consult'`: escalates to the parent agent or user for clarification.
         * - `'Failed'`: marks the run as failed.
         * - `'Retry'`: re-prompts the agent to produce a valid structured response.
         * - `'Success'`: accepts the chat message as a valid completion.
         *
         * `null` uses the runtime default. Supersedes `AIAgent.ChatHandlingOption`.
         */
        chatHandlingOption?: 'Consult' | 'Failed' | 'Retry' | 'Success' | null;

        /**
         * Whether the agent is permitted to enter structured plan mode before executing actions.
         * **Narrow-only security invariant** (monotonic logical `AND` down the `BaseAgentID` chain
         * and defaults cascade): once `false` on an ancestor, category, or agent type, descendants
         * cannot re-enable it. Default: `true`. Supersedes `AIAgent.SupportsPlanMode`.
         */
        supportsPlanMode?: boolean | null;

        /**
         * Whether the agent must produce and have a plan approved before executing actions.
         * **Narrow-only security invariant** (monotonic logical `OR` down the `BaseAgentID` chain
         * and defaults cascade): once `true` on an ancestor, category, or agent type, descendants
         * cannot disable it. Default: `false`. Supersedes `AIAgent.RequirePlanMode`.
         */
        requirePlanMode?: boolean | null;

        /**
         * When `true`, exposes available actions to the underlying LLM as native provider
         * function/tool declarations rather than relying solely on JSON-in-prompt action
         * instructions. Default: `true`. Supersedes `AIAgent.DeclareActionsAsNativeTools`.
         */
        declareActionsAsNativeTools?: boolean | null;
    } | null;

    /**
     * Context window sizing, token-budget compaction thresholds, and legacy message-count
     * compression settings. Also configurable at the agent-type tier via
     * `AIAgentType.DefaultAgentConfiguration.contextWindow`.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    contextWindow?: {
        /**
         * Enables legacy message-count-based context compression during long agent runs.
         * Default: `false`. Supersedes `AIAgent.EnableContextCompression`.
         */
        enableCompression?: boolean | null;

        /**
         * Minimum number of messages in the conversation/step history before legacy context
         * compression triggers. `null` inherits from category/agent type or disables
         * message-count-triggered compression. Supersedes
         * `AIAgent.ContextCompressionMessageThreshold` and
         * `AIAgentType.ContextCompressionMessageThreshold`.
         */
        compressionMessageThreshold?: number | null;

        /**
         * Foreign key UUID (`MJ: AI Prompts.ID`) of the prompt executed to compress older
         * messages when legacy context compression runs. `null` uses the inherited or system
         * default compression prompt. Supersedes `AIAgent.ContextCompressionPromptID` and
         * `AIAgentType.ContextCompressionPromptID`.
         */
        compressionPromptID?: string | null;

        /**
         * Number of most-recent messages kept verbatim (uncompressed) whenever legacy context
         * compression summarizes older history. `null` uses the inherited or system default
         * retention count. Supersedes `AIAgent.ContextCompressionMessageRetentionCount` and
         * `AIAgentType.ContextCompressionMessageRetentionCount`.
         */
        compressionMessageRetentionCount?: number | null;

        /**
         * Maximum token budget targeted for the agent's active context window before automatic
         * compaction runs. `null` defers to the category, agent type, or underlying model limit.
         * Supersedes `AIAgent.ContextWindowMaxTokens` and `AIAgentType.ContextWindowMaxTokens`.
         */
        maxTokens?: number | null;

        /**
         * Percentage (`0`–`100`) of `maxTokens` at which automatic token-budget context
         * compaction triggers. `null` uses the inherited or system default trigger threshold.
         * Supersedes `AIAgent.CompactionTriggerPercent` and
         * `AIAgentType.CompactionTriggerPercent`.
         */
        compactionTriggerPercent?: number | null;

        /**
         * Target context utilization percentage (`0`–`100`, lower than `compactionTriggerPercent`)
         * that automatic compaction aims to reduce the active context window down to. `null` uses
         * the inherited or system default target. Supersedes `AIAgent.CompactionTargetPercent`
         * and `AIAgentType.CompactionTargetPercent`.
         */
        compactionTargetPercent?: number | null;

        /**
         * Foreign key UUID (`MJ: AI Prompts.ID`) of the prompt used to generate conversation or
         * run summaries during token-budget compaction. `null` uses the inherited or system
         * default summary prompt. Supersedes `AIAgent.ConversationSummaryPromptID` and
         * `AIAgentType.ConversationSummaryPromptID`.
         */
        summaryPromptID?: string | null;
    } | null;

    /**
     * Notes and few-shot examples memory injection, retention lifecycle, write access, and
     * semantic reranker settings.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    memory?: {
        /**
         * When `true`, injects matching `MJ: AI Agent Notes` records into the agent's prompt
         * context at run start. Default: `true`. Supersedes `AIAgent.InjectNotes`.
         */
        injectNotes?: boolean | null;

        /**
         * Maximum number of agent notes injected into a single run's context when `injectNotes`
         * is enabled. Default: `5` (setting `null` resets the legacy NOT NULL column to `5`).
         * Supersedes `AIAgent.MaxNotesToInject`.
         */
        maxNotesToInject?: number | null;

        /**
         * Selection strategy for choosing which notes are injected:
         * - `'All'`: includes all eligible notes up to `maxNotesToInject`.
         * - `'Recent'`: prioritizes the most recently created or updated notes.
         * - `'Relevant'`: ranks notes by semantic/contextual similarity to the current task.
         *
         * Supersedes `AIAgent.NoteInjectionStrategy`.
         */
        noteInjectionStrategy?: 'All' | 'Recent' | 'Relevant' | null;

        /**
         * When `true`, injects matching `MJ: AI Agent Examples` few-shot records into the agent's
         * prompt context. Default: `false`. Supersedes `AIAgent.InjectExamples`.
         */
        injectExamples?: boolean | null;

        /**
         * Maximum number of few-shot examples injected into a single run's context when
         * `injectExamples` is enabled. Default: `3` (setting `null` resets the legacy NOT NULL
         * column to `3`). Supersedes `AIAgent.MaxExamplesToInject`.
         */
        maxExamplesToInject?: number | null;

        /**
         * Ranking strategy for choosing which few-shot examples are injected:
         * - `'Rated'`: prioritizes highest-rated examples.
         * - `'Recent'`: prioritizes most recently created or updated examples.
         * - `'Semantic'`: ranks examples by embedding similarity to the current request.
         *
         * Supersedes `AIAgent.ExampleInjectionStrategy`.
         */
        exampleInjectionStrategy?: 'Rated' | 'Recent' | 'Semantic' | null;

        /**
         * Number of days before eligible agent notes age out for archiving/cleanup. `null`
         * disables age-based note expiration. Supersedes `AIAgent.NoteRetentionDays`.
         */
        noteRetentionDays?: number | null;

        /**
         * Number of days before eligible agent examples age out for archiving/cleanup. `null`
         * disables age-based example expiration. Supersedes `AIAgent.ExampleRetentionDays`.
         */
        exampleRetentionDays?: number | null;

        /**
         * When `true`, enables automatic archiving of expired or superseded agent notes and
         * examples according to `noteRetentionDays` and `exampleRetentionDays`. Default: `true`.
         * Supersedes `AIAgent.AutoArchiveEnabled`.
         */
        autoArchiveEnabled?: boolean | null;

        /**
         * Controls whether the agent is permitted to create, update, or persist new memory records
         * (notes/examples) during execution. Default: `true`. Supersedes
         * `AIAgent.AllowMemoryWrite`.
         */
        allowMemoryWrite?: boolean | null;

        /**
         * Optional structured configuration object for the memory reranker (for example enabled
         * flag, reranker model/provider selection, top-K cutoff, and minimum score threshold).
         * `null` disables custom reranker settings. Supersedes `AIAgent.RerankerConfiguration`.
         */
        reranker?: { [key: string]: unknown } | null;
    } | null;

    /**
     * Payload path scoping (downstream, upstream, and self read/write isolation) and
     * starting/final JSON Schema payload validation settings.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    payload?: {
        /**
         * JSON path patterns defining which fields from a parent agent's payload are passed
         * downstream into this agent when invoked as a sub-agent (for example `['*']` for full
         * visibility or `['customer.*', 'orderId']`). Setting `null` resets the legacy NOT NULL
         * column to `'["*"]'`. Supersedes `AIAgent.PayloadDownstreamPaths`.
         */
        downstreamPaths?: string[] | null;

        /**
         * JSON path patterns defining which payload fields this sub-agent is permitted to merge
         * back upstream into the parent agent's payload upon completion (for example `['*']` or
         * `['analysis.summary']`). Setting `null` resets the legacy NOT NULL column to `'["*"]'`.
         * Supersedes `AIAgent.PayloadUpstreamPaths`.
         */
        upstreamPaths?: string[] | null;

        /**
         * Optional JSON path patterns restricting which portions of its own payload the agent's
         * prompts may read. `null` imposes no additional self-read restriction. Supersedes
         * `AIAgent.PayloadSelfReadPaths`.
         */
        selfReadPaths?: string[] | null;

        /**
         * Optional JSON path patterns restricting which portions of its own payload the agent may
         * mutate via payload change requests. `null` imposes no additional self-write restriction.
         * Supersedes `AIAgent.PayloadSelfWritePaths`.
         */
        selfWritePaths?: string[] | null;

        /**
         * Optional dot-delimited root path within the parent payload where this sub-agent's scoped
         * view is anchored (for example `'research'` mounts `parentPayload.research` as the
         * sub-agent's root payload). `null` operates at the payload root. Supersedes
         * `AIAgent.PayloadScope`.
         */
        scope?: string | null;

        /**
         * Optional JSON Schema string used to validate the incoming payload before execution
         * starts. `null` disables starting payload validation. Supersedes
         * `AIAgent.StartingPayloadValidation`.
         */
        startingValidationSchema?: string | null;

        /**
         * Behavior when the incoming payload fails `startingValidationSchema`:
         * - `'Fail'`: aborts execution immediately with a validation error.
         * - `'Warn'`: logs a warning and continues execution.
         *
         * Supersedes `AIAgent.StartingPayloadValidationMode`.
         */
        startingValidationMode?: 'Fail' | 'Warn' | null;

        /**
         * Optional JSON Schema string used to validate the agent's final output payload before
         * marking the run complete. `null` disables final payload validation. Supersedes
         * `AIAgent.FinalPayloadValidation`.
         */
        finalValidationSchema?: string | null;

        /**
         * Behavior when the final output payload fails `finalValidationSchema`:
         * - `'Fail'`: fails the run immediately.
         * - `'Retry'`: feeds validation errors back to the agent up to `finalValidationMaxRetries`
         *   times to self-correct.
         * - `'Warn'`: logs a warning and accepts the payload.
         *
         * Supersedes `AIAgent.FinalPayloadValidationMode`.
         */
        finalValidationMode?: 'Fail' | 'Retry' | 'Warn' | null;

        /**
         * Maximum number of self-correction retry attempts allowed when `finalValidationMode` is
         * `'Retry'`. Default: `3` (setting `null` resets the legacy NOT NULL column to `3`).
         * Supersedes `AIAgent.FinalPayloadValidationMaxRetries`.
         */
        finalValidationMaxRetries?: number | null;
    } | null;

    /**
     * Sub-agent invocation concurrency mode, per-run execution count bounds, and parent-child
     * consultation round ceiling.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    subAgentExecution?: {
        /**
         * Controls whether multiple sub-agent invocations dispatched in a single step execute
         * concurrently (`'Parallel'`) or one after another (`'Sequential'`). Supersedes
         * `AIAgent.ExecutionMode`.
         */
        mode?: 'Parallel' | 'Sequential' | null;

        /**
         * Optional minimum number of times this sub-agent should be executed within a parent run.
         * `null` imposes no minimum execution count. Supersedes `AIAgent.MinExecutionsPerRun`.
         */
        minExecutionsPerRun?: number | null;

        /**
         * Maximum number of times this sub-agent may be invoked within a single parent run.
         * **Narrow-only ceiling invariant** (clamped via `Math.min` across defaults and
         * `BaseAgentID` ancestors): descendants may lower the cap, never raise it. `null` leaves
         * the cap unconstrained at this tier. Supersedes `AIAgent.MaxExecutionsPerRun`.
         */
        maxExecutionsPerRun?: number | null;

        /**
         * Maximum number of back-and-forth consultation rounds allowed between a parent agent and
         * this sub-agent during a single invocation. **Narrow-only ceiling invariant** (clamped
         * via `Math.min` across defaults and `BaseAgentID` ancestors). `null` uses the inherited
         * or system default ceiling. Supersedes `AIAgent.MaxSubAgentConsultRounds`.
         */
        maxConsultRounds?: number | null;
    } | null;

    /**
     * Conversation message windowing, attachment storage path, inline threshold, and unregistered
     * file policy.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    attachments?: {
        /**
         * Controls which prior conversation messages are passed into the agent:
         * - `'All'`: passes the entire conversation history.
         * - `'Bookend'`: retains the opening and most-recent messages up to `maxMessages`.
         * - `'Latest'`: retains only the most-recent `maxMessages`.
         * - `'None'`: omits prior conversation messages.
         *
         * Supersedes `AIAgent.MessageMode`.
         */
        messageMode?: 'All' | 'Bookend' | 'Latest' | 'None' | null;

        /**
         * Maximum number of conversation messages included when `messageMode` is `'Bookend'` or
         * `'Latest'`. `null` imposes no explicit message-count cap. Supersedes
         * `AIAgent.MaxMessages`.
         */
        maxMessages?: number | null;

        /**
         * Optional storage root path or prefix under the agent's storage account where
         * conversation and run attachments are stored. `null` uses the storage provider or system
         * default path. Supersedes `AIAgent.AttachmentRootPath`.
         */
        rootPath?: string | null;

        /**
         * Size threshold in bytes below which attachments may be stored or transmitted inline
         * rather than offloaded to external blob storage. `null` uses the system default
         * threshold. Supersedes `AIAgent.InlineStorageThresholdBytes`.
         */
        inlineStorageThresholdBytes?: number | null;

        /**
         * Whether the agent accepts file attachments that have not been registered as tracked MJ
         * file or artifact records. **Narrow-only security invariant** (monotonic logical `AND`
         * down the `BaseAgentID` chain and defaults cascade): once `false` on an ancestor or
         * default tier, descendants cannot re-enable it. Default: `false`. Supersedes
         * `AIAgent.AcceptUnregisteredFiles`.
         */
        acceptUnregisteredFiles?: boolean | null;
    } | null;

    /**
     * Output artifact creation lifecycle and optional default artifact type binding.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    artifacts?: {
        /**
         * Controls when outputs from this agent are persisted as `MJ: Artifacts` records:
         * - `'Always'`: creates user-visible artifacts for eligible outputs.
         * - `'Never'`: disables artifact creation.
         * - `'System Only'`: creates internal system-scoped artifacts hidden from end users.
         *
         * Supersedes `AIAgent.ArtifactCreationMode`.
         */
        creationMode?: 'Always' | 'Never' | 'System Only' | null;

        /**
         * Optional foreign key UUID (`MJ: Artifact Types.ID`) specifying the default artifact type
         * assigned when this agent creates artifacts without an explicit type override. `null`
         * defers to inference or the system default type. Supersedes
         * `AIAgent.DefaultArtifactTypeID`.
         */
        defaultArtifactTypeID?: string | null;
    } | null;

    /**
     * Search-scope visibility policy and secondary scope dimension configuration.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    scope?: {
        /**
         * Controls which search scopes the agent can query:
         * - `'All'`: permits querying all scopes visible to the invoking user.
         * - `'Assigned'`: restricts queries to scopes explicitly assigned to the agent.
         * - `'None'`: disables search-scope access.
         *
         * **Narrow-only security invariant** (`All` > `Assigned` > `None` down the `BaseAgentID`
         * chain): descendants can narrow scope access, never widen it. Supersedes
         * `AIAgent.SearchScopeAccess`.
         */
        searchScopeAccess?: 'All' | 'Assigned' | 'None' | null;

        /**
         * Optional structured JSON configuration defining secondary scope filtering dimensions
         * (such as tenant, workspace, or domain-specific entity filters) applied during execution.
         * `null` applies no secondary scope rules. Supersedes `AIAgent.ScopeConfig`.
         */
        secondaryScopeConfig?: { [key: string]: unknown } | null;
    } | null;

    /**
     * Skill discovery and activation behavior.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    skills?: {
        /**
         * Controls how skills available to the agent are activated:
         * - `'Auto'`: allows the agent to autonomously activate matching skills based on context.
         * - `'RequestedOnly'`: restricts activation to skills explicitly requested by the user or
         *   caller.
         *
         * **Narrow-only security invariant** (`Auto` -> `RequestedOnly` down the `BaseAgentID`
         * chain): once narrowed to `'RequestedOnly'`, descendants cannot widen back to `'Auto'`.
         * Supersedes `AIAgent.SkillActivationMode`.
         */
        activationMode?: 'Auto' | 'RequestedOnly' | null;
    } | null;

    /**
     * Client-side tool execution policy.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    clientTools?: {
        /**
         * Whether the agent is permitted to invoke ephemeral (session-registered, non-persisted)
         * client tools advertised by the caller UI/runtime. **Narrow-only security invariant**
         * (monotonic logical `AND` down the `BaseAgentID` chain and defaults cascade): once
         * `false` on an ancestor or default tier, descendants cannot widen back to `true`.
         * Default: `true`. Supersedes `AIAgent.AllowEphemeralClientTools`.
         */
        allowEphemeral?: boolean | null;
    } | null;

    /**
     * Default realtime session recording policy.
     * Set to `null` to explicitly clear overrides at this cascade tier.
     */
    recording?: {
        /**
         * Default recording mode applied to realtime sessions hosted by this agent:
         * - `'Audio'`: records audio streams only.
         * - `'AudioVideo'`: records both audio and video streams.
         * - `'None'`: disables session recording by default.
         *
         * `null` defers to the inherited or session default. Supersedes
         * `AIAgent.RecordingDefault`.
         */
        defaultMode?: 'Audio' | 'AudioVideo' | 'None' | null;
    } | null;

    /**
     * Admin-only per-agent pluggable `BaseAgent` helper seam overrides (Extension Point #3).
     * Collected cumulatively across `AgentType -> Categories -> BaseAgent Chain -> Agent`
     * (child tiers cannot strip plugins bound by an ancestor or default tier; higher-priority
     * or more specific entries for the same seam take precedence).
     * Code-only security seams (`limits`, `actionPolicy`, `policy`, `permissions`, `permission`,
     * `setup`, `steps`, `actions`, `subAgents`) are strictly forbidden in metadata and rejected
     * both at save time and at runtime.
     */
    helperPlugins?: Array<{
        /**
         * Canonical `BaseAgent` helper seam key to override (for example `'messaging'`,
         * `'payload'`, `'compaction'`, `'realtime'`, `'iteration'`, `'skills'`, or `'prompt'`).
         * Code-only security seams (`'limits'`, `'actionPolicy'`, `'policy'`, `'permissions'`,
         * `'permission'`, `'setup'`, `'steps'`, `'actions'`, `'subAgents'`) are always rejected.
         */
        seam: string;

        /**
         * Registered `@RegisterClass(BaseAgent<Seam>Helper, driverClass)` key identifying the
         * custom helper implementation to instantiate for this seam.
         */
        driverClass: string;

        /**
         * Optional precedence weight when multiple plugin entries target the same `seam` across
         * the cascade. Higher values win; equal priorities favor the later (more specific) entry.
         */
        priority?: number;
    }> | null;

    /**
     * Optional UX hints for instantiable agent templates (`InstantiationMode` of `'Optional'` or
     * `'Required'`). Automatically stripped from resolved configurations on non-instantiable leaf
     * instances (`BaseAgentID != null && InstantiationMode === 'None'`).
     * Set to `null` to explicitly clear instantiation hints at this cascade tier.
     */
    instantiation?: {
        /**
         * Pre-populated display-name suggestions offered to users when creating a personal
         * instance from this agent template.
         */
        suggestedNames?: string[];

        /**
         * Suggested Font Awesome icon classes or icon identifiers presented in the instance
         * creation UI.
         */
        suggestedIcons?: string[];

        /**
         * Suggested persona names for customizing the instantiated agent's conversational
         * identity.
         */
        suggestedPersonaNames?: string[];

        /**
         * Positive integer cap limiting how many personal instances a single user may create from
         * this agent template.
         */
        maxInstancesPerUser?: number;

        /**
         * Initial greeting message displayed to the user when opening a newly created instance for
         * the first time.
         */
        onboardingGreeting?: string;

        /**
         * Curated communication-style presets offered during instantiation so users can pick a
         * tone and speaking style for their instance.
         */
        personalityPresets?: Array<{
            /**
             * Short user-facing display label for the preset (for example `'Executive Brief'` or
             * `'Warm Collaborator'`).
             */
            label: string;

            /**
             * Concise description of the interpersonal tone injected into the instance's persona
             * instructions.
             */
            tone: string;

            /**
             * Stylistic guidance describing phrasing, structure, verbosity, and formatting
             * conventions for the instance's responses.
             */
            speakingStyle: string;

            /**
             * Optional longer helper text explaining when to choose this preset in the
             * instantiation UI.
             */
            description?: string;
        }>;
    } | null;

    /**
     * Default prompt template parameters merged beneath agent-level `AIAgent.AgentTypePromptParams`
     * across the cascade (`AgentType -> Category -> BaseAgent Chain -> Agent`), enabling shared
     * category and type prompt defaults without duplicating them per agent.
     * Set to `null` to explicitly clear prompt defaults at this cascade tier.
     */
    promptDefaults?: { [key: string]: unknown } | null;
}
