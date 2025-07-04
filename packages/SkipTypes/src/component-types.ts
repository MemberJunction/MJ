/**
 * This file is often **DIRECTLY** embedded into prompts so keep it clean and simple and limited to the types below.
 */

import { DataContext } from "@memberjunction/data-context";

/**
 * Represents a complete specification for a generated Skip component, including its structure,
 * requirements, code, and nested component hierarchy
 */
export type SkipComponentRootSpec = {
    /**
     * A description of what the component should do from a functional perspective.
     * This should be in markdown format and include:
     * - Core functionality and purpose
     * - User interactions and behaviors
     * - Business rules and logic
     * - Expected outcomes and outputs
     * - User experience considerations
     * - Accessibility requirements
     * 
     * @since 2.1.0 - Made required and enhanced documentation
     */
    functionalRequirements: string;
    
    /**
     * Detailed data requirements specification for the component.
     * Defines how the component accesses and uses data, supporting static, dynamic, and hybrid modes.
     * This field is critical for determining how the component will interact with MemberJunction data.
     * 
     * @since 2.1.0 - Made required for better data architecture planning
     */
    dataRequirements?: SkipComponentDataRequirements;
    
    /**
     * A technical description of how the component is designed and implemented.
     * This should be in markdown format and include:
     * - Architecture and design patterns used
     * - Key technical decisions and rationale
     * - Component structure and organization
     * - State management approach
     * - Performance considerations
     * - Integration points with parent/child components
     * - Error handling strategies
     * 
     * @since 2.1.0 - Made required and enhanced documentation
     */
    technicalDesign: string;
    
    /**
     * The actual code for the main component, typically wrapped in an IIFE that returns
     * the component object with component, print, and refresh properties
     */
    componentCode: string;
    
    /**
     * The name of the main component
     */
    componentName: string;
    
    /**
     * The type of component: report, dashboard, form, chart, table, or other. Over time this list
     * might grow to include more types as Skip evolves and new component types are needed.  
     */
    componentType: "report" | "dashboard" | "form" | "other",

    /**
     * A summary of what the component does that a user would understand.
     * This should be a high-level, user-friendly description suitable for end users.
     */
    description: string;
    
    /**
     * The callback strategy used by this component (e.g., "hybrid", "direct", "none")
     */
    callbackStrategy: string;
    
    /**
     * Describes the state structure managed by this component
     */
    stateStructure: Record<string, string>;
    
    /**
     * An array of child component specifications
     */
    childComponents: SkipComponentChildSpec[];
    
    /**
     * The title of the component
     */
    title: string;
    
    /**
     * A user-friendly explanation of what the component does
     */
    userExplanation: string;
    
    /**
     * A technical explanation of how the component works
     */
    techExplanation: string;
};
 

/**
 * Represents a child component within a component hierarchy
 */
export interface SkipComponentChildSpec {
    /**
     * The programmatic name of the component
     */
    componentName: string;
    
    /**
     * Example of the component being used in JSX format. This is used to provide a clear example on the properties and 
     * event handling that the component supports. This is used to teach the next AI exactly what we want it to generate for the 
     * child component.
     */
    exampleUsage: string;  
    
    /**
     * The code for the child component. This is generated LATER by a separate process after the parent
     * component generation is complete. When the parent component generates this is undefined.
     */
    componentCode?: string;

    /**
     * A summary of what this child component does that a user would understand.
     * This should be a high-level, user-friendly description suitable for end users.
     */
    description: string;
    
    /**
     * Functional requirements for this child component.
     * This should be in markdown format and describe what the component should do from a functional perspective.
     * Includes:
     * - Component-specific functionality
     * - How it integrates with the parent component
     * - User interactions within this component
     * - Business rules specific to this component
     * 
     * @since 2.1.0 - Enhanced documentation for clarity
     */
    functionalRequirements?: string;
    
    /**
     * Data requirements for this child component.
     * Child components inherit static data from their parent component's data context.
     * However, they can define their own dynamic data requirements for entities they need to access at runtime.
     * 
     * @since 2.1.0 - Enhanced documentation for clarity
     */
    dataRequirements?: SkipComponentDataRequirements;
    
    /**
     * Technical design details for this child component.
     * This should be in markdown format and describe the implementation approach.
     * Includes:
     * - How the component is structured
     * - State management within the component
     * - Props interface and event handlers
     * - Performance optimizations specific to this component
     * 
     * @since 2.1.0 - Enhanced documentation for clarity
     */
    technicalDesign?: string;
    
    /**
     * The path in the state tree where this component's state is stored
     */
    statePath: string;
    
    /**
     * An array of sub-components (recursive structure)
     */
    components: SkipComponentChildSpec[];
}


/**
 * Defines the data requirements for a Skip component, supporting three different data access modes.
 * This interface is critical for understanding how components interact with MemberJunction data
 * and helps optimize performance by clearly defining data access patterns.
 * 
 * @since 2.1.0 - Enhanced with comprehensive support for static, dynamic, and hybrid data modes
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