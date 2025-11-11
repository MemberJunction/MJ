import { ComponentEvent, ComponentProperty } from "./component-props-events";
import { ComponentDataRequirements } from "./data-requirements";
import { ComponentLibraryDependency } from "./library-dependency";

/**
 * Specification for an interactive component
 */
export class ComponentSpec {
    name: string;

    /**
     * Components can be embedded or registry. Registry means we don't have the
     * code directly here nor do we generate the code, we simply use the component from its registry
     */
    location: "embedded" | "registry";

    /**
     * Used when location === 'registry' - the unique name of a given registry without the @ sign
     * for example MJ or Skip would be valid globally unique registry names (as registered with MemberJunction.org)
     * You would not include @ here. Fully qualified component identifiers would be
     * @Registry/Namespace/Name/Version but in the context of this field it is just the registry name.
     */
    registry?: string;

    /**
     * Used when location === "registry", a hierarchical namespace such as "crm/analytics/accounts". The combination of the 
     * namespace and name are how a registry component is loaded. Registry components might have
     * a root level segment that starts with @ such as "@memberjunction/examples/entities" or if the root
     * segment doesn't have @ that means the component is local to that registry
     */
    namespace?: string;

    /**
     * Used when location === "registry", a semantic versioning string such as
     * "1.0.0"
     * "^1.0.0"
     * "~1.0.0"
     * Follows conventions documented here: https://semver.org/ and https://docs.npmjs.com/about-semantic-versioning 
     */
    version?: string;

    /**
     * Only used when location === 'registry', logic explaining why this component is being selected
     * to serve a specific use case or requirement
     */
    selectionReasoning?: string;

    /**
     * When an architect decides to use an existing component as a base for a new version,
     * they can set this flag to true. This indicates that the new version will be created
     * based on the existing component based on the namespace/name/version specified above
     */
    createNewVersion?: boolean;

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
     * Optional array of diagrams that use Mermaid syntax to illustrate component design. 
     * When provided each entry in the array specifies a title, optional description and the mermaid content itself.
     * Examples of diagrams include:
     * - Flowcharts of the process the component implements
     * - Entity-relationship diagrams of the data model the component uses
     * - Sequence diagrams illustrating interactions between the components various parts
     */
    diagrams?: Array<{ title: string; description?: string, content: string; }>;
    
    /**
     * Properties the component accepts, if any 
     */
    properties?: ComponentProperty[];

    /**
     * Events that the component emits, if any
     */
    events?: ComponentEvent[];

    /**
     * Metadata about methods the component supports, if any
     */
    methods?: ComponentMethodInfo;

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

    /**
     * Relevant examples of components intended to inspire this component's creation
     */
    relevantExamples?: ComponentExample[];

    /**
     * Self-declared maturity level of the component. When a component is "in progress" and is not
     * yet complete but is partially done, it can be marked as "incomplete". When it is functionally complete
     * but not yet widely tested, it can be marked as "beta". When it is fully complete and tested, it can be marked
     * as "production". This is intended to help architects and developers understand the readiness of a component
     * for use in production systems.
     */
    readinessLevel?: "incomplete" | "beta" | "production";

    /**
     * If a component isn't complete or encounters problems in testing, this field can be used to
     * track a work plan for completing or fixing the component. Generally this work plan string will contain
     * a markdown formatted list of tasks to be done with rich explanations to allow developers (human+AI) to
     * collaborate on completing the component.
     */
    workPlan?: string;
};

/**
 * Defines standard and custom methods a component implements
 */
export interface ComponentMethodInfo {
    standardMethodsSupported: {
        print?: boolean;
        refresh?: boolean;
        getCurrentDataState?: boolean;
        getDataStateHistory?: boolean;
        validate?: boolean;
        isDirty?: boolean;
        reset?: boolean;
        scrollTo?: boolean;
        focus?: boolean;
        invokeMethod?: boolean;
        hasMethod?: boolean;
    }
    customMethods: CustomComponentMethod[]
}

/**
 * Defines a single custom component method
 */
export interface CustomComponentMethod {
    name: string;
    description: string;
    parameters: Array<{name: string, type: string, description?: string }>;
    returnType: string;
}

/**
 * Type that defines an example component used to inspire the creation
 * of a new component. By definition these examples are located in a registry
 * and can be found via the combination of their name and namespace. The optional
 * properties can be used at runtime to store additional information as required
 * for generation/inference needs
 */
export type ComponentExample = {
    name: string;
    namespace: string;
    version?: string;
    registry?: string;
    description?: string;
    functionalRequirements?: string;
    technicalDesign?: string;

    /**
     * Tracks a 0-1 number that indicates the relevance of this example to the containing ComponentSpec, can be used
     * for ranking examples by importance/relevance
     */
    relevance?: number;

    code?: string;

    /**
     * Optional runtime embedding vector calculated for description
     */
    descriptionVector?: number[];
    /**
     * Optional runtime embedding vector calculated for functional requirements
     */
    functionalRequirementsVector?: number[];
    /**
     * Optional runtime embedding vector calculated for technical design
     */
    technicalDesignVector?: number[];

    /**
     * Bag to hold any number of other runtime attributes
     */
    other?: any;
};
