/**
 * EntityGrouper - Analyzes entity relationships and creates logical groups
 *
 * Creates groups of 1-N related entities for query generation based on
 * foreign key relationships. Uses breadth-first traversal by default.
 */

import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { EntityGroup, RelationshipInfo } from '../data/schema';
import { extractErrorMessage } from '../utils/error-handlers';

/**
 * EntityGrouper class
 * Generates logical groups of related entities for query generation
 */
export class EntityGrouper {
  /**
   * Generate entity groups from available entities
   * Creates combinations of 1-N entities based on foreign key relationships
   *
   * @param entities - Array of entities to analyze
   * @param minSize - Minimum number of entities per group (usually 1)
   * @param maxSize - Maximum number of entities per group
   * @returns Array of unique entity groups with relationship metadata
   */
  async generateEntityGroups(entities: EntityInfo[], minSize: number, maxSize: number): Promise<EntityGroup[]> {
    try {
      // Build relationship graph from foreign keys
      const relationshipGraph = this.buildRelationshipGraph(entities);

      // Generate all valid entity groups
      const groups: EntityGroup[] = [];

      // For each entity, generate groups of different sizes
      for (const primaryEntity of entities) {
        // Single entity groups (size 1)
        if (minSize <= 1) {
          groups.push({
            entities: [primaryEntity],
            relationships: [],
            primaryEntity,
            relationshipType: 'single',
          });
        }

        // Multi-entity groups (size 2 to maxSize)
        if (maxSize > 1) {
          const relatedGroups = this.generateRelatedGroups(primaryEntity, entities, relationshipGraph, minSize, maxSize);
          groups.push(...relatedGroups);
        }
      }

      // Deduplicate groups (same entities = same group)
      const uniqueGroups = this.deduplicateGroups(groups);

      return uniqueGroups;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error, 'EntityGrouper.generateEntityGroups'));
    }
  }

  /**
   * Build a relationship graph from entity foreign keys
   * Maps entity names to their related entities
   */
  private buildRelationshipGraph(entities: EntityInfo[]): Map<string, RelationshipInfo[]> {
    const graph = new Map<string, RelationshipInfo[]>();

    for (const entity of entities) {
      const relationships: RelationshipInfo[] = [];

      // Find all foreign key fields in this entity
      for (const field of entity.Fields) {
        if (this.isForeignKeyField(field)) {
          const relatedEntity = this.findRelatedEntityName(field, entities);
          if (relatedEntity) {
            relationships.push({
              from: entity.Name,
              to: relatedEntity,
              via: field.Name,
              type: 'many-to-one',
            });
          }
        }
      }

      graph.set(entity.Name, relationships);
    }

    return graph;
  }

  /**
   * Generate groups of related entities using breadth-first traversal
   * Prefers directly related entities (1 hop) over distant ones
   */
  private generateRelatedGroups(
    primaryEntity: EntityInfo,
    allEntities: EntityInfo[],
    relationshipGraph: Map<string, RelationshipInfo[]>,
    minSize: number,
    maxSize: number,
  ): EntityGroup[] {
    const groups: EntityGroup[] = [];

    // Get entities connected to primary entity using BFS
    const connectedEntities = this.findConnectedEntitiesBFS(primaryEntity, allEntities, relationshipGraph, maxSize);

    // Generate combinations of different sizes
    for (let size = Math.max(2, minSize); size <= maxSize && size <= connectedEntities.length + 1; size++) {
      const combinations = this.generateCombinations(connectedEntities, size - 1);

      for (const combination of combinations) {
        const groupEntities = [primaryEntity, ...combination];
        const relationships = this.collectRelationships(groupEntities, relationshipGraph);
        const relationshipType = this.determineRelationshipType(relationships);

        groups.push({
          entities: groupEntities,
          relationships,
          primaryEntity,
          relationshipType,
        });
      }
    }

    return groups;
  }

  /**
   * Find connected entities using breadth-first search
   * Returns entities ordered by distance from primary entity
   */
  private findConnectedEntitiesBFS(
    primaryEntity: EntityInfo,
    allEntities: EntityInfo[],
    relationshipGraph: Map<string, RelationshipInfo[]>,
    maxDepth: number,
  ): EntityInfo[] {
    const visited = new Set<string>([primaryEntity.Name]);
    const queue: Array<{ entity: EntityInfo; depth: number }> = [{ entity: primaryEntity, depth: 0 }];
    const connected: EntityInfo[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) continue;

      const relationships = relationshipGraph.get(current.entity.Name) || [];

      for (const rel of relationships) {
        if (!visited.has(rel.to)) {
          visited.add(rel.to);
          const relatedEntity = allEntities.find((e) => e.Name === rel.to);

          if (relatedEntity) {
            connected.push(relatedEntity);
            queue.push({ entity: relatedEntity, depth: current.depth + 1 });
          }
        }
      }

      // Also check reverse relationships (entities pointing to current)
      for (const [entityName, rels] of relationshipGraph.entries()) {
        if (!visited.has(entityName)) {
          const hasReverseRel = rels.some((r) => r.to === current.entity.Name);
          if (hasReverseRel) {
            visited.add(entityName);
            const relatedEntity = allEntities.find((e) => e.Name === entityName);
            if (relatedEntity) {
              connected.push(relatedEntity);
              queue.push({ entity: relatedEntity, depth: current.depth + 1 });
            }
          }
        }
      }
    }

    return connected;
  }

  /**
   * Generate all combinations of entities of a given size
   */
  private generateCombinations(entities: EntityInfo[], size: number): EntityInfo[][] {
    if (size === 0) return [[]];
    if (size > entities.length) return [];

    const combinations: EntityInfo[][] = [];

    const generate = (start: number, current: EntityInfo[]): void => {
      if (current.length === size) {
        combinations.push([...current]);
        return;
      }

      for (let i = start; i < entities.length; i++) {
        generate(i + 1, [...current, entities[i]]);
      }
    };

    generate(0, []);
    return combinations;
  }

  /**
   * Collect all relationships between entities in a group
   */
  private collectRelationships(entities: EntityInfo[], relationshipGraph: Map<string, RelationshipInfo[]>): RelationshipInfo[] {
    const entityNames = new Set(entities.map((e) => e.Name));
    const relationships: RelationshipInfo[] = [];

    for (const entity of entities) {
      const rels = relationshipGraph.get(entity.Name) || [];
      for (const rel of rels) {
        if (entityNames.has(rel.to)) {
          relationships.push(rel);
        }
      }
    }

    return relationships;
  }

  /**
   * Determine relationship type based on relationship count and pattern
   */
  private determineRelationshipType(relationships: RelationshipInfo[]): 'single' | 'parent-child' | 'many-to-many' {
    if (relationships.length === 0) {
      return 'single';
    }

    // Check for many-to-many pattern (junction table pattern)
    const hasManyToMany = relationships.some((r) => r.type === 'many-to-many');
    if (hasManyToMany) {
      return 'many-to-many';
    }

    return 'parent-child';
  }

  /**
   * Deduplicate groups by entity composition
   * Groups with same entities (regardless of order) are considered duplicates
   */
  private deduplicateGroups(groups: EntityGroup[]): EntityGroup[] {
    const uniqueGroups = new Map<string, EntityGroup>();

    for (const group of groups) {
      const key = this.generateGroupKey(group);
      if (!uniqueGroups.has(key)) {
        uniqueGroups.set(key, group);
      }
    }

    return Array.from(uniqueGroups.values());
  }

  /**
   * Generate unique key for a group based on entity IDs
   */
  private generateGroupKey(group: EntityGroup): string {
    const entityIds = group.entities
      .map((e) => e.ID)
      .sort()
      .join('|');
    return entityIds;
  }

  /**
   * Check if a field is a foreign key field
   */
  private isForeignKeyField(field: EntityFieldInfo): boolean {
    return field.RelatedEntityID != null && field.RelatedEntityID.trim().length > 0;
  }

  /**
   * Find the related entity name for a foreign key field
   */
  private findRelatedEntityName(field: EntityFieldInfo, entities: EntityInfo[]): string | null {
    if (!field.RelatedEntityID) return null;

    const relatedEntity = entities.find((e) => e.ID === field.RelatedEntityID);
    return relatedEntity ? relatedEntity.Name : null;
  }
}
