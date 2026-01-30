import { CompositeKey, EntityInfo, Metadata, RunView, UserInfo, LogError } from '@memberjunction/core';
import { DependencyNode, WalkOptions } from './types';

/**
 * Walks entity relationship graphs to discover dependent records.
 * Uses EntityRelationshipInfo metadata to traverse One-To-Many relationships
 * from a starting record outward to its children and grandchildren.
 */
export class DependencyGraphWalker {
    /**
     * Walk downward from a root record through its One-To-Many relationships,
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

        await this.walkChildren(rootNode, resolvedOptions, visited, contextUser);
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

        const parentEntity = parentNode.EntityInfo;
        const relationships = parentEntity.RelatedEntities;

        for (const rel of relationships) {
            if (rel.Type !== 'One To Many') {
                continue; // Skip Many-To-Many for now; they are junction tables
            }

            const relatedEntityInfo = this.getRelatedEntityInfo(rel.RelatedEntityID);
            if (!relatedEntityInfo) {
                continue;
            }

            if (this.shouldSkipEntity(relatedEntityInfo.Name, options)) {
                continue;
            }

            const childRecords = await this.loadChildRecords(
                parentNode,
                rel,
                relatedEntityInfo,
                options,
                contextUser
            );

            for (const childData of childRecords) {
                const childKey = this.buildCompositeKey(relatedEntityInfo, childData);
                const visitKey = `${relatedEntityInfo.Name}::${childKey.ToConcatenatedString()}`;

                if (visited.has(visitKey)) {
                    continue; // Cycle detection
                }
                visited.add(visitKey);

                const childNode: DependencyNode = {
                    EntityName: relatedEntityInfo.Name,
                    EntityInfo: relatedEntityInfo,
                    RecordKey: childKey,
                    RecordID: childKey.ToConcatenatedString(),
                    RecordData: childData,
                    Relationship: rel,
                    Children: [],
                    Depth: parentNode.Depth + 1,
                };

                parentNode.Children.push(childNode);
                await this.walkChildren(childNode, options, visited, contextUser);
            }
        }
    }

    /**
     * Load child records for a given parent node + relationship.
     */
    private async loadChildRecords(
        parentNode: DependencyNode,
        rel: import('@memberjunction/core').EntityRelationshipInfo,
        childEntityInfo: EntityInfo,
        options: Required<WalkOptions>,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>[]> {
        const rv = new RunView();
        const parentKeyValue = this.getParentKeyValue(parentNode, rel);
        if (parentKeyValue === null || parentKeyValue === undefined) {
            return [];
        }

        let extraFilter = `${rel.RelatedEntityJoinField} = '${parentKeyValue}'`;
        if (!options.IncludeDeleted && this.hasSoftDeleteField(childEntityInfo)) {
            extraFilter += ` AND __mj_DeletedAt IS NULL`;
        }

        try {
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: childEntityInfo.Name,
                ExtraFilter: extraFilter,
                ResultType: 'simple',
            }, contextUser);

            if (!result.Success) {
                LogError(`DependencyGraphWalker: Failed to load children of ${parentNode.EntityName} ` +
                    `via ${childEntityInfo.Name}.${rel.RelatedEntityJoinField}: ${result.ErrorMessage}`);
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
            return {};
        }

        return result.Results[0];
    }

    /**
     * Extract the parent key value that the child FK references.
     */
    private getParentKeyValue(
        parentNode: DependencyNode,
        rel: import('@memberjunction/core').EntityRelationshipInfo
    ): unknown {
        // EntityKeyField tells us which parent field the child FK points to.
        // If blank, it defaults to the parent's first primary key.
        const parentFieldName = rel.EntityKeyField && rel.EntityKeyField.trim().length > 0
            ? rel.EntityKeyField
            : parentNode.EntityInfo.FirstPrimaryKey.Name;

        return parentNode.RecordData[parentFieldName] ?? null;
    }

    /**
     * Build a CompositeKey from a record's data using the entity's primary key fields.
     */
    private buildCompositeKey(
        entityInfo: EntityInfo,
        recordData: Record<string, unknown>
    ): CompositeKey {
        const pairs = entityInfo.PrimaryKeys.map(pk => ({
            FieldName: pk.Name,
            Value: recordData[pk.Name],
        }));
        return new CompositeKey(pairs);
    }

    /**
     * Get EntityInfo by entity ID.
     */
    private getRelatedEntityInfo(entityID: string): EntityInfo | null {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.ID === entityID);
        return entity ?? null;
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
