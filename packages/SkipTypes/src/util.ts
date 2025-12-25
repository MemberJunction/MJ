import { EntityFieldInfo, EntityFieldValueInfo, EntityInfo, EntityRelationshipInfo } from "@memberjunction/core";
import { SimpleEntityInfo, SimpleEntityFieldInfo } from "@memberjunction/interactive-component-types";
import { SkipEntityFieldInfo, SkipEntityFieldValueInfo, SkipEntityInfo, SkipEntityRelationshipInfo } from "./entity-metadata-types";

// ============================================================================
// EntityInfo <-> SkipEntityInfo conversions
// ============================================================================

/**
 * Maps a MemberJunction EntityInfo object to a SkipEntityInfo object for use in the Skip query system.
 *
 * This function transforms the comprehensive MemberJunction entity metadata into a simplified
 * format optimized for the Skip query engine, including all fields and related entities.
 *
 * @param e - The source EntityInfo object from MemberJunction core
 * @returns A SkipEntityInfo object with mapped fields and relationships
 */
export function MapEntityInfoToSkipEntityInfo(e: EntityInfo): SkipEntityInfo {
    return {
        id: e.ID,
        name: e.Name,
        description: e.Description,
        schemaName: e.SchemaName,
        baseView: e.BaseView,
        fields: e.Fields.map(f => MapEntityFieldInfoToSkipEntityFieldInfo(f)),
        relatedEntities: e.RelatedEntities?.map(r => MapEntityRelationshipInfoToSkipEntityRelationshipInfo(r)) || [],
        rowsPacked: e.RowsToPackWithSchema as 'None' | 'Sample' | 'All',
        rowsSampleMethod: e.RowsToPackSampleMethod as 'random' | 'top n' | 'bottom n'
    };
}

/**
 * Maps an array of MemberJunction EntityInfo objects to SkipEntityInfo objects.
 *
 * @param entities - Array of EntityInfo from @memberjunction/core
 * @returns Array of SkipEntityInfo objects
 */
export function MapEntityInfoArrayToSkipEntityInfoArray(entities: EntityInfo[]): SkipEntityInfo[] {
    return entities.map(e => MapEntityInfoToSkipEntityInfo(e));
}

/**
 * Converts a SkipEntityInfo to a partial EntityInfo object.
 * Note: This creates a plain object with EntityInfo-compatible properties,
 * not a full EntityInfo instance (which requires database context).
 *
 * @param skipEntity - The SkipEntityInfo to convert
 * @returns A partial EntityInfo-compatible object
 */
export function MapSkipEntityInfoToEntityInfo(skipEntity: SkipEntityInfo): Partial<EntityInfo> {
    return {
        ID: skipEntity.id,
        Name: skipEntity.name,
        Description: skipEntity.description,
        SchemaName: skipEntity.schemaName,
        BaseView: skipEntity.baseView,
        RowsToPackWithSchema: skipEntity.rowsPacked,
        RowsToPackSampleMethod: skipEntity.rowsSampleMethod
    };
}

// ============================================================================
// EntityFieldInfo <-> SkipEntityFieldInfo conversions
// ============================================================================

/**
 * Maps a MemberJunction EntityFieldInfo object to a SkipEntityFieldInfo object.
 *
 * This function converts detailed field metadata from MemberJunction's format to the Skip
 * query system format, preserving all field properties including type information, constraints,
 * relationships, and validation rules.
 *
 * @param f - The EntityFieldInfo object to be mapped
 * @returns A SkipEntityFieldInfo object with all field properties mapped
 */
export function MapEntityFieldInfoToSkipEntityFieldInfo(f: EntityFieldInfo): SkipEntityFieldInfo {
    return {
        entityID: f.EntityID,
        sequence: f.Sequence,
        name: f.Name,
        displayName: f.DisplayName,
        description: f.Description,
        isPrimaryKey: f.IsPrimaryKey,
        isUnique: f.IsUnique,
        category: f.Category,
        type: f.Type,
        length: f.Length,
        precision: f.Precision,
        scale: f.Scale,
        sqlFullType: f.SQLFullType,
        allowsNull: f.AllowsNull,
        defaultValue: f.DefaultValue,
        autoIncrement: f.AutoIncrement,
        valueListType: f.ValueListType,
        extendedType: f.ExtendedType,
        defaultInView: f.DefaultInView,
        defaultColumnWidth: f.DefaultColumnWidth,
        isVirtual: f.IsVirtual,
        isNameField: f.IsNameField,
        relatedEntityID: f.RelatedEntityID,
        relatedEntityFieldName: f.RelatedEntityFieldName,
        relatedEntity: f.RelatedEntity,
        relatedEntitySchemaName: f.RelatedEntitySchemaName,
        relatedEntityBaseView: f.RelatedEntityBaseView,
        possibleValues: f.EntityFieldValues?.map(v => ({
            value: v.Value,
            displayValue: v.Code !== v.Value ? v.Code : undefined
        }))
    };
}

/**
 * Converts a SkipEntityFieldInfo to a partial EntityFieldInfo object.
 * Note: This creates a plain object with EntityFieldInfo-compatible properties,
 * not a full EntityFieldInfo instance (which requires database context).
 *
 * @param skipField - The SkipEntityFieldInfo to convert
 * @returns A partial EntityFieldInfo-compatible object
 */
export function MapSkipEntityFieldInfoToEntityFieldInfo(skipField: SkipEntityFieldInfo): Partial<EntityFieldInfo> {
    return {
        EntityID: skipField.entityID,
        Sequence: skipField.sequence,
        Name: skipField.name,
        DisplayName: skipField.displayName,
        Description: skipField.description,
        IsPrimaryKey: skipField.isPrimaryKey,
        IsUnique: skipField.isUnique,
        Category: skipField.category,
        Type: skipField.type,
        Length: skipField.length,
        Precision: skipField.precision,
        Scale: skipField.scale,
        AllowsNull: skipField.allowsNull,
        DefaultValue: skipField.defaultValue,
        AutoIncrement: skipField.autoIncrement,
        ValueListType: skipField.valueListType,
        ExtendedType: skipField.extendedType,
        DefaultInView: skipField.defaultInView,
        DefaultColumnWidth: skipField.defaultColumnWidth,
        IsVirtual: skipField.isVirtual,
        IsNameField: skipField.isNameField,
        RelatedEntityID: skipField.relatedEntityID,
        RelatedEntityFieldName: skipField.relatedEntityFieldName
    };
}

// ============================================================================
// EntityFieldValueInfo <-> SkipEntityFieldValueInfo conversions
// ============================================================================

/**
 * Maps a MemberJunction EntityFieldValueInfo object to a SkipEntityFieldValueInfo object.
 *
 * This function converts possible field values (used for dropdown lists, enums, and constraints)
 * from MemberJunction's format to the Skip query system format. These values represent the
 * allowed values for fields with restricted value lists.
 *
 * @param pv - The EntityFieldValueInfo object representing a possible value
 * @returns A SkipEntityFieldValueInfo object with mapped value information
 */
export function MapEntityFieldValueInfoToSkipEntityFieldValueInfo(pv: EntityFieldValueInfo): SkipEntityFieldValueInfo {
    return {
        value: pv.Value,
        displayValue: pv.Value
    };
}

// ============================================================================
// EntityRelationshipInfo <-> SkipEntityRelationshipInfo conversions
// ============================================================================

/**
 * Maps a MemberJunction EntityRelationshipInfo object to a SkipEntityRelationshipInfo object.
 *
 * This function converts entity relationship metadata from MemberJunction's format to the Skip
 * query system format. Relationships define how entities are connected through foreign keys,
 * joins, and other associations, enabling complex queries across related data.
 *
 * @param re - The EntityRelationshipInfo object to be mapped
 * @returns A SkipEntityRelationshipInfo object with all relationship properties mapped
 */
export function MapEntityRelationshipInfoToSkipEntityRelationshipInfo(re: EntityRelationshipInfo): SkipEntityRelationshipInfo {
    return {
        entityID: re.EntityID,
        entity: re.Entity,
        entityBaseView: re.EntityBaseView,
        entityKeyField: re.EntityKeyField,
        relatedEntityID: re.RelatedEntityID,
        relatedEntityJoinField: re.RelatedEntityJoinField,
        relatedEntityBaseView: re.RelatedEntityBaseView,
        relatedEntity: re.RelatedEntity,
        type: re.Type,
        joinEntityInverseJoinField: re.JoinEntityInverseJoinField,
        joinView: re.JoinView,
        joinEntityJoinField: re.JoinEntityJoinField,
    };
}

// ============================================================================
// SimpleEntityInfo <-> SkipEntityInfo conversions
// ============================================================================

/**
 * Maps a SimpleEntityInfo object to a SkipEntityInfo object.
 *
 * @param simpleEntity - The SimpleEntityInfo from @memberjunction/interactive-component-types
 * @returns A SkipEntityInfo object
 */
export function MapSimpleEntityInfoToSkipEntityInfo(simpleEntity: SimpleEntityInfo): SkipEntityInfo {
    return {
        id: '',
        name: simpleEntity.name,
        description: simpleEntity.description,
        schemaName: '',
        baseView: '',
        fields: simpleEntity.fields.map(f => MapSimpleEntityFieldInfoToSkipEntityFieldInfo(f)),
        relatedEntities: []
    };
}

/**
 * Maps an array of SimpleEntityInfo objects to SkipEntityInfo objects.
 *
 * @param entities - Array of SimpleEntityInfo from @memberjunction/interactive-component-types
 * @returns Array of SkipEntityInfo objects
 */
export function MapSimpleEntityInfoArrayToSkipEntityInfoArray(entities: SimpleEntityInfo[]): SkipEntityInfo[] {
    return entities.map(e => MapSimpleEntityInfoToSkipEntityInfo(e));
}

/**
 * Converts a SkipEntityInfo to a SimpleEntityInfo object.
 *
 * @param skipEntity - The SkipEntityInfo to convert
 * @returns A new SimpleEntityInfo instance
 */
export function MapSkipEntityInfoToSimpleEntityInfo(skipEntity: SkipEntityInfo): SimpleEntityInfo {
    return new SimpleEntityInfo({
        name: skipEntity.name,
        description: skipEntity.description,
        fields: skipEntity.fields.map(f => MapSkipEntityFieldInfoToSimpleEntityFieldInfo(f))
    });
}

// ============================================================================
// SimpleEntityFieldInfo <-> SkipEntityFieldInfo conversions
// ============================================================================

/**
 * Maps a SimpleEntityFieldInfo object to a SkipEntityFieldInfo object.
 *
 * @param simpleField - The SimpleEntityFieldInfo from @memberjunction/interactive-component-types
 * @returns A SkipEntityFieldInfo object
 */
export function MapSimpleEntityFieldInfoToSkipEntityFieldInfo(simpleField: SimpleEntityFieldInfo): SkipEntityFieldInfo {
    return {
        entityID: '',
        sequence: simpleField.sequence,
        name: simpleField.name,
        displayName: undefined,
        description: simpleField.description,
        isPrimaryKey: simpleField.isPrimaryKey,
        isUnique: false,
        category: undefined,
        type: simpleField.type,
        length: 0,
        precision: 0,
        scale: 0,
        sqlFullType: '',
        allowsNull: simpleField.allowsNull,
        defaultValue: '',
        autoIncrement: false,
        valueListType: undefined,
        extendedType: undefined,
        defaultInView: simpleField.defaultInView,
        defaultColumnWidth: 0,
        isVirtual: false,
        isNameField: false,
        relatedEntityID: undefined,
        relatedEntityFieldName: undefined,
        relatedEntity: undefined,
        relatedEntitySchemaName: undefined,
        relatedEntityBaseView: undefined,
        possibleValues: simpleField.possibleValues?.map(v => ({ value: v }))
    };
}

/**
 * Converts a SkipEntityFieldInfo to a SimpleEntityFieldInfo object.
 *
 * @param skipField - The SkipEntityFieldInfo to convert
 * @returns A new SimpleEntityFieldInfo instance
 */
export function MapSkipEntityFieldInfoToSimpleEntityFieldInfo(skipField: SkipEntityFieldInfo): SimpleEntityFieldInfo {
    return new SimpleEntityFieldInfo({
        name: skipField.name,
        sequence: skipField.sequence,
        defaultInView: skipField.defaultInView,
        type: skipField.type,
        allowsNull: skipField.allowsNull,
        isPrimaryKey: skipField.isPrimaryKey,
        description: skipField.description,
        possibleValues: skipField.possibleValues?.map(v => v.value)
    });
}

// ============================================================================
// Helper functions for working with SkipEntityInfo
// ============================================================================

/**
 * Helper function to check if a field exists in a SkipEntityInfo
 *
 * @param entity - The SkipEntityInfo to check
 * @param fieldName - The field name to check
 * @returns True if the field exists, false otherwise
 */
export function skipEntityHasField(entity: SkipEntityInfo, fieldName: string): boolean {
    return entity.fields.some(f => f.name === fieldName);
}

/**
 * Helper function to get a field by name from a SkipEntityInfo
 *
 * @param entity - The SkipEntityInfo to search
 * @param fieldName - The field name to find
 * @returns The SkipEntityFieldInfo if found, undefined otherwise
 */
export function skipEntityGetField(entity: SkipEntityInfo, fieldName: string): SkipEntityFieldInfo | undefined {
    return entity.fields.find(f => f.name === fieldName);
}

/**
 * Helper function to get all field names as a Set for efficient lookup
 *
 * @param entity - The SkipEntityInfo to get field names from
 * @returns Set of all field names in the entity
 */
export function skipEntityGetFieldNameSet(entity: SkipEntityInfo): Set<string> {
    return new Set(entity.fields.map(f => f.name));
}
