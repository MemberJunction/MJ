import { ComponentEvent, ComponentProperty } from "./component-props-events";
import { ComponentDataRequirements } from "./data-requirements";

/**
 * Represents a child component within a component hierarchy
 */
export interface ComponentChildSpec {
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
     */
    functionalRequirements?: string;
    
    /**
     * Data requirements for this child component. This section defines where a child component
     * will **directly** access data as required using utilities methods like `rv.runView` and `rq.runQuery`
     */
    dataRequirements?: ComponentDataRequirements;

    /**
     * An optional array of properties that the component uses. The names and descriptions 
     * allow consumers of the component to understand what is accepted by the component and the 
     * component. This can be used for shared data shared between components or for configuration
     * settings.
     */
    properties?: ComponentProperty[];

    /**
     * An optional array of events that the component emits.
     * This allows consumers of the component to understand what events they can listen to.
     */
    events?: ComponentEvent[];

    /**
     * Technical design details for this child component.
     * This should be in markdown format and describe the implementation approach.
     * Includes:
     * - How the component is structured
     * - State within the component
     * - Properites/events 
     */
    technicalDesign?: string;
    
    /**
     * The path in the state tree where this component's state is stored
     */
    statePath: string;
    
    /**
     * An array of sub-components
     */
    components: ComponentChildSpec[];
}