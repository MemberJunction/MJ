import { DataContext } from "@memberjunction/data-context";

/**
 * Defines the data requirements for a Skip component, supporting three different data access modes.
 * This interface is critical for understanding how components interact with MemberJunction data
 * and helps optimize performance by clearly defining data access patterns.
 */
export interface SkipComponentDataRequirements {
    /**
     * The primary data access mode for this component.
     * - 'static': Data is pre-loaded and passed to the component during initialization
     * - 'dynamic': Component fetches data at runtime using MJ utilities
     * - 'hybrid': Component uses both static and dynamic data access patterns
     */
    mode: 'static' | 'dynamic' | 'hybrid';
    
    /**
     * For static mode: References to data context items that this component uses.
     * These are pre-loaded data snapshots that are passed to the component during initialization.
     * Static mode is preferred for:
     * - Reports with fixed datasets
     * - Components where users don't need entity-level permissions
     * - Scenarios requiring reduced database load
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
     * For hybrid mode: Components can use both static and dynamic data access.
     * Both staticData and dynamicData sections should be populated.
     * Hybrid mode is useful for:
     * - Components with both summary (static) and detail (dynamic) views
     * - Optimizing performance while maintaining interactivity
     */
    hybridStrategy?: {
        /**
         * Description of how the component decides when to use static vs dynamic data
         */
        description: string;
        
        /**
         * Optional performance considerations for the hybrid approach
         */
        performanceNotes?: string;
    };
    
    /**
     * General description of the component's data requirements and access patterns.
     * This should provide a high-level overview of the data strategy.
     */
    description?: string;
    
    /**
     * Security considerations for data access
     * @since 2.1.0
     */
    securityNotes?: string;
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