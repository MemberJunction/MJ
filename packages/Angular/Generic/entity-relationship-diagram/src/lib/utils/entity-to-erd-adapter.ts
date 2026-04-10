import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { ERDNode, ERDField, ERDFieldValue, ERDLink } from '../interfaces/erd-types';

/**
 * Converts MemberJunction EntityFieldInfo to generic ERDField format.
 */
export function entityFieldToERDField(field: EntityFieldInfo): ERDField {
  const erdField: ERDField = {
    id: field.ID,
    name: field.Name,
    type: field.Type,
    isPrimaryKey: field.IsPrimaryKey,
    description: field.Description,
    allowsNull: field.AllowsNull,
    defaultValue: field.DefaultValue,
    length: field.Length,
    precision: field.Precision,
    scale: field.Scale,
    isVirtual: field.IsVirtual,
    autoIncrement: field.AutoIncrement
  };

  // Add related entity info for foreign keys
  if (field.RelatedEntityID) {
    erdField.relatedNodeId = field.RelatedEntityID;
    erdField.relatedNodeName = field.RelatedEntity;
    erdField.relatedFieldName = field.RelatedEntityFieldName;
  }

  // Add possible values if they exist
  if (field.EntityFieldValues && field.EntityFieldValues.length > 0) {
    erdField.possibleValues = field.EntityFieldValues.map(v => ({
      id: v.ID,
      value: v.Value,
      code: v.Code,
      description: v.Description,
      sequence: v.Sequence
    } as ERDFieldValue));
  }

  return erdField;
}

/**
 * Converts MemberJunction EntityInfo to generic ERDNode format.
 */
export function entityInfoToERDNode(entity: EntityInfo): ERDNode {
  return {
    id: entity.ID,
    name: entity.Name,
    schemaName: entity.SchemaName,
    description: entity.Description,
    status: entity.Status,
    baseTable: entity.BaseTable,
    fields: entity.Fields.map(f => entityFieldToERDField(f)),
    customData: {
      // Store original entity for reverse lookup if needed
      originalEntity: entity
    }
  };
}

/**
 * Converts an array of MemberJunction EntityInfo objects to ERDNode format.
 */
export function entitiesToERDNodes(entities: EntityInfo[]): ERDNode[] {
  return entities.map(e => entityInfoToERDNode(e));
}

/**
 * Extracts the original EntityInfo from an ERDNode's customData.
 * Returns null if not found.
 */
export function getOriginalEntityFromERDNode(node: ERDNode): EntityInfo | null {
  if (node.customData && node.customData['originalEntity']) {
    return node.customData['originalEntity'] as EntityInfo;
  }
  return null;
}

/**
 * Finds an EntityInfo by node ID from an array.
 */
export function findEntityByNodeId(nodeId: string, entities: EntityInfo[]): EntityInfo | undefined {
  return entities.find(e => UUIDsEqual(e.ID, nodeId));
}

/**
 * Options for building ERD data from entities.
 */
export interface BuildERDDataOptions {
  /** Include incoming relationships (entities that reference these entities). Default: true */
  includeIncoming?: boolean;
  /** Include outgoing relationships (entities these reference via FK). Default: true */
  includeOutgoing?: boolean;
  /** All entities in the system (for relationship lookups). Required for includeIncoming/includeOutgoing. */
  allEntities?: EntityInfo[];
  /** Relationship depth - how many hops to include. Default: 1 */
  depth?: number;
}

/**
 * Result of building ERD data from entities.
 */
export interface BuildERDDataResult {
  nodes: ERDNode[];
  links: ERDLink[];
}

/**
 * Builds ERD nodes and links from an array of EntityInfo objects.
 * This handles the transformation and automatic relationship discovery.
 *
 * @param entities - The primary entities to display
 * @param options - Options for relationship discovery
 * @returns Object containing nodes and links arrays
 *
 * @example
 * ```typescript
 * // Single entity with all related entities
 * const result = buildERDDataFromEntities([myEntity], {
 *   allEntities: metadata.Entities,
 *   includeIncoming: true,
 *   includeOutgoing: true,
 *   depth: 1
 * });
 * ```
 */
export function buildERDDataFromEntities(
  entities: EntityInfo[],
  options: BuildERDDataOptions = {}
): BuildERDDataResult {
  const {
    includeIncoming = true,
    includeOutgoing = true,
    allEntities = [],
    depth = 1
  } = options;

  const nodes: ERDNode[] = [];
  const links: ERDLink[] = [];
  const addedNodeIds = new Set<string>();
  const addedLinkKeys = new Set<string>();

  // Helper to add a node if not already added
  const addNode = (entity: EntityInfo): void => {
    if (!addedNodeIds.has(entity.ID)) {
      nodes.push(entityInfoToERDNode(entity));
      addedNodeIds.add(entity.ID);
    }
  };

  // Helper to add a link if not already added
  const addLink = (link: ERDLink): void => {
    const key = `${link.sourceNodeId}->${link.targetNodeId}:${link.sourceField.id}`;
    if (!addedLinkKeys.has(key)) {
      links.push(link);
      addedLinkKeys.add(key);
    }
  };

  // First, add all primary entities
  for (const entity of entities) {
    addNode(entity);
  }

  // Process relationships for each primary entity
  for (const entity of entities) {
    // Outgoing relationships (this entity references others via FK)
    if (includeOutgoing) {
      for (const field of entity.Fields) {
        if (field.RelatedEntityID) {
          const relatedEntity = allEntities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
          if (relatedEntity) {
            addNode(relatedEntity);

            const pkField = relatedEntity.Fields.find(f => f.IsPrimaryKey);
            addLink({
              sourceNodeId: entity.ID,
              targetNodeId: field.RelatedEntityID,
              sourceField: entityFieldToERDField(field),
              targetField: pkField ? entityFieldToERDField(pkField) : undefined,
              isSelfReference: UUIDsEqual(entity.ID, field.RelatedEntityID),
              relationshipType: 'many-to-one'
            });
          }
        }
      }
    }

    // Incoming relationships (other entities reference this one)
    if (includeIncoming) {
      for (const rel of entity.RelatedEntities) {
        // rel.RelatedEntity is the entity that has the FK pointing to this entity
        const relEntity = allEntities.find(e => e.Name === rel.RelatedEntity);
        if (relEntity) {
          addNode(relEntity);

          const fkField = relEntity.Fields.find(f => f.Name === rel.RelatedEntityJoinField);
          const pkField = entity.Fields.find(f => f.IsPrimaryKey);

          if (fkField) {
            addLink({
              sourceNodeId: relEntity.ID,
              targetNodeId: entity.ID,
              sourceField: entityFieldToERDField(fkField),
              targetField: pkField ? entityFieldToERDField(pkField) : undefined,
              isSelfReference: UUIDsEqual(relEntity.ID, entity.ID),
              relationshipType: 'many-to-one'
            });
          }
        }
      }
    }
  }

  // If depth > 1, recursively expand relationships
  if (depth > 1) {
    const processedIds = new Set(entities.map(e => e.ID));
    let currentDepthEntities = [...nodes]
      .map(n => getOriginalEntityFromERDNode(n))
      .filter((e): e is EntityInfo => e !== null && !processedIds.has(e.ID));

    for (let d = 1; d < depth; d++) {
      const nextDepthEntities: EntityInfo[] = [];

      for (const entity of currentDepthEntities) {
        if (processedIds.has(entity.ID)) continue;
        processedIds.add(entity.ID);

        // Outgoing
        if (includeOutgoing) {
          for (const field of entity.Fields) {
            if (field.RelatedEntityID && !addedNodeIds.has(field.RelatedEntityID)) {
              const relatedEntity = allEntities.find(e => UUIDsEqual(e.ID, field.RelatedEntityID));
              if (relatedEntity) {
                addNode(relatedEntity);
                nextDepthEntities.push(relatedEntity);

                const pkField = relatedEntity.Fields.find(f => f.IsPrimaryKey);
                addLink({
                  sourceNodeId: entity.ID,
                  targetNodeId: field.RelatedEntityID,
                  sourceField: entityFieldToERDField(field),
                  targetField: pkField ? entityFieldToERDField(pkField) : undefined,
                  isSelfReference: UUIDsEqual(entity.ID, field.RelatedEntityID),
                  relationshipType: 'many-to-one'
                });
              }
            }
          }
        }

        // Incoming
        if (includeIncoming) {
          for (const rel of entity.RelatedEntities) {
            // rel.RelatedEntity is the entity that has the FK pointing to this entity
            const relEntity = allEntities.find(e => e.Name === rel.RelatedEntity);
            if (relEntity && !addedNodeIds.has(relEntity.ID)) {
              addNode(relEntity);
              nextDepthEntities.push(relEntity);

              const fkField = relEntity.Fields.find(f => f.Name === rel.RelatedEntityJoinField);
              const pkField = entity.Fields.find(f => f.IsPrimaryKey);

              if (fkField) {
                addLink({
                  sourceNodeId: relEntity.ID,
                  targetNodeId: entity.ID,
                  sourceField: entityFieldToERDField(fkField),
                  targetField: pkField ? entityFieldToERDField(pkField) : undefined,
                  isSelfReference: UUIDsEqual(relEntity.ID, entity.ID),
                  relationshipType: 'many-to-one'
                });
              }
            }
          }
        }
      }

      currentDepthEntities = nextDepthEntities;
    }
  }

  return { nodes, links };
}
