export interface ComponentDataRequirements {
    /**
     * How the component gets its data
     * - 'views': Fetches data at runtime using MJ RunView() 
     * - 'queries': Fetches data at runtime using MJ RunQuery()
     * - 'hybrid': Uses both views and queries, depending on the context
     */
    mode: 'views' | 'queries' | 'hybrid';
    
    queries: ComponentQueryDataRequirement[];

    /**
     * Describes the entities and fields the component will access to fulfill user requirements.
     */
    entities: ComponentEntityDataRequirement[];
    
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
     * Queries can have parameters (not all do). See @see ComponentQueryParameterValue for details.
     */
    parameters?: ComponentQueryParameterValue[];
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
}

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