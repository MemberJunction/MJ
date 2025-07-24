import { ComponentEvent, ComponentProperty } from "./component-props-events";
import { ComponentDataRequirements } from "./data-requirements";
import { ComponentLibraryDependency } from "./library-dependency";

/**
 * Specification for an interactive component
 */
export class ComponentSpec {
    name: string;

    /**
     * End-user friendly description of what the component does
     */
    description: string;
    
    /**
     * User-friendly name
     */
    title: string;
    
    /**
     * Self-declared type - some common options below, can be any string if the standard ones aren't sufficient
     */
    type: "report" | "dashboard" | "form" | "table" | "chart" | "navigation" | "search" | string;

    /**
     * JavaScript code
     */
    code: string;

    /**
     * A functional description of what the component should do in markdown. 
     * 
     * Describes:
     * - Core functionality
     * - Any business rules
     * - Expected outcomes
     * - UX considerations
     */
    functionalRequirements: string;
    
    /**
     * Describes the entities and queries a component requires to function.
     */
    dataRequirements?: ComponentDataRequirements;
    
    /**
     * Technical explanation of the component in markdown.
     */
    technicalDesign: string;
    
    /**
     * Properties the component accepts, if any 
     */
    properties?: ComponentProperty[];

    /**
     * Events that the component emits, if any
     */
    events?: ComponentEvent[];

    /**
     * Example of the component being used in JSX format. This is used to provide a clear example on the properties and 
     * event handling that the component supports.
     */
    exampleUsage: string;  

    /**
     * Describes any other components this one depends on, if any
     */
    dependencies?: ComponentSpec[];

    /**
     * 3rd party lib dependencies, if any
     */
    libraries?: ComponentLibraryDependency[];
};