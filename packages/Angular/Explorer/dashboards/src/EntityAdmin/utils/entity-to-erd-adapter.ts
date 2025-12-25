import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { ERDNode, ERDField, ERDFieldValue } from '@memberjunction/ng-entity-relationship-diagram';

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
  return entities.find(e => e.ID === nodeId);
}
