/**
 * @file CloneMaterializer.ts
 * Builds the in-memory entity graph for record cloning.
 * Orchestrates collection routing (declared vs dynamic via DeclareRelatedRecordsDynamic),
 * builds each row from NewRecord() plus the plan's field values, re-stamps join fields,
 * and handles polymorphic IS-A child additions.
 * @see plans/record-cloning/README.md §6, §13.1
 */

import {
    BaseEntity,
    IMetadataProvider,
    LogError,
    Metadata,
    RelatedRecordCollection,
    UserInfo,
} from '@memberjunction/core';
import { ClonePlan, ClonePlanNode, CompositeKeyLike } from '@memberjunction/record-cloning-base';
import { SingleKeyField, ToCompositeKey, ToRecordKeyString } from './CloneKeys';

/** Writes every column of a planned target key (single or composite) onto the new row. */
function applyTargetKey(entity: BaseEntity, targetKey: CompositeKeyLike | string | null | undefined): void {
    if (!targetKey) return; // server-assigned key
    const ck = ToCompositeKey(entity.EntityInfo, targetKey);
    for (const pair of ck.KeyValuePairs) {
        // An empty column points at a parent whose key the database assigns; the save fills it in.
        if (pair.Value === null || pair.Value === undefined || pair.Value === '') continue;
        entity.Set(pair.FieldName, pair.Value);
    }
}

export interface MaterializedGraph {
    RootEntity: BaseEntity;
    StagedEntities: Map<string, BaseEntity>;
    SidecarEntities: BaseEntity[];
    PrerequisiteEntities?: BaseEntity[];
    /** Plan nodes saved as sidecars although planned in a collection (they point at another new row). */
    DeferredNodeKeys?: Set<string>;
}

export class CloneMaterializer {
    private _provider?: IMetadataProvider;

    public constructor(provider?: IMetadataProvider) {
        this._provider = provider;
    }

    protected get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Materializes a ClonePlan into memory.
     */
    public async Materialize(plan: ClonePlan, contextUser: UserInfo): Promise<MaterializedGraph> {
        const md = this.Provider;
        const stagedEntities = new Map<string, BaseEntity>();
        const sidecarEntities: BaseEntity[] = [];
        const prerequisiteEntities: BaseEntity[] = [];

        // 1. Build and Initialize Root
        const rootPlanNode = plan.Nodes.find((n) => n.Depth === 0);
        if (!rootPlanNode) {
            throw new Error(`Plan contains no root node (Depth === 0).`);
        }

        const rootEntity = await md.GetEntityObject<BaseEntity>(rootPlanNode.EntityName, contextUser);
        if (!rootEntity) {
            throw new Error(`Failed to instantiate entity object for root '${rootPlanNode.EntityName}'.`);
        }

        rootEntity.NewRecord();

        // The plan's field values are the whole row: excluded and denied fields keep the column default.
        this.applyFieldChanges(rootEntity, rootPlanNode);

        // Assign the planned target key (minted UUID or derived composite; none when server-assigned)
        applyTargetKey(rootEntity, rootPlanNode.TargetKey);

        const rootNodeKey = rootPlanNode.NodeKey ?? rootPlanNode.Key;
        stagedEntities.set(rootNodeKey, rootEntity);

        // Rows that point at another new row through a column other than their join field (a step
        // path's DestinationStepID, a step's SubAgentID) can't save inside the root's graph save,
        // which saves each row's children before its next sibling: the row they point at may not
        // exist yet. They become sidecars, saved after the graph in dependency order.
        const deferred = CloneMaterializer.rowsToDefer(plan);
        const sidecarKeys = new Map<BaseEntity, string>();

        // 2. Build Children by Depth (Depth 1, 2, ...)
        const maxDepth = Math.max(...plan.Nodes.map((n) => n.Depth));

        for (let d = 1; d <= maxDepth; d++) {
            const nodesAtDepth = plan.Nodes.filter((n) => n.Depth === d && n.Action === 'Create');

            for (const childNode of nodesAtDepth) {
                const childNodeKey = childNode.NodeKey ?? childNode.Key;

                // Find discovering edge pointing to this child
                const edge = plan.Edges.find((e) => e.ToKey === childNodeKey && e.Policy === 'Deep');
                if (!edge) {
                    continue;
                }

                const parentEntity = stagedEntities.get(edge.FromKey);
                if (!parentEntity) {
                    throw new Error(`Parent entity not found in staged graph for edge '${edge.FromKey}' -> '${childNodeKey}'.`);
                }

                // Determine or establish collection companion
                let childEntity: BaseEntity;
                if (edge.Kind === 'ForwardFK') {
                    // ForwardFK targets are prerequisite entities that must exist before the parent entity can reference them
                    childEntity = await md.GetEntityObject<BaseEntity>(childNode.EntityName, contextUser);
                    childEntity.NewRecord();
                    prerequisiteEntities.push(childEntity);
                } else {
                    const collection = deferred.has(childNodeKey)
                        ? null
                        : this.resolveOrCreateCollection(parentEntity, childNode.EntityName, edge.JoinField, edge.RelationshipID);
                    if (collection) {
                        childEntity = await collection.Create();
                    } else {
                        // Sidecar route: a deferred row, or one whose collection can't be declared
                        childEntity = await md.GetEntityObject<BaseEntity>(childNode.EntityName, contextUser);
                        childEntity.NewRecord();
                        sidecarEntities.push(childEntity);
                        sidecarKeys.set(childEntity, childNodeKey);
                    }
                }

                // The plan's field values are the whole row: excluded and denied fields keep the column default.
                this.applyFieldChanges(childEntity, childNode);

                // Assign the planned target key (minted UUID or derived composite; none when server-assigned)
                applyTargetKey(childEntity, childNode.TargetKey);

                // CRITICAL RULE (§6.7): Re-set the join field after the planned values.
                // Foreign keys reference a single-column key, so both sides of the join use that column.
                if (edge.Kind === 'ForwardFK') {
                    // In a ForwardFK, parentEntity owns the FK pointing to childEntity
                    const childKeyField = SingleKeyField(childEntity.EntityInfo, 'Pointing a row at its cloned prerequisite');
                    parentEntity.Set(edge.JoinField, childEntity.Get(childKeyField));
                } else if (edge.Kind === 'SoftLink') {
                    // Polymorphic EntityID/RecordID rows store the parent's record-id string, which
                    // works for a composite parent key too.
                    childEntity.Set(edge.JoinField, ToRecordKeyString(parentEntity.PrimaryKey));
                } else {
                    const parentKeyField = SingleKeyField(parentEntity.EntityInfo, 'Joining a cloned child to its parent');
                    childEntity.Set(edge.JoinField, parentEntity.Get(parentKeyField));
                }

                stagedEntities.set(childNodeKey, childEntity);
            }
        }

        return {
            RootEntity: rootEntity,
            StagedEntities: stagedEntities,
            SidecarEntities: CloneMaterializer.orderSidecars(plan, sidecarEntities, sidecarKeys),
            DeferredNodeKeys: deferred,
            PrerequisiteEntities: prerequisiteEntities,
        };
    }

    /**
     * Create rows with a remapped column, other than the join field to their parent, whose new
     * value is another new row's key: they must save after that row, not inside the graph save.
     */
    private static rowsToDefer(plan: ClonePlan): Set<string> {
        const newRowByKey = CloneMaterializer.newRowsByTargetKey(plan);
        const deferred = new Set<string>();
        for (const node of plan.Nodes) {
            if (node.Depth === 0 || node.Action !== 'Create') continue;
            const nodeKey = node.NodeKey ?? node.Key;
            const edge = plan.Edges.find((e) => e.ToKey === nodeKey && e.Policy === 'Deep');
            if (!edge || edge.Kind === 'ForwardFK') continue;
            const pointsAtNewRow = CloneMaterializer.remappedTargets(node, edge.JoinField, newRowByKey).some((target) => target !== nodeKey);
            if (pointsAtNewRow) deferred.add(nodeKey);
        }
        return deferred;
    }

    /** New rows by their planned key, lower-cased, for matching a remapped column's value. */
    private static newRowsByTargetKey(plan: ClonePlan): Map<string, string> {
        const byKey = new Map<string, string>();
        for (const node of plan.Nodes) {
            if (node.Action !== 'Create') continue;
            const key = ToRecordKeyString(node.TargetKey);
            if (key) byKey.set(key.toLowerCase(), node.NodeKey ?? node.Key);
        }
        return byKey;
    }

    /** Plan nodes a row points at through remapped columns other than `joinField`. */
    private static remappedTargets(node: ClonePlanNode, joinField: string, newRowByKey: Map<string, string>): string[] {
        const targets: string[] = [];
        for (const change of node.FieldChanges) {
            if (change.Kind !== 'Remap' || change.Field.toLowerCase() === joinField.toLowerCase()) continue;
            if (typeof change.NewValue !== 'string') continue;
            const target = newRowByKey.get(change.NewValue.toLowerCase());
            if (target) targets.push(target);
        }
        return targets;
    }

    /**
     * Sidecars in an order where each saves after the sidecars it depends on: its parent, when
     * the parent is a sidecar too, and the new rows its remapped columns point at. Rows saved in
     * the graph save come first anyway. Stable: independent sidecars keep their planned order.
     */
    private static orderSidecars(plan: ClonePlan, sidecars: BaseEntity[], keys: Map<BaseEntity, string>): BaseEntity[] {
        if (sidecars.length < 2) return sidecars;
        const newRowByKey = CloneMaterializer.newRowsByTargetKey(plan);
        const sidecarKeys = new Set(keys.values());
        const dependsOn = new Map<string, string[]>();
        for (const [, nodeKey] of keys) {
            const node = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
            const edge = plan.Edges.find((e) => e.ToKey === nodeKey && e.Policy === 'Deep');
            if (!node || !edge) continue;
            const deps = [edge.FromKey, ...CloneMaterializer.remappedTargets(node, edge.JoinField, newRowByKey)]
                .filter((k) => k !== nodeKey && sidecarKeys.has(k));
            dependsOn.set(nodeKey, deps);
        }
        const ordered: BaseEntity[] = [];
        const done = new Set<string>();
        const visiting = new Set<string>();
        const byKey = new Map([...keys].map(([entity, key]) => [key, entity]));
        const visit = (key: string) => {
            if (done.has(key) || visiting.has(key)) return; // a cycle can't all be inserted anyway; keep the planned order
            visiting.add(key);
            for (const dep of dependsOn.get(key) ?? []) visit(dep);
            visiting.delete(key);
            done.add(key);
            const entity = byKey.get(key);
            if (entity) ordered.push(entity);
        };
        for (const entity of sidecars) {
            const key = keys.get(entity);
            if (key) visit(key);
        }
        return ordered;
    }

    /**
     * Resolves an existing writable collection or declares a dynamic one on the parent entity.
     */
    private resolveOrCreateCollection(
        parent: BaseEntity,
        childEntityName: string,
        joinField: string,
        relationshipId?: string
    ): RelatedRecordCollection | null {
        // 1. Check if parent already has a declared writable collection for this child
        if (parent.HasCompanions) {
            for (const companion of parent.Companions) {
                if (companion instanceof RelatedRecordCollection) {
                    if (
                        companion.RelatedEntityName.toLowerCase() === childEntityName.toLowerCase() &&
                        companion.RelatedEntityJoinField.toLowerCase() === joinField.toLowerCase() &&
                        !companion.IsReadOnly
                    ) {
                        return companion;
                    }
                }
            }
        }

        // 2. Use DeclareRelatedRecordsDynamic to declare runtime collection companion
        const dynamicCollectionName = `_mj_clone_${childEntityName.replace(/[^a-zA-Z0-9_]/g, '_')}_${joinField}`;
        try {
            return parent.DeclareRelatedRecordsDynamic({
                Name: dynamicCollectionName,
                RelatedEntity: childEntityName,
                RelatedEntityJoinField: joinField,
                Source: 'database',
                ReadOnly: false,
            });
        } catch (err) {
            // The row still saves, but after the parent's transaction step rather than inside its
            // save (the sidecar route). Say so: it is the line between the two routes.
            LogError(`[RecordCloning] Could not declare ${childEntityName} rows as a collection of ${parent.EntityInfo?.Name ?? 'the parent'}; saving them as sidecars: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Writes the plan's field values in pipeline order, so later stages (reset, rename, remap,
     * prompt) win over the copied value. Fields the plan excludes are never set.
     */
    private applyFieldChanges(entity: BaseEntity, planNode: ClonePlanNode): void {
        for (const change of planNode.FieldChanges) {
            if (change.Kind === 'Excluded' || change.Kind === 'NotWritable' || change.Kind === 'DeniedRead' || change.Kind === 'DeniedCreate') {
                continue;
            }

            if (change.NewValue !== undefined) {
                entity.Set(change.Field, change.NewValue);
            }
        }
    }
}
