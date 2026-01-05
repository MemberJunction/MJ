/**
 * Graph visualization and entity metadata formatting utilities
 */

import { EntityInfo } from '@memberjunction/core';

/**
 * Entity metadata formatted for LLM prompts (concise version)
 */
export interface EntityMetadataForPrompt {
  Name: string;
  Description: string;
  SchemaName: string;
  FieldCount: number;
  RelatedEntities: Array<{ name: string; type: string }>;
}

/**
 * Generates a simple text-based relationship graph for LLM prompts
 *
 * Output format:
 * ```
 * Customers: → Orders, → Addresses
 * Orders: → OrderDetails, → Customers
 * Products: → OrderDetails, → Categories
 * ```
 */
export function generateRelationshipGraph(entities: EntityInfo[]): string {
  const lines: string[] = [];

  for (const entity of entities) {
    const entityName = entity.Name ?? 'Unknown';

    if (entity.RelatedEntities.length === 0) {
      lines.push(`${entityName}: (no relationships)`);
      continue;
    }

    const relations = entity.RelatedEntities
      .filter(rel => rel.RelatedEntity != null)
      .map(rel => `→ ${rel.RelatedEntity}`)
      .join(', ');

    lines.push(`${entityName}: ${relations}`);
  }

  return lines.join('\n');
}

/**
 * Generates a Mermaid diagram for richer visualization
 *
 * This can be used in prompts that support Mermaid syntax.
 * Output format:
 * ```mermaid
 * graph LR
 *   Customers[Customers] --> Orders[Orders]
 *   Orders[Orders] --> OrderDetails[OrderDetails]
 * ```
 */
export function generateMermaidDiagram(entities: EntityInfo[]): string {
  const lines = ['graph LR'];
  const processedPairs = new Set<string>();

  for (const entity of entities) {
    const entityName = entity.Name ?? 'Unknown';
    const safeEntityName = entityName.replace(/\s/g, '_');

    for (const rel of entity.RelatedEntities) {
      if (rel.RelatedEntity == null) continue;

      const safeRelatedName = rel.RelatedEntity.replace(/\s/g, '_');
      const pairKey = [safeEntityName, safeRelatedName].sort().join('|');

      if (!processedPairs.has(pairKey)) {
        lines.push(`  ${safeEntityName}[${entityName}] --> ${safeRelatedName}[${rel.RelatedEntity}]`);
        processedPairs.add(pairKey);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Formats entity metadata for LLM prompt (concise version with key info)
 *
 * Extracts only the essential information needed for entity grouping:
 * - Entity name and description
 * - Schema name
 * - Field count (as a proxy for data richness)
 * - Related entities with relationship types
 */
export function formatEntitiesForPrompt(entities: EntityInfo[]): EntityMetadataForPrompt[] {
  return entities.map(entity => ({
    Name: entity.Name ?? '',
    Description: entity.Description ?? 'No description available',
    SchemaName: entity.SchemaName ?? 'dbo',
    FieldCount: entity.Fields.length,
    RelatedEntities: entity.RelatedEntities
      .filter(rel => rel.RelatedEntity != null && rel.Type != null)
      .map(rel => ({
        name: rel.RelatedEntity!,
        type: rel.Type!
      }))
  }));
}
