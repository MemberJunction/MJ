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
     * Queries can have parameters (not all do). See @see ComponentQueryParameterValue for details.
     */
    parameters?: ComponentQueryParameterValue[];

    /**
     * This is only provided when requesting a NEW query be created. For existing queries, this will be undefined.
     * This SQL can use Nunjucks syntax/templating for parameters including the custom filters defined in 
     */
    newQuerySQL?: string;
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
     * Value of the parameter. If the value is '@runtime', it indicates that the component will determine the value at runtime. 
     * If anything other than '@runtime' is specified, it is a hardcoded value that the component will use.
     */ 
    value: string;

    /**
     * When specifying '@runtime' for the value, populate this field with a value that can be used to test the query to validate it runs. It doesn't need
     * to be a value that is valid in the sense of being in the database, but is of the right type. For example if the
     * parameter is a number, date or string, include a test value of that type. **Note** if the parameter is for a UNIQUEIDENTIFIER column
     * type make sure to use a valid UUID format otherwise the query will FAIL.
     */
    testValue: string;

    /**
     * Description of the parameter and how it is used in the query. This is particular important if 
     * the value is '@runtime' as it helps the component developer understand what the parameter is for and how to determine its value.
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
 * Simple type to share more information about the relevant fields 
 * in an entity that are to be used in a component 
 **/
export type SimpleEntityFieldInfo = {
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
}