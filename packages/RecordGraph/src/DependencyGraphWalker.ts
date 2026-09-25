import {
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    EntityRelationshipInfo,
    IMetadataProvider,
    Metadata,
    RunView,
    
    UserInfo, LogError, LogStatus,
} from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    DependencyNode,
    EdgeKind,
    EdgePolicyDecision,
    GraphEdge,
    GraphEdgeCandidate,
    WalkOptions,
    WalkStats,
} from './types';
import { escapeSqlString, SqlIn } from './sql';
import { BuildCompositeKeyFromRecord } from './keys';
import { SortNodesTopologically } from './sort';
import { SYSTEM_FK_SKIP_PATTERNS } from './constants';

/** Discovery mode for child recursion */
type DiscoveryMode = 'full' | 'forward-only';

/** Internal cache entry for reverse relationships */
interface ReverseRelationship {
    ChildEntityInfo: EntityInfo;
    ChildJoinField: string;
    ParentKeyField: string;
    RelationshipInfo: EntityRelationshipInfo;
    CollectionName?: string;
    IsCollection: boolean;
}

/** Internal cache entry for forward references */
interface ForwardReference {
    TargetEntityInfo: EntityInfo;
    FKFieldName: string;
    TargetKeyField: string;
    IsSelf: boolean;
    IsHierarchy: boolean;
    IsEmbedded: boolean;
}

/**
 * Extended metadata provider interface with optional FindISAChildEntities
 */
interface IExtendedMetadataProvider extends IMetadataProvider {
    FindISAChildEntities?(
        entityInfo: EntityInfo,
        recordPKValue: string,
        contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string }[]>;
}

/**
 * Walks a record's relationship graph to discover all dependent and referenced records.
 *
 * Traversal rules:
 * - Reverse walk: follows curated One-To-Many relationships (where child points to parent).
 *   Recurses with 'full' mode (both reverse + forward).
 * - Forward walk: follows foreign keys on the parent (where parent points to another entity).
 *   Recurses with 'forward-only' mode — targets do NOT discover their own reverse children,
 *   preventing graph explosion from shared/hub entities.
 * - Subtypes: follows IS-A inheritance if IncludeSubtypes is true.
 * - Hierarchies: follows self-referencing hierarchy FKs if FollowHierarchies is true.
 * - Soft links: follows inbound polymorphic EntityID/RecordID links if IncludeSoftLinks is true.
 * - Non-curated inbound FKs: discovers non-curated inbound FKs if ListNonCuratedInbound is true.
 * - EdgePolicy: callers can supply an EdgePolicy callback to dictate Deep / Reference / Skip per edge.
 * - Cycle prevention: uses ancestorStack (entity types) to prevent backtracking and a global visited set (records).
 */
export class DependencyGraphWalker {
    /** Cache: entityID → reverse relationships from EntityRelationship metadata */
    private reverseRelCache = new Map<string, ReverseRelationship[]>();
    /** Cache: entityID → forward FK references from field metadata */
    private forwardRefCache = new Map<string, ForwardReference[]>();

    /** Optional provider override; falls back to Metadata.Provider when not set. */
    private _provider?: IMetadataProvider;

    public constructor(provider?: IMetadataProvider) {
        this._provider = provider;
    }

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IExtendedMetadataProvider {
        return (this._provider ?? Metadata.Provider) as IExtendedMetadataProvider;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Walk from a root record through its relationships, building a tree of
     * all records that should be included in a version label or clone plan.
     *
     * @param entityName - The starting entity name
     * @param recordKey  - The starting record's primary key
     * @param options    - Controls depth, filtering, policies, etc.
     * @param contextUser - Server-side user context
     * @returns The root DependencyNode with all descendants populated
     */
    public async WalkDependents(
        entityName: string,
        recordKey: CompositeKey,
        options: WalkOptions,
        contextUser: UserInfo
    ): Promise<DependencyNode> {
        const md = this.ProviderToUse;
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) {
            throw new Error(`Entity '${entityName}' not found in metadata`);
        }

        const resolvedOptions = this.resolveDefaults(options);
        const visited = new Set<string>();
        const ancestorStack = new Set<string>();
        const stats = this.createEmptyStats();
        this.reverseRelCache.clear();
        this.forwardRefCache.clear();

        const rootData = await this.loadRecordData(entityInfo, recordKey, contextUser);

        const rootNode: DependencyNode = {
            EntityName: entityName,
            EntityInfo: entityInfo,
            RecordKey: recordKey,
            RecordID: recordKey.ToConcatenatedString(),
            RecordData: rootData,
            Relationship: null,
            Children: [],
            Depth: 0,
            DiscoveringEdge: null,
        };

        // Mark root as visited and push its entity type onto the ancestor stack
        visited.add(this.visitKey(entityInfo.Name, rootNode.RecordID));
        ancestorStack.add(entityInfo.Name);
        this.incrementEntityCount(stats, entityInfo.Name);

        // Walk subtypes of root if requested
        if (resolvedOptions.IncludeSubtypes) {
            await this.walkSubtypes(rootNode, resolvedOptions, visited, ancestorStack, stats, contextUser);
        }

        // Root always gets full discovery mode (both reverse + forward)
        await this.walkChildren(rootNode, 'full', resolvedOptions, visited, ancestorStack, stats, contextUser);

        // Pop root (cleanup)
        ancestorStack.delete(entityInfo.Name);

        this.logWalkSummary(entityName, resolvedOptions, stats);

        return rootNode;
    }

    /**
     * Flatten a dependency tree into a topologically sorted list.
     * Parents appear before their children, ensuring safe restore or clone execution ordering.
     */
    public FlattenTopological(root: DependencyNode): DependencyNode[] {
        return SortNodesTopologically(root);
    }

    // =========================================================================
    // Core Walk Logic
    // =========================================================================

    /**
     * Recursively discover and attach child nodes for a given parent node.
     */
    private async walkChildren(
        parentNode: DependencyNode,
        discoveryMode: DiscoveryMode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        if (parentNode.Depth >= options.MaxDepth) {
            return;
        }

        // Reverse walk: only when in full mode (root or reverse-discovered nodes)
        if (discoveryMode === 'full') {
            await this.walkReverseRelationships(parentNode, options, visited, ancestorStack, stats, contextUser);

            if (options.ListNonCuratedInbound) {
                await this.walkNonCuratedInbound(parentNode, options, visited, ancestorStack, stats, contextUser);
            }

            if (options.IncludeSoftLinks) {
                await this.walkSoftLinks(parentNode, options, visited, ancestorStack, stats, contextUser);
            }
        } else {
            stats.ForwardOnlySuppressions++;
        }

        // Forward walk: always performed regardless of discovery mode
        await this.walkForwardReferences(parentNode, options, visited, ancestorStack, stats, contextUser);

        // Subtypes walk: if enabled, discover IS-A rows
        if (options.IncludeSubtypes) {
            await this.walkSubtypes(parentNode, options, visited, ancestorStack, stats, contextUser);
        }
    }

    // =========================================================================
    // Reverse Walking (EntityRelationship-driven)
    // =========================================================================

    /**
     * Walk reverse relationships: for each EntityRelationship on the parent
     * entity, load matching child records and recurse into them.
     */
    private async walkReverseRelationships(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        const relationships = this.discoverReverseRelationships(parentNode.EntityInfo, options);

        for (const rel of relationships) {
            const isHierarchyRel = UUIDsEqual(rel.ChildEntityInfo.ID, parentNode.EntityInfo.ID);
            if (isHierarchyRel && !options.FollowHierarchies) {
                continue;
            }

            // Ancestor check: skip if the child entity type is on our current path (unless allowed hierarchy recursion)
            if (ancestorStack.has(rel.ChildEntityInfo.Name) && !(isHierarchyRel && options.FollowHierarchies)) {
                stats.AncestorSkips++;
                continue;
            }

            if (this.shouldSkipEntity(rel.ChildEntityInfo.Name, options)) {
                continue;
            }

            const edgeKind: EdgeKind = isHierarchyRel ? 'Hierarchy' : (rel.IsCollection ? 'Collection' : 'Relationship');

            // Check edge policy before loading if policy is configured
            if (options.EdgePolicy) {
                const candidate: GraphEdgeCandidate = {
                    Kind: edgeKind,
                    SourceEntityName: parentNode.EntityName,
                    SourceKey: parentNode.RecordKey,
                    SourceRecordData: parentNode.RecordData,
                    TargetEntityName: rel.ChildEntityInfo.Name,
                    JoinField: rel.ChildJoinField,
                    Relationship: rel.RelationshipInfo,
                    CollectionName: rel.CollectionName,
                    IsSoftLink: false,
                    Depth: parentNode.Depth + 1,
                };
                const decision = options.EdgePolicy(candidate);
                if (decision === 'Skip') {
                    continue;
                }
            }

            const childRecords = await this.loadChildRecords(parentNode, rel, options, contextUser);

            for (const childData of childRecords) {
                const childKey = BuildCompositeKeyFromRecord(rel.ChildEntityInfo, childData);
                const discoveringEdge: GraphEdge = {
                    Kind: edgeKind,
                    FromKey: this.visitKey(parentNode.EntityName, parentNode.RecordID),
                    ToKey: this.visitKey(rel.ChildEntityInfo.Name, childKey.ToConcatenatedString()),
                    SourceEntityName: parentNode.EntityName,
                    TargetEntityName: rel.ChildEntityInfo.Name,
                    JoinField: rel.ChildJoinField,
                    Relationship: rel.RelationshipInfo,
                    CollectionName: rel.CollectionName,
                    IsSoftLink: false,
                };

                // Re-evaluate EdgePolicy per-record if candidate target key is known
                let decision: EdgePolicyDecision = 'Deep';
                if (options.EdgePolicy) {
                    const candidate: GraphEdgeCandidate = {
                        Kind: edgeKind,
                        SourceEntityName: parentNode.EntityName,
                        SourceKey: parentNode.RecordKey,
                        SourceRecordData: parentNode.RecordData,
                        TargetEntityName: rel.ChildEntityInfo.Name,
                        TargetKey: childKey,
                        JoinField: rel.ChildJoinField,
                        Relationship: rel.RelationshipInfo,
                        CollectionName: rel.CollectionName,
                        IsSoftLink: false,
                        Depth: parentNode.Depth + 1,
                    };
                    decision = options.EdgePolicy(candidate);
                    if (decision === 'Skip') continue;
                }

                const childNode = this.registerNode(
                    rel.ChildEntityInfo, childData, rel.RelationshipInfo, parentNode, visited, stats, discoveringEdge
                );
                if (!childNode) continue;

                if (decision === 'Deep') {
                    // Push child entity type, recurse with FULL mode, then pop
                    const alreadyInStack = ancestorStack.has(rel.ChildEntityInfo.Name);
                    if (!alreadyInStack) {
                        ancestorStack.add(rel.ChildEntityInfo.Name);
                    }
                    await this.walkChildren(childNode, 'full', options, visited, ancestorStack, stats, contextUser);
                    if (!alreadyInStack) {
                        ancestorStack.delete(rel.ChildEntityInfo.Name);
                    }
                }
            }
        }
    }

    // =========================================================================
    // Inbound Non-Curated FK Walking
    // =========================================================================

    /**
     * Discovers inbound foreign keys that are not registered as curated EntityRelationships.
     * Evaluated when ListNonCuratedInbound is true.
     */
    private async walkNonCuratedInbound(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        if (!options.EdgePolicy) return; // Non-curated inbound edges require an explicit policy

        const md = this.ProviderToUse;
        const parentEntity = parentNode.EntityInfo;
        const parentKeyField = parentEntity.FirstPrimaryKey.Name; // first-pk-ok: foreign keys target single-column primary keys
        const parentKeyValue = parentNode.RecordData[parentKeyField];
        if (parentKeyValue == null) return;

        // Curated child entity IDs to skip
        const curatedChildEntityIds = new Set(parentEntity.RelatedEntities.map(r => r.RelatedEntityID));

        for (const entity of md.Entities) {
            if (options.RequireTrackRecordChanges && !entity.TrackRecordChanges) continue;
            if (this.shouldSkipEntity(entity.Name, options)) continue;
            if (curatedChildEntityIds.has(entity.ID)) continue;

            for (const field of entity.Fields) {
                if (!field.RelatedEntityID || !UUIDsEqual(field.RelatedEntityID, parentEntity.ID)) continue;
                if (this.isSystemFKField(field.Name)) continue;

                const candidate: GraphEdgeCandidate = {
                    Kind: 'InboundFK',
                    SourceEntityName: parentNode.EntityName,
                    SourceKey: parentNode.RecordKey,
                    SourceRecordData: parentNode.RecordData,
                    TargetEntityName: entity.Name,
                    JoinField: field.Name,
                    Relationship: null,
                    IsSoftLink: false,
                    Depth: parentNode.Depth + 1,
                };

                const decision = options.EdgePolicy(candidate);
                if (decision === 'Skip') continue;

                // Load records matching inbound FK
                const filter = `[${field.Name}] = '${escapeSqlString(String(parentKeyValue))}'` +
                    (!options.IncludeDeleted && this.entityHasSoftDelete(entity) ? ' AND __mj_DeletedAt IS NULL' : '');

                try {
                    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                    const result = await rv.RunView<Record<string, unknown>>({
                        EntityName: entity.Name,
                        ExtraFilter: filter,
                        ResultType: 'simple',
                    }, contextUser);

                    if (!result.Success) continue;

                    for (const row of result.Results) {
                        const rowKey = BuildCompositeKeyFromRecord(entity, row);
                        const discoveringEdge: GraphEdge = {
                            Kind: 'InboundFK',
                            FromKey: this.visitKey(parentNode.EntityName, parentNode.RecordID),
                            ToKey: this.visitKey(entity.Name, rowKey.ToConcatenatedString()),
                            SourceEntityName: parentNode.EntityName,
                            TargetEntityName: entity.Name,
                            JoinField: field.Name,
                            Relationship: null,
                            IsSoftLink: false,
                        };

                        const childNode = this.registerNode(
                            entity, row, null, parentNode, visited, stats, discoveringEdge
                        );
                        if (!childNode) continue;

                        if (decision === 'Deep') {
                            ancestorStack.add(entity.Name);
                            await this.walkChildren(childNode, 'full', options, visited, ancestorStack, stats, contextUser);
                            ancestorStack.delete(entity.Name);
                        }
                    }
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    LogError(`DependencyGraphWalker: Error loading inbound FK records for ${entity.Name}: ${msg}`);
                }
            }
        }
    }

    // =========================================================================
    // Soft Link Walking
    // =========================================================================

    /**
     * Discovers records pointing to the parent via polymorphic EntityID/RecordID soft links.
     */
    private async walkSoftLinks(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        const md = this.ProviderToUse;
        const parentEntity = parentNode.EntityInfo;

        for (const entity of md.Entities) {
            if (options.RequireTrackRecordChanges && !entity.TrackRecordChanges) continue;
            if (this.shouldSkipEntity(entity.Name, options)) continue;

            // Look for fields declared with EntityIDFieldName
            for (const field of entity.Fields) {
                if (!field.EntityIDFieldName) continue;

                const candidate: GraphEdgeCandidate = {
                    Kind: 'SoftLink',
                    SourceEntityName: parentNode.EntityName,
                    SourceKey: parentNode.RecordKey,
                    SourceRecordData: parentNode.RecordData,
                    TargetEntityName: entity.Name,
                    JoinField: field.Name,
                    Relationship: null,
                    IsSoftLink: true,
                    EntityIDFieldName: field.EntityIDFieldName,
                    Depth: parentNode.Depth + 1,
                };

                const decision = options.EdgePolicy ? options.EdgePolicy(candidate) : 'Skip';
                if (decision === 'Skip') continue;

                // Build query: EntityID discriminator match and RecordID match
                // Soft links store either the full record-id ("ID|abc") or, commonly for a single
                // key column, the bare value ("abc"); match both.
                const recordIDValue = parentNode.RecordKey.ToRecordID();
                const bareIDValue = parentNode.RecordKey.ToCompactURLSegment();
                const filter = `([${field.EntityIDFieldName}] = '${escapeSqlString(parentEntity.ID)}' OR [${field.EntityIDFieldName}] = '${escapeSqlString(parentEntity.Name)}') ` +
                    `AND ([${field.Name}] = '${escapeSqlString(recordIDValue)}' OR [${field.Name}] = '${escapeSqlString(bareIDValue)}')` +
                    (!options.IncludeDeleted && this.entityHasSoftDelete(entity) ? ' AND __mj_DeletedAt IS NULL' : '');

                try {
                    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                    const result = await rv.RunView<Record<string, unknown>>({
                        EntityName: entity.Name,
                        ExtraFilter: filter,
                        ResultType: 'simple',
                    }, contextUser);

                    if (!result.Success) continue;

                    for (const row of result.Results) {
                        const rowKey = BuildCompositeKeyFromRecord(entity, row);
                        const discoveringEdge: GraphEdge = {
                            Kind: 'SoftLink',
                            FromKey: this.visitKey(parentNode.EntityName, parentNode.RecordID),
                            ToKey: this.visitKey(entity.Name, rowKey.ToConcatenatedString()),
                            SourceEntityName: parentNode.EntityName,
                            TargetEntityName: entity.Name,
                            JoinField: field.Name,
                            Relationship: null,
                            IsSoftLink: true,
                            EntityIDFieldName: field.EntityIDFieldName,
                        };

                        const childNode = this.registerNode(
                            entity, row, null, parentNode, visited, stats, discoveringEdge
                        );
                        if (!childNode) continue;

                        if (decision === 'Deep') {
                            ancestorStack.add(entity.Name);
                            await this.walkChildren(childNode, 'full', options, visited, ancestorStack, stats, contextUser);
                            ancestorStack.delete(entity.Name);
                        }
                    }
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    LogError(`DependencyGraphWalker: Error loading soft link records for ${entity.Name}: ${msg}`);
                }
            }
        }
    }

    // =========================================================================
    // Subtypes Walking (IS-A)
    // =========================================================================

    /**
     * Discover and attach IS-A subtype rows for a given parent record.
     */
    private async walkSubtypes(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        const md = this.ProviderToUse;
        if (!md.FindISAChildEntities) return;

        try {
            // IS-A tables share one single-column key, and the provider matches on its bare value
            // (not the "ID|<guid>" record-id string, which errors on a UUID column).
            const pkValue = parentNode.RecordKey.KeyValuePairs[0]?.Value;
            if (pkValue === null || pkValue === undefined) return;
            const subtypes = await md.FindISAChildEntities(
                parentNode.EntityInfo,
                String(pkValue),
                contextUser
            );

            for (const subtype of subtypes) {
                const childEntityInfo = md.EntityByName(subtype.ChildEntityName);
                if (!childEntityInfo) continue;
                if (options.RequireTrackRecordChanges && !childEntityInfo.TrackRecordChanges) continue;
                if (this.shouldSkipEntity(childEntityInfo.Name, options)) continue;

                const candidate: GraphEdgeCandidate = {
                    Kind: 'IsASubtype',
                    SourceEntityName: parentNode.EntityName,
                    SourceKey: parentNode.RecordKey,
                    SourceRecordData: parentNode.RecordData,
                    TargetEntityName: childEntityInfo.Name,
                    TargetKey: parentNode.RecordKey,
                    JoinField: childEntityInfo.FirstPrimaryKey.Name, // first-pk-ok: IS-A subtype shares the parent's single-column key
                    Relationship: null,
                    IsSoftLink: false,
                    Depth: parentNode.Depth + 1,
                };

                const decision = options.EdgePolicy ? options.EdgePolicy(candidate) : 'Deep';
                if (decision === 'Skip') continue;

                // Load subtype record using the same primary key value
                const childData = await this.loadRecordData(childEntityInfo, parentNode.RecordKey, contextUser);
                if (!childData || Object.keys(childData).length === 0) continue;

                const discoveringEdge: GraphEdge = {
                    Kind: 'IsASubtype',
                    FromKey: this.visitKey(parentNode.EntityName, parentNode.RecordID),
                    ToKey: this.visitKey(childEntityInfo.Name, parentNode.RecordID),
                    SourceEntityName: parentNode.EntityName,
                    TargetEntityName: childEntityInfo.Name,
                    JoinField: childEntityInfo.FirstPrimaryKey.Name, // first-pk-ok: IS-A subtype shares the parent's single-column key
                    Relationship: null,
                    IsSoftLink: false,
                };

                const childNode = this.registerNode(
                    childEntityInfo, childData, null, parentNode, visited, stats, discoveringEdge, true
                );
                if (!childNode) continue;

                if (decision === 'Deep') {
                    ancestorStack.add(childEntityInfo.Name);
                    await this.walkChildren(childNode, 'full', options, visited, ancestorStack, stats, contextUser);
                    ancestorStack.delete(childEntityInfo.Name);
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`DependencyGraphWalker: Error finding IS-A child entities for ${parentNode.EntityName}: ${msg}`);
        }
    }

    // =========================================================================
    // Forward Walking (FK field-driven)
    // =========================================================================

    /**
     * Walk forward FK references: for each FK field on the parent entity that
     * points to another entity, load the referenced record and recurse.
     */
    private async walkForwardReferences(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        const forwardRefs = this.discoverForwardReferences(parentNode.EntityInfo, options);

        for (const ref of forwardRefs) {
            // Self-pointer check
            if (ref.IsSelf) {
                if (ref.IsHierarchy && options.FollowHierarchies) {
                    // Follow hierarchy edge
                    const fkValue = parentNode.RecordData[ref.FKFieldName];
                    if (fkValue == null) continue;

                    const targetKey = new CompositeKey([{
                        FieldName: ref.TargetKeyField,
                        Value: fkValue,
                    }]);

                    const candidate: GraphEdgeCandidate = {
                        Kind: 'Hierarchy',
                        SourceEntityName: parentNode.EntityName,
                        SourceKey: parentNode.RecordKey,
                        SourceRecordData: parentNode.RecordData,
                        TargetEntityName: ref.TargetEntityInfo.Name,
                        TargetKey: targetKey,
                        JoinField: ref.FKFieldName,
                        Relationship: null,
                        IsSoftLink: false,
                        Depth: parentNode.Depth + 1,
                    };

                    const decision = options.EdgePolicy ? options.EdgePolicy(candidate) : 'Deep';
                    if (decision === 'Skip') continue;

                    const vKey = this.visitKey(ref.TargetEntityInfo.Name, targetKey.ToConcatenatedString());
                    if (visited.has(vKey)) {
                        stats.VisitedSkips++;
                        continue;
                    }

                    const targetData = await this.loadRecordData(ref.TargetEntityInfo, targetKey, contextUser);
                    if (!targetData || Object.keys(targetData).length === 0) continue;

                    const discoveringEdge: GraphEdge = {
                        Kind: 'Hierarchy',
                        FromKey: this.visitKey(parentNode.EntityName, parentNode.RecordID),
                        ToKey: vKey,
                        SourceEntityName: parentNode.EntityName,
                        TargetEntityName: ref.TargetEntityInfo.Name,
                        JoinField: ref.FKFieldName,
                        Relationship: null,
                        IsSoftLink: false,
                    };

                    const targetNode = this.registerNode(
                        ref.TargetEntityInfo, targetData, null, parentNode, visited, stats, discoveringEdge
                    );
                    if (!targetNode) continue;

                    if (decision === 'Deep') {
                        await this.walkChildren(targetNode, 'full', options, visited, ancestorStack, stats, contextUser);
                    }
                }
                // Plain self pointers are never followed automatically
                continue;
            }

            // Ancestor check: skip if target entity type is on our current path
            if (ancestorStack.has(ref.TargetEntityInfo.Name)) {
                stats.AncestorSkips++;
                continue;
            }

            if (this.shouldSkipEntity(ref.TargetEntityInfo.Name, options)) {
                continue;
            }

            // Read the FK value from the record data
            const fkValue = parentNode.RecordData[ref.FKFieldName];
            if (fkValue == null) continue;

            const targetKey = new CompositeKey([{
                FieldName: ref.TargetKeyField,
                Value: fkValue,
            }]);

            const edgeKind: EdgeKind = ref.IsEmbedded ? 'Embedded' : 'ForwardFK';

            // Check edge policy before loading
            let decision: EdgePolicyDecision = ref.IsEmbedded ? 'Deep' : 'Reference';
            if (options.EdgePolicy) {
                const candidate: GraphEdgeCandidate = {
                    Kind: edgeKind,
                    SourceEntityName: parentNode.EntityName,
                    SourceKey: parentNode.RecordKey,
                    SourceRecordData: parentNode.RecordData,
                    TargetEntityName: ref.TargetEntityInfo.Name,
                    TargetKey: targetKey,
                    JoinField: ref.FKFieldName,
                    Relationship: null,
                    IsSoftLink: false,
                    Depth: parentNode.Depth + 1,
                };
                decision = options.EdgePolicy(candidate);
                if (decision === 'Skip') continue;
            }

            // Skip if we've already visited this specific record
            const vKey = this.visitKey(ref.TargetEntityInfo.Name, targetKey.ToConcatenatedString());
            if (visited.has(vKey)) {
                stats.VisitedSkips++;
                continue;
            }

            const targetData = await this.loadRecordData(ref.TargetEntityInfo, targetKey, contextUser);
            if (!targetData || Object.keys(targetData).length === 0) continue;

            const discoveringEdge: GraphEdge = {
                Kind: edgeKind,
                FromKey: this.visitKey(parentNode.EntityName, parentNode.RecordID),
                ToKey: vKey,
                SourceEntityName: parentNode.EntityName,
                TargetEntityName: ref.TargetEntityInfo.Name,
                JoinField: ref.FKFieldName,
                Relationship: null,
                IsSoftLink: false,
            };

            const targetNode = this.registerNode(
                ref.TargetEntityInfo, targetData, null, parentNode, visited, stats, discoveringEdge
            );
            if (!targetNode) continue;

            // Recurse based on policy decision:
            // 'Deep' recurses with full mode; 'Reference' recurses with forward-only mode
            const nextMode: DiscoveryMode = decision === 'Deep' ? 'full' : 'forward-only';
            ancestorStack.add(ref.TargetEntityInfo.Name);
            await this.walkChildren(targetNode, nextMode, options, visited, ancestorStack, stats, contextUser);
            ancestorStack.delete(ref.TargetEntityInfo.Name);
        }
    }

    // =========================================================================
    // Relationship Discovery
    // =========================================================================

    /**
     * Discover reverse relationships for an entity using EntityRelationship metadata.
     */
    private discoverReverseRelationships(
        parentEntity: EntityInfo,
        options: Required<WalkOptions>
    ): ReverseRelationship[] {
        const cached = this.reverseRelCache.get(parentEntity.ID);
        if (cached) return cached;

        const md = this.ProviderToUse;
        const relationships: ReverseRelationship[] = [];

        for (const rel of parentEntity.RelatedEntities) {
            // Only walk One-To-Many (parent has many children)
            if (rel.Type.trim() !== 'One To Many') continue;

            const childEntity = md.Entities.find(e => UUIDsEqual(e.ID, rel.RelatedEntityID));
            if (!childEntity) continue;
            if (options.RequireTrackRecordChanges && !childEntity.TrackRecordChanges) continue;

            const parentKeyField = this.resolveParentKeyFieldFromRelationship(rel, parentEntity);

            let collectionName: string | undefined;
            let isCollection = false;
            if (rel.RelatedRecordCollection) {
                isCollection = true;
                try {
                    const parsed = typeof rel.RelatedRecordCollection === 'string'
                        ? (JSON.parse(rel.RelatedRecordCollection) as Record<string, unknown>)
                        : (rel.RelatedRecordCollection as Record<string, unknown>);
                    if (parsed && typeof parsed['Name'] === 'string') {
                        collectionName = parsed['Name'];
                    }
                } catch {
                    // Ignore parse error; keep isCollection = true
                }
            }

            relationships.push({
                ChildEntityInfo: childEntity,
                ChildJoinField: rel.RelatedEntityJoinField,
                ParentKeyField: parentKeyField,
                RelationshipInfo: rel,
                CollectionName: collectionName,
                IsCollection: isCollection,
            });
        }

        this.reverseRelCache.set(parentEntity.ID, relationships);
        return relationships;
    }

    /**
     * Discover forward FK references on an entity.
     */
    private discoverForwardReferences(
        entity: EntityInfo,
        options: Required<WalkOptions>
    ): ForwardReference[] {
        const cached = this.forwardRefCache.get(entity.ID);
        if (cached) return cached;

        const md = this.ProviderToUse;
        const refs: ForwardReference[] = [];

        for (const field of entity.Fields) {
            if (!field.RelatedEntityID) continue;
            if (this.isSystemFKField(field.Name)) continue;

            const isSelf = UUIDsEqual(field.RelatedEntityID, entity.ID);
            const targetEntity = isSelf ? entity : md.Entities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
            if (!targetEntity) continue;
            if (options.RequireTrackRecordChanges && !targetEntity.TrackRecordChanges) continue;

            const isHierarchy = field.IsHierarchy;

            refs.push({
                TargetEntityInfo: targetEntity,
                FKFieldName: field.Name,
                TargetKeyField: this.resolveParentKeyFieldFromFK(field, targetEntity),
                IsSelf: isSelf,
                IsHierarchy: isHierarchy,
                IsEmbedded: false, // Embedded records are declared in subclasses or metadata
            });
        }

        this.forwardRefCache.set(entity.ID, refs);
        return refs;
    }

    // =========================================================================
    // Data Loading
    // =========================================================================

    /**
     * Load child records for a reverse relationship.
     */
    private async loadChildRecords(
        parentNode: DependencyNode,
        rel: ReverseRelationship,
        options: Required<WalkOptions>,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>[]> {
        const parentKeyValue = parentNode.RecordData[rel.ParentKeyField] ?? null;
        if (parentKeyValue == null) return [];

        let extraFilter = `[${rel.ChildJoinField}] = '${escapeSqlString(String(parentKeyValue))}'`;
        if (!options.IncludeDeleted && this.entityHasSoftDelete(rel.ChildEntityInfo)) {
            extraFilter += ` AND __mj_DeletedAt IS NULL`;
        }

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: rel.ChildEntityInfo.Name,
                ExtraFilter: extraFilter,
                ResultType: 'simple',
            }, contextUser);

            if (!result.Success) {
                LogError(
                    `DependencyGraphWalker: Failed to load children of ` +
                    `${parentNode.EntityName} via ${rel.ChildEntityInfo.Name}.${rel.ChildJoinField}: ` +
                    `${result.ErrorMessage}`
                );
                return [];
            }
            return result.Results;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`DependencyGraphWalker: Error loading child records: ${msg}`);
            return [];
        }
    }

    /**
     * Load a single record's data by primary key.
     */
    private async loadRecordData(
        entityInfo: EntityInfo,
        key: CompositeKey,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: entityInfo.Name,
            ExtraFilter: key.ToWhereClause(),
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            LogError(
                `DependencyGraphWalker: loadRecordData returned empty for entity ` +
                `'${entityInfo.Name}' with key ${key.ToConcatenatedString()}`
            );
            return {};
        }
        return result.Results[0];
    }

    // =========================================================================
    // Node Registration
    // =========================================================================

    /**
     * Build a DependencyNode from record data, register it in the visited set,
     * and attach it as a child of the parent. Returns null if already visited.
     */
    private registerNode(
        entityInfo: EntityInfo,
        recordData: Record<string, unknown>,
        relationship: EntityRelationshipInfo | null,
        parentNode: DependencyNode,
        visited: Set<string>,
        stats: WalkStats,
        discoveringEdge?: GraphEdge | null,
        isSubtypeRow?: boolean
    ): DependencyNode | null {
        const key = BuildCompositeKeyFromRecord(entityInfo, recordData);
        const vKey = this.visitKey(entityInfo.Name, key.ToConcatenatedString());

        if (visited.has(vKey)) {
            stats.VisitedSkips++;
            return null;
        }
        visited.add(vKey);

        const node: DependencyNode = {
            EntityName: entityInfo.Name,
            EntityInfo: entityInfo,
            RecordKey: key,
            RecordID: key.ToConcatenatedString(),
            RecordData: recordData,
            Relationship: relationship,
            Children: [],
            Depth: parentNode.Depth + 1,
            DiscoveringEdge: discoveringEdge ?? null,
            IsSubtypeRow: isSubtypeRow ?? false,
        };

        parentNode.Children.push(node);
        this.incrementEntityCount(stats, entityInfo.Name);
        return node;
    }

    // =========================================================================
    // Logging
    // =========================================================================

    /** Create an empty stats accumulator. */
    private createEmptyStats(): WalkStats {
        return {
            EntityCounts: new Map(),
            TotalRecords: 0,
            AncestorSkips: 0,
            VisitedSkips: 0,
            ForwardOnlySuppressions: 0,
        };
    }

    /** Increment the per-entity record counter. */
    private incrementEntityCount(stats: WalkStats, entityName: string): void {
        stats.TotalRecords++;
        stats.EntityCounts.set(entityName, (stats.EntityCounts.get(entityName) ?? 0) + 1);
    }

    /**
     * Log a detailed summary of the walk.
     */
    private logWalkSummary(
        rootEntityName: string,
        options: Required<WalkOptions>,
        stats: WalkStats
    ): void {
        const entityBreakdown = Array.from(stats.EntityCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `    ${name}: ${count}`)
            .join('\n');

        LogStatus(
            `DependencyGraphWalker: Walk complete for '${rootEntityName}'\n` +
            `  Total records: ${stats.TotalRecords}\n` +
            `  Unique entities: ${stats.EntityCounts.size}\n` +
            `  Ancestor skips: ${stats.AncestorSkips}\n` +
            `  Visited skips: ${stats.VisitedSkips}\n` +
            `  Forward-only suppressions: ${stats.ForwardOnlySuppressions}\n` +
            `  Max depth: ${options.MaxDepth}\n` +
            `  Per-entity breakdown:\n${entityBreakdown}`
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Build a unique key for the visited set: "EntityName::recordID" */
    private visitKey(entityName: string, recordId: string): string {
        return `${entityName}::${recordId}`;
    }

    /**
     * Determine the parent key field from an EntityRelationship record.
     */
    private resolveParentKeyFieldFromRelationship(
        rel: EntityRelationshipInfo,
        parentEntity: EntityInfo
    ): string {
        if (rel.EntityKeyField && rel.EntityKeyField.trim().length > 0) {
            return rel.EntityKeyField;
        }
        return parentEntity.FirstPrimaryKey.Name; // first-pk-ok: FK target — relationship without explicit EntityKeyField joins on parent single key column
    }

    /**
     * Determine the target key field from a FK field definition.
     */
    private resolveParentKeyFieldFromFK(
        fkField: EntityFieldInfo,
        targetEntity: EntityInfo
    ): string {
        if (fkField.RelatedEntityFieldName && fkField.RelatedEntityFieldName.trim().length > 0) {
            return fkField.RelatedEntityFieldName;
        }
        return targetEntity.FirstPrimaryKey.Name; // first-pk-ok: FK target — column without RelatedEntityFieldName references target single key column
    }

    /** Check if a field name matches a system/infrastructure FK pattern. */
    private isSystemFKField(fieldName: string): boolean {
        return SYSTEM_FK_SKIP_PATTERNS.some(pattern => pattern.test(fieldName));
    }

    /** Check if an entity should be skipped based on filter options. */
    private shouldSkipEntity(entityName: string, options: Required<WalkOptions>): boolean {
        if (options.ExcludeEntities.length > 0 && options.ExcludeEntities.includes(entityName)) {
            return true;
        }
        if (options.EntityFilter.length > 0 && !options.EntityFilter.includes(entityName)) {
            return true;
        }
        return false;
    }

    /** Check if an entity has a soft delete field. */
    private entityHasSoftDelete(entityInfo: EntityInfo): boolean {
        return entityInfo.Fields.some(f => f.Name === '__mj_DeletedAt');
    }

    /** Apply defaults to walk options. */
    private resolveDefaults(options: WalkOptions): Required<WalkOptions> {
        return {
            MaxDepth: options.MaxDepth ?? 10,
            EntityFilter: options.EntityFilter ?? [],
            ExcludeEntities: options.ExcludeEntities ?? [],
            IncludeDeleted: options.IncludeDeleted ?? false,
            RequireTrackRecordChanges: options.RequireTrackRecordChanges ?? true,
            IncludeSoftLinks: options.IncludeSoftLinks ?? false,
            IncludeSubtypes: options.IncludeSubtypes ?? false,
            FollowHierarchies: options.FollowHierarchies ?? false,
            ListNonCuratedInbound: options.ListNonCuratedInbound ?? false,
            EdgePolicy: options.EdgePolicy ?? null as unknown as (edge: GraphEdgeCandidate) => EdgePolicyDecision,
            BatchChildLoads: options.BatchChildLoads ?? true,
        };
    }
}
