/**
 * Entity helper utilities
 *
 * Helper functions for working with entity metadata and formatting for AI prompts
 */

import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import {
  EntityMetadataForPrompt,
  EntityFieldMetadata,
  EntityRelationshipMetadata,
  EntityGroup
} from '../data/schema';

/**
 * Format entity metadata for AI prompt consumption
 * Includes schema name, base view, fields, and relationships
 *
 * CRITICAL: Must include schemaName and baseView for functional SQL generation
 *
 * @param entity - Entity to format
 * @param allEntities - All available entities for relationship lookups
 * @returns Formatted entity metadata ready for AI prompts
 */
export function formatEntityMetadataForPrompt(entity: EntityInfo, allEntities: EntityInfo[]): EntityMetadataForPrompt {
  return {
    entityName: entity.Name,
    description: entity.Description || '',
    schemaName: entity.SchemaName || 'dbo',
    baseTable: entity.BaseTable || entity.Name,
    baseView: entity.BaseView || `vw${entity.Name}`,
    fields: formatEntityFields(entity),
    relationships: formatEntityRelationships(entity, allEntities),
  };
}

/**
 * Format entity fields for AI prompt
 * Includes field metadata with types, descriptions, and relationship info
 */
function formatEntityFields(entity: EntityInfo): EntityFieldMetadata[] {
  return entity.Fields.map((field) => ({
    name: field.Name,
    displayName: field.DisplayName || field.Name,
    type: field.Type,
    description: field.Description || '',
    isPrimaryKey: field.IsPrimaryKey || false,
    isForeignKey: field.RelatedEntityID != null && field.RelatedEntityID.trim().length > 0,
    relatedEntity: field.RelatedEntity || undefined,
    isRequired: !field.AllowsNull,
    defaultValue: field.DefaultValue || undefined,
  }));
}

/**
 * Format entity relationships for AI prompt
 * Includes schema and view names for proper JOIN generation
 */
function formatEntityRelationships(entity: EntityInfo, allEntities: EntityInfo[]): EntityRelationshipMetadata[] {
  const relationships: EntityRelationshipMetadata[] = [];

  // Foreign key relationships (many-to-one)
  for (const field of entity.Fields) {
    if (isForeignKeyField(field) && field.RelatedEntity) {
      const relatedEntity = findEntityByName(field.RelatedEntity, allEntities);
      if (relatedEntity) {
        relationships.push({
          type: 'many-to-one',
          relatedEntity: relatedEntity.Name,
          relatedEntityView: relatedEntity.BaseView || `vw${relatedEntity.Name}`,
          relatedEntitySchema: relatedEntity.SchemaName || 'dbo',
          foreignKeyField: field.Name,
          description: `${entity.Name} references ${relatedEntity.Name} via ${field.Name}`,
        });
      }
    }
  }

  // Reverse relationships (one-to-many)
  for (const otherEntity of allEntities) {
    if (otherEntity.ID === entity.ID) continue;

    for (const field of otherEntity.Fields) {
      if (isForeignKeyField(field) && field.RelatedEntityID === entity.ID) {
        relationships.push({
          type: 'one-to-many',
          relatedEntity: otherEntity.Name,
          relatedEntityView: otherEntity.BaseView || `vw${otherEntity.Name}`,
          relatedEntitySchema: otherEntity.SchemaName || 'dbo',
          foreignKeyField: field.Name,
          description: `${otherEntity.Name} references ${entity.Name} via ${field.Name}`,
        });
      }
    }
  }

  return relationships;
}

/**
 * Check if a field is a foreign key field
 */
function isForeignKeyField(field: EntityFieldInfo): boolean {
  return field.RelatedEntityID != null && field.RelatedEntityID.trim().length > 0;
}

/**
 * Find entity by name in array
 */
function findEntityByName(name: string, entities: EntityInfo[]): EntityInfo | undefined {
  return entities.find((e) => e.Name === name);
}

/**
 * Find entity by ID in array
 */
export function findEntityById(id: string, entities: EntityInfo[]): EntityInfo | undefined {
  return entities.find((e) => e.ID === id);
}

/**
 * Get primary key field(s) for an entity
 */
export function getPrimaryKeyFields(entity: EntityInfo): EntityFieldInfo[] {
  return entity.Fields.filter((f) => f.IsPrimaryKey);
}

/**
 * Get foreign key fields for an entity
 */
export function getForeignKeyFields(entity: EntityInfo): EntityFieldInfo[] {
  return entity.Fields.filter((f) => isForeignKeyField(f));
}

/**
 * Check if an entity has any relationships
 */
export function hasRelationships(entity: EntityInfo, allEntities: EntityInfo[]): boolean {
  // Check if this entity has any foreign keys
  const hasForeignKeys = entity.Fields.some((f) => isForeignKeyField(f));
  if (hasForeignKeys) return true;

  // Check if any other entity references this entity
  for (const otherEntity of allEntities) {
    if (otherEntity.ID === entity.ID) continue;
    const referencesThisEntity = otherEntity.Fields.some((f) => isForeignKeyField(f) && f.RelatedEntityID === entity.ID);
    if (referencesThisEntity) return true;
  }

  return false;
}

/**
 * Get count of relationships for an entity
 */
export function getRelationshipCount(entity: EntityInfo, allEntities: EntityInfo[]): number {
  return formatEntityRelationships(entity, allEntities).length;
}

/**
 * Format an entire entity group for AI prompt consumption
 * Converts all entities in the group to structured metadata
 *
 * @param entityGroup - Entity group to format
 * @returns Array of formatted entity metadata for Nunjucks template
 */
export function formatEntityGroupForPrompt(entityGroup: EntityGroup): EntityMetadataForPrompt[] {
  return entityGroup.entities.map((entity) =>
    formatEntityMetadataForPrompt(entity, entityGroup.entities)
  );
}
