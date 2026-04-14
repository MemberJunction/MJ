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
 * Information about a related entity matched via an organic key.
 * Either direct (relatedEntityFieldNames) or transitive (transitiveObjectName + bridge fields).
 */
export interface SkipEntityOrganicKeyRelatedEntityInfo {
    id: string;
    relatedEntityID: string;
    relatedEntityName: string;
    relatedEntitySchemaName: string;
    relatedEntityBaseView: string;
    /** True if this is a direct field-to-field match. */
    isDirectMatch: boolean;
    /** True if this is a transitive match through a bridge view. */
    isTransitiveMatch: boolean;
    /**
     * For direct matches: field names in the related entity, positionally aligned
     * with the parent organic key's matchFieldNames.
     */
    relatedEntityFieldNames?: string[];
    /** For transitive matches: schema-qualified name of the bridge view/table. */
    transitiveObjectName?: string;
    /** For transitive matches: fields in the bridge that match the organic key. */
    transitiveObjectMatchFieldNames?: string[];
    /** For transitive matches: output field from the bridge that joins to the related entity. */
    transitiveObjectOutputFieldName?: string;
    /** For transitive matches: field in the related entity matching the bridge output. */
    relatedEntityJoinFieldName?: string;
    displayName?: string;
    sequence: number;
}

/**
 * Information about an organic key defined on an entity.
 * Organic keys express cross-entity relationships via shared business data
 * (email, acronym, domain, etc.) rather than database FK constraints.
 */
export interface SkipEntityOrganicKeyInfo {
    id: string;
    name: string;
    description?: string;
    /**
     * Comma-delimited field names parsed into an array. Single value for simple
     * keys, multiple for compound keys.
     */
    matchFieldNames: string[];
    /** How to normalize values before comparison. */
    normalizationStrategy: 'LowerCaseTrim' | 'Trim' | 'ExactMatch' | 'Custom';
    /** SQL expression template (uses {{FieldName}} placeholder) when strategy is Custom. */
    customNormalizationExpression?: string;
    sequence: number;
    relatedEntities: SkipEntityOrganicKeyRelatedEntityInfo[];
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
     * Organic keys defined on this entity. Empty array if none.
     * Organic keys express cross-entity relationships via shared business data
     * (email, acronym, domain, etc.) rather than database FK constraints. Skip
     * should treat these as additional valid join paths beyond `relatedEntities`.
     */
    organicKeys: SkipEntityOrganicKeyInfo[];

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
