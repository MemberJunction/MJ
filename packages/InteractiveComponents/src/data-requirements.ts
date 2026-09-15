import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

export interface ComponentDataRequirements {
    /**
     * How the component gets its data
     * - 'views': Fetches data at runtime using MJ RunView() 
     * - 'queries': Fetches data at runtime using MJ RunQuery()
     * - 'hybrid': Uses both views and queries, depending on the context
     */
    mode: 'views' | 'queries' | 'hybrid';
    
    /**
     * Describes the entities and fields the component will access to fulfill user requirements.
     */
    entities: ComponentEntityDataRequirement[];
    
    /**
     * Stored Queries that the component will use to fetch data.
     */
    queries: ComponentQueryDataRequirement[];

    /**
     * Description of data access patterns
     */
    description?: string;
}

/**
 * Describes how a component will use a specific query in MemberJunction to fetch data
 */
export type ComponentQueryDataRequirement = {
    /**
     * Query name, used along with categoryPath to identify the query
     */
    name: string;

    /**
     * Full path of the category for the query. Categories can be hierarchical so a full path might be
     * 'Membership/Users/ActiveUsers'. This helps in organizing queries and avoiding name collisions.
     */
    categoryPath: string;

    /**
     * Description of the query and how/why the component will use it 
     */
    description?: string;

    /**
     * A list of the fields that the component will use out of the possible fields returned by the query.
     * Uses the @see SimpleQueryFieldInfo type to describe each field, which extends SimpleEntityFieldInfo
     * with query-specific properties like source entity tracking and summary field indicators.
     */
    fields: SimpleQueryFieldInfo[];

    /**
     * A list of the entities that are part of this query. This is vital information for matching query requests
     * against existing queries
     */
    entityNames: string[];

    /**
     * Queries can have parameters (not all do). See @see ComponentQueryParameterValue for details.
     */
    parameters?: ComponentQueryParameterValue[];

    /**
     * This is only provided when requesting a NEW query be created. For existing queries, this will be undefined.
     * This SQL can use Nunjucks syntax/templating for parameters including the custom filters defined in
     */
    newQuerySQL?: string;

    /**
     * Indicates whether this query was newly created (true) or matched an existing query (false).
     * Set by the Query Designer agent during query processing.
     */
    isNew?: boolean;
}

/**
 * Describes a single query parameter that a component will use when running a query.
 */
export type ComponentQueryParameterValue = {
    /**
     * Name of the parameter
     */
    name: string;

    /**
     * Whether this parameter must be provided when executing the query.
     */
    isRequired: boolean;

    /**
     * Value of the parameter. If the value is '@runtime', it indicates that the component will determine the value at runtime.
     * If anything other than '@runtime' is specified, it is a hardcoded value that the component will use.
     */
    value?: string;

    /**
     * When specifying '@runtime' for the value, populate this field with a value that can be used to test the query to validate it runs. It doesn't need
     * to be a value that is valid in the sense of being in the database, but is of the right type. For example if the
     * parameter is a number, date or string, include a test value of that type. **Note** if the parameter is for a UNIQUEIDENTIFIER column
     * type make sure to use a valid UUID format otherwise the query will FAIL.
     */
    testValue?: string;

    /**
     * Data type of the parameter (e.g., 'string', 'int', 'uniqueidentifier', 'datetime', 'decimal').
     * This helps the component generator understand how to properly format and pass the parameter value.
     */
    type?: string;

    /**
     * Example value demonstrating the proper format for this parameter.
     * Preferred over testValue for component generation as it aligns with SkipQueryParamInfo.SampleValue naming.
     */
    sampleValue?: string;

    /**
     * Description of the parameter and how it is used in the query. This is important for helping
     * the component developer understand what the parameter is for and how to determine its value.
     */
    description?: string;
}

/**
 * Describes use of a single entity 
 */
export type ComponentEntityDataRequirement = {
    /**
     * Name of the entity (unique system-wide)
     */
    name: string;

    /**
     * Description of data in the entity
     */
    description?: string;

    /**
     * Fields to show the user
     */
    displayFields: string[];

    /**
     * Fields to filter on initially or via user interaction.
     */
    filterFields?: string[];

    /**
     * Fields to use when sorting 
     */
    sortFields?: string[];

    /**
     * For the set of fields used in the combination of display, filter, and sort,
     * this array is populated with additional metadata about each field. This will
     * NOT include fields that are not used in the component.
     */
    fieldMetadata: SimpleEntityFieldInfo[]

    /**
     * When/Where/How components should use this data
     */
    usageContext?: string;

    /**
     * Array of permissions required by the component
     */
    permissionLevelNeeded: ComponentEntitySimplePermission[];
}

export type ComponentEntitySimplePermission = 'read' | 'create' | 'update' | 'delete';

/**
 * Lightweight class to share field metadata for component validation and linting.
 * This is a simplified version of EntityFieldInfo from @memberjunction/core,
 * designed for contexts where full field metadata isn't needed.
 **/
export class SimpleEntityFieldInfo {
    /**
     * Name of the field
     */
    Name: string;

    /** @deprecated Use {@link Name}. */
    get name(): string {
        return this.Name;
    }
    /** @deprecated Use {@link Name}. */
    set name(value: string) {
        this.Name = value;
    }
    /**
     * Display sequence usually used for this field
     */
    Sequence: number;

    /** @deprecated Use {@link Sequence}. */
    get sequence(): number {
        return this.Sequence;
    }
    /** @deprecated Use {@link Sequence}. */
    set sequence(value: number) {
        this.Sequence = value;
    }
    /**
     * Whether this field is usually displayed in a user-facing view
     */
    DefaultInView: boolean;

    /** @deprecated Use {@link DefaultInView}. */
    get defaultInView(): boolean {
        return this.DefaultInView;
    }
    /** @deprecated Use {@link DefaultInView}. */
    set defaultInView(value: boolean) {
        this.DefaultInView = value;
    }
    /**
     * SQL Server type of the field, e.g., 'varchar', 'int', etc.
     */
    Type: string;

    /** @deprecated Use {@link Type}. */
    get type(): string {
        return this.Type;
    }
    /** @deprecated Use {@link Type}. */
    set type(value: string) {
        this.Type = value;
    }
    /**
     * Whether the field allows null values
     */
    AllowsNull: boolean;

    /** @deprecated Use {@link AllowsNull}. */
    get allowsNull(): boolean {
        return this.AllowsNull;
    }
    /** @deprecated Use {@link AllowsNull}. */
    set allowsNull(value: boolean) {
        this.AllowsNull = value;
    }
    /**
     * Whether the field is part of the primary key
     */
    IsPrimaryKey: boolean;

    /** @deprecated Use {@link IsPrimaryKey}. */
    get isPrimaryKey(): boolean {
        return this.IsPrimaryKey;
    }
    /** @deprecated Use {@link IsPrimaryKey}. */
    set isPrimaryKey(value: boolean) {
        this.IsPrimaryKey = value;
    }
    /**
     * Possible values for the field, if applicable
     */
    possibleValues?: string[];
    /**
     * Description of the field
     */
    description?: string;

    constructor(init?: Partial<SimpleEntityFieldInfo>) {
        if (init) {
            Object.assign(this, init);
        }
    }

    /**
     * Creates a SimpleEntityFieldInfo from a full EntityFieldInfo object
     * @param fieldInfo The EntityFieldInfo from @memberjunction/core
     * @returns A new SimpleEntityFieldInfo instance
     */
    static FromEntityFieldInfo(fieldInfo: EntityFieldInfo): SimpleEntityFieldInfo {
        return new SimpleEntityFieldInfo({
            name: fieldInfo.Name,
            sequence: fieldInfo.Sequence,
            defaultInView: fieldInfo.DefaultInView,
            type: fieldInfo.Type,
            allowsNull: fieldInfo.AllowsNull,
            isPrimaryKey: fieldInfo.IsPrimaryKey,
            possibleValues: fieldInfo.EntityFieldValues?.map(v => v.Value),
            description: fieldInfo.Description
        });
    }

    /**
     * Converts this SimpleEntityFieldInfo to a partial EntityFieldInfo object.
     * Note: This creates a plain object with EntityFieldInfo-compatible properties,
     * not a full EntityFieldInfo instance (which requires database context).
     * @returns A partial EntityFieldInfo-compatible object
     */
    ToEntityFieldInfo(): Partial<EntityFieldInfo> {
        return {
            Name: this.Name,
            Sequence: this.Sequence,
            DefaultInView: this.DefaultInView,
            Type: this.Type,
            AllowsNull: this.AllowsNull,
            IsPrimaryKey: this.IsPrimaryKey,
            Description: this.description
            // Note: possibleValues cannot be directly mapped back as EntityFieldValues
            // requires EntityFieldValueInfo objects with additional metadata
        };
    }
}

/**
 * Extended field info class for query fields that includes data lineage tracking.
 * Query fields may come from joins across multiple entities, so this class tracks
 * the source entity and field for each column in the query result.
 *
 * Use this class for ComponentQueryDataRequirement.fields instead of SimpleEntityFieldInfo.
 */
export class SimpleQueryFieldInfo extends SimpleEntityFieldInfo {
    /**
     * The source entity this field originates from (for data lineage tracking).
     * For query fields, this indicates which MemberJunction entity the data comes from.
     * May be undefined for computed fields that don't map to a single entity.
     */
    sourceEntity?: string;
    /**
     * The field name in the source entity (for data lineage tracking).
     * Combined with sourceEntity, this provides full lineage back to the original data source.
     */
    sourceFieldName?: string;
    /**
     * Whether this field represents a summary/aggregate value (COUNT, SUM, AVG, etc.).
     * Important for chart axis choices, grid formatting, and data interpretation.
     */
    isSummary?: boolean;
    /**
     * Description of the summary calculation (e.g., "Count of orders per customer").
     * Provides context for how the aggregate value is computed.
     */
    summaryDescription?: string;

    constructor(init?: Partial<SimpleQueryFieldInfo>) {
        super(init);
        if (init) {
            // Assign query-specific properties that aren't handled by super()
            this.sourceEntity = init.sourceEntity;
            this.sourceFieldName = init.sourceFieldName;
            this.isSummary = init.isSummary;
            this.summaryDescription = init.summaryDescription;
        }
    }
}

/**
 * Lightweight class to share entity metadata for component validation and linting.
 * Contains the entity name and complete list of all fields in the entity.
 * This is a simplified version of EntityInfo from @memberjunction/core,
 * designed for contexts where full entity metadata isn't needed.
 */
export class SimpleEntityInfo {
    /**
     * Name of the entity (unique system-wide, e.g., "Certifications")
     */
    Name: string;

    /** @deprecated Use {@link Name}. */
    get name(): string {
        return this.Name;
    }
    /** @deprecated Use {@link Name}. */
    set name(value: string) {
        this.Name = value;
    }

    /**
     * Optional description of the entity
     */
    description?: string;

    /**
     * Complete list of ALL fields in this entity.
     * Used by linter to validate field access with proper severity levels.
     */
    Fields: SimpleEntityFieldInfo[];

    /** @deprecated Use {@link Fields}. */
    get fields(): SimpleEntityFieldInfo[] {
        return this.Fields;
    }
    /** @deprecated Use {@link Fields}. */
    set fields(value: SimpleEntityFieldInfo[]) {
        this.Fields = value;
    }

    constructor(init?: Partial<SimpleEntityInfo>) {
        this.Fields = [];
        if (init) {
            Object.assign(this, init);
        }
    }

    /**
     * Creates a SimpleEntityInfo from a full EntityInfo object
     * @param entityInfo The EntityInfo from @memberjunction/core
     * @returns A new SimpleEntityInfo instance with all fields mapped
     */
    static FromEntityInfo(entityInfo: EntityInfo): SimpleEntityInfo {
        return new SimpleEntityInfo({
            name: entityInfo.Name,
            description: entityInfo.Description,
            fields: entityInfo.Fields.map(f => SimpleEntityFieldInfo.FromEntityFieldInfo(f))
        });
    }

    /**
     * Creates an array of SimpleEntityInfo from an array of EntityInfo objects
     * @param entities Array of EntityInfo from @memberjunction/core
     * @returns Array of SimpleEntityInfo instances
     */
    static FromEntityInfoArray(entities: EntityInfo[]): SimpleEntityInfo[] {
        return entities.map(e => SimpleEntityInfo.FromEntityInfo(e));
    }

    /**
     * Converts this SimpleEntityInfo to a partial EntityInfo object.
     * Note: This creates a plain object with EntityInfo-compatible properties,
     * not a full EntityInfo instance (which requires database context).
     * @returns A partial EntityInfo-compatible object
     */
    ToEntityInfo(): Partial<EntityInfo> {
        return {
            Name: this.Name,
            Description: this.description
            // Note: Fields cannot be directly mapped back as EntityInfo.Fields
            // requires EntityFieldInfo objects with additional metadata and context
        };
    }

    /**
     * Helper method to check if a field exists in this entity
     * @param fieldName The field name to check
     * @returns True if the field exists, false otherwise
     */
    HasField(fieldName: string): boolean {
        return this.Fields.some(f => f.name === fieldName);
    }

    /** @deprecated Use {@link HasField}. */
    hasField(fieldName: string): boolean {
        return this.HasField(fieldName);
    }

    /**
     * Helper method to get a field by name
     * @param fieldName The field name to find
     * @returns The SimpleEntityFieldInfo if found, undefined otherwise
     */
    GetField(fieldName: string): SimpleEntityFieldInfo | undefined {
        return this.Fields.find(f => f.name === fieldName);
    }

    /** @deprecated Use {@link GetField}. */
    getField(fieldName: string): SimpleEntityFieldInfo | undefined {
        return this.GetField(fieldName);
    }

    /**
     * Helper method to get all field names as a Set for efficient lookup
     * @returns Set of all field names in this entity
     */
    GetFieldNameSet(): Set<string> {
        return new Set(this.Fields.map(f => f.name));
    }

    /** @deprecated Use {@link GetFieldNameSet}. */
    getFieldNameSet(): Set<string> {
        return this.GetFieldNameSet();
    }
}