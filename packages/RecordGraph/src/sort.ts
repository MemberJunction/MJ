import { Metadata, type IMetadataProvider, type EntityInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { DependencyNode } from './types';

/**
 * Describes a directed foreign-key or IS-A parent dependency edge where `EntityID`
 * depends on `RelatedEntityID` (i.e. `RelatedEntityID` should be persisted before `EntityID`
 * on Create/Update, and after `EntityID` on Delete).
 */
export interface EntityDependencyEdge {
    EntityID: string;
    EntityName: string;
    FieldName: string;
    RelatedEntityID: string;
    RelatedEntityName: string;
    AllowsNull: boolean;
    IsISAParent: boolean;
}

/**
 * Describes a self-referencing FK field on an entity (`RelatedEntityID === EntityID`).
 */
export interface SelfReferencingFieldInfo {
    EntityID: string;
    EntityName: string;
    FieldName: string;
    AllowsNull: boolean;
}

/**
 * Result of {@link PlanEntityDependencyOrder}, used by Peer Sync and graph operations
 * to order entities for Create/Update/Delete and identify nullable FKs that must be
 * written in a second pass (`NULL` on insert, populated after both sides exist) to break
 * mutual FK cycles cleanly.
 */
export interface EntityDependencyPlan {
    /**
     * Entity IDs ordered so parent/referenced entities appear before child/referencing entities.
     * Reverse this array for Delete ordering.
     */
    OrderedEntityIDs: string[];
    /**
     * Nullable FK edges selected to be deferred (written as `NULL` on initial insert and
     * patched in a second pass) in order to break multi-entity cycles.
     */
    DeferredNullableFields: EntityDependencyEdge[];
    /**
     * Self-referencing FK fields (`RelatedEntityID === EntityID`) detected on entities in scope.
     */
    SelfReferencingFields: SelfReferencingFieldInfo[];
    /**
     * Strongly connected components (each an array of Entity IDs) that form a true cycle
     * with NO nullable FK edge available to break the cycle.
     */
    UnresolvableCycles: string[][];
    /**
     * True when `UnresolvableCycles.length > 0`.
     */
    HasUnresolvableCycles: boolean;
}

/**
 * Computes strongly connected components (SCCs) of a directed graph using Tarjan's algorithm.
 *
 * Here, an edge `u -> v` returned by `getDependencies(u)` means "`u` depends on `v`"
 * (so `v` must come before `u`). Tarjan's post-order traversal naturally emits `v`'s SCC
 * before `u`'s SCC, meaning the returned array of SCCs is already in dependency order
 * (referenced/parent SCCs first, referencing/dependent SCCs after).
 *
 * @param nodeIDs Nodes in the graph
 * @param getDependencies Returns the nodes that `nodeID` depends on
 */
export function FindStronglyConnectedComponents(
    nodeIDs: string[],
    getDependencies: (nodeID: string) => string[],
): string[][] {
    const canonicalByNorm = new Map<string, string>();
    const normNodes: string[] = [];
    for (const id of nodeIDs) {
        const norm = NormalizeUUID(id);
        if (!canonicalByNorm.has(norm)) {
            canonicalByNorm.set(norm, id);
            normNodes.push(norm);
        }
    }

    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    const strongConnect = (vNorm: string): void => {
        indices.set(vNorm, index);
        lowlink.set(vNorm, index);
        index++;
        stack.push(vNorm);
        onStack.add(vNorm);

        const originalId = canonicalByNorm.get(vNorm)!;
        const deps = getDependencies(originalId);
        for (const rawTarget of deps) {
            const wNorm = NormalizeUUID(rawTarget);
            if (!canonicalByNorm.has(wNorm)) continue;

            if (!indices.has(wNorm)) {
                strongConnect(wNorm);
                lowlink.set(vNorm, Math.min(lowlink.get(vNorm)!, lowlink.get(wNorm)!));
            } else if (onStack.has(wNorm)) {
                lowlink.set(vNorm, Math.min(lowlink.get(vNorm)!, indices.get(wNorm)!));
            }
        }

        if (lowlink.get(vNorm) === indices.get(vNorm)) {
            const component: string[] = [];
            while (stack.length > 0) {
                const wNorm = stack.pop()!;
                onStack.delete(wNorm);
                component.push(canonicalByNorm.get(wNorm)!);
                if (wNorm === vNorm) break;
            }
            sccs.push(component);
        }
    };

    for (const vNorm of normNodes) {
        if (!indices.has(vNorm)) {
            strongConnect(vNorm);
        }
    }

    return sccs;
}

/**
 * Returns only the strongly connected components that represent true cycles:
 * either multi-node SCCs (`scc.length > 1`) or single-node SCCs with a self-edge.
 */
export function FindTrueCycles(
    nodeIDs: string[],
    getDependencies: (nodeID: string) => string[],
): string[][] {
    const sccs = FindStronglyConnectedComponents(nodeIDs, getDependencies);
    return sccs.filter((scc) => {
        if (scc.length > 1) return true;
        if (scc.length === 1) {
            const node = scc[0];
            return getDependencies(node).some((dep) => UUIDsEqual(dep, node));
        }
        return false;
    });
}

/**
 * Builds a complete entity dependency execution plan over the given `entityIDs`,
 * accounting for foreign keys, IS-A parent relationships (`EntityInfo.ParentID`),
 * self-referencing FKs, and multi-entity cycles (via Tarjan's SCC algorithm and
 * automatic selection of nullable FK edges for two-pass deferral).
 */
export function PlanEntityDependencyOrder(
    entityIDs: string[],
    provider?: IMetadataProvider,
): EntityDependencyPlan {
    const md = provider ?? Metadata.Provider;

    const canonicalByNorm = new Map<string, string>();
    const uniqueEntityIDs: string[] = [];
    for (const id of entityIDs) {
        const norm = NormalizeUUID(id);
        if (!canonicalByNorm.has(norm)) {
            canonicalByNorm.set(norm, id);
            uniqueEntityIDs.push(id);
        }
    }

    const edgesByEntityNorm = new Map<string, EntityDependencyEdge[]>();
    const selfReferencingFields: SelfReferencingFieldInfo[] = [];

    for (const entityID of uniqueEntityIDs) {
        const normID = NormalizeUUID(entityID);
        const entityInfo: EntityInfo | undefined = md.EntityByID(entityID);
        const edges: EntityDependencyEdge[] = [];
        edgesByEntityNorm.set(normID, edges);

        if (!entityInfo) continue;

        // 1. IS-A parent relationship: parent table row must exist before child subtype row
        if (entityInfo.ParentID) {
            const parentNorm = NormalizeUUID(entityInfo.ParentID);
            if (canonicalByNorm.has(parentNorm) && parentNorm !== normID) {
                const parentInfo = md.EntityByID(entityInfo.ParentID);
                edges.push({
                    EntityID: entityID,
                    EntityName: entityInfo.Name,
                    FieldName: entityInfo.FirstPrimaryKey?.Name ?? 'ID', // first-pk-ok: IS-A child shares a single-column primary key with its parent entity
                    RelatedEntityID: canonicalByNorm.get(parentNorm)!,
                    RelatedEntityName: parentInfo?.Name ?? String(entityInfo.ParentEntity ?? ''),
                    AllowsNull: false,
                    IsISAParent: true,
                });
            }
        }

        // 2. Foreign key fields
        for (const field of entityInfo.Fields ?? []) {
            if (!field.RelatedEntityID) continue;
            const relatedNorm = NormalizeUUID(field.RelatedEntityID);
            if (relatedNorm === normID) {
                selfReferencingFields.push({
                    EntityID: entityID,
                    EntityName: entityInfo.Name,
                    FieldName: field.Name,
                    AllowsNull: field.AllowsNull !== false,
                });
                continue;
            }
            if (!canonicalByNorm.has(relatedNorm)) continue;

            const relatedInfo = md.EntityByID(field.RelatedEntityID);
            edges.push({
                EntityID: entityID,
                EntityName: entityInfo.Name,
                FieldName: field.Name,
                RelatedEntityID: canonicalByNorm.get(relatedNorm)!,
                RelatedEntityName: relatedInfo?.Name ?? field.RelatedEntity ?? '',
                AllowsNull: field.AllowsNull !== false,
                IsISAParent: false,
            });
        }
    }

    const deferredEdgeKeySet = new Set<string>();
    const deferredNullableFields: EntityDependencyEdge[] = [];
    const unresolvableCycles: string[][] = [];

    const edgeKey = (edge: EntityDependencyEdge): string =>
        `${NormalizeUUID(edge.EntityID)}:${edge.FieldName}:${NormalizeUUID(edge.RelatedEntityID)}`;

    const getActiveDependencies = (entityID: string): string[] => {
        const edges = edgesByEntityNorm.get(NormalizeUUID(entityID)) ?? [];
        const deps: string[] = [];
        for (const edge of edges) {
            if (deferredEdgeKeySet.has(edgeKey(edge))) continue;
            deps.push(edge.RelatedEntityID);
        }
        return deps;
    };

    // Iteratively resolve multi-entity SCCs by deferring nullable FK edges
    let sccs = FindStronglyConnectedComponents(uniqueEntityIDs, getActiveDependencies);
    let safetyCounter = 0;
    const maxIterations = uniqueEntityIDs.length * 10 + 10;

    while (safetyCounter++ < maxIterations) {
        const multiNodeSCCs = sccs.filter((scc) => scc.length > 1);
        if (multiNodeSCCs.length === 0) break;

        let deferredAnyInPass = false;

        for (const scc of multiNodeSCCs) {
            const sccNormSet = new Set(scc.map(NormalizeUUID));
            // Find candidate nullable FK edges internal to this SCC that haven't been deferred yet
            const candidateEdges: EntityDependencyEdge[] = [];
            for (const memberID of scc) {
                const edges = edgesByEntityNorm.get(NormalizeUUID(memberID)) ?? [];
                for (const edge of edges) {
                    if (
                        !deferredEdgeKeySet.has(edgeKey(edge)) &&
                        sccNormSet.has(NormalizeUUID(edge.RelatedEntityID)) &&
                        edge.AllowsNull &&
                        !edge.IsISAParent
                    ) {
                        candidateEdges.push(edge);
                    }
                }
            }

            if (candidateEdges.length === 0) {
                unresolvableCycles.push(scc);
            } else {
                // Defer the last candidate edge in deterministic order to break one cycle step
                const chosen = candidateEdges[candidateEdges.length - 1];
                deferredEdgeKeySet.add(edgeKey(chosen));
                deferredNullableFields.push(chosen);
                deferredAnyInPass = true;
            }
        }

        if (!deferredAnyInPass) break;
        unresolvableCycles.length = 0;
        sccs = FindStronglyConnectedComponents(uniqueEntityIDs, getActiveDependencies);
    }

    // Flatten the resulting SCCs (already in topological dependency order: parents first)
    const orderedEntityIDs: string[] = [];
    for (const scc of sccs) {
        for (const id of scc) {
            orderedEntityIDs.push(id);
        }
    }

    return {
        OrderedEntityIDs: orderedEntityIDs,
        DeferredNullableFields: deferredNullableFields,
        SelfReferencingFields: selfReferencingFields,
        UnresolvableCycles: unresolvableCycles,
        HasUnresolvableCycles: unresolvableCycles.length > 0,
    };
}

/**
 * Sort items by entity dependency order so parent entities appear before child entities
 * that reference them via foreign keys or IS-A parent relationships.
 *
 * Uses Tarjan's SCC algorithm and {@link PlanEntityDependencyOrder} under the hood so
 * multi-entity cycles are broken deterministically at nullable FK boundaries.
 *
 * @param items Array of items to sort
 * @param getEntityID Function mapping an item to its Entity ID
 * @param provider Optional metadata provider override (defaults to Metadata.Provider)
 */
export function SortByEntityDependencyOrder<T>(
    items: T[],
    getEntityID: (item: T) => string,
    provider?: IMetadataProvider
): T[] {
    if (items.length <= 1) return [...items];
    const md = provider ?? Metadata.Provider;

    // Collect all reachable entity IDs so transitive parent dependencies outside `items`
    // still contribute to relative ordering.
    const allEntityIDs: string[] = [];
    const seenNorm = new Set<string>();
    const collectReachable = (entityId: string): void => {
        const norm = NormalizeUUID(entityId);
        if (seenNorm.has(norm)) return;
        seenNorm.add(norm);
        allEntityIDs.push(entityId);

        const entityInfo = md.EntityByID(entityId);
        if (!entityInfo) return;
        if (entityInfo.ParentID && !UUIDsEqual(entityInfo.ParentID, entityId)) {
            collectReachable(entityInfo.ParentID);
        }
        for (const field of entityInfo.Fields ?? []) {
            if (field.RelatedEntityID && !UUIDsEqual(field.RelatedEntityID, entityId)) {
                collectReachable(field.RelatedEntityID);
            }
        }
    };

    for (const item of items) {
        collectReachable(getEntityID(item));
    }

    const plan = PlanEntityDependencyOrder(allEntityIDs, md);
    const rankByNorm = new Map<string, number>();
    plan.OrderedEntityIDs.forEach((id, idx) => {
        rankByNorm.set(NormalizeUUID(id), idx);
    });

    return [...items].sort((a, b) => {
        const rankA = rankByNorm.get(NormalizeUUID(getEntityID(a))) ?? 0;
        const rankB = rankByNorm.get(NormalizeUUID(getEntityID(b))) ?? 0;
        return rankA - rankB;
    });
}

/**
 * Backward-compatibility alias for SortByEntityDependencyOrder.
 */
export const SortEntitiesByDependency = SortByEntityDependencyOrder;

/**
 * Flatten a dependency tree into a topologically sorted list (breadth-first traversal).
 * Parents appear before their children, ensuring safe restore or clone execution ordering.
 */
export function SortNodesTopologically(root: DependencyNode): DependencyNode[] {
    const result: DependencyNode[] = [];
    const queue: DependencyNode[] = [root];
    while (queue.length > 0) {
        const node = queue.shift()!;
        result.push(node);
        for (const child of node.Children) {
            queue.push(child);
        }
    }
    return result;
}
