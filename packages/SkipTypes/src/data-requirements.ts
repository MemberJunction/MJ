import { DataContext } from "@memberjunction/data-context";

/**
 * Defines the data requirements for a Skip component, supporting three different data access modes.
 * This interface is critical for understanding how components interact with MemberJunction data
 * and helps optimize performance by clearly defining data access patterns.
 */
export interface SkipComponentDataRequirements {
    /**
     * The primary data access mode for this component.
     * - 'dynamic': Component fetches data at runtime using MJ utilities
     * - 'static': Static is deprecated, use dynamic. Data is pre-loaded and passed to the component during initialization
     * - 'hybrid': Hybrid is deprecated, use dynamic. Uses both static and dynamic data access patterns
     */
    mode: 'static' | 'dynamic' | 'hybrid';
    
    /**
     * For static mode: References to data context items that this component uses.
     * These are pre-loaded data snapshots that are passed to the component during initialization.
     * Static mode is preferred for:
     * - Reports with fixed datasets
     * - Components where users don't need entity-level permissions
     * - Scenarios requiring reduced database load
     * @deprecated Use dynamicData instead
     */
    staticData?: {
        /**
         * Reference to the data context that this component uses.
         * Points to a DataContext object containing pre-loaded data.
         */
        dataContext: DataContext;
        
        /**
         * Optional description of how the static data is used by the component
         */
        description?: string;
    };
    
    /**
     * For dynamic mode: Defines which MemberJunction entities this component needs access to.
     * The component will use the RunView/RunQuery utilities to fetch data at runtime.
     * Dynamic mode is preferred for:
     * - Interactive dashboards with drill-down capabilities
     * - Components requiring real-time data
     * - Scenarios where users need entity-level permission validation
     */
    dynamicData?: {
        /**
         * Array of objects specifying the exact entities and fields the component will 
         * need to fulfill user requirements. This detail also allows other components
         * to not have to know the database schema.
         */
        requiredEntities: SkipComponentEntityDataRequirement[];
        
        /**
         * Optional description of the dynamic data access patterns
         */
        description?: string;
    };
    
    /**
     * General description of the component's data requirements and access patterns.
     * This should provide a high-level overview of the data strategy.
     */
    description?: string;
}

/**
 * Specifications for the use of a single entity within a Skip component.
 */
export type SkipComponentEntityDataRequirement = {
    /**
     * The name of the entity as defined in the metadata.
     */
    entityName: string;

    /**
     * Description of the entityt as defined in the metadata.
     */
    entityDescription?: string;

    /**
     * These fields can be shown to the user as determined by each component.
     */
    displayFields: string[];

    /**
     * These fields can be used when filtering data as appropriately determined by each component.
     */
    filterFields?: string[];

    /**
     * These fields can be used when sorting data as appropriately determined by each component.
     */
    sortFields?: string[];

    /**
     * Optional, description of when/where/how components should use this entity.
     */
    usageContext?: string;
}