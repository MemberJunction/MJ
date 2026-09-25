import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { DependencyNode } from './types';

/**
 * Sort items by entity dependency order so parent entities appear before child entities
 * that reference them via foreign keys.
 *
 * Lifted and generalized from VersionHistory's RestoreEngine.
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
    const md = provider ?? Metadata.Provider;

    // Build a map of entityId -> dependency level
    const levelMap = new Map<string, number>();
    const visited = new Set<string>();

    const computeLevel = (entityId: string): number => {
        if (levelMap.has(entityId)) return levelMap.get(entityId)!;
        if (visited.has(entityId)) return 0; // Cycle — break it
        visited.add(entityId);

        const entityInfo = md.EntityByID(entityId);
        if (!entityInfo) {
            levelMap.set(entityId, 0);
            return 0;
        }

        // Find all FK fields pointing to other entities
        let maxParentLevel = -1;
        for (const field of entityInfo.Fields) {
            if (field.RelatedEntityID && !UUIDsEqual(field.RelatedEntityID, entityId)) {
                const parentLevel = computeLevel(field.RelatedEntityID);
                maxParentLevel = Math.max(maxParentLevel, parentLevel);
            }
        }

        const level = maxParentLevel + 1;
        levelMap.set(entityId, level);
        return level;
    };

    // Compute levels for all entities in the item set
    const entityIds = new Set(items.map(getEntityID));
    for (const entityId of entityIds) {
        computeLevel(entityId);
    }

    // Sort: lower level (parents) first
    return [...items].sort((a, b) => {
        const levelA = levelMap.get(getEntityID(a)) ?? 0;
        const levelB = levelMap.get(getEntityID(b)) ?? 0;
        return levelA - levelB;
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
