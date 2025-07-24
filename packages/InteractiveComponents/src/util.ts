import { ComponentSpec } from "./component-spec";

/**
 * Builds the complete code for a component based on the provided spec.
 * 
 * This function generates the full code representation of a component, including
 * the root component code and recursively pulling in dependency components and also replacing
 * the placeholders for those dependency components in the parent component's code with the 
 * actual code for those dependency components (which were generated after the parent component was generated).
 * 
 * @param spec - The ComponentRootSpec defining the component structure and behavior
 * @returns A string containing the complete executable JavaScript code for the component
 */
export function BuildComponentCompleteCode(spec: ComponentSpec): string {
    // Start with the base code for the root component
    let code = spec.code || '// Generation Error: No root component code provided! \n\n';
    // Recursively replace placeholders for dependency components with their generated code
    if (!spec.dependencies || spec.dependencies.length === 0) {
        // If there are no dependency components, return the base code for this component
        return code;
    }
    for (const dep of spec.dependencies) {
        const depCode = BuildComponentCode(dep, "");
        if (depCode && depCode.length > 0) {
            // Append the generated code for this dependency component to the root component code
            code += '\n\n' + depCode;
        }
    }
    // Return the complete code for this component
    return code;
}

/**
 * Builds the code for a component dependency based on the provided spec including recursive dependency components.
 * @param spec - The ComponentSpec defining the dependency component structure and behavior
 * @returns A string containing the executable JavaScript code for the component dependency
 */
export function BuildComponentCode(dep: ComponentSpec, path: string): string {
    // Start with the base code for the component
    let commentHeader = `/*******************************************************\n   ${path ? `${path} > ` : ''}${dep.name}\n   ${dep.description}\n*******************************************************/\n`
    let code = commentHeader + dep.code;
    // Recursively replace placeholders for dependency components with their generated code
    if (!dep.dependencies || dep.dependencies.length === 0) {
        // If there are no dependency components, return the base code for this component
        return code;
    }

    for (const sub of dep.dependencies) {
        const subCode = BuildComponentCode(sub, path + (path ? ' > ' : '') + sub.name);
        if (subCode && subCode.length > 0) {
            code += '\n\n' + subCode;
        }
    }
    // Return the complete code for this dependency component
    return code;
}
 