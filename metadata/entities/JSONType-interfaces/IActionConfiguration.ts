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
 *  - The taint gate, read by the task-graph dispatcher to refuse egress from a tainted run.
 *
 * NULL for actions that need none of them.
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
     * True for an action that sends data out of MJ or makes a change that cannot be taken back
     * (email, webhooks, payments, external writes). A durable task graph whose run is tainted (it
     * ingested SemiTrusted or Untrusted content) refuses to run it unless a completed Human node
     * upstream approved the work. Absent means false.
     */
    disallowWhenTainted?: boolean;
}
