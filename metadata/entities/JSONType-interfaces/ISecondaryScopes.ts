/**
 * Secondary scope dimensions for a ScopedPromptPart.
 *
 * Stored as a JSON object in the `SecondaryScopes` column of the
 * `MJ: Scoped Prompt Parts` entity. CodeGen emits a strongly-typed
 * `SecondaryScopesObject` accessor on `ScopedPromptPartEntity` that returns
 * `ISecondaryScopes | null`.
 *
 * This is the SAME shape the agent runtime already carries for memory scoping —
 * `ExecuteAgentParams.SecondaryScopes` (`@memberjunction/ai-core-plus`) and the
 * `SecondaryScopes` JSON column on AIAgentRun / AIAgentNote: an open map of
 * arbitrary dimension keys (e.g. `ChannelID`, `ContactID`, `Region`) to scalar or
 * string-array values. A part is matched (cascading or strict) against the run's
 * SecondaryScopes by the PromptComponentResolver.
 *
 * Open by design: the set of dimensions is owned by the host application
 * (a multi-tenant layer such as BCSaaS supplies its own), so this is an index
 * signature rather than a fixed-field interface — no DB change to add a dimension.
 */

/**
 * Value type for a single secondary-scope dimension. Mirrors
 * `SecondaryScopeValue` in `@memberjunction/ai-core-plus`: strings, numbers,
 * booleans, and string arrays (for multi-valued dimensions).
 */
export type SecondaryScopeValue = string | number | boolean | string[];

/**
 * Open map of secondary-scope dimension name → value.
 * @example { "ChannelID": "c-123", "Region": "EMEA" }
 */
export interface ISecondaryScopes {
    [dimension: string]: SecondaryScopeValue;
}
