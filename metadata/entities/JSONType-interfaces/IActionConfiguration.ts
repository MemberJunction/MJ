/**
 * Configuration stored on Action.Config (`Config_` in TypeScript): the per-action settings that
 * need neither a foreign key nor an index, so they live in one evolvable JSON bag instead of a
 * column each. New optional keys can be added without a schema migration.
 *
 * Three kinds of setting share it today:
 *
 *  - Integration routing, written by IntegrationActionGenerator for actions with
 *    DriverClass='IntegrationActionExecutor' and read by that executor to dispatch the call.
 *  - Output trust, read by the agent runtime (BaseAgent.resolveActionTrustLevel) to decide
 *    how far to trust what the action returns.
 *  - Agent result lifecycle and execution-limit defaults, read by BaseAgent across both
 *    directly-attached (`AIAgentAction`) and skill-provided (`AISkillAction`) invocations so
 *    that skills act purely as a bundling mechanism over a single action invocation pathway.
 *
 * NULL for actions that need none of these.
 */
export interface IActionConfiguration {
    /** Integration routing: the MJ: Integrations record the generated action calls. */
    IntegrationName?: string;

    /** Integration routing: the external object (table, endpoint, resource) the action operates on. */
    ObjectName?: string;

    /** Integration routing: the operation the action performs on the object (Get, List, Create, Update, Upsert, Delete, ...). */
    Verb?: string;

    /** Integration routing: connector-specific options passed through to the integration connector. */
    connectorConfig?: Record<string, unknown>;

    /**
     * How far the agent runtime trusts this action's output. The action's metadata is the source
     * of truth; a per-agent or per-run override lives in AgentTypePromptParams.
     *
     *  - 'Trusted' (the default when absent): internal structured data or platform-validated output.
     *  - 'SemiTrusted': may carry user-authored or partner content; wrapped in a data envelope.
     *  - 'Untrusted': content fetched from outside MJ (web pages, search results, mail, feeds,
     *    arbitrary HTTP responses, MCP tool output). Wrapped in <untrusted_external_data>, its
     *    AIDirectives are dropped, and the run is marked tainted so its memory writes land Pending.
     */
    outputTrustLevel?: 'Trusted' | 'SemiTrusted' | 'Untrusted';

    /**
     * Default number of agent turns before this action's result expires from conversation context.
     * `0` expires immediately after the next turn; `N` expires after `N` turns; `undefined` means
     * results do not expire unless overridden on `AIAgentAction` or `ExecuteAgentParams.messageExpirationOverride`.
     * Applies uniformly whether the action is attached directly to an agent or provided via a Skill.
     */
    resultExpirationTurns?: number;

    /**
     * Default mode for handling expired results of this action (`'None'`, `'Remove'`, or `'Compact'`).
     * Can be overridden per agent via `AIAgentAction.ResultExpirationMode` or per run via `messageExpirationOverride`.
     */
    resultExpirationMode?: 'None' | 'Remove' | 'Compact';

    /**
     * Default compaction strategy when `resultExpirationMode === 'Compact'` (`'First N Chars'` or `'AI Summary'`).
     * Defaults to `'First N Chars'` when `resultExpirationMode === 'Compact'` and omitted.
     */
    compactMode?: 'First N Chars' | 'AI Summary';

    /**
     * Default number of characters retained when `compactMode === 'First N Chars'`.
     */
    compactLength?: number;

    /**
     * Optional AI Prompt ID to use when `compactMode === 'AI Summary'`. Falls back to
     * `Action.DefaultCompactPromptID` and then the system default compaction prompt.
     */
    compactPromptId?: string;

    /**
     * Default maximum number of times an agent may execute this action in a single run when no
     * per-agent `AIAgentAction.MaxExecutionsPerRun` or dynamic `actionChanges` limit is set.
     */
    maxExecutionsPerRun?: number;
}
