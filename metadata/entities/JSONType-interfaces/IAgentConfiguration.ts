/**
 * Unified typed AI Agent configuration bag stored across the 3-table settings cascade:
 *   - `MJ: AI Agents.Configuration`
 *   - `MJ: AI Agent Categories.DefaultConfiguration`
 *   - `MJ: AI Agent Types.DefaultAgentConfiguration`
 *
 * Resolution precedence:
 *   Instance -> BaseAgent Chain (root..leaf) -> Category -> Parent Categories -> AgentType -> System Default
 *
 * Narrow-only security invariants (`SupportsPlanMode`, `RequirePlanMode`, `SkillActivationMode`,
 * `SearchScopeAccess`, `AllowEphemeralClientTools`, `AcceptUnregisteredFiles`, and numeric
 * execution/consult ceilings) can never be loosened down the chain or via category/type defaults.
 *
 * **Lockstep contract**: this interface is mirrored, field for field, by `IAgentConfiguration` in
 * `packages/AI/CorePlus/src/agent-configuration.ts` (`@memberjunction/ai-core-plus`). Runtime code
 * parses raw JSON columns through `ParseAgentConfiguration` rather than depending solely on
 * CodeGen's inline copy. Edit both files in the same commit.
 */
export interface IAgentConfiguration {
    /** Core execution, planning, model selection, and tool-calling protocol settings. */
    execution?: {
        modelSelectionMode?: 'Agent' | 'Agent Type' | null;
        defaultPromptEffortLevel?: number | null;
        chatHandlingOption?: 'Consult' | 'Failed' | 'Retry' | 'Success' | null;
        supportsPlanMode?: boolean | null;
        requirePlanMode?: boolean | null;
        declareActionsAsNativeTools?: boolean | null;
    } | null;

    /** Context window sizing, compaction thresholds, and legacy message compression settings. */
    contextWindow?: {
        enableCompression?: boolean | null;
        compressionMessageThreshold?: number | null;
        compressionPromptID?: string | null;
        compressionMessageRetentionCount?: number | null;
        maxTokens?: number | null;
        compactionTriggerPercent?: number | null;
        compactionTargetPercent?: number | null;
        summaryPromptID?: string | null;
    } | null;

    /** Notes/examples memory injection, retention lifecycle, write access, and reranker settings. */
    memory?: {
        injectNotes?: boolean | null;
        maxNotesToInject?: number | null;
        noteInjectionStrategy?: 'All' | 'Recent' | 'Relevant' | null;
        injectExamples?: boolean | null;
        maxExamplesToInject?: number | null;
        exampleInjectionStrategy?: 'Rated' | 'Recent' | 'Semantic' | null;
        noteRetentionDays?: number | null;
        exampleRetentionDays?: number | null;
        autoArchiveEnabled?: boolean | null;
        allowMemoryWrite?: boolean | null;
        reranker?: { [key: string]: unknown } | null;
    } | null;

    /** Payload path scoping and starting/final payload validation settings. */
    payload?: {
        downstreamPaths?: string[] | null;
        upstreamPaths?: string[] | null;
        selfReadPaths?: string[] | null;
        selfWritePaths?: string[] | null;
        scope?: string | null;
        startingValidationSchema?: string | null;
        startingValidationMode?: 'Fail' | 'Warn' | null;
        finalValidationSchema?: string | null;
        finalValidationMode?: 'Fail' | 'Retry' | 'Warn' | null;
        finalValidationMaxRetries?: number | null;
    } | null;

    /** Sub-agent execution mode, run count bounds, and consult-round ceiling. */
    subAgentExecution?: {
        mode?: 'Parallel' | 'Sequential' | null;
        minExecutionsPerRun?: number | null;
        maxExecutionsPerRun?: number | null;
        maxConsultRounds?: number | null;
    } | null;

    /** Conversation message windowing, attachment storage path, inline threshold, and file policy. */
    attachments?: {
        messageMode?: 'All' | 'Bookend' | 'Latest' | 'None' | null;
        maxMessages?: number | null;
        rootPath?: string | null;
        inlineStorageThresholdBytes?: number | null;
        acceptUnregisteredFiles?: boolean | null;
    } | null;

    /** Artifact creation mode and optional default artifact type reference. */
    artifacts?: {
        creationMode?: 'Always' | 'Never' | 'System Only' | null;
        defaultArtifactTypeID?: string | null;
    } | null;

    /** Search-scope access policy and secondary scope dimension configuration. */
    scope?: {
        searchScopeAccess?: 'All' | 'Assigned' | 'None' | null;
        secondaryScopeConfig?: { [key: string]: unknown } | null;
    } | null;

    /** Skill activation mode (narrow-only: Auto -> RequestedOnly). */
    skills?: {
        activationMode?: 'Auto' | 'RequestedOnly' | null;
    } | null;

    /** Ephemeral client-tool policy (narrow-only: true -> false). */
    clientTools?: {
        allowEphemeral?: boolean | null;
    } | null;

    /** Default realtime session recording policy. */
    recording?: {
        defaultMode?: 'Audio' | 'AudioVideo' | 'None' | null;
    } | null;

    /**
     * Admin-only per-agent pluggable BaseAgent helper seam overrides (Extension Point #3).
     * Code-only security seams (`limits`, `actionPolicy`, `policy`, `permissions`) are always rejected.
     */
    helperPlugins?: Array<{
        seam: string;
        driverClass: string;
        priority?: number;
    }> | null;

    /** Optional UX hints for instantiable agent templates (`InstantiationMode` of `Optional` / `Required`). */
    instantiation?: {
        suggestedNames?: string[];
        suggestedIcons?: string[];
        suggestedPersonaNames?: string[];
        maxInstancesPerUser?: number;
        onboardingGreeting?: string;
        personalityPresets?: Array<{
            label: string;
            tone: string;
            speakingStyle: string;
            description?: string;
        }>;
    } | null;

    /** Default prompt template parameters merged beneath agent-level `AgentTypePromptParams`. */
    promptDefaults?: { [key: string]: unknown } | null;
}
