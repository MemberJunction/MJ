/**
 * For each Skip API Analysis result, it is possible for Skip to provide a set of tableDataColumns that describe the data that is being returned in this shape.
 */
export interface SkipColumnInfo {
    fieldName: string;
    displayName: string;
    simpleDataType: 'string' | 'number' | 'date' | 'boolean';
    description: string;
}

/**
 * Enumerates the possible values for a given field
 */
export interface SkipEntityFieldValueInfo {
    /**
     * Possible value
     */
    value: string;
    /**
     * Value to show user, if different from value
     */
    displayValue?: string;
}

/**
 * Describes a single field in an entity.
 */
export interface SkipEntityFieldInfo {
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
 * many-to-many relationships through junction tables.
 */
export interface SkipEntityRelationshipInfo {
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
 * Info about a single entity including fields and relationships
 */
export interface SkipEntityInfo {
    id: string;
    name: string;
    description?: string;
    schemaName: string;
    baseView: string;
    fields: SkipEntityFieldInfo[];
    relatedEntities: SkipEntityRelationshipInfo[];

    /**
     * If rows packed is set to anything other than none, the data is provided in the rows property.
     */
    rowsPacked?: 'None' | 'Sample' | 'All';
    /**
     * If rowsPacked === 'Sample', this additional property is used to indicate the method used to sample the rows
     */
    rowsSampleMethod?: 'random' | 'top n' | 'bottom n';
    /**
     * Optional, the metadata can include an array of rows that can be used to provide context to Skip for the data that is being passed in.
     */
    rows?: unknown[];
}
