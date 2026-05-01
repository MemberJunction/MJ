/**
 * Polymorphic scope descriptor used to filter tag visibility.
 *
 * A `TagScopeContext` is a list of (entityName | entityId, recordId) pairs that
 * resolve, conjunctively, to the set of `MJ:Tag Scopes` rows considered
 * "in-context" for the current request. A tag is visible if it is `IsGlobal=1`
 * OR has at least one `MJ:Tag Scopes` row matching one of the scopes here.
 *
 * Most callers will pass a single scope (one tenant / customer record). The
 * array shape exists for cases where the request straddles multiple scope
 * records (for example: a multi-tenant analytics query running across two
 * companies a user has access to).
 *
 * Either `entityName` (e.g., "Companies") or `entityId` may be supplied — the
 * filter builder resolves the name to an EntityID via `Metadata.EntityByName`.
 */
export interface TagScopeContextEntry {
    /** Human-readable entity name. Resolved to EntityID by the filter builder. */
    entityName?: string;
    /** Pre-resolved EntityID. Takes precedence over `entityName` when both are set. */
    entityId?: string;
    /** The primary key value of the scope record. */
    recordId: string;
}

/**
 * Bundle of scopes plus an optional escape-hatch flag for callers that want
 * "global tags only" without having to construct an empty context.
 */
export interface TagScopeContext {
    /** The (entity, record) pairs that constitute the current scope. */
    scopes: TagScopeContextEntry[];
    /**
     * When true, only `IsGlobal=1` tags are considered visible regardless of
     * the `scopes` content. Useful for cross-tenant admin views that must not
     * leak tenant-specific tags.
     */
    globalOnly?: boolean;
}
