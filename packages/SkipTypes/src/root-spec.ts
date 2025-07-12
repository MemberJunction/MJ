import { SkipComponentChildSpec } from "./child-spec";
import { SkipComponentDataRequirements } from "./data-requirements";

/**
 * Represents a complete specification for a generated Skip component, including its structure,
 * requirements, code, and nested component hierarchy
 */
export type SkipComponentRootSpec = {
    /**
     * A description of what the component should do from a functional perspective.
     * This should be in markdown format and include:
     * - Core functionality
     * - Business rules
     * - Expected outcomes
     * - UX considerations
     */
    functionalRequirements: string;
    
    /**
     * Detailed data requirements, including how the component accesses and uses data.
     */
    dataRequirements?: SkipComponentDataRequirements;
    
    /**
     * A technical description of how the component is designed and implemented.
     * This should be in markdown format and include:
     * - Architecture and design patterns
     * - Key technical decisions
     * - Component structure 
     * - State management
     * - Integration points with parent/child components
     */
    technicalDesign: string;
    
    /**
     * The code for the main component.
     */
    componentCode: string;
    
    /**
     * Name of the component
     */
    componentName: string;
    
    /**
     * The type of component: report, dashboard, form, or other.   
     */
    componentType: "report" | "dashboard" | "form" | "other",

    /**
     * A summary of what the component does that a user would understand.
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
     * User-friendly name
     */
    title: string;
    
    /**
     * A user-friendly explanation of what the component does
     */
    userExplanation: string;
    
    /**
     * Summary of technical design
     */
    techExplanation: string;
};