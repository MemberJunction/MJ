/**
 * @file ClonePlanHash.ts
 * Canonical form of a ClonePlan's topology and transformations, for hashing.
 * Stable across key ordering and ignores pre-minted TargetKey values. The engine hashes it with
 * SHA-256 (`node:crypto`); this package stays dependency-free and client-safe.
 * @see plans/record-cloning/README.md §3.5, §13.1
 */

import {
    CloneFieldChange,
    ClonePlanEdge,
    ClonePlanNode,
    CompositeKeyLike,
    FormatCompositeKey,
} from './types';
import { MaskSensitiveFieldChange } from './SensitiveValues';

/** The key values of a key given as pairs, a record-id segment ("F|V||F|V") or a bare value. */
function keyValues(key: CompositeKeyLike | string | null | undefined): string[] {
    if (!key) return [];
    if (typeof key !== 'string') return (key.KeyValuePairs ?? []).map((p) => String(p.Value ?? ''));
    if (!key.includes('|')) return [key];
    return key.split('||').map((pair) => pair.slice(pair.indexOf('|') + 1));
}

/**
 * Tokens for the key values a plan mints (a new UUID, a remapped key column): each maps to a stable
 * name for the row it belongs to. Without this, remapped foreign keys would change the hash on every
 * re-plan, and every Execute of an unchanged plan would come back PLAN_CHANGED.
 */
function mintedKeyTokens(nodes: ClonePlanNode[]): Map<string, string> {
    const tokens = new Map<string, string>();
    for (const n of nodes) {
        const source = new Set(keyValues(n.SourceKey).map((v) => v.toLowerCase()));
        keyValues(n.TargetKey).forEach((value, i) => {
            if (value && !source.has(value.toLowerCase())) tokens.set(value.toLowerCase(), `@new(${n.EntityName}::${FormatCompositeKey(n.SourceKey)}#${i})`);
        });
    }
    return tokens;
}

/**
 * Deterministically stringifies an arbitrary value for canonical hashing, with minted key values
 * (also inside strings, such as remapped JSON) replaced by their stable tokens.
 */
function canonicalizeValue(val: unknown, tokens: Map<string, string>, pattern: RegExp | null): string {
    if (val === null || val === undefined) {
        return '';
    }
    if (typeof val === 'object') {
        if (val instanceof Date) {
            return val.toISOString();
        }
        if (Array.isArray(val)) {
            return `[${val.map((v) => canonicalizeValue(v, tokens, pattern)).join(',')}]`;
        }
        const obj = val as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeValue(obj[k], tokens, pattern)}`).join(',')}}`;
    }
    if (typeof val === 'string' && pattern) {
        return JSON.stringify(val.replace(pattern, (m) => tokens.get(m.toLowerCase()) ?? m));
    }
    return JSON.stringify(val);
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Input subset of ClonePlan required for computing the canonical hash.
 */
export interface ClonePlanHashInput {
    Nodes: ClonePlanNode[];
    Edges: ClonePlanEdge[];
    Excluded?: unknown[];
}

/**
 * The canonical string a plan hash is computed over.
 *
 * - Covers every node's (EntityName, SourceKey, Action)
 * - Covers every edge's (FromKey, ToKey, Policy)
 * - Covers every FieldChange (Field, Kind, OldValue, NewValue, Reason), with encrypted values masked
 * - EXCLUDES TargetKey values (so re-planning does not drift on pre-minted UUIDs)
 * - Immune to array ordering of nodes, edges, or field changes
 */
export function CanonicalPlanPayload(plan: ClonePlanHashInput): string {
    const tokens = mintedKeyTokens(plan.Nodes);
    const pattern = tokens.size > 0 ? new RegExp([...tokens.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'gi') : null;

    // 1. Canonicalize and sort nodes
    const sortedNodes = [...plan.Nodes]
        .map((n) => {
            const sortedChanges = [...n.FieldChanges]
                .sort((a, b) => a.Field.localeCompare(b.Field))
                .map(MaskSensitiveFieldChange)
                .map((fc: CloneFieldChange) => ({
                    Field: fc.Field,
                    Kind: fc.Kind,
                    OldValue: canonicalizeValue(fc.OldValue, tokens, pattern),
                    NewValue: canonicalizeValue(fc.NewValue, tokens, pattern),
                    Reason: fc.Reason || '',
                }));

            return {
                EntityName: n.EntityName,
                SourceKey: FormatCompositeKey(n.SourceKey),
                Action: n.Action,
                FieldChanges: sortedChanges,
            };
        })
        .sort((a, b) => {
            const cmp = a.EntityName.localeCompare(b.EntityName);
            if (cmp !== 0) return cmp;
            return a.SourceKey.localeCompare(b.SourceKey);
        });

    // 2. Canonicalize and sort edges
    const sortedEdges = [...plan.Edges]
        .map((e) => ({
            FromKey: e.FromKey,
            ToKey: e.ToKey,
            Policy: e.Policy,
        }))
        .sort((a, b) => {
            const cmp = a.FromKey.localeCompare(b.FromKey);
            if (cmp !== 0) return cmp;
            const cmp2 = a.ToKey.localeCompare(b.ToKey);
            if (cmp2 !== 0) return cmp2;
            return a.Policy.localeCompare(b.Policy);
        });

    // 3. Form canonical string
    return JSON.stringify({
        Nodes: sortedNodes,
        Edges: sortedEdges,
    });
}
