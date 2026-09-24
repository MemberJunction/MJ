/**
 * @file CloneMaterializer.ts
 * Builds the in-memory entity graph for record cloning.
 * Orchestrates collection routing (declared vs dynamic via DeclareRelatedRecordsDynamic),
 * CopyFrom with includePrimaryKeys=false, immediate join-field re-stamping,
 * polymorphic IS-A child additions, and sequence preservation.
 * @see plans/record-cloning/README.md §6, §13.1
 */

import {
    BaseEntity,
    CompositeKey,
    IMetadataProvider,
    Metadata,
    RelatedRecordCollection,
    UserInfo,
} from '@memberjunction/core';
import { ClonePlan, ClonePlanNode, CompositeKeyLike } from '@memberjunction/record-cloning-base';
import { SingleKeyField, ToCompositeKey, ToRecordKeyString } from './CloneKeys';

/** A loaded source row keyed by any of the forms callers use: full record-id string, or first value. */
function findLoadedSource(loaded: Map<string, BaseEntity> | undefined, key: CompositeKey, raw: unknown): BaseEntity | undefined {
    if (!loaded) return undefined;
    const candidates = [
        ToRecordKeyString(key),
        key.ToConcatenatedString(),
        typeof raw === 'string' ? raw : '',
        key.KeyValuePairs.length === 1 ? String(key.KeyValuePairs[0].Value ?? '') : '',
    ];
    for (const c of candidates) {
        if (c && loaded.has(c)) return loaded.get(c);
    }
    return undefined;
}

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
    public async Materialize(
        plan: ClonePlan,
        contextUser: UserInfo,
        loadedSources?: Map<string, BaseEntity>
    ): Promise<MaterializedGraph> {
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

        // Load root source if not provided (every key column, single or composite)
        const rootCompKey = ToCompositeKey(rootEntity.EntityInfo, rootPlanNode.SourceKey);
        let sourceRoot = findLoadedSource(loadedSources, rootCompKey, rootPlanNode.SourceKey);
        if (!sourceRoot) {
            sourceRoot = await md.GetEntityObject<BaseEntity>(rootPlanNode.EntityName, contextUser);
            await sourceRoot.InnerLoad(rootCompKey);
        }

        // Copy data from root source
        rootEntity.CopyFrom(sourceRoot, false);

        // Assign the planned target key (minted UUID or derived composite; none when server-assigned)
        applyTargetKey(rootEntity, rootPlanNode.TargetKey);

        // Apply mapped field values to root
        this.applyFieldChanges(rootEntity, rootPlanNode);

        const rootNodeKey = rootPlanNode.NodeKey ?? rootPlanNode.Key;
        stagedEntities.set(rootNodeKey, rootEntity);

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
                    const collection = this.resolveOrCreateCollection(parentEntity, childNode.EntityName, edge.JoinField, edge.RelationshipID);
                    if (collection) {
                        childEntity = await collection.Create();
                    } else {
                        // Sidecar route when collection cannot be declared
                        childEntity = await md.GetEntityObject<BaseEntity>(childNode.EntityName, contextUser);
                        childEntity.NewRecord();
                        sidecarEntities.push(childEntity);
                    }
                }

                // Load source child record (every key column, single or composite)
                const childCompKey = ToCompositeKey(childEntity.EntityInfo, childNode.SourceKey);
                let sourceChild = findLoadedSource(loadedSources, childCompKey, childNode.SourceKey);
                if (!sourceChild) {
                    sourceChild = await md.GetEntityObject<BaseEntity>(childNode.EntityName, contextUser);
                    await sourceChild.InnerLoad(childCompKey);
                }

                // Copy data from source child
                childEntity.CopyFrom(sourceChild, false);

                // Assign the planned target key (minted UUID or derived composite; none when server-assigned)
                applyTargetKey(childEntity, childNode.TargetKey);

                // CRITICAL RULE (§6.7): Re-set the join field immediately after CopyFrom.
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

                // Apply mapped field values
                this.applyFieldChanges(childEntity, childNode);

                stagedEntities.set(childNodeKey, childEntity);
            }
        }

        return {
            RootEntity: rootEntity,
            StagedEntities: stagedEntities,
            SidecarEntities: sidecarEntities,
            PrerequisiteEntities: prerequisiteEntities,
        };
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
        } catch {
            // If already declared or dynamic declaration disallowed, fall back to sidecar
            return null;
        }
    }

    /**
     * Applies planned field transformations to an entity instance.
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
