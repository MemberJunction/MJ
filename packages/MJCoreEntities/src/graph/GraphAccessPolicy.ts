/**
 * @fileoverview Pluggable access policies for the semantic graph.
 *
 * By default {@link GraphEngine} shows a node only when the viewer may read its entity and the row
 * comes back from a read run as that viewer (entity permissions and row-level security). That is
 * the right rule for most entities, but not for all of them:
 *
 * - **Derived nodes.** A concept synthesized from a private document, or that document's chunks, are
 *   separate entities whose own permissions know nothing about the document. Visibility has to follow
 *   the source record.
 * - **Entities whose access is not row-level security.** Some entities decide access in code; their
 *   graph visibility should come from that code.
 *
 * A policy plugs in for one entity (node policy) or one edge type (edge policy):
 *
 * ```typescript
 * @RegisterClass(BaseGraphNodeAccessPolicy, 'MJ: Graph Concepts')
 * export class MyConceptPolicy extends BaseGraphNodeAccessPolicy { ... }
 * ```
 *
 * Policies are registered in code only. No metadata row selects one, so metadata-write access cannot
 * swap in a permissive policy. One policy applies per entity or edge type: the highest-priority
 * registration wins, so to combine behaviours, subclass the policy you are extending.
 *
 * @module @memberjunction/core-entities
 */

import { LogError, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { NormalizeGraphEdgeTypeName, type GraphDataProvider, type GraphEdgeView, type GraphNodeRef, type GraphNodeView } from './BaseGraphEdgeProvider';

/** What a node policy decides for one node. */
export type GraphNodeAccessDecision = 'Visible' | 'Redacted' | 'Hidden';

/**
 * How a node policy combines with the default check.
 * - `Extend`: the default check runs first; the policy sees only nodes that passed it and can only narrow.
 * - `Replace`: the default check is skipped for the entity; the policy reads the nodes and decides.
 */
export type GraphAccessPolicyMode = 'Extend' | 'Replace';

/** One node handed to a node policy. `View` is set for `Extend` policies (the default check's result). */
export interface GraphPolicyNode {
    readonly Key: string;
    readonly Ref: GraphNodeRef;
    readonly View?: GraphNodeView;
}

/** What a policy may use while deciding. Every read it makes must run as {@link Principal}. */
export interface GraphAccessPolicyContext {
    /** The viewer being checked. With audience readers, each principal is checked separately. */
    readonly Principal: UserInfo;
    /** Provider for every read the policy makes. */
    readonly Provider: GraphDataProvider;
    /** When `true`, `Proposed` concepts count as visible. */
    readonly IncludeProposed: boolean;
    /**
     * Keys of `nodes` this principal may see, by the full check (default check plus policies).
     * Used to make one node's visibility follow another's, such as a chunk following its source
     * document. Nested calls are bounded; past the bound every node is hidden.
     */
    ResolveVisibleKeys(nodes: readonly GraphNodeRef[]): Promise<Set<string>>;
    /** Canonical node key for a reference, as used in {@link GraphPolicyNode.Key}. */
    NodeKey(node: GraphNodeRef): string;
    /** `true` when the graph is of a graph type with `IsCanon = 1`. */
    IsCanonGraph(graphID: string): boolean;
}

/**
 * Access policy for the nodes of one entity, registered under that entity's name.
 */
export abstract class BaseGraphNodeAccessPolicy {
    /** `Extend` (the default) or `Replace`. See {@link GraphAccessPolicyMode}. */
    public get Mode(): GraphAccessPolicyMode {
        return 'Extend';
    }

    /**
     * Decides each node. A node missing from the result is hidden. For an `Extend` policy, `nodes`
     * are the ones that passed the default check; for a `Replace` policy, the views produced by
     * {@link ReadNodes}. Make one batched set of reads for the whole call, never one per node.
     */
    public abstract FilterNodes(
        nodes: readonly GraphPolicyNode[],
        ctx: GraphAccessPolicyContext,
    ): Promise<Map<string, GraphNodeAccessDecision>>;

    /**
     * `Replace` policies only: reads the requested nodes as {@link GraphAccessPolicyContext.Principal}
     * and returns a view for each node that exists and may be shown. The default implementation
     * returns nothing, which hides every node.
     */
    public async ReadNodes(
        nodes: readonly GraphPolicyNode[],
        ctx: GraphAccessPolicyContext,
    ): Promise<Map<string, GraphNodeView>> {
        void nodes;
        void ctx;
        return new Map<string, GraphNodeView>();
    }
}

/**
 * Access policy for the edges of one edge type, registered under the edge type's name. The engine
 * already hides an edge unless both endpoints are visible; an edge policy can only narrow further.
 */
export abstract class BaseGraphEdgeAccessPolicy {
    /** IDs of the edges this principal may see. An edge missing from the result is hidden. */
    public abstract FilterEdges(edges: readonly GraphEdgeView[], ctx: GraphAccessPolicyContext): Promise<Set<string>>;
}

/** Stands in for a registered node policy that could not be created: hides every node. */
class FailClosedNodePolicy extends BaseGraphNodeAccessPolicy {
    public async FilterNodes(): Promise<Map<string, GraphNodeAccessDecision>> {
        return new Map<string, GraphNodeAccessDecision>();
    }
}

/** Stands in for a registered edge policy that could not be created: hides every edge. */
class FailClosedEdgePolicy extends BaseGraphEdgeAccessPolicy {
    public async FilterEdges(): Promise<Set<string>> {
        return new Set<string>();
    }
}

/**
 * Resolves registered access policies by entity name or edge type name. A policy that is registered
 * but cannot be created fails closed: everything it governs is hidden, never left to the default.
 */
export class GraphAccessPolicyRegistry {
    /** The node policy registered for an entity, or `null` when none is. */
    public static GetNodePolicy(entityName: string): BaseGraphNodeAccessPolicy | null {
        return GraphAccessPolicyRegistry.resolve<BaseGraphNodeAccessPolicy>(
            BaseGraphNodeAccessPolicy,
            entityName,
            () => new FailClosedNodePolicy(),
        );
    }

    /**
     * The edge policy registered for an edge type, or `null` when none is. The type name is matched
     * ignoring case and whitespace ({@link NormalizeGraphEdgeTypeName}), the same way edges match an
     * edge-type filter: a policy registered as `'RelatedTo'` governs edges named `'Related To'`, and
     * an edge cannot skip its policy because of how the name is spaced.
     */
    public static GetEdgePolicy(edgeTypeName: string): BaseGraphEdgeAccessPolicy | null {
        return GraphAccessPolicyRegistry.resolve<BaseGraphEdgeAccessPolicy>(
            BaseGraphEdgeAccessPolicy,
            GraphAccessPolicyRegistry.registeredEdgePolicyKey(edgeTypeName),
            () => new FailClosedEdgePolicy(),
        );
    }

    /**
     * The key of the highest-priority edge policy registered for this type name under any spelling,
     * or the name itself when none matches. Priority ties go to the later registration, as in the
     * ClassFactory.
     */
    private static registeredEdgePolicyKey(edgeTypeName: string): string {
        const target = NormalizeGraphEdgeTypeName(edgeTypeName);
        let best: { Key: string; Priority: number } | null = null;
        for (const r of MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseGraphEdgeAccessPolicy)) {
            if (r.Key != null && NormalizeGraphEdgeTypeName(r.Key) === target && (!best || r.Priority >= best.Priority)) {
                best = { Key: r.Key, Priority: r.Priority };
            }
        }
        return best?.Key ?? edgeTypeName;
    }

    private static resolve<T>(baseClass: unknown, key: string, failClosed: () => T): T | null {
        const trimmed = key?.trim();
        if (!trimmed) {
            return null;
        }
        const factory = MJGlobal.Instance.ClassFactory;
        if (!factory.GetRegistration(baseClass, trimmed)) {
            return null;
        }
        try {
            const result = factory.TryCreateInstance<T>(baseClass, trimmed);
            if (result.Resolved) {
                return result.Instance;
            }
            LogError(`GraphAccessPolicyRegistry: the policy registered for '${trimmed}' could not be created; hiding what it governs.`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`GraphAccessPolicyRegistry: creating the policy registered for '${trimmed}' threw; hiding what it governs: ${msg}`);
        }
        return failClosed();
    }
}
