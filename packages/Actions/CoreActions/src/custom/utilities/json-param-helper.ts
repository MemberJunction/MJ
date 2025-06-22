import { RunActionParams } from "@memberjunction/actions-base";

/**
 * Helper class for handling JSON parameters that can be either objects or strings
 */
export class JSONParamHelper {
    /**
     * Get a parameter value that can be either a JSON object or a JSON string
     * First checks for the object parameter, then falls back to the string parameter
     * 
     * @param params - The action parameters
     * @param paramName - The base parameter name (without String suffix)
     * @returns The parsed value or undefined
     */
    static getJSONParam(params: RunActionParams, paramName: string): any {
        // First check for the object parameter
        const objectParam = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (objectParam?.Value !== undefined && objectParam?.Value !== null) {
            return objectParam.Value;
        }

        // Then check for the string parameter
        const stringParam = params.Params.find(p => p.Name.trim().toLowerCase() === `${paramName}string`.toLowerCase());
        if (stringParam?.Value !== undefined && stringParam?.Value !== null) {
            try {
                return JSON.parse(stringParam.Value.toString());
            } catch (e) {
                throw new Error(`Failed to parse ${paramName}String parameter as JSON: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        return undefined;
    }

    /**
     * Check if a JSON parameter exists (either as object or string)
     * 
     * @param params - The action parameters
     * @param paramName - The base parameter name (without String suffix)
     * @returns True if the parameter exists
     */
    static hasJSONParam(params: RunActionParams, paramName: string): boolean {
        const objectParam = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (objectParam?.Value !== undefined && objectParam?.Value !== null) {
            return true;
        }

        const stringParam = params.Params.find(p => p.Name.trim().toLowerCase() === `${paramName}string`.toLowerCase());
        return stringParam?.Value !== undefined && stringParam?.Value !== null;
    }

    /**
     * Get a required JSON parameter, throwing an error if not found
     * 
     * @param params - The action parameters
     * @param paramName - The base parameter name (without String suffix)
     * @returns The parsed value
     * @throws Error if parameter is not found
     */
    static getRequiredJSONParam(params: RunActionParams, paramName: string): any {
        const value = this.getJSONParam(params, paramName);
        if (value === undefined) {
            throw new Error(`${paramName} parameter is required (can be provided as ${paramName} object or ${paramName}String)`);
        }
        return value;
    }
}