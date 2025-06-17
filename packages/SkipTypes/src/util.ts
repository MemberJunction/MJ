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
        code = replacePlaceholderWithCode(code, child.componentName, childCode);
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
        code = replacePlaceholderWithCode(code, sub.componentName, subCode);
    }
    // Return the complete code for this child component
    return code;
}

/**
 * Replaces a placeholder with code, handling commented placeholders and maintaining proper indentation.
 * 
 * This function finds the entire line containing the placeholder (including if it's commented out)
 * and replaces it with the provided code, maintaining the original indentation level for all
 * inserted lines.
 * 
 * @param sourceCode - The source code containing the placeholder
 * @param placeholder - The placeholder name (without << >> brackets)
 * @param replacementCode - The code to insert in place of the placeholder
 * @returns The source code with the placeholder replaced
 */
function replacePlaceholderWithCode(sourceCode: string, placeholder: string, replacementCode: string): string {
    // Split the source code into lines
    const lines = sourceCode.split('\n');
    
    // Find the line containing the placeholder (with or without comment prefix)
    // Look for patterns like: <<placeholder>>, // <<placeholder>>, /* <<placeholder>> */, etc.
    const placeholderPattern = new RegExp(`<<${placeholder}>>`);
    const lineIndex = lines.findIndex(line => placeholderPattern.test(line));
    
    if (lineIndex === -1) {
        // Placeholder not found, return original code
        console.warn(`Placeholder <<${placeholder}>> not found in code`);
        return sourceCode;
    }
    
    // Get the line with the placeholder
    const placeholderLine = lines[lineIndex];
    
    // Calculate the indentation (number of leading spaces/tabs)
    const indentMatch = placeholderLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    
    // Split the replacement code into lines
    const replacementLines = replacementCode.split('\n');
    
    // Add the indentation to each line of the replacement code
    const indentedReplacementLines = replacementLines.map(line => {
        // Don't add indentation to empty lines
        return line.trim() === '' ? line : indent + line;
    });
    
    // Replace the placeholder line with the indented replacement lines
    lines.splice(lineIndex, 1, ...indentedReplacementLines);
    
    // Join the lines back together
    return lines.join('\n');
}