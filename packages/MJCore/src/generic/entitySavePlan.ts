/**
 * @fileoverview `EntitySavePlan` — the ordered unit of work produced by an entity and its
 * companions, and the local executor that runs it inside a single provider transaction.
 *
 * ## Why a plan rather than direct recursion
 *
 * Making the work explicit before executing any of it buys three things that matter:
 *
 * 1. **Validation can see the whole graph.** Cross-child invariants ("debits must equal credits")
 *    have to be checked against the complete set — including pending removals — *before* the first
 *    row is written. A plan is the natural place to assert that.
 * 2. **One transaction decision.** The plan is built, then executed. The executor opens exactly one
 *    scope for the whole graph instead of each level guessing whether it should start one.
 * 3. **The remote path becomes trivial.** A plan is data. The client serialises the graph, the
 *    server rebuilds it and runs the *same* executor. There is one cascade implementation, placed
 *    in one of two locations — never two implementations to keep in sync.
 *
 * ## Platform guarantees are preserved by construction
 *
 * Every node is persisted by calling that record's own `BaseEntity.Save()` / `.Delete()`. Nothing
 * is written with direct SQL. Record Changes, entity actions, field validation, subclass `Save`
 * overrides, `PreSave` data hooks, `save_started` / `save` / `delete` events and cache invalidation
 * therefore all fire per node exactly as they do for a standalone save — with no graph-specific
 * plumbing and no risk of the graph path quietly skipping a guarantee the single-record path has.
 *
 * @module @memberjunction/core
 */

import type { BaseEntity } from './baseEntity';
import type { EntitySaveOptions, EntityDeleteOptions } from './interfaces';
import { LogError } from './logging';

/**
 * What a plan node does to its record.
 */
export type EntitySavePlanOperation = 'Save' | 'Delete';

/**
 * A single unit of work within an {@link EntitySavePlan}.
 */
export type EntitySavePlanNode = {
    /** The record to operate on. */
    Entity: BaseEntity;
    /** Whether this node saves or deletes its record. */
    Operation: EntitySavePlanOperation;
    /**
     * Human-readable origin of this node, used in error messages so a failure names the collection
     * it came from rather than just an entity name (e.g. `Lines[3]`).
     */
    Label: string;
    /**
     * Applied to the record immediately before the node executes.
     *
     * This is how a child collection stamps the parent's freshly-assigned primary key onto each
     * child's foreign key: the parent node runs first, so by the time this callback fires the key
     * exists. Deferring it to execution time — rather than setting it when the plan is built — is
     * what makes creating a parent and its children in one call work.
     */
    Prepare?: () => void;
    /**
     * When true, this node executes the record's **own** save/delete only, without letting that
     * record build and run a graph of its own.
     *
     * Set on the root node — the record whose `Save()` produced this plan. Without it the root
     * would re-enter graph planning from inside its own graph execution, recursing forever, and
     * would deadlock on its own in-flight save debounce.
     *
     * Deliberately **not** set on child nodes: a child that declares companions of its own must
     * build and run its own sub-graph, which is what makes nesting (payment → line → allocation)
     * work.
     */
    SelfOnly?: boolean;
};

/**
 * The outcome of executing one plan node.
 */
export type EntitySavePlanNodeResult = {
    /** The node that ran. */
    Node: EntitySavePlanNode;
    /** Whether the record's own Save()/Delete() reported success. */
    Success: boolean;
    /** The failure detail, when `Success` is false. */
    ErrorMessage?: string;
};

/**
 * The outcome of executing a whole plan.
 */
export type EntitySavePlanResult = {
    /** True only when every node succeeded and the transaction committed. */
    Success: boolean;
    /** Per-node outcomes, in execution order. */
    NodeResults: EntitySavePlanNodeResult[];
    /** The first failure's message, hoisted for convenience. */
    ErrorMessage?: string;
};

/**
 * An ordered set of record operations that must succeed or fail together.
 *
 * Built by `BaseEntity.BuildSavePlan()` / `BuildDeletePlan()`, which seed the root node and then let
 * each companion contribute via `EntityCompanion.ContributeSaveWork()` /
 * `ContributeDeleteWork()`.
 *
 * @remarks
 * Ordering is explicit and positional — nodes execute in the order they were added. Companions that
 * need their work to run before the parent (deletions of children, for instance) add it before the
 * parent node exists, which is why `ContributeDeleteWork` is called first on the delete path and
 * `ContributeSaveWork` last on the save path.
 */
export class EntitySavePlan {
    private nodes: EntitySavePlanNode[] = [];

    /**
     * The record the plan is rooted at — the entity whose `Save()` / `Delete()` was called.
     */
    public readonly Root: BaseEntity;

    /**
     * @param root - The record this plan is rooted at.
     */
    constructor(root: BaseEntity) {
        this.Root = root;
    }

    /**
     * The nodes in execution order.
     */
    public get Nodes(): readonly EntitySavePlanNode[] {
        return this.nodes;
    }

    /**
     * How many operations this plan will perform.
     *
     * A count of 1 means the plan is just the root record, and `BaseEntity` takes its ordinary
     * single-record path — no plan execution, no transaction scope, byte-for-byte the behaviour
     * that existed before companions. This is what keeps the overwhelmingly common case free of
     * any new cost or risk.
     */
    public get NodeCount(): number {
        return this.nodes.length;
    }

    /**
     * Appends a node to the plan.
     *
     * @param node - The unit of work to append.
     * @returns This plan, for chaining.
     */
    public Add(node: EntitySavePlanNode): EntitySavePlan {
        this.nodes.push(node);
        return this;
    }

    /**
     * Convenience wrapper over {@link Add} for a save node.
     *
     * @param entity - The record to save.
     * @param label - Origin label used in error messages.
     * @param prepare - Optional callback applied immediately before the node executes.
     * @returns This plan, for chaining.
     */
    public AddSave(entity: BaseEntity, label: string, prepare?: () => void, selfOnly = false): EntitySavePlan {
        return this.Add({ Entity: entity, Operation: 'Save', Label: label, Prepare: prepare, SelfOnly: selfOnly });
    }

    /**
     * Convenience wrapper over {@link Add} for a delete node.
     *
     * @param entity - The record to delete.
     * @param label - Origin label used in error messages.
     * @returns This plan, for chaining.
     */
    public AddDelete(entity: BaseEntity, label: string): EntitySavePlan {
        return this.Add({ Entity: entity, Operation: 'Delete', Label: label });
    }
}

/**
 * Per-node option sets used when executing a plan.
 *
 * The root node needs its own variants carrying the `IsGraphNodeSave` / `IsGraphNodeDelete` flag,
 * which prevents it from re-entering graph planning and bypasses its in-flight save debounce.
 * `BaseEntity` constructs all four, because it already holds the option classes as values —
 * building them here would force a runtime import of `interfaces.ts` and close an import cycle for
 * no benefit.
 */
export type EntitySavePlanExecuteOptions = {
    /** Options for non-root save nodes. */
    SaveOptions?: EntitySaveOptions;
    /** Options for the root save node — must carry `IsGraphNodeSave: true`. */
    RootSaveOptions?: EntitySaveOptions;
    /** Options for non-root delete nodes. */
    DeleteOptions?: EntityDeleteOptions;
    /** Options for the root delete node — must carry `IsGraphNodeDelete: true`. */
    RootDeleteOptions?: EntityDeleteOptions;
    /**
     * Keys of the records already being persisted higher up in this unit of work — the cycle guard.
     *
     * A child node runs the child's own `Save()`, which builds and executes the child's own plan.
     * That is what makes nesting work (a payment's line's allocations all land in one transaction),
     * but on a **self-referential** collection it is also what makes a cycle fatal: declare
     * `SubAgents` on `MJ: AI Agents` via `ParentID`, then wire `a.SubAgents.Add(b)` and
     * `b.SubAgents.Add(a)`, and the recursion only ends when the call stack does.
     *
     * The set is threaded through the options rather than held in a module-scoped variable
     * deliberately. A process-global would be shared by every concurrent save in the process, so
     * two unrelated requests saving the *same* record at the same time would report a cycle that
     * does not exist. Carried on the options, its lifetime is exactly one unit of work.
     */
    Visited?: Set<string>;
};

/**
 * Stable identity for cycle detection: the entity plus its primary key.
 *
 * Object identity is not enough — the same row can be represented by two different `BaseEntity`
 * instances within one graph, which is precisely the shape a cycle takes after a round trip.
 *
 * @param entity - The record to key.
 * @returns The key, or `null` for a record with no primary-key value yet (a brand-new record cannot
 *          be its own ancestor, so it needs no guard).
 */
function GraphNodeKey(entity: BaseEntity): string | null {
    const entityName = entity.EntityInfo?.Name;
    const key = entity.PrimaryKey?.ToString();
    return entityName && key ? `${entityName}|${key}` : null;
}

/**
 * Executes a plan's nodes in order, stopping at the first failure.
 *
 * This function does **not** manage the transaction — the caller owns that, because the caller is
 * the only one that knows whether the graph is the outermost unit of work or nested inside a larger
 * one. See `BaseEntity.executeGraphLocal`.
 *
 * @param plan - The plan to execute.
 * @param options - Per-node option sets.
 * @returns The per-node outcomes and an overall success flag.
 */
export async function ExecuteEntitySavePlan(
    plan: EntitySavePlan,
    options: EntitySavePlanExecuteOptions = {},
): Promise<EntitySavePlanResult> {
    const nodeResults: EntitySavePlanNodeResult[] = [];
    const visited = options.Visited ?? new Set<string>();

    // The root is an ancestor of everything this plan will run, so it goes in before the loop.
    // Its own node is `SelfOnly` and therefore exempt from the check below — it cannot recurse.
    const rootKey = GraphNodeKey(plan.Root);
    const rootWasAlreadyVisited = rootKey !== null && visited.has(rootKey);
    if (rootKey && !rootWasAlreadyVisited) {
        visited.add(rootKey);
    }

    try {
        for (const node of plan.Nodes) {
            // A child node re-entering a record already in progress above it is a cycle. Detect it
            // here rather than letting the recursion run until the stack overflows, which surfaces
            // as an unattributable crash rather than a fixable message.
            if (!node.SelfOnly) {
                const key = GraphNodeKey(node.Entity);
                if (key && visited.has(key)) {
                    const message =
                        `Cycle detected in the entity graph at ${node.Label} (${key}): this record is already ` +
                        `being saved higher up in the same unit of work. A self-referential related-record ` +
                        `collection cannot contain one of its own ancestors.`;
                    LogError(message);
                    return { Success: false, NodeResults: nodeResults, ErrorMessage: message };
                }
            }

            // Late-bind anything that depends on values produced by earlier nodes — most importantly
            // a child's foreign key, which cannot exist until the parent row has been inserted.
            if (node.Prepare) {
                node.Prepare();
            }

            const outcome = await executePlanNode(node, { ...options, Visited: visited });
            nodeResults.push(outcome);

            if (!outcome.Success) {
                // Stop immediately. The caller rolls the transaction back, so continuing would only
                // pile up work that is about to be undone — and would let a later, more confusing
                // failure mask the real one.
                return { Success: false, NodeResults: nodeResults, ErrorMessage: outcome.ErrorMessage };
            }
        }

        return { Success: true, NodeResults: nodeResults };
    } finally {
        // Leave the set exactly as it was found, so sibling branches of the same graph are not
        // poisoned by an ancestor this branch happened to add.
        if (rootKey && !rootWasAlreadyVisited) {
            visited.delete(rootKey);
        }
    }
}

/**
 * Runs a single plan node and normalises its outcome.
 *
 * `BaseEntity.Save()` / `.Delete()` signal logical failure by returning `false` rather than
 * throwing, so both shapes have to be handled: a `false` return and a genuine exception.
 *
 * @param node - The node to run.
 * @param saveOptions - Options for a save node.
 * @param deleteOptions - Options for a delete node.
 * @returns The node outcome.
 */
async function executePlanNode(
    node: EntitySavePlanNode,
    options: EntitySavePlanExecuteOptions,
): Promise<EntitySavePlanNodeResult> {
    try {
        // The root node runs "self only": it must not re-enter graph planning from inside the graph
        // it is already executing, and it must bypass its own in-flight save debounce. Child nodes
        // get the ordinary options, so a child with companions of its own runs its own sub-graph.
        const ok =
            node.Operation === 'Save'
                ? await node.Entity.Save(node.SelfOnly ? options.RootSaveOptions : options.SaveOptions)
                : await node.Entity.Delete(node.SelfOnly ? options.RootDeleteOptions : options.DeleteOptions);

        if (ok) {
            return { Node: node, Success: true };
        }

        const detail = node.Entity.LatestResult?.CompleteMessage ?? 'unknown error';
        return {
            Node: node,
            Success: false,
            ErrorMessage: `${node.Operation} failed for ${node.Label} (${node.Entity.EntityInfo?.Name}): ${detail}`,
        };
    } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        LogError(`EntitySavePlan node threw for ${node.Label}: ${detail}`);
        return {
            Node: node,
            Success: false,
            ErrorMessage: `${node.Operation} threw for ${node.Label} (${node.Entity.EntityInfo?.Name}): ${detail}`,
        };
    }
}
