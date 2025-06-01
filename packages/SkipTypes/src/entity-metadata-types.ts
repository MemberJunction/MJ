/**
 * @fileoverview Entity metadata and schema types for Skip API
 * 
 * This file contains types that describe database entities, fields, relationships, and metadata
 * structures used by the Skip API system. These types define the structure for:
 * 
 * - Entity schema information (SkipEntityInfo)
 * - Field definitions and metadata (SkipEntityFieldInfo, SkipEntityFieldValueInfo)
 * - Entity relationships (SkipEntityRelationshipInfo)
 * - Column descriptions for report data (SkipColumnInfo)
 * 
 * These types are essential for communicating database schema information to Skip, allowing
 * the AI to understand the structure, relationships, and constraints of the underlying data.
 * This metadata enables Skip to generate appropriate SQL queries, understand data relationships,
 * and provide meaningful analysis and reports.
 * 
 * The entity metadata includes information about primary keys, foreign keys, data types,
 * constraints, and relationships that Skip uses to navigate and query the database effectively.
 * 
 * @author MemberJunction
 * @since 2.0.0
 */

/**
 * For each Skip API Analysis result, it is possible for Skip to provide a set of tableDataColumns that describe the data that is being returned in this shape.
 */
export class SkipColumnInfo {
    fieldName: string;
    displayName: string;
    simpleDataType: 'string' | 'number' | 'date' | 'boolean';
    description: string;
}

/**
 * Enumerates the possible values for a given field  
 */
export class SkipEntityFieldValueInfo {
    /**
     * Actual value for the possible value for the field
     */
    value: string;
    /**
     * Optional, the display value for the field value
     */
    displayValue?: string;
}

/**
 * Comprehensive metadata about individual entity fields, including data types, constraints,
 * relationships, and UI display preferences. This information helps Skip understand how
 * to work with each field in queries and analysis.
 */
export class SkipEntityFieldInfo {
    entityID: string;
    sequence: number;
    name: string;
    displayName?: string;
    description?: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    category?: string;
    type: string;
    length: number;
    precision: number;
    scale: number;
    sqlFullType: string;
    allowsNull: boolean;
    defaultValue: string;
    autoIncrement: boolean;
    valueListType?: string;
    extendedType?: string;
    defaultInView: boolean;
    defaultColumnWidth: number;
    isVirtual: boolean;
    isNameField: boolean;
    relatedEntityID?: string;
    relatedEntityFieldName?: string;
    relatedEntity?: string;
    relatedEntitySchemaName?: string;
    relatedEntityBaseView?: string;

    possibleValues?: SkipEntityFieldValueInfo[];
}

/**
 * Defines relationships between entities, including foreign key relationships and
 * many-to-many relationships through junction tables. This information allows Skip
 * to understand how entities are connected and generate appropriate JOIN queries.
 */
export class SkipEntityRelationshipInfo {
    entityID: string;
    relatedEntityID: string;
    type: string;
    entityKeyField: string;
    relatedEntityJoinField: string;
    joinView: string;
    joinEntityJoinField: string;
    joinEntityInverseJoinField: string;
    entity: string;
    entityBaseView: string;
    relatedEntity: string;
    relatedEntityBaseView: string;
}

/**
 * Complete metadata about a database entity including its fields, relationships,
 * and optionally sample data. This is the primary structure used to communicate
 * entity schema information to Skip for analysis and query generation.
 */
export class SkipEntityInfo {
    id: string;
    name!: string;
    description?: string;
    schemaName!: string;
    baseView!: string;
    fields: SkipEntityFieldInfo[] =[];
    relatedEntities: SkipEntityRelationshipInfo[] = [];

    /**
     * If rows packed is set to anything other than none, the data is provided in the rows property.
     */
    rowsPacked?: 'None' | 'Sample' | 'All' = 'None';
    /**
     * If rowsPacked === 'Sample', this additional property is used to indicate the method used to sample the rows
     */
    rowsSampleMethod?: 'random' | 'top n' | 'bottom n' = 'random';
    /**
     * Optional, the metadata can include an array of rows that can be used to provide context to Skip for the data that is being passed in. 
     */
    rows?: any[] = [];
}