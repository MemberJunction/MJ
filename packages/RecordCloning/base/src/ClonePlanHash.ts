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
    FormatCompositeKey,
} from './types';
import { MaskSensitiveFieldChange } from './SensitiveValues';

/**
 * Deterministically stringifies an arbitrary value for canonical hashing.
 */
function canonicalizeValue(val: unknown): string {
    if (val === null || val === undefined) {
        return '';
    }
    if (typeof val === 'object') {
        if (val instanceof Date) {
            return val.toISOString();
        }
        if (Array.isArray(val)) {
            return `[${val.map(canonicalizeValue).join(',')}]`;
        }
        const obj = val as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeValue(obj[k])}`).join(',')}}`;
    }
    return JSON.stringify(val);
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
    // 1. Canonicalize and sort nodes
    const sortedNodes = [...plan.Nodes]
        .map((n) => {
            const sortedChanges = [...n.FieldChanges]
                .sort((a, b) => a.Field.localeCompare(b.Field))
                .map(MaskSensitiveFieldChange)
                .map((fc: CloneFieldChange) => ({
                    Field: fc.Field,
                    Kind: fc.Kind,
                    OldValue: canonicalizeValue(fc.OldValue),
                    NewValue: canonicalizeValue(fc.NewValue),
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
