/**
 * Definition of a single property of a component.
 */
export interface SkipComponentProperty {
    /**
     * The name of the property
     */
    name: string;
    /**
     * A description of what this property is used for
     */
    description: string;
    /**
     * The type of the property. 
     * It can be one of 'string', 'number', 'boolean', 'object', 'array', 'function', or 'any'.
     * These types are for aligning users of the component. Components are in JavaScript and do not
     * actually enforce types at runtime, but this is used to provide guidance for users (AI and Human)
     */
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function' | 'any';
    /**
     * Indicates if this property is required for the component to function correctly.
     * If true, the component will not work without this property being set.
     */
    required: boolean;
    /**
     * The default value, if any, for this property if it is not provided.
     */
    defaultValue?: any;
    /**
     * Optional list of possible values for this property.
     */
    possibleValues?: string[];
}

/**
 * Definition of a single event of a component.
 */
export interface SkipComponentEvent {
    /**
     * The name of the event
     */
    name: string;
    /**
     * A description of what this event does
     */
    description: string;
    /**
     * An array of parameters that this event can emit.
     */
    parameters?: SkipComponentEventParameter[];
}

export interface SkipComponentEventParameter {
    /**
     * The name of the parameter
     */
    name: string;
    /**
     * A description of what this parameter is used for
     */
    description: string;
    /**
     * The type of the parameter. 
     * It can be one of 'string', 'number', 'boolean', 'object', 'array', 'function', or 'any'.
     */
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function' | 'any';
}   