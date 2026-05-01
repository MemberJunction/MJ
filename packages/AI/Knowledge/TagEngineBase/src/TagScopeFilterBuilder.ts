import { BaseSingleton } from '@memberjunction/global';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJTagEntity } from '@memberjunction/core-entities';
import { TagScopeContext, TagScopeContextEntry } from './TagScopeContext';

/**
 * Builds SQL fragments + in-memory filter predicates that constrain tag
 * visibility to a given `TagScopeContext`. Lives at the base layer so both the
 * server-side `TagEngine` (semantic-search subtree filter, RunView extra
 * filter) and the client-side caller (UI facets) can share the rules.
 *
 * The visibility rule: a tag is visible iff
 *   `Status='Active' AND (IsGlobal=1 OR ID IN (SELECT TagID FROM TagScope WHERE …))`.
 * `globalOnly` forces the second branch off; an empty context returns
 * everything Active (no scope filtering at all).
 *
 * Multi-provider safety: every method accepts an optional
 * `provider?: IMetadataProvider`. When omitted we fall back to the global
 * `Metadata.Provider` per CLAUDE.md guidance.
 */
export class TagScopeFilterBuilder extends BaseSingleton<TagScopeFilterBuilder> {
    public constructor() {
        super();
    }

    public static get Instance(): TagScopeFilterBuilder {
        return TagScopeFilterBuilder.getInstance<TagScopeFilterBuilder>();
    }

    /**
     * SQL `WHERE`-suitable predicate for `MJ:Tags` (or `vwTags`) rows that
     * limits the result set to tags visible under the supplied context.
     *
     * Returns `Status='Active'` when no context is supplied (no scope filter),
     * `Status='Active' AND IsGlobal=1` when `globalOnly` is set, and
     * `Status='Active' AND (IsGlobal=1 OR ID IN (subquery))` otherwise.
     *
     * The subquery uses the canonical `__mj`/`vwTagScopes` view — callers do
     * not need a separate JOIN.
     */
    public buildVisibilityFilter(
        ctx?: TagScopeContext | null,
        provider?: IMetadataProvider
    ): string {
        if (!ctx || ctx.scopes.length === 0) {
            if (ctx?.globalOnly) {
                return `Status='Active' AND IsGlobal=1`;
            }
            return `Status='Active'`;
        }

        if (ctx.globalOnly) {
            return `Status='Active' AND IsGlobal=1`;
        }

        const scopeSubquery = this.buildScopeSubquery(ctx.scopes, provider);
        if (scopeSubquery == null) {
            // None of the scope entries resolved — same effect as globalOnly.
            return `Status='Active' AND IsGlobal=1`;
        }
        return `Status='Active' AND (IsGlobal=1 OR ID IN (${scopeSubquery}))`;
    }

    /**
     * Predicate suitable for the SemanticVectorService's `subtreeFilter`
     * callback — given a `TagEmbeddingMetadata` entry's tag ID, the caller
     * decides whether it should be considered for cosine search. We return a
     * function-style filter (callable) AND the SQL form for callers that need
     * either.
     *
     * For callers that have the in-memory `MJTagEntity` cache, prefer
     * `buildInMemoryFilter`.
     */
    public buildVisibleTagIDPredicate(
        ctx?: TagScopeContext | null,
        provider?: IMetadataProvider
    ): string {
        if (!ctx || ctx.scopes.length === 0) {
            if (ctx?.globalOnly) {
                return `(SELECT 1 WHERE IsGlobal=1)`;
            }
            return ''; // no constraint
        }

        if (ctx.globalOnly) {
            return `IsGlobal=1`;
        }

        const scopeSubquery = this.buildScopeSubquery(ctx.scopes, provider);
        if (scopeSubquery == null) return `IsGlobal=1`;
        return `(IsGlobal=1 OR ID IN (${scopeSubquery}))`;
    }

    /**
     * In-memory predicate over a Tag entity instance — convenient when the
     * caller already has the `Tags` cache loaded and wants to filter rather
     * than re-query. Pass the `tagScopes` cache (a map of tagID → scope rows)
     * to avoid an N+1 lookup.
     *
     * Active tags always pass through Status; the scope test is only applied
     * when a context is supplied.
     */
    public buildInMemoryFilter(
        ctx?: TagScopeContext | null,
        tagScopesByTagID?: Map<string, Array<{ScopeEntityID: string; ScopeRecordID: string}>>,
        provider?: IMetadataProvider
    ): (tag: MJTagEntity) => boolean {
        if (!ctx || (ctx.scopes.length === 0 && !ctx.globalOnly)) {
            return (tag) => tag.Status === 'Active';
        }

        if (ctx.globalOnly || ctx.scopes.length === 0) {
            return (tag) => tag.Status === 'Active' && tag.IsGlobal === true;
        }

        // Resolve scope entries to (entityID, recordID) pairs upfront.
        const resolved = this.resolveScopes(ctx.scopes, provider);
        const lookup = new Set(resolved.map(s => `${s.entityID}|${s.recordID}`));

        return (tag) => {
            if (tag.Status !== 'Active') return false;
            if (tag.IsGlobal) return true;
            const rows = tagScopesByTagID?.get(tag.ID);
            if (!rows || rows.length === 0) return false;
            return rows.some(r => lookup.has(`${r.ScopeEntityID}|${r.ScopeRecordID}`));
        };
    }

    /**
     * Validate that a proposed child scope is a (non-strict) subset of its
     * parent's scope, OR the parent is global. Returns `{ ok: false }` when
     * the child would be visible somewhere the parent is not.
     */
    public validateChildScope(
        parentTag: MJTagEntity,
        proposedScopes: TagScopeContextEntry[],
        parentScopes: Array<{ScopeEntityID: string; ScopeRecordID: string}>,
        provider?: IMetadataProvider
    ): { ok: true } | { ok: false; reason: string } {
        if (parentTag.IsGlobal) return { ok: true };
        if (proposedScopes.length === 0) {
            // Child has no scopes but parent is non-global — child would be
            // unreachable. Reject as ambiguous.
            return { ok: false, reason: 'Child scope is empty but parent is not global; child would be unreachable.' };
        }

        const resolved = this.resolveScopes(proposedScopes, provider);
        const parentLookup = new Set(parentScopes.map(s => `${s.ScopeEntityID}|${s.ScopeRecordID}`));
        for (const r of resolved) {
            if (!parentLookup.has(`${r.entityID}|${r.recordID}`)) {
                return {
                    ok: false,
                    reason: `Proposed scope (entity=${r.entityID}, record=${r.recordID}) is not a subset of parent tag "${parentTag.Name}"'s scope.`
                };
            }
        }
        return { ok: true };
    }

    private buildScopeSubquery(
        entries: TagScopeContextEntry[],
        provider?: IMetadataProvider
    ): string | null {
        const resolved = this.resolveScopes(entries, provider);
        if (resolved.length === 0) return null;

        const conditions = resolved
            .map(r => `(ScopeEntityID='${this.escape(r.entityID)}' AND ScopeRecordID='${this.escape(r.recordID)}')`)
            .join(' OR ');
        return `SELECT TagID FROM __mj.vwTagScopes WHERE ${conditions}`;
    }

    private resolveScopes(
        entries: TagScopeContextEntry[],
        provider?: IMetadataProvider
    ): Array<{ entityID: string; recordID: string }> {
        const md = provider ?? Metadata.Provider;
        const out: Array<{ entityID: string; recordID: string }> = [];
        for (const e of entries) {
            let entityID = e.entityId;
            if (!entityID && e.entityName) {
                const ent = md?.EntityByName?.(e.entityName);
                if (ent) entityID = ent.ID;
            }
            if (!entityID || !e.recordId) continue;
            out.push({ entityID, recordID: e.recordId });
        }
        return out;
    }

    private escape(value: string): string {
        return value.replace(/'/g, "''");
    }
}
