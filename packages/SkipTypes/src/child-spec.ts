import { SkipComponentDataRequirements } from "./data-requirements";

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