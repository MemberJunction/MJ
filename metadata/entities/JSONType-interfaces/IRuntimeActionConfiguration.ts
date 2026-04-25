/**
 * Configuration stored on Action.RuntimeActionConfiguration when Action.Type='Runtime'.
 *
 * Runtime actions are JavaScript payloads executed inside MJ's isolated-vm
 * sandbox that call back to the host via a permissioned bridge (utilities
 * object) to access metadata, views, queries, entity CRUD, other actions,
 * agents, and AI capabilities.
 *
 * This configuration is the security and resource contract for a single
 * Runtime action:
 *  - What it is permitted to touch (permissions)
 *  - How much it is allowed to consume (limits)
 *  - What sandbox affordances it needs (sandbox)
 *  - How it relates to prior versions of itself (version / previousVersionId)
 *
 * The JSON blob is evolvable — new optional keys can be added without a
 * schema migration. Required keys MUST be marked required here and enforced
 * at Save time (see the zod validator in @memberjunction/actions-base).
 *
 * Only applicable when Action.Type='Runtime'. NULL for Custom / Generated actions.
 */
export interface IRuntimeActionConfiguration {
    /** Declarative permission scopes. The bridge validates every call against these. */
    permissions: IRuntimeActionPermissions;

    /** Resource limits (memory, bridge-call count). Defaults applied when omitted. */
    limits?: IRuntimeActionLimits;

    /** Sandbox options — additional libraries, debug mode, etc. */
    sandbox?: IRuntimeActionSandboxOptions;

    /** Semantic version of this action (e.g. "1.0.3"). Tracked in version history. */
    version?: string;

    /** ID of the previous Action record this version was derived from, if any. */
    previousVersionId?: string;
}

/**
 * Declarative permission scopes for a Runtime action. The bridge enforces
 * each scope on every call — an attempt to touch an unlisted entity / action /
 * agent throws a PermissionDenied error before the downstream operation runs.
 *
 * IDs are the source of truth; names are kept alongside for display, logging,
 * and human review during the approval workflow.
 *
 * The `allowAnyEntity` / `allowAnyAction` / `allowAnyAgent` booleans are
 * escape hatches for framework-shipped utility actions that must accept the
 * target entity/action/agent as runtime input (e.g. a generic "data quality
 * report" that can analyze any entity). They bypass the allowlist entirely
 * for their namespace. The approval UI renders a prominent warning when any
 * of them is set so a human reviewer sees the blast radius at approval time;
 * agent-authored Runtime actions should enumerate specific references rather
 * than set these flags.
 */
export interface IRuntimeActionPermissions {
    /** Other actions this Runtime action can invoke via utilities.actions.Invoke */
    allowedActions: IRuntimeActionReference[];

    /** Agents this Runtime action can run via utilities.agents.Run */
    allowedAgents: IRuntimeActionReference[];

    /** Entities this Runtime action can read or mutate via utilities.rv / utilities.entity */
    allowedEntities: IRuntimeActionReference[];

    /**
     * DANGEROUS ESCAPE HATCH. When true, allows access to ANY entity via
     * `utilities.md.*`, `utilities.rv.*`, and `utilities.entity.*`, ignoring
     * `allowedEntities`. Only set for framework-authored utility actions that
     * accept the target entity as runtime input. Approval UI flags this.
     */
    allowAnyEntity?: boolean;

    /**
     * DANGEROUS ESCAPE HATCH. When true, allows invocation of ANY action via
     * `utilities.actions.Invoke`, ignoring `allowedActions`. Only set for
     * framework-authored orchestrators. Approval UI flags this.
     */
    allowAnyAction?: boolean;

    /**
     * DANGEROUS ESCAPE HATCH. When true, allows invocation of ANY agent via
     * `utilities.agents.Run`, ignoring `allowedAgents`. Only set for
     * framework-authored orchestrators. Approval UI flags this.
     */
    allowAnyAgent?: boolean;
}

/**
 * Resource limits enforced per invocation. Host enforces memory via isolated-vm;
 * bridge-call count is tracked on the host side and blocks once exceeded.
 */
export interface IRuntimeActionLimits {
    /** Memory limit in MB. Default: 128. */
    maxMemoryMB?: number;

    /** Max bridge calls per single execution. Default: 100. Prevents runaway loops. */
    maxBridgeCalls?: number;
}

/**
 * Sandbox affordances the action needs beyond the default library set
 * (lodash, date-fns, uuid, validator).
 */
export interface IRuntimeActionSandboxOptions {
    /**
     * Additional libraries beyond the default set. Must be in the approved
     * registry in @memberjunction/action-runtime — arbitrary npm packages
     * are not allowed. Currently approved opt-in libraries:
     *   - mathjs (heavy math)
     *   - papaparse (CSV parsing)
     *   - cheerio (HTML parsing)
     *   - marked (markdown parsing)
     */
    additionalLibraries?: IRuntimeLibraryReference[];

    /** Enable verbose console output in the sandbox. Default false. */
    debugMode?: boolean;
}

/**
 * Stable reference to an entity / action / agent.
 *
 * `id` is authoritative (used for lookups and permission checks).
 * `name` is kept so that the approval UI, logs, and diffs stay readable
 * even when items are renamed — the UI should show the current name from
 * the lookup and fall back to the stored one if the target is deleted.
 */
export interface IRuntimeActionReference {
    /** UUID of the referenced item */
    id: string;

    /** Human-readable name at the time this configuration was authored */
    name: string;
}

/**
 * Reference to a sandbox library. Names must match the approved library
 * registry in @memberjunction/action-runtime. Version is optional and only
 * honored if multiple versions of the same library are registered.
 */
export interface IRuntimeLibraryReference {
    /** Library name as used in require() / import (e.g. "papaparse") */
    name: string;

    /** Optional semver constraint. If omitted, uses the registry's default. */
    version?: string;
}
