import { EntityInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type {
    CoalescedRecordChange,
    PeerChangeCursor,
    PeerChangeOperation,
    PeerRecordChangeEntry,
    PeerRecordFieldChange,
} from './types.js';

/**
 * Dependency edge between two entities (`FromEntityID` depends on `ToEntityID`,
 * meaning `ToEntityID` must be synced first).
 */
export interface PeerEntityDependencyEdge {
    FromEntityID: string;
    ToEntityID: string;
    FieldName: string;
    AllowsNull: boolean;
    IsISAParent: boolean;
}

/**
 * Self-referencing foreign key field on an entity (`Entity.FieldName -> Entity.ID`).
 */
export interface PeerSelfReferencingField {
    EntityID: string;
    EntityName: string;
    FieldName: string;
    AllowsNull: boolean;
}

/**
 * Result of entity-level dependency planning for a Peer Sync batch.
 */
export interface PeerEntityDependencyPlan {
    /** Topologically sorted entity IDs (dependencies first). */
    OrderedEntityIDs: string[];
    /** Nullable FK edges deferred to Pass 2 to break strongly connected component cycles. */
    DeferredNullableFields: PeerEntityDependencyEdge[];
    /** Self-referencing FK fields that require intra-entity parent-before-child ordering. */
    SelfReferencingFields: PeerSelfReferencingField[];
    /** Non-nullable entity cycles that cannot be broken automatically. */
    UnresolvableCycles: string[][];
}

/**
 * Compares two composite `(ChangedAt, ID)` cursors in ascending order.
 * Returns `< 0` if `a < b`, `0` if equal, and `> 0` if `a > b`.
 */
export function CompareCompositeCursor(a: PeerChangeCursor, b: PeerChangeCursor): number {
    const timeA = Date.parse(a.ChangedAt);
    const timeB = Date.parse(b.ChangedAt);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
        return timeA - timeB;
    }
    if (a.ChangedAt !== b.ChangedAt) {
        return a.ChangedAt.localeCompare(b.ChangedAt);
    }
    return NormalizeUUID(a.ChangeID).localeCompare(NormalizeUUID(b.ChangeID));
}

/**
 * Builds a composite watermark SQL `WHERE` clause over `MJ: Record Changes`
 * that:
 * 1. Scopes to `EntityID`
 * 2. Excludes inbound sync echoes (`Source IS NULL OR Source <> 'Sync'`)
 * 3. Restricts to `Type IN ('Create', 'Update', 'Delete')`
 * 4. Advances strictly past `(ChangedAt, ID)` so ties on `ChangedAt` are never skipped
 */
export function BuildCompositeWatermarkWhereClause(
    entityID: string,
    cursor: PeerChangeCursor | null
): string {
    const escapedEntityID = entityID.replace(/'/g, "''");
    const baseFilter =
        `EntityID='${escapedEntityID}' ` +
        `AND (Source IS NULL OR Source <> 'Sync') ` +
        `AND Type IN ('Create', 'Update', 'Delete')`;

    if (!cursor || !cursor.ChangedAt) {
        return baseFilter;
    }

    const escapedChangedAt = cursor.ChangedAt.replace(/'/g, "''");
    if (!cursor.ChangeID) {
        return `${baseFilter} AND ChangedAt > '${escapedChangedAt}'`;
    }

    const escapedChangeID = cursor.ChangeID.replace(/'/g, "''");
    return (
        `${baseFilter} AND (` +
        `ChangedAt > '${escapedChangedAt}' OR ` +
        `(ChangedAt = '${escapedChangedAt}' AND ID > '${escapedChangeID}')` +
        `)`
    );
}

/**
 * Coalesces an ordered or unordered list of `MJ: Record Changes` entries into
 * at most one net `CoalescedRecordChange` per `(EntityName, RecordID)` within
 * the batch window.
 *
 * State machine per record:
 * - `Create` + `Update`(s) -> `Create` with latest `FullRecordJSON`
 * - `Create` + `Delete` -> elided completely (no-op; unless re-created later in the window)
 * - `Update` + `Update`(s) -> `Update` with latest `FullRecordJSON`, union of changed fields,
 *   and `AncestorData` reconstructed from the earliest `oldValue` per field
 * - `Update`(s) + `Delete` -> `Delete`
 * - `Delete` + `Create` -> `Update` (re-created record with same primary key)
 */
export function CoalesceRecordChanges(changes: PeerRecordChangeEntry[]): CoalescedRecordChange[] {
    // Sort chronologically by (ChangedAt, ID) first
    const sorted = [...changes].sort((a, b) =>
        CompareCompositeCursor(
            { ChangedAt: a.ChangedAt, ChangeID: a.ID },
            { ChangedAt: b.ChangedAt, ChangeID: b.ID }
        )
    );

    interface Accumulator {
        entityName: string;
        recordID: string;
        createdInWindow: boolean;
        operation: PeerChangeOperation | 'Elided';
        latestRecordData: Record<string, string | number | boolean | null>;
        ancestorData: Record<string, string | number | boolean | null>;
        changedFields: Set<string>;
        latestChangedAt: string;
        latestChangeID: string;
    }

    const byRecordKey = new Map<string, Accumulator>();

    for (const entry of sorted) {
        if (entry.Source === 'Sync') {
            continue;
        }
        if (entry.Type !== 'Create' && entry.Type !== 'Update' && entry.Type !== 'Delete') {
            continue;
        }

        const key = `${entry.EntityName.toLowerCase()}::${NormalizeUUID(entry.RecordID)}`;
        const parsedRecord = parseRecordJSON(entry.FullRecordJSON);
        const parsedChanges = parseChangesJSON(entry.ChangesJSON);

        const existing = byRecordKey.get(key);
        if (!existing) {
            const changedFields = new Set<string>(Object.keys(parsedChanges));
            const ancestorData: Record<string, string | number | boolean | null> = {};
            if (entry.Type === 'Update') {
                // Start ancestor from latest snapshot, then overwrite changed fields with their pre-window oldValue
                for (const [k, v] of Object.entries(parsedRecord)) {
                    ancestorData[k] = v;
                }
                for (const [field, diff] of Object.entries(parsedChanges)) {
                    ancestorData[field] = diff.oldValue;
                }
            }

            byRecordKey.set(key, {
                entityName: entry.EntityName,
                recordID: entry.RecordID,
                createdInWindow: entry.Type === 'Create',
                operation: entry.Type,
                latestRecordData: parsedRecord,
                ancestorData,
                changedFields,
                latestChangedAt: entry.ChangedAt,
                latestChangeID: entry.ID,
            });
            continue;
        }

        existing.latestChangedAt = entry.ChangedAt;
        existing.latestChangeID = entry.ID;

        if (entry.Type === 'Create') {
            if (existing.operation === 'Elided') {
                existing.createdInWindow = true;
                existing.operation = 'Create';
                existing.latestRecordData = parsedRecord;
                existing.ancestorData = {};
                existing.changedFields.clear();
            } else if (existing.operation === 'Delete') {
                // Deleted then re-created with same PK in the same window -> net Update
                existing.operation = 'Update';
                existing.latestRecordData = parsedRecord;
                for (const field of Object.keys(parsedRecord)) {
                    existing.changedFields.add(field);
                }
            } else {
                existing.latestRecordData = parsedRecord;
            }
        } else if (entry.Type === 'Update') {
            if (existing.operation === 'Create') {
                // Create + Update -> stays Create with latest snapshot
                existing.latestRecordData = {
                    ...existing.latestRecordData,
                    ...parsedRecord,
                };
            } else if (existing.operation === 'Update') {
                // Preserve earliest oldValue for any newly touched field
                for (const [field, diff] of Object.entries(parsedChanges)) {
                    if (!existing.changedFields.has(field)) {
                        existing.ancestorData[field] = diff.oldValue;
                    }
                    existing.changedFields.add(field);
                }
                existing.latestRecordData = {
                    ...existing.latestRecordData,
                    ...parsedRecord,
                };
                // Backfill any unmodified fields into ancestorData that weren't captured yet
                for (const [field, val] of Object.entries(parsedRecord)) {
                    if (!(field in existing.ancestorData) && !existing.changedFields.has(field)) {
                        existing.ancestorData[field] = val;
                    }
                }
            }
        } else if (entry.Type === 'Delete') {
            if (existing.createdInWindow && existing.operation === 'Create') {
                // Created and deleted in the same window -> elide completely
                existing.operation = 'Elided';
                existing.latestRecordData = {};
                existing.ancestorData = {};
                existing.changedFields.clear();
            } else {
                existing.operation = 'Delete';
            }
        }
    }

    const results: CoalescedRecordChange[] = [];
    for (const acc of byRecordKey.values()) {
        if (acc.operation === 'Elided') {
            continue;
        }
        results.push({
            EntityName: acc.entityName,
            SourceRecordID: acc.recordID,
            Operation: acc.operation,
            RecordData: acc.latestRecordData,
            AncestorData: acc.operation === 'Update' ? acc.ancestorData : null,
            ChangedFields: Array.from(acc.changedFields),
            LatestChangedAt: acc.latestChangedAt,
            LatestChangeID: acc.latestChangeID,
        });
    }

    return results;
}

/**
 * Plans the entity-level sync execution order across `entityIDs` using Tarjan's
 * Strongly Connected Components (SCC) algorithm, IS-A parent relationships,
 * and automatic two-pass nullable FK cycle breaking.
 */
export function PlanPeerEntityOrder(
    entityIDs: string[],
    provider?: IMetadataProvider
): PeerEntityDependencyPlan {
    const md = provider ?? Metadata.Provider;
    const uniqueIDs: string[] = [];
    for (const id of entityIDs) {
        if (!uniqueIDs.some(existing => UUIDsEqual(existing, id))) {
            uniqueIDs.push(id);
        }
    }

    if (uniqueIDs.length === 0) {
        return {
            OrderedEntityIDs: [],
            DeferredNullableFields: [],
            SelfReferencingFields: [],
            UnresolvableCycles: [],
        };
    }

    const normToCanonical = new Map<string, string>();
    const entityByNorm = new Map<string, EntityInfo>();
    for (const id of uniqueIDs) {
        const norm = NormalizeUUID(id);
        normToCanonical.set(norm, id);
        const info = md.Entities.find(e => UUIDsEqual(e.ID, id));
        if (info) {
            entityByNorm.set(norm, info);
        }
    }

    const selfReferencingFields: PeerSelfReferencingField[] = [];
    const allEdges: PeerEntityDependencyEdge[] = [];

    for (const [normId, entity] of entityByNorm.entries()) {
        const canonicalFrom = normToCanonical.get(normId)!;
        for (const field of entity.Fields) {
            if (!field.RelatedEntityID) continue;
            const normTarget = NormalizeUUID(field.RelatedEntityID);
            if (!normToCanonical.has(normTarget)) continue;

            if (normTarget === normId) {
                selfReferencingFields.push({
                    EntityID: canonicalFrom,
                    EntityName: entity.Name,
                    FieldName: field.Name,
                    AllowsNull: field.AllowsNull,
                });
                continue;
            }

            allEdges.push({
                FromEntityID: canonicalFrom,
                ToEntityID: normToCanonical.get(normTarget)!,
                FieldName: field.Name,
                AllowsNull: field.AllowsNull,
                IsISAParent: false,
            });
        }

        if (entity.ParentEntityInfo) {
            const normParent = NormalizeUUID(entity.ParentEntityInfo.ID);
            if (normToCanonical.has(normParent) && normParent !== normId) {
                allEdges.push({
                    FromEntityID: canonicalFrom,
                    ToEntityID: normToCanonical.get(normParent)!,
                    FieldName: entity.FirstPrimaryKey?.Name ?? 'ID', // first-pk-ok: IS-A child shares a single-column primary key with its parent entity
                    AllowsNull: false,
                    IsISAParent: true,
                });
            }
        }
    }

    const deferredNullableFields: PeerEntityDependencyEdge[] = [];
    const removedEdgeKeys = new Set<string>();
    const edgeKey = (e: PeerEntityDependencyEdge): string =>
        `${NormalizeUUID(e.FromEntityID)}->${NormalizeUUID(e.ToEntityID)}:${e.FieldName}`;

    const buildAdjacency = (): Map<string, Set<string>> => {
        const adj = new Map<string, Set<string>>();
        for (const id of uniqueIDs) {
            adj.set(NormalizeUUID(id), new Set<string>());
        }
        for (const edge of allEdges) {
            if (removedEdgeKeys.has(edgeKey(edge))) continue;
            const fromNorm = NormalizeUUID(edge.FromEntityID);
            const toNorm = NormalizeUUID(edge.ToEntityID);
            if (fromNorm !== toNorm) {
                adj.get(fromNorm)?.add(toNorm);
            }
        }
        return adj;
    };

    const unresolvableCycles: string[][] = [];
    let safety = uniqueIDs.length * Math.max(allEdges.length, 1) + 10;

    while (safety-- > 0) {
        const adj = buildAdjacency();
        const cycles = findTrueCyclesNorm(adj);
        if (cycles.length === 0) {
            break;
        }

        let brokeAny = false;
        for (const scc of cycles) {
            const sccSet = new Set<string>(scc);
            const candidateEdges = allEdges.filter(
                e =>
                    !removedEdgeKeys.has(edgeKey(e)) &&
                    e.AllowsNull &&
                    !e.IsISAParent &&
                    sccSet.has(NormalizeUUID(e.FromEntityID)) &&
                    sccSet.has(NormalizeUUID(e.ToEntityID))
            );

            if (candidateEdges.length > 0) {
                const chosen = candidateEdges[0];
                removedEdgeKeys.add(edgeKey(chosen));
                deferredNullableFields.push(chosen);
                brokeAny = true;
            } else {
                const canonicalCycle = scc.map(n => normToCanonical.get(n) ?? n);
                const sig = [...canonicalCycle].sort().join(',');
                if (!unresolvableCycles.some(c => [...c].sort().join(',') === sig)) {
                    unresolvableCycles.push(canonicalCycle);
                }
            }
        }

        if (!brokeAny) {
            break;
        }
    }

    const finalAdj = buildAdjacency();
    const visited = new Set<string>();
    const ordered: string[] = [];

    const visit = (normId: string): void => {
        if (visited.has(normId)) return;
        visited.add(normId);
        const deps = finalAdj.get(normId);
        if (deps) {
            for (const depNorm of deps) {
                visit(depNorm);
            }
        }
        const canonical = normToCanonical.get(normId);
        if (canonical) {
            ordered.push(canonical);
        }
    };

    for (const id of uniqueIDs) {
        visit(NormalizeUUID(id));
    }

    return {
        OrderedEntityIDs: ordered,
        DeferredNullableFields: deferredNullableFields,
        SelfReferencingFields: selfReferencingFields,
        UnresolvableCycles: unresolvableCycles,
    };
}

/**
 * Orders coalesced record changes within a single self-referencing entity
 * so that parent records are applied before child records on `Create`/`Update`,
 * and child records are deleted before parent records on `Delete`.
 */
export function OrderChangesBySelfReference(
    changes: CoalescedRecordChange[],
    pkFieldName: string,
    selfRefFieldNames: string[]
): CoalescedRecordChange[] {
    if (changes.length <= 1 || selfRefFieldNames.length === 0) {
        return changes;
    }

    const upserts = changes.filter(c => c.Operation !== 'Delete');
    const deletes = changes.filter(c => c.Operation === 'Delete');

    const bySourceID = new Map<string, CoalescedRecordChange>();
    for (const change of upserts) {
        const pkVal = change.RecordData[pkFieldName];
        const key = pkVal != null ? NormalizeUUID(String(pkVal)) : NormalizeUUID(change.SourceRecordID);
        bySourceID.set(key, change);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const orderedUpserts: CoalescedRecordChange[] = [];

    const visitUpsert = (key: string, change: CoalescedRecordChange): void => {
        if (visited.has(key)) return;
        if (visiting.has(key)) return; // Guard against data-level self-cycles
        visiting.add(key);

        for (const fieldName of selfRefFieldNames) {
            const parentVal = change.RecordData[fieldName];
            if (parentVal != null && String(parentVal).length > 0) {
                const parentKey = NormalizeUUID(String(parentVal));
                if (parentKey !== key) {
                    const parentChange = bySourceID.get(parentKey);
                    if (parentChange) {
                        visitUpsert(parentKey, parentChange);
                    }
                }
            }
        }

        visiting.delete(key);
        visited.add(key);
        orderedUpserts.push(change);
    };

    for (const change of upserts) {
        const pkVal = change.RecordData[pkFieldName];
        const key = pkVal != null ? NormalizeUUID(String(pkVal)) : NormalizeUUID(change.SourceRecordID);
        visitUpsert(key, change);
    }

    // For deletes, reverse dependency order (children before parents)
    return [...orderedUpserts, ...deletes.reverse()];
}

function findTrueCyclesNorm(adjacency: Map<string, Set<string>>): string[][] {
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    const strongConnect = (v: string): void => {
        indices.set(v, index);
        lowlink.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);

        const neighbors = adjacency.get(v);
        if (neighbors) {
            for (const w of neighbors) {
                if (! adjacency.has(w)) continue;
                if (!indices.has(w)) {
                    strongConnect(w);
                    lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
                } else if (onStack.has(w)) {
                    lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
                }
            }
        }

        if (lowlink.get(v) === indices.get(v)) {
            const scc: string[] = [];
            let w: string;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);

            if (scc.length > 1) {
                cycles.push(scc);
            }
        }
    };

    for (const node of adjacency.keys()) {
        if (!indices.has(node)) {
            strongConnect(node);
        }
    }

    return cycles;
}

function parseRecordJSON(
    json: string | null
): Record<string, string | number | boolean | null> {
    if (!json) return {};
    try {
        const parsed = JSON.parse(json) as Record<string, string | number | boolean | null | object>;
        const out: Record<string, string | number | boolean | null> = {};
        if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
                if (k.endsWith('___')) continue;
                if (v === null) {
                    out[k] = null;
                } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    out[k] = v;
                } else if (v !== undefined) {
                    out[k] = JSON.stringify(v);
                }
            }
        }
        return out;
    } catch {
        return {};
    }
}

function parseChangesJSON(
    json: string | null
): Record<string, PeerRecordFieldChange> {
    if (!json) return {};
    try {
        const parsed = JSON.parse(json) as Record<
            string,
            { fieldName?: string; oldValue?: string | number | boolean | null; newValue?: string | number | boolean | null }
        >;
        const out: Record<string, PeerRecordFieldChange> = {};
        if (parsed && typeof parsed === 'object') {
            for (const [k, diff] of Object.entries(parsed)) {
                if (!diff || typeof diff !== 'object') continue;
                out[k] = {
                    fieldName: diff.fieldName ?? k,
                    oldValue: diff.oldValue ?? null,
                    newValue: diff.newValue ?? null,
                };
            }
        }
        return out;
    } catch {
        return {};
    }
}
