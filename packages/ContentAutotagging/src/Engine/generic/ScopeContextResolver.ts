import { TagScopeContext } from '@memberjunction/tag-engine-base';
import { TagEngine } from '@memberjunction/tag-engine';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { MJContentSourceEntity } from '@memberjunction/core-entities';

/**
 * Derive the `TagScopeContext` for an autotag run from the source's
 * configuration. Today the only signal is the source's `TagRootID`: if the
 * root tag is non-global, we lift its `TagScope` rows into the run context so
 * the LLM, semantic match, and auto-grow paths all stay inside that tenant's
 * subtree.
 *
 * Future extension point: a per-source explicit scope override (e.g.,
 * `Configuration.ScopeJSON`). When added, this resolver should prefer the
 * explicit override and fall back to the TagRootID-derived context.
 */
export class ScopeContextResolver {
    /**
     * Returns a `TagScopeContext` derived from the source's `TagRootID`, or
     * `null` if no scope is implied (root tag is global, or no root set).
     */
    public static deriveScopeContext(source: MJContentSourceEntity): TagScopeContext | null {
        const config = (source as unknown as { ConfigurationObject?: { TagRootID?: string | null } }).ConfigurationObject;
        const tagRootID = config?.TagRootID ?? null;
        if (!tagRootID) return null;

        const root = TagEngine.Instance.GetTagByID(tagRootID);
        if (!root) return null;
        if (root.IsGlobal) return null;

        const scopes = TagEngineBase.Instance.GetScopesForTag(root.ID);
        if (scopes.length === 0) return null;

        return {
            scopes: scopes.map(s => ({
                entityId: s.ScopeEntityID,
                recordId: s.ScopeRecordID,
            })),
        };
    }

    /**
     * Union two contexts — used when batching content items across sources
     * with divergent scopes. Result includes every scope row from both
     * inputs, deduplicated by (entity, record).
     */
    public static union(a: TagScopeContext | null, b: TagScopeContext | null): TagScopeContext | null {
        if (!a && !b) return null;
        if (!a) return b;
        if (!b) return a;
        const seen = new Set<string>();
        const merged: TagScopeContext['scopes'] = [];
        for (const s of [...a.scopes, ...b.scopes]) {
            const key = `${s.entityId ?? s.entityName ?? ''}|${s.recordId}`;
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(s);
            }
        }
        return { scopes: merged, globalOnly: a.globalOnly && b.globalOnly };
    }
}
