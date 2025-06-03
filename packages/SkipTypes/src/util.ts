import { EntityFieldInfo, EntityFieldValueInfo, EntityInfo, EntityRelationshipInfo } from "@memberjunction/core";
import { SkipEntityFieldInfo, SkipEntityFieldValueInfo, SkipEntityInfo, SkipEntityRelationshipInfo } from "./entity-metadata-types";
import { SkipComponentChildSpec, SkipComponentRootSpec } from "./component-types";

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
    const se: SkipEntityInfo = {
        id: e.ID,
        name: e.Name,
        description: e.Description,
        schemaName: e.SchemaName,
        baseView: e.BaseView,
        fields: e.Fields.map(f => MapEntityFieldInfoToSkipEntityFieldInfo(e, f)),
        relatedEntities: e.RelatedEntities.map(re => MapEntityRelationshipInfoToSkipEntityRelationshipInfo(re))
    };
    return se;
}

/**
 * Maps a MemberJunction EntityFieldInfo object to a SkipEntityFieldInfo object.
 * 
 * This function converts detailed field metadata from MemberJunction's format to the Skip
 * query system format, preserving all field properties including type information, constraints,
 * relationships, and validation rules.
 * 
 * @param e - The parent EntityInfo object that contains this field
 * @param f - The EntityFieldInfo object to be mapped
 * @returns A SkipEntityFieldInfo object with all field properties mapped
 */
export function MapEntityFieldInfoToSkipEntityFieldInfo(e: EntityInfo, f: EntityFieldInfo): SkipEntityFieldInfo {
    const sf: SkipEntityFieldInfo = {
        entityID: e.ID,
        sequence: f.Sequence,
        name: f.Name,
        description: f.Description,
        displayName: f.DisplayName,
        type: f.Type,
        isPrimaryKey: f.IsPrimaryKey,
        isUnique: f.IsUnique,
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
        possibleValues: f.EntityFieldValues.map(pv => MapEntityFieldValueInfoToSkipEntityFieldValueInfo(pv))
    };
    return sf;
}

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
    const sefvi: SkipEntityFieldValueInfo = {
        value: pv.Value,
        displayValue: pv.Value
    };
    return sefvi;
}

/**
 * Maps a MemberJunction EntityRelationshipInfo object to a SkipEntityRelationshipInfo object.
 * 
 * This function converts entity relationship metadata from MemberJunction's format to the Skip
 * query system format. Relationships define how entities are connected through foreign keys,
 * joins, and other associations, enabling complex queries across related data.
 * 
 * @param re - The EntityRelationshipInfo object to be mapped
 * @returns A SkipEntityRelationshipInfo object with all relationship properties mapped
 * 
 * @example
 */
export function MapEntityRelationshipInfoToSkipEntityRelationshipInfo(re: EntityRelationshipInfo): SkipEntityRelationshipInfo {
    const sre: SkipEntityRelationshipInfo = {
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
    }
    return sre;    
}

/**
 * Builds the complete code for a Skip component based on the provided spec.
 * 
 * This function generates the full code representation of a Skip component, including
 * the root component code and recursively pulling in child components and also replacing
 * the placeholders for those child components in the parent component's code with the 
 * actual code for those child components (which were generated after the parent component was generated).
 * 
 * @param spec - The SkipComponentRootSpec defining the component structure and behavior
 * @returns A string containing the complete executable JavaScript code for the Skip component
 */
export function BuildSkipComponentCompleteCode(spec: SkipComponentRootSpec): string {
    // Start with the base code for the root component
    let code = spec.componentCode;
    // Recursively replace placeholders for child components with their generated code
    for (const child of spec.childComponents) {
        const childCode = BuildSkipComponentChildCode(child);
        // Replace the placeholder in the parent component's code with the actual child component code
        // Note: The placeholder format is assumed to be <<placeholderName>>
        code = code.replace(`<<${child.placeholder}>>`, childCode);
    }
    // Return the complete code for this component
    return code;
}

/**
 * Builds the code for a Skip component child based on the provided spec including recursive child components.
 * @param spec - The SkipComponentChildSpec defining the child component structure and behavior
 * @returns A string containing the executable JavaScript code for the Skip component child
 */
export function BuildSkipComponentChildCode(child: SkipComponentChildSpec): string {
    // Start with the base code for the child component
    let code = child.componentCode;
    // Recursively replace placeholders for child components with their generated code
    for (const sub of child.components) {
        const subCode = BuildSkipComponentChildCode(sub);
        // Replace the placeholder in the parent component's code with the actual child component code
        // Note: The placeholder format is assumed to be <<placeholderName>>
        code = code.replace(`<<${sub.placeholder}>>`, subCode);
    }
    // Return the complete code for this child component
    return code;
}