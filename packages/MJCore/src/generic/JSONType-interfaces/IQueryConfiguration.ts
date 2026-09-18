/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IQueryConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Optional per-query configuration bag.
 *
 * Stored as JSON in `MJ: Queries.Configuration`. CodeGen emits a typed
 * `ConfigurationObject` accessor on `MJQueryEntity` that returns
 * `IQueryConfiguration | null`.
 *
 * Expand by adding a property here — no schema migration. Anything the engine
 * filters, sorts, or joins on stays a column on `Query`. Semantic layer options,
 * execution logging policies, and AI agent bounds belong in this bag.
 */
export interface IQueryConfiguration {
    /**
     * Relative ranking / ground-truth priority for semantic query selection (1-100).
     * High values (e.g. 90-100) mark authoritative, enterprise-certified ground truth queries
     * that should be preferred when multiple similar queries match an agent's request.
     * Default: 50.
     */
    Priority?: number;

    /**
     * Controls execution logging for this query.
     * When true (default), executions are logged to `MJ: Query Execution Logs`.
     * Set to false to opt out of execution logging (useful for high-frequency health checks,
     * internal pollers, or sensitive data queries).
     * Default: true.
     */
    LogExecution?: boolean;

    /**
     * Explicit flag indicating this query is an enterprise ground-truth / canonical query
     * for its domain or question type. Agents can filter or prioritize canonical queries.
     * Default: false.
     */
    IsCanonical?: boolean;

    /**
     * Alternative questions, natural language phrasings, and query aliases.
     * Included in composite embeddings and semantic search indexing to boost vector recall
     * across varied phrasing without diluting the primary description.
     */
    AlternativeQuestions?: string[];

    /**
     * Usage guidance for AI agents and callers. Provides prescriptive context on when
     * this query should be chosen and how its results should be interpreted.
     */
    UsageGuidance?: string;

    /**
     * Explicit negative bounding / anti-patterns for AI agents.
     * E.g. "Do NOT use for unbilled orders; use 'Unbilled Orders by Region' instead."
     */
    WhenNotToUse?: string;

    /**
     * Operational domain or persona scopes where this query applies
     * (e.g. ['Sales', 'Finance', 'Executive']).
     */
    DomainScope?: string[];
}
