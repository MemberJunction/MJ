import { ComponentChildSpec } from "./child-spec";
import { ComponentRootSpec } from "./root-spec";

/**
 * Builds the complete code for a component based on the provided spec.
 * 
 * This function generates the full code representation of a component, including
 * the root component code and recursively pulling in child components and also replacing
 * the placeholders for those child components in the parent component's code with the 
 * actual code for those child components (which were generated after the parent component was generated).
 * 
 * @param spec - The ComponentRootSpec defining the component structure and behavior
 * @returns A string containing the complete executable JavaScript code for the component
 */
export function BuildComponentCompleteCode(spec: ComponentRootSpec): string {
    // Start with the base code for the root component
    let code = spec.componentCode || '// Generation Error: No root component code provided! \n\n';
    // Recursively replace placeholders for child components with their generated code
    if (!spec.childComponents || spec.childComponents.length === 0) {
        // If there are no child components, return the base code for this component
        return code;
    }
    for (const child of spec.childComponents) {
        const childCode = BuildComponentChildCode(child, "");
        if (childCode && childCode.length > 0) {
            // Append the generated code for this child component to the root component code
            code += '\n\n' + childCode;
        }
    }
    // Return the complete code for this component
    return code;
}

/**
 * Builds the code for a component child based on the provided spec including recursive child components.
 * @param spec - The ComponentChildSpec defining the child component structure and behavior
 * @returns A string containing the executable JavaScript code for the component child
 */
export function BuildComponentChildCode(child: ComponentChildSpec, path: string): string {
    // Start with the base code for the child component
    let commentHeader = `/*******************************************************\n   ${path ? `${path} > ` : ''}${child.componentName}\n   ${child.description}\n*******************************************************/\n`
    let code = commentHeader + child.componentCode;
    // Recursively replace placeholders for child components with their generated code
    if (!child.components || child.components.length === 0) {
        // If there are no child components, return the base code for this child
        return code;
    }

    for (const sub of child.components) {
        const subCode = BuildComponentChildCode(sub, path + (path ? ' > ' : '') + child.componentName);
        if (subCode && subCode.length > 0) {
            code += '\n\n' + subCode;
        }
    }
    // Return the complete code for this child component
    return code;
}
 