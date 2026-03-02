import { CompositeKey, EntityInfo, EntityFieldInfo, EntityRelationshipInfo, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DependencyNode, WalkOptions } from './types';
import { buildCompositeKeyFromRecord, escapeSqlString } from './constants';

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Controls how deeply a node is explored.
 *
 * - `'full'` — both reverse (EntityRelationship children) AND forward (FK refs)
 *   walks are performed. Used for the root record and for records discovered via
 *   reverse walk (they are "owned children" that may have their own children).
 *
 * - `'forward-only'` — only forward FK references are followed. Reverse
 *   EntityRelationship children are NOT discovered. Used for records found via
 *   forward FK references (they are "referenced records", not owned children).
 *   This is the key mechanism that prevents graph explosion: following a FK to
 *   AI Models does NOT then reverse-walk to find every Prompt that uses that model.
 */
type DiscoveryMode = 'full' | 'forward-only';

/**
 * A reverse relationship discovered from EntityRelationship metadata.
 * Represents a child entity that references the parent via a FK field.
 */
interface ReverseRelationship {
    /** The child entity that has a FK pointing to the parent */
    ChildEntityInfo: EntityInfo;
    /** The FK field name on the child entity */
    ChildJoinField: string;
    /** The field on the parent entity that the FK references (usually the PK) */
    ParentKeyField: string;
    /** The original EntityRelationshipInfo from metadata */
    RelationshipInfo: EntityRelationshipInfo;
}

/**
 * A forward FK reference from the current entity to another entity.
 * Represents a record that the current entity points to via one of its FK fields.
 */
interface ForwardReference {
    /** The entity that the FK points to */
    TargetEntityInfo: EntityInfo;
    /** The FK field on the current entity */
    FKFieldName: string;
    /** The field on the target entity that is referenced (usually the PK) */
    TargetKeyField: string;
}

/**
 * Accumulated walk statistics for logging.
 */
interface WalkStats {
    /** Count of records per entity name */
    EntityCounts: Map<string, number>;
    /** Total records discovered */
    TotalRecords: number;
    /** Count of records skipped by ancestor stack */
    AncestorSkips: number;
    /** Count of records skipped by visited set */
    VisitedSkips: number;
    /** Count of reverse walks suppressed on forward-discovered nodes */
    ForwardOnlySuppressions: number;
}

// =============================================================================
// System FK Skip Patterns
// =============================================================================

/**
 * FK field name patterns that should NOT be followed during forward walking.
 * These reference system infrastructure (Users, audit fields, polymorphic
 * entity references) rather than business data. Following them would pull in
 * every user record, every entity definition, etc.
 */
const SYSTEM_FK_SKIP_PATTERNS: RegExp[] = [
    /^CreatedByUserID$/i,
    /^UpdatedByUserID$/i,
    /^UserID$/i,
    /^ContextUser(ID)?$/i,
    /^ModifiedBy(UserID)?$/i,
    /^CreatedBy$/i,
    /^UpdatedBy$/i,
    /^Owner(ID|UserID)?$/i,
    /^AssignedTo(ID|UserID)?$/i,
    /^EntityID$/i,  // polymorphic entity reference, not a real FK to follow
];

// =============================================================================
// DependencyGraphWalker
// =============================================================================

/**
 * Walks entity relationship graphs to discover records for version labeling.
 *
 * ## Two-direction traversal
 *
 * **Reverse**: Uses the entity's `RelatedEntities` (EntityRelationship metadata)
 * to find child records. This is curated by CodeGen and admins — only explicitly
 * registered One-To-Many relationships are walked.
 *
 * **Forward**: Scans the current entity's own FK fields to find records it
 * references (e.g., AI Agent Prompt → AI Prompt via PromptID). Skips
 * system/infrastructure fields (UserID, CreatedBy, etc.).
 *
 * ## Discovery mode — prevents explosion from forward references
 *
 * Records found via **reverse walk** are "owned children" and get full treatment
 * (both reverse + forward walks). Records found via **forward walk** are
 * "referenced records" and only get forward-only treatment (their own FK refs
 * are followed, but their EntityRelationship children are NOT discovered).
 *
 * This prevents the classic explosion pattern:
 * ```
 * Agent → AgentPrompt → Prompt → [reverse to ALL PromptModels] → Model
 *   → [reverse to ALL AgentModels across ALL agents] → explosion!
 * ```
 *
 * With discovery mode:
 * ```
 * Agent → AgentPrompt(reverse,full) → Prompt(forward,forward-only)
 *   → Model(forward,forward-only) → STOP (no reverse walk on Model)
 * ```
 *
 * ## Ancestor stack — prevents backtracking
 *
 * A set of entity names on the current path from root to the current node is
 * maintained. When evaluating any relationship, if the target entity type is
 * already on the ancestor stack, it is skipped. This is a secondary safety net
 * that prevents cycles even within full-mode walks.
 *
 * ## Filters
 *
 * - Only walks entities with `TrackRecordChanges === true`
 * - Skips system FK fields via regex patterns (UserID, CreatedBy, etc.)
 * - Respects `ExcludeEntities` and `EntityFilter` options
 * - Uses a global `visited` set for record-level cycle detection
 */
export class DependencyGraphWalker {
    /** Cache: entityID → reverse relationships from EntityRelationship metadata */
    private reverseRelCache = new Map<string, ReverseRelationship[]>();
    /** Cache: entityID → forward FK references from field metadata */
    private forwardRefCache = new Map<string, ForwardReference[]>();

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Walk from a root record through its relationships, building a tree of
     * all records that should be included in a version label.
     *
     * @param entityName - The starting entity name
     * @param recordKey  - The starting record's primary key
     * @param options    - Controls depth, filtering, etc.
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
        };

        // Mark root as visited and push its entity type onto the ancestor stack
        visited.add(this.visitKey(entityInfo.Name, rootNode.RecordID));
        ancestorStack.add(entityInfo.Name);
        this.incrementEntityCount(stats, entityInfo.Name);

        // Root always gets full discovery mode (both reverse + forward)
        await this.walkChildren(rootNode, 'full', resolvedOptions, visited, ancestorStack, stats, contextUser);

        // Pop root (cleanup)
        ancestorStack.delete(entityInfo.Name);

        this.logWalkSummary(entityName, resolvedOptions, stats);

        return rootNode;
    }

    /**
     * Flatten a dependency tree into a topologically sorted list.
     * Parents appear before their children, ensuring safe restore ordering.
     */
    public FlattenTopological(root: DependencyNode): DependencyNode[] {
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

    // =========================================================================
    // Core Walk Logic
    // =========================================================================

    /**
     * Recursively discover and attach child nodes for a given parent node.
     *
     * The `discoveryMode` controls which directions are walked:
     * - `'full'`: both reverse (EntityRelationship) and forward (FK refs)
     * - `'forward-only'`: only forward FK refs — no reverse children discovered
     *
     * Records found via reverse walk are recursed with `'full'` mode.
     * Records found via forward walk are recursed with `'forward-only'` mode.
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
        } else {
            stats.ForwardOnlySuppressions++;
        }

        // Forward walk: always performed regardless of discovery mode
        await this.walkForwardReferences(parentNode, options, visited, ancestorStack, stats, contextUser);
    }

    // =========================================================================
    // Reverse Walking (EntityRelationship-driven)
    // =========================================================================

    /**
     * Walk reverse relationships: for each EntityRelationship on the parent
     * entity, load matching child records and recurse into them.
     *
     * Skips any child entity type that is already on the ancestor stack,
     * preventing backtracking (e.g., from AI Prompt back to AI Agent Prompts).
     *
     * Children found via reverse walk are recursed with 'full' discovery mode,
     * since they are "owned children" that may have their own children.
     */
    private async walkReverseRelationships(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        const relationships = this.discoverReverseRelationships(parentNode.EntityInfo);

        for (const rel of relationships) {
            // Ancestor check: skip if the child entity type is on our current path
            if (ancestorStack.has(rel.ChildEntityInfo.Name)) {
                stats.AncestorSkips++;
                continue;
            }

            if (this.shouldSkipEntity(rel.ChildEntityInfo.Name, options)) {
                continue;
            }

            const childRecords = await this.loadChildRecords(parentNode, rel, options, contextUser);

            for (const childData of childRecords) {
                const childNode = this.registerNode(
                    rel.ChildEntityInfo, childData, rel.RelationshipInfo, parentNode, visited, stats
                );
                if (!childNode) continue;

                // Push child entity type, recurse with FULL mode, then pop
                ancestorStack.add(rel.ChildEntityInfo.Name);
                await this.walkChildren(childNode, 'full', options, visited, ancestorStack, stats, contextUser);
                ancestorStack.delete(rel.ChildEntityInfo.Name);
            }
        }
    }

    // =========================================================================
    // Forward Walking (FK field-driven)
    // =========================================================================

    /**
     * Walk forward FK references: for each FK field on the parent entity that
     * points to another tracked entity, load the referenced record and recurse.
     *
     * Skips system/infrastructure FKs (UserID, CreatedBy, etc.) and any target
     * entity type already on the ancestor stack.
     *
     * Targets found via forward walk are recursed with 'forward-only' discovery
     * mode — they won't discover their own reverse children, preventing graph
     * explosion from "hub" entities like AI Models.
     */
    private async walkForwardReferences(
        parentNode: DependencyNode,
        options: Required<WalkOptions>,
        visited: Set<string>,
        ancestorStack: Set<string>,
        stats: WalkStats,
        contextUser: UserInfo
    ): Promise<void> {
        const forwardRefs = this.discoverForwardReferences(parentNode.EntityInfo);

        for (const ref of forwardRefs) {
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

            // Skip if we've already visited this specific record
            const vKey = this.visitKey(ref.TargetEntityInfo.Name, targetKey.ToConcatenatedString());
            if (visited.has(vKey)) {
                stats.VisitedSkips++;
                continue;
            }

            const targetData = await this.loadRecordData(ref.TargetEntityInfo, targetKey, contextUser);
            if (!targetData || Object.keys(targetData).length === 0) continue;

            const targetNode = this.registerNode(
                ref.TargetEntityInfo, targetData, null, parentNode, visited, stats
            );
            if (!targetNode) continue;

            // Push target entity type, recurse with FORWARD-ONLY mode, then pop
            ancestorStack.add(ref.TargetEntityInfo.Name);
            await this.walkChildren(targetNode, 'forward-only', options, visited, ancestorStack, stats, contextUser);
            ancestorStack.delete(ref.TargetEntityInfo.Name);
        }
    }

    // =========================================================================
    // Relationship Discovery
    // =========================================================================

    /**
     * Discover reverse relationships for an entity using EntityRelationship
     * metadata. Only includes One-To-Many relationships to entities that have
     * TrackRecordChanges enabled.
     *
     * Uses EntityRelationship (already loaded in memory on EntityInfo) rather
     * than scanning all entities' FK fields. This means only relationships
     * that CodeGen or admins have explicitly registered are walked.
     */
    private discoverReverseRelationships(parentEntity: EntityInfo): ReverseRelationship[] {
        const cached = this.reverseRelCache.get(parentEntity.ID);
        if (cached) return cached;

        const md = new Metadata();
        const relationships: ReverseRelationship[] = [];

        for (const rel of parentEntity.RelatedEntities) {
            // Only walk One-To-Many (parent has many children)
            if (rel.Type.trim() !== 'One To Many') continue;

            const childEntity = md.Entities.find(e => UUIDsEqual(e.ID, rel.RelatedEntityID));
            if (!childEntity) continue;
            if (!childEntity.TrackRecordChanges) continue;

            const parentKeyField = this.resolveParentKeyFieldFromRelationship(rel, parentEntity);

            relationships.push({
                ChildEntityInfo: childEntity,
                ChildJoinField: rel.RelatedEntityJoinField,
                ParentKeyField: parentKeyField,
                RelationshipInfo: rel,
            });
        }

        this.reverseRelCache.set(parentEntity.ID, relationships);
        return relationships;
    }

    /**
     * Discover forward FK references on an entity — fields that point TO other
     * entities. Only includes references to entities with TrackRecordChanges
     * enabled, and skips system/infrastructure FK fields.
     */
    private discoverForwardReferences(entity: EntityInfo): ForwardReference[] {
        const cached = this.forwardRefCache.get(entity.ID);
        if (cached) return cached;

        const md = new Metadata();
        const refs: ForwardReference[] = [];

        for (const field of entity.Fields) {
            if (!field.RelatedEntityID) continue;
            if (this.isSystemFKField(field.Name)) continue;
            if (UUIDsEqual(field.RelatedEntityID, entity.ID)) continue; // skip self-referencing

            const targetEntity = md.Entities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
            if (!targetEntity) continue;
            if (!targetEntity.TrackRecordChanges) continue;

            refs.push({
                TargetEntityInfo: targetEntity,
                FKFieldName: field.Name,
                TargetKeyField: this.resolveParentKeyFieldFromFK(field, targetEntity),
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
     * Queries the child entity where the join field matches the parent's key value.
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
        const rv = new RunView();
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
        stats: WalkStats
    ): DependencyNode | null {
        const key = buildCompositeKeyFromRecord(entityInfo, recordData);
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
     * Log a detailed summary of the walk: total records, per-entity counts,
     * skips, and suppression stats.
     */
    private logWalkSummary(
        rootEntityName: string,
        options: Required<WalkOptions>,
        stats: WalkStats
    ): void {
        const entityBreakdown = Array.from(stats.EntityCounts.entries())
            .sort((a, b) => b[1] - a[1])  // sort by count descending
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
     * Uses EntityKeyField if specified, otherwise falls back to the first PK.
     */
    private resolveParentKeyFieldFromRelationship(
        rel: EntityRelationshipInfo,
        parentEntity: EntityInfo
    ): string {
        if (rel.EntityKeyField && rel.EntityKeyField.trim().length > 0) {
            return rel.EntityKeyField;
        }
        return parentEntity.FirstPrimaryKey.Name;
    }

    /**
     * Determine the target key field from a FK field definition.
     * Uses RelatedEntityFieldName if specified, otherwise falls back to the
     * target entity's first PK.
     */
    private resolveParentKeyFieldFromFK(
        fkField: EntityFieldInfo,
        targetEntity: EntityInfo
    ): string {
        if (fkField.RelatedEntityFieldName && fkField.RelatedEntityFieldName.trim().length > 0) {
            return fkField.RelatedEntityFieldName;
        }
        return targetEntity.FirstPrimaryKey.Name;
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
        };
    }
}
