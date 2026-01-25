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
     * Uses the @see SimpleEntityFieldInfo type to describe each field. **NOTE** not all of the fields are actually
     * directly related to entity fields as some might be computed/etc, but SimpleEntityFieldInfo helps define some key aspects
     * like the data type of the column and a description of the field.
     */
    fields: SimpleEntityFieldInfo[];

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
    name: string;
    /**
     * Display sequence usually used for this field
     */
    sequence: number;
    /**
     * Whether this field is usually displayed in a user-facing view
     */
    defaultInView: boolean;
    /**
     * SQL Server type of the field, e.g., 'varchar', 'int', etc.
     */
    type: string;
    /**
     * Whether the field allows null values
     */
    allowsNull: boolean;
    /**
     * Whether the field is part of the primary key
     */
    isPrimaryKey: boolean;
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
            Name: this.name,
            Sequence: this.sequence,
            DefaultInView: this.defaultInView,
            Type: this.type,
            AllowsNull: this.allowsNull,
            IsPrimaryKey: this.isPrimaryKey,
            Description: this.description
            // Note: possibleValues cannot be directly mapped back as EntityFieldValues
            // requires EntityFieldValueInfo objects with additional metadata
        };
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
    name: string;

    /**
     * Optional description of the entity
     */
    description?: string;

    /**
     * Complete list of ALL fields in this entity.
     * Used by linter to validate field access with proper severity levels.
     */
    fields: SimpleEntityFieldInfo[];

    constructor(init?: Partial<SimpleEntityInfo>) {
        this.fields = [];
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
            Name: this.name,
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
    hasField(fieldName: string): boolean {
        return this.fields.some(f => f.name === fieldName);
    }

    /**
     * Helper method to get a field by name
     * @param fieldName The field name to find
     * @returns The SimpleEntityFieldInfo if found, undefined otherwise
     */
    getField(fieldName: string): SimpleEntityFieldInfo | undefined {
        return this.fields.find(f => f.name === fieldName);
    }

    /**
     * Helper method to get all field names as a Set for efficient lookup
     * @returns Set of all field names in this entity
     */
    getFieldNameSet(): Set<string> {
        return new Set(this.fields.map(f => f.name));
    }
}