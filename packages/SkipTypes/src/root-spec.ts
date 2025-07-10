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
 
