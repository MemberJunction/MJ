import { DataContext } from "@memberjunction/data-context";

/**
 * This interface is critical for understanding how components interact with MemberJunction data
 */
export interface ComponentDataRequirements {
    /**
     * The primary data access mode for this component.
     * - 'dynamic': Component fetches data at runtime using MJ utilities
     * - 'static': Deprecated, use dynamic.  
     * - 'hybrid': Deprecated, use dynamic.  
     */
    mode: 'static' | 'dynamic' | 'hybrid';
    
    /**
     * For static mode: References to data context items that this component uses.
     * These are pre-loaded data snapshots that are passed to the component during initialization.
     * @deprecated Use dynamicData instead
     */
    staticData?: {
        /**
         * Reference to the data context that this component uses.
         */
        dataContext: DataContext;
        
        /**
         * Description of how the static data is used by the component
         */
        description?: string;
    };
    
    /**
     * For dynamic mode: Defines which MemberJunction entities this component needs access to.
     * The component will use the RunView/RunQuery utilities to fetch data at runtime.
     */
    dynamicData?: {
        /**
         * Describes the entities and fields the component will
         * need to fulfill user requirements.
         */
        requiredEntities: ComponentEntityDataRequirement[];
        
        /**
         * Description of data access patterns
         */
        description?: string;
    };
    
    /**
     * General description of data requirements
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
    entityName: string;

    /**
     * Description of data in the entity
     */
    entityDescription?: string;

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