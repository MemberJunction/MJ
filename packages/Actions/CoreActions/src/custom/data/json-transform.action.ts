import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { JSONPath } from "jsonpath-plus";
import jmespath from "jmespath";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that transforms JSON data using JSONPath or JMESPath expressions
 * Enables powerful querying and transformation of JSON structures
 * 
 * @example
 * ```typescript
 * // Extract values using JSONPath
 * await runAction({
 *   ActionName: 'JSON Transform',
 *   Params: [{
 *     Name: 'InputData',
 *     Value: { users: [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }] }
 *   }, {
 *     Name: 'Expression',
 *     Value: '$.users[?(@.age > 26)].name'
 *   }]
 * });
 * 
 * // Transform using JMESPath
 * await runAction({
 *   ActionName: 'JSON Transform',
 *   Params: [{
 *     Name: 'InputData',
 *     Value: { items: [{ price: 10, qty: 2 }, { price: 20, qty: 1 }] }
 *   }, {
 *     Name: 'Expression',
 *     Value: 'items[].{total: price * qty}'
 *   }, {
 *     Name: 'TransformType',
 *     Value: 'JMESPath'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "JSON Transform")
export class JSONTransformAction extends BaseAction {
    
    /**
     * Transforms JSON data using JSONPath or JMESPath expressions
     * 
     * @param params - The action parameters containing:
     *   - InputData: JSON object or array to transform
     *   - Expression: JSONPath or JMESPath query expression
     *   - TransformType: "JSONPath" | "JMESPath" (default: "JSONPath")
     *   - Multiple: Boolean - return all matches vs first match (JSONPath only, default: true)
     *   - Flatten: Boolean - flatten array results (default: false)
     *   - WrapScalar: Boolean - wrap scalar results in object (default: false)
     * 
     * @returns Transformed data based on the expression
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            let inputData: any;
            try {
                inputData = JSONParamHelper.getRequiredJSONParam(params, 'InputData');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const expressionParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'expression');
            const transformTypeParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'transformtype');
            const multipleParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'multiple');
            const flattenParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'flatten');
            const wrapScalarParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'wrapscalar');

            // Validate required parameters
            if (!expressionParam?.Value) {
                return {
                    Success: false,
                    Message: "Expression parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const expression = expressionParam.Value.toString();
            const transformType = (transformTypeParam?.Value?.toString() || 'JSONPath').toUpperCase();
            const multiple = multipleParam?.Value?.toString()?.toLowerCase() === 'true';
            const flatten = flattenParam?.Value?.toString()?.toLowerCase() === 'true';
            const wrapScalar = wrapScalarParam?.Value?.toString()?.toLowerCase() === 'true';

            let result: any;

            if (transformType === 'JSONPATH') {
                // Use JSONPath
                try {
                    const options = {
                        path: expression,
                        json: inputData,
                        resultType: (multiple ? 'all' : 'value') as 'all' | 'value',
                        wrap: false,
                        flatten: flatten
                    };

                    result = JSONPath(options);

                    // Handle empty results
                    if (result === undefined || (Array.isArray(result) && result.length === 0)) {
                        result = null;
                    }
                } catch (error) {
                    return {
                        Success: false,
                        Message: `JSONPath error: ${error instanceof Error ? error.message : String(error)}`,
                        ResultCode: "EXPRESSION_ERROR"
                    };
                }
            } else if (transformType === 'JMESPATH') {
                // Use JMESPath
                try {
                    result = jmespath.search(inputData, expression);
                } catch (error) {
                    return {
                        Success: false,
                        Message: `JMESPath error: ${error instanceof Error ? error.message : String(error)}`,
                        ResultCode: "EXPRESSION_ERROR"
                    };
                }
            } else {
                return {
                    Success: false,
                    Message: `Invalid TransformType: ${transformType}. Must be 'JSONPath' or 'JMESPath'`,
                    ResultCode: "INVALID_PARAMETERS"
                };
            }

            // Wrap scalar results if requested
            if (wrapScalar && (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean')) {
                result = { value: result };
            }

            // Prepare output
            const output = {
                result: result,
                transformType: transformType,
                expression: expression,
                inputType: Array.isArray(inputData) ? 'array' : typeof inputData,
                resultType: result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result
            };

            // Add match count for arrays
            if (Array.isArray(result)) {
                output['matchCount'] = result.length;
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(output, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to transform JSON: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }
}