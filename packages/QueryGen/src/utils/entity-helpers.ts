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
 * Uses EntityInfo.RelatedEntities getter for pre-computed relationships
 */
function formatEntityRelationships(entity: EntityInfo, allEntities: EntityInfo[]): EntityRelationshipMetadata[] {
  // Use entity.RelatedEntities getter which returns EntityRelationshipInfo[]
  return entity.RelatedEntities.map(rel => {
    const relatedEntity = findEntityById(rel.RelatedEntityID, allEntities);

    return {
      type: mapRelationshipType(rel.Type),
      relatedEntity: rel.RelatedEntity,
      relatedEntityView: relatedEntity?.BaseView || `vw${rel.RelatedEntity}`,
      relatedEntitySchema: relatedEntity?.SchemaName || 'dbo',
      foreignKeyField: rel.EntityKeyField,
      description: `${entity.Name} ${rel.Type} relationship with ${rel.RelatedEntity} via ${rel.EntityKeyField}`,
    };
  });
}

/**
 * Map MJ relationship types to QueryGen types
 */
function mapRelationshipType(mjType: string): 'one-to-many' | 'many-to-one' | 'many-to-many' {
  const normalized = mjType.toLowerCase().replace(/\s+/g, '-');
  if (normalized === 'many-to-one') return 'many-to-one';
  if (normalized === 'one-to-many') return 'one-to-many';
  if (normalized === 'many-to-many') return 'many-to-many';
  return 'many-to-one'; // Default fallback
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
 * Uses EntityInfo.RelatedEntities getter
 */
export function hasRelationships(entity: EntityInfo, allEntities: EntityInfo[]): boolean {
  return entity.RelatedEntities.length > 0;
}

/**
 * Get count of relationships for an entity
 * Uses EntityInfo.RelatedEntities getter
 */
export function getRelationshipCount(entity: EntityInfo, allEntities: EntityInfo[]): number {
  return entity.RelatedEntities.length;
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
