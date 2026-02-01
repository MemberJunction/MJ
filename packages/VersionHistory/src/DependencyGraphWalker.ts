import { CompositeKey, EntityInfo, EntityFieldInfo, EntityRelationshipInfo, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { DependencyNode, WalkOptions } from './types';
import { buildCompositeKeyFromRecord, escapeSqlString } from './constants';

/**
 * Describes a discovered relationship between a parent entity and a child entity.
 * Used internally to unify FK-based discovery (Layer 1) and EntityRelationship
 * supplemental discovery (Layer 2).
 */
interface DiscoveredRelationship {
    /** The child entity that references the parent */
    ChildEntityInfo: EntityInfo;
    /** The FK field on the child entity that points to the parent */
    ChildJoinField: string;
    /** The field on the parent entity that the FK references (usually the PK) */
    ParentKeyField: string;
    /** Source of discovery: 'fk' for ground-truth FK fields, 'relationship' for EntityRelationships */
    Source: 'fk' | 'relationship';
    /** Original EntityRelationshipInfo if from Layer 2 */
    RelationshipInfo: EntityRelationshipInfo | null;
}

/**
 * Walks entity relationship graphs to discover dependent records.
 *
 * Uses a two-layer discovery approach:
 *
 * **Layer 1 (Ground Truth)**: Scans all entities' foreign key fields
 * (`EntityFieldInfo.RelatedEntityID`) to find every FK that points to the
 * current entity. This is the authoritative source of relationships.
 *
 * **Layer 2 (Supplemental)**: Checks `EntityRelationshipInfo` entries for any
 * additional relationships not captured by Layer 1 (e.g., polymorphic keys
 * using EntityID/RecordID pairs that don't have database FK constraints).
 *
 * Only walks into entities where `TrackRecordChanges === true`, since those
 * are the entities with meaningful version state worth capturing.
 */
export class DependencyGraphWalker {
    /** Cache of discovered relationships per entity ID to avoid repeated scans */
    private relationshipCache = new Map<string, DiscoveredRelationship[]>();

    /**
     * Walk downward from a root record through its relationships,
     * building a tree of all dependent records.
     *
     * @param entityName - The starting entity name
     * @param recordKey - The starting record's primary key
     * @param options - Controls depth, filtering, etc.
     * @param contextUser - Server-side user context
     * @returns The root DependencyNode with all descendants populated
     */
    public async WalkDependents(
        entityName: string,
        recordKey: CompositeKey,
        options: WalkOptions,
        contextUser: UserInfo
    ): Promise<DependencyNode> {
        const md = new Metadata();
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) {
            throw new Error(`Entity '${entityName}' not found in metadata`);
        }

        const resolvedOptions = this.resolveDefaults(options);
        const visited = new Set<string>();
        this.relationshipCache.clear();

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
        };

        // Mark root as visited
        visited.add(`${entityInfo.Name}::${rootNode.RecordID}`);

        await this.walkChildren(rootNode, resolvedOptions, visited, contextUser);

        LogStatus(
            `DependencyGraphWalker: Walked ${visited.size} records from ` +
            `'${entityName}' (max depth: ${resolvedOptions.MaxDepth})`
        );

        return rootNode;
    }

    /**
     * Flatten a dependency tree into a topologically sorted list.
     * Parents appear before their children, ensuring safe restore ordering.
     */
    public FlattenTopological(root: DependencyNode): DependencyNode[] {
        const result: DependencyNode[] = [];
        this.flattenBFS(root, result);
        return result;
    }

    // =========================================================================
    // Relationship Discovery (Two-Layer)
    // =========================================================================

    /**
     * Discover all relationships where other entities reference the given entity.
     *
     * Layer 1: Scan all entities' FK fields for any field whose RelatedEntityID
     * matches the parent entity. This is the ground truth.
     *
     * Layer 2: Check EntityRelationships for supplemental relationships not
     * already covered (e.g., polymorphic EntityID/RecordID patterns).
     */
    private discoverRelationships(parentEntity: EntityInfo): DiscoveredRelationship[] {
        const cached = this.relationshipCache.get(parentEntity.ID);
        if (cached) return cached;

        const md = new Metadata();
        const discovered: DiscoveredRelationship[] = [];

        // Track what we've found via FK so we can detect supplemental-only relationships
        const coveredKeys = new Set<string>(); // "childEntityID::childFieldName"

        // ----- Layer 1: FK-based ground truth -----
        for (const entity of md.Entities) {
            // Only walk into entities that track record changes
            if (!entity.TrackRecordChanges) continue;

            for (const field of entity.Fields) {
                if (!field.RelatedEntityID || field.RelatedEntityID !== parentEntity.ID) {
                    continue;
                }

                // Determine which parent field the FK points to
                const parentKeyField = this.resolveParentKeyField(
                    field, parentEntity
                );

                discovered.push({
                    ChildEntityInfo: entity,
                    ChildJoinField: field.Name,
                    ParentKeyField: parentKeyField,
                    Source: 'fk',
                    RelationshipInfo: null,
                });

                coveredKeys.add(`${entity.ID}::${field.Name}`);
            }
        }

        // ----- Layer 2: EntityRelationships supplemental -----
        for (const rel of parentEntity.RelatedEntities) {
            // Build a key to check if this relationship is already covered by Layer 1
            const relKey = `${rel.RelatedEntityID}::${rel.RelatedEntityJoinField}`;

            if (coveredKeys.has(relKey)) {
                continue; // Already discovered via FK, skip duplicate
            }

            // This relationship exists in EntityRelationships but NOT as an FK field.
            // This handles polymorphic keys (EntityID/RecordID patterns), many-to-many
            // via junction tables, or other special relationships.
            const childEntity = md.Entities.find(e => e.ID === rel.RelatedEntityID);
            if (!childEntity) continue;
            if (!childEntity.TrackRecordChanges) continue;

            // Only handle One To Many for dependency walking
            if (rel.Type !== 'One To Many') continue;

            const parentKeyField = (rel.EntityKeyField && rel.EntityKeyField.trim().length > 0)
                ? rel.EntityKeyField
                : parentEntity.FirstPrimaryKey.Name;

            discovered.push({
                ChildEntityInfo: childEntity,
                ChildJoinField: rel.RelatedEntityJoinField,
                ParentKeyField: parentKeyField,
                Source: 'relationship',
                RelationshipInfo: rel,
            });

            coveredKeys.add(relKey);
        }

        this.relationshipCache.set(parentEntity.ID, discovered);
        return discovered;
    }

    /**
     * Given an FK field on a child entity, determine which field on the parent entity
     * it references. Uses RelatedEntityFieldName if available, otherwise defaults
     * to the parent's first primary key.
     */
    private resolveParentKeyField(
        fkField: EntityFieldInfo,
        parentEntity: EntityInfo
    ): string {
        if (fkField.RelatedEntityFieldName && fkField.RelatedEntityFieldName.trim().length > 0) {
            return fkField.RelatedEntityFieldName;
        }
        return parentEntity.FirstPrimaryKey.Name;
    }

    // =========================================================================
    // Tree Walking
    // =========================================================================

    /**
     * Recursively discover and attach child nodes for a given parent.
     */
    private async walkChildren(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        contextUser: UserInfo
    ): Promise<void> {
        if (parentNode.Depth >= options.MaxDepth) {
            return;
        }

        const relationships = this.discoverRelationships(parentNode.EntityInfo);

        for (const rel of relationships) {
            if (this.shouldSkipEntity(rel.ChildEntityInfo.Name, options)) {
                continue;
            }

            const childRecords = await this.loadChildRecords(
                parentNode, rel, options, contextUser
            );

            for (const childData of childRecords) {
                const childKey = buildCompositeKeyFromRecord(rel.ChildEntityInfo, childData);
                const visitKey = `${rel.ChildEntityInfo.Name}::${childKey.ToConcatenatedString()}`;

                if (visited.has(visitKey)) {
                    continue; // Cycle detection
                }
                visited.add(visitKey);

                const childNode: DependencyNode = {
                    EntityName: rel.ChildEntityInfo.Name,
                    EntityInfo: rel.ChildEntityInfo,
                    RecordKey: childKey,
                    RecordID: childKey.ToConcatenatedString(),
                    RecordData: childData,
                    Relationship: rel.RelationshipInfo,
                    Children: [],
                    Depth: parentNode.Depth + 1,
                };

                parentNode.Children.push(childNode);
                await this.walkChildren(childNode, options, visited, contextUser);
            }
        }
    }

    // =========================================================================
    // Data Loading
    // =========================================================================

    /**
     * Load child records for a given parent node + discovered relationship.
     */
    private async loadChildRecords(
        parentNode: DependencyNode,
        rel: DiscoveredRelationship,
        options: Required<WalkOptions>,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>[]> {
        const parentKeyValue = parentNode.RecordData[rel.ParentKeyField] ?? null;
        if (parentKeyValue === null || parentKeyValue === undefined) {
            return [];
        }

        let extraFilter = `[${rel.ChildJoinField}] = '${escapeSqlString(String(parentKeyValue))}'`;
        if (!options.IncludeDeleted && this.hasSoftDeleteField(rel.ChildEntityInfo)) {
            extraFilter += ` AND __mj_DeletedAt IS NULL`;
        }

        try {
            const rv = new RunView();
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
            const errorMsg = e instanceof Error ? e.message : String(e);
            LogError(`DependencyGraphWalker: Error loading child records: ${errorMsg}`);
            return [];
        }
    }

    /**
     * Load the current data for a single record.
     */
    private async loadRecordData(
        entityInfo: EntityInfo,
        key: CompositeKey,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>> {
        const rv = new RunView();
        const whereClause = key.ToWhereClause();

        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: entityInfo.Name,
            ExtraFilter: whereClause,
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
    // Helpers
    // =========================================================================

    /**
     * Flatten using BFS to get a natural parent-before-child ordering.
     */
    private flattenBFS(root: DependencyNode, result: DependencyNode[]): void {
        const queue: DependencyNode[] = [root];
        while (queue.length > 0) {
            const node = queue.shift()!;
            result.push(node);
            for (const child of node.Children) {
                queue.push(child);
            }
        }
    }

    /**
     * Check if an entity should be skipped based on filter options.
     */
    private shouldSkipEntity(entityName: string, options: Required<WalkOptions>): boolean {
        if (options.ExcludeEntities.length > 0 && options.ExcludeEntities.includes(entityName)) {
            return true;
        }
        if (options.EntityFilter.length > 0 && !options.EntityFilter.includes(entityName)) {
            return true;
        }
        return false;
    }

    /**
     * Check if an entity has a soft delete field.
     */
    private hasSoftDeleteField(entityInfo: EntityInfo): boolean {
        return entityInfo.Fields.some(f => f.Name === '__mj_DeletedAt');
    }

    /**
     * Apply defaults to walk options.
     */
    private resolveDefaults(options: WalkOptions): Required<WalkOptions> {
        return {
            MaxDepth: options.MaxDepth ?? 10,
            EntityFilter: options.EntityFilter ?? [],
            ExcludeEntities: options.ExcludeEntities ?? [],
            IncludeDeleted: options.IncludeDeleted ?? false,
        };
    }
}
