/**
 * LLM-based Entity Grouper
 *
 * Uses AI to generate semantically meaningful entity groupings based on
 * business context and schema understanding, replacing the deterministic
 * hub-and-spoke algorithm with intelligent semantic analysis.
 */

import { EntityInfo, EntityRelationshipInfo, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { EntityGroup } from '../data/schema';
import { QueryGenConfig } from '../cli/config';
import { generateRelationshipGraph, formatEntitiesForPrompt } from '../utils/graph-helpers';
import { extractErrorMessage } from '../utils/error-handlers';
import { executePromptWithOverrides } from '../utils/prompt-helpers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * LLM response format from Entity Group Generator prompt
 */
interface LLMEntityGroupResponse {
  groups: Array<{
    entities: string[];
    primaryEntity: string;
    businessDomain: string;
    businessRationale: string;
    relationshipType: 'single' | 'parent-child' | 'many-to-many';
    expectedQuestionTypes: string[];
  }>;
}

/**
 * Generates entity groups using LLM-based semantic analysis
 *
 * This class replaces the deterministic hub-and-spoke algorithm with an
 * intelligent approach that understands business context and generates
 * meaningful entity combinations for query generation.
 */
export class EntityGrouper {
  private readonly promptName = 'Entity Group Generator';
  private readonly config: QueryGenConfig;

  constructor(config: QueryGenConfig) {
    this.config = config;
  }

  /**
   * Generate semantically meaningful entity groups using LLM analysis
   *
   * Note: The LLM determines the optimal number and size of entity groups based on
   * business domain understanding. The number of groups is not strictly enforced.
   *
   * @param entities - All entities to analyze
   * @param contextUser - User context for server-side operations
   * @returns Array of validated entity groups with business context
   */
  async generateEntityGroups(
    entities: EntityInfo[],
    contextUser: UserInfo
  ): Promise<EntityGroup[]> {
    try {
      // 1. Prepare schema data for LLM
      const schemaData = this.prepareSchemaData(entities);

      // 2. Call LLM to generate groups
      const llmResponse = await this.callLLMForGrouping(schemaData, contextUser);

      // 3. Validate and convert to EntityGroup objects
      const validatedGroups = this.validateAndConvertGroups(llmResponse, entities);

      // 4. Deduplicate any similar groups
      const deduplicatedGroups = this.deduplicateGroups(validatedGroups);

      return deduplicatedGroups;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error, 'EntityGrouper.generateEntityGroups'));
    }
  }

  /**
   * Prepare schema data for LLM prompt
   *
   * Note: The LLM will determine appropriate group sizes and count based on
   * business domain understanding. We provide the full entity schema and
   * relationship graph for intelligent analysis.
   */
  private prepareSchemaData(entities: EntityInfo[]): Record<string, unknown> {
    const formattedEntities = formatEntitiesForPrompt(entities);
    const relationshipGraph = generateRelationshipGraph(entities);

    // Get schema name from first entity (assume single schema)
    const schemaName = entities[0]?.SchemaName || 'Unknown';

    return {
      schemaName,
      entities: formattedEntities,
      relationshipGraph
    };
  }

  /**
   * Call LLM via AIPromptRunner to generate entity groups
   */
  private async callLLMForGrouping(
    schemaData: Record<string, unknown>,
    contextUser: UserInfo
  ): Promise<LLMEntityGroupResponse> {
    // Get prompt entity from AIEngine
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === this.promptName);
    if (!prompt) {
      throw new Error(`Prompt "${this.promptName}" not found. Ensure metadata has been synced to database.`);
    }

    // Execute with model/vendor overrides if specified in config
    const result = await executePromptWithOverrides<LLMEntityGroupResponse>(
      prompt,
      schemaData,
      contextUser,
      this.config
    );

    if (!result.success) {
      throw new Error(`LLM grouping failed: ${result.errorMessage || 'Unknown error'}`);
    }

    if (!result.result) {
      throw new Error('LLM did not return structured data');
    }

    return result.result;
  }

  /**
   * Validate LLM output and convert to EntityGroup objects
   */
  private validateAndConvertGroups(
    llmResponse: LLMEntityGroupResponse,
    entities: EntityInfo[]
  ): EntityGroup[] {
    const entityMap = new Map(entities.map(e => [e.Name, e]));
    const validGroups: EntityGroup[] = [];

    for (const llmGroup of llmResponse.groups) {
      try {
        // Validate all entity names exist
        const groupEntities = llmGroup.entities
          .map(name => entityMap.get(name))
          .filter((e): e is EntityInfo => e !== undefined);

        if (groupEntities.length !== llmGroup.entities.length) {
          console.warn(`Skipping group "${llmGroup.businessDomain}": contains unknown entities`);
          continue;
        }

        // Validate primary entity exists
        const primaryEntity = entityMap.get(llmGroup.primaryEntity);
        if (!primaryEntity) {
          console.warn(`Skipping group "${llmGroup.businessDomain}": primary entity "${llmGroup.primaryEntity}" not found`);
          continue;
        }

        // Build relationships array (collect all relationships between entities in the group)
        const relationships = this.extractRelationships(groupEntities);

        // Validate connectivity (all entities must be reachable from primary)
        if (groupEntities.length > 1 && !this.isConnected(groupEntities, relationships)) {
          console.warn(`Skipping group "${llmGroup.businessDomain}": entities are not connected`);
          continue;
        }

        // Create EntityGroup with LLM metadata
        validGroups.push({
          entities: groupEntities,
          relationships,
          primaryEntity,
          relationshipType: llmGroup.relationshipType,
          businessDomain: llmGroup.businessDomain,
          businessRationale: llmGroup.businessRationale,
          expectedQuestionTypes: llmGroup.expectedQuestionTypes
        });
      } catch (error: unknown) {
        console.warn(`Skipping invalid group: ${extractErrorMessage(error, 'validateGroup')}`);
      }
    }

    if (validGroups.length === 0) {
      throw new Error('No valid entity groups generated by LLM');
    }

    return validGroups;
  }

  /**
   * Extract relationships between entities in a group
   */
  private extractRelationships(entities: EntityInfo[]): EntityRelationshipInfo[] {
    const entityNames = new Set(entities.map(e => e.Name));
    const relationships: EntityRelationshipInfo[] = [];

    for (const entity of entities) {
      for (const rel of entity.RelatedEntities) {
        if (entityNames.has(rel.RelatedEntity)) {
          relationships.push(rel);
        }
      }
    }

    return relationships;
  }

  /**
   * Check if all entities in a group are connected by relationships
   *
   * Uses BFS to verify all entities are reachable from the first entity
   */
  private isConnected(entities: EntityInfo[], relationships: EntityRelationshipInfo[]): boolean {
    if (entities.length <= 1) return true;

    // Build adjacency map
    const adjacency = new Map<string, Set<string>>();
    for (const entity of entities) {
      adjacency.set(entity.Name, new Set());
    }

    for (const rel of relationships) {
      const entityName = entities.find(e =>
        e.RelatedEntities.includes(rel)
      )?.Name;

      if (entityName) {
        adjacency.get(entityName)?.add(rel.RelatedEntity);
        adjacency.get(rel.RelatedEntity)?.add(entityName); // Bidirectional
      }
    }

    // BFS from first entity
    const visited = new Set<string>();
    const queue = [entities[0].Name];
    visited.add(entities[0].Name);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) || new Set();

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // All entities should be visited
    return visited.size === entities.length;
  }

  /**
   * Remove duplicate or highly similar groups
   *
   * Groups are considered duplicates if they contain the exact same set of entities
   */
  private deduplicateGroups(groups: EntityGroup[]): EntityGroup[] {
    const seen = new Set<string>();
    const unique: EntityGroup[] = [];

    for (const group of groups) {
      // Create normalized key (sorted entity names)
      const key = group.entities.map(e => e.Name).sort().join('|');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(group);
      }
    }

    return unique;
  }
}
