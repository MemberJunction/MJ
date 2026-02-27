import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios from "axios";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that executes GraphQL queries and mutations
 * 
 * @example
 * ```typescript
 * // Simple query
 * await runAction({
 *   ActionName: 'GraphQL Query',
 *   Params: [{
 *     Name: 'Endpoint',
 *     Value: 'https://api.example.com/graphql'
 *   }, {
 *     Name: 'Query',
 *     Value: `
 *       query GetUser($id: ID!) {
 *         user(id: $id) {
 *           id
 *           name
 *           email
 *         }
 *       }
 *     `
 *   }, {
 *     Name: 'Variables',
 *     Value: { id: '123' }
 *   }]
 * });
 * 
 * // Mutation with headers
 * await runAction({
 *   ActionName: 'GraphQL Query',
 *   Params: [{
 *     Name: 'Endpoint',
 *     Value: 'https://api.example.com/graphql'
 *   }, {
 *     Name: 'Query',
 *     Value: `
 *       mutation CreateUser($input: CreateUserInput!) {
 *         createUser(input: $input) {
 *           id
 *           name
 *         }
 *       }
 *     `
 *   }, {
 *     Name: 'Variables',
 *     Value: {
 *       input: {
 *         name: 'John Doe',
 *         email: 'john@example.com'
 *       }
 *     }
 *   }, {
 *     Name: 'Headers',
 *     Value: {
 *       'Authorization': 'Bearer token123'
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "GraphQL Query")
export class GraphQLQueryAction extends BaseAction {
    
    /**
     * Executes a GraphQL query or mutation
     * 
     * @param params - The action parameters containing:
     *   - Endpoint: GraphQL endpoint URL (required)
     *   - Query: GraphQL query/mutation string (required)
     *   - Variables: Variables object for the query (optional)
     *   - Headers: Additional headers for the request (optional)
     *   - OperationName: For multi-operation documents (optional)
     *   - Timeout: Request timeout in milliseconds - default: 30000
     * 
     * @returns GraphQL response data
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const endpoint = this.getParamValue(params, 'endpoint');
            const query = this.getParamValue(params, 'query');
            const variables = JSONParamHelper.getJSONParam(params, 'variables');
            const headers = JSONParamHelper.getJSONParam(params, 'headers') || {};
            const operationName = this.getParamValue(params, 'operationname');
            const timeout = this.getNumericParam(params, 'timeout', 30000);

            // Validate required parameters
            if (!endpoint) {
                return {
                    Success: false,
                    Message: "Endpoint parameter is required",
                    ResultCode: "MISSING_ENDPOINT"
                };
            }

            if (!query) {
                return {
                    Success: false,
                    Message: "Query parameter is required",
                    ResultCode: "MISSING_QUERY"
                };
            }

            // Validate endpoint URL
            try {
                new URL(endpoint);
            } catch (e) {
                return {
                    Success: false,
                    Message: `Invalid endpoint URL: ${endpoint}`,
                    ResultCode: "INVALID_URL"
                };
            }

            // Prepare GraphQL request body
            const requestBody: any = { query };
            
            if (variables) {
                requestBody.variables = variables;
            }

            if (operationName) {
                requestBody.operationName = operationName;
            }

            // Prepare headers
            const requestHeaders = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...headers
            };

            // Make GraphQL request
            const response = await axios.post(endpoint, requestBody, {
                headers: requestHeaders,
                timeout,
                validateStatus: () => true // Handle all status codes
            });

            // Check for HTTP errors
            if (response.status < 200 || response.status >= 300) {
                return {
                    Success: false,
                    Message: `HTTP error ${response.status}: ${response.statusText}`,
                    ResultCode: `HTTP_${response.status}`
                };
            }

            // Check for GraphQL errors
            const responseData = response.data;
            const hasErrors = responseData.errors && responseData.errors.length > 0;

            // Add output parameters
            if (responseData.data) {
                params.Params.push({
                    Name: 'Data',
                    Type: 'Output',
                    Value: responseData.data
                });
            }

            if (responseData.errors) {
                params.Params.push({
                    Name: 'Errors',
                    Type: 'Output',
                    Value: responseData.errors
                });
            }

            if (responseData.extensions) {
                params.Params.push({
                    Name: 'Extensions',
                    Type: 'Output',
                    Value: responseData.extensions
                });
            }

            // Determine success based on GraphQL response
            if (hasErrors && !responseData.data) {
                // Only errors, no data - complete failure
                return {
                    Success: false,
                    Message: `GraphQL errors: ${JSON.stringify(responseData.errors, null, 2)}`,
                    ResultCode: "GRAPHQL_ERROR"
                };
            } else if (hasErrors && responseData.data) {
                // Partial success - has both data and errors
                return {
                    Success: true,
                    ResultCode: "PARTIAL_SUCCESS",
                    Message: JSON.stringify({
                        message: "GraphQL query completed with errors",
                        data: responseData.data,
                        errors: responseData.errors,
                        extensions: responseData.extensions
                    }, null, 2)
                };
            } else {
                // Complete success
                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: JSON.stringify({
                        message: "GraphQL query executed successfully",
                        data: responseData.data,
                        extensions: responseData.extensions
                    }, null, 2)
                };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "REQUEST_FAILED"
            };
        }
    }

    /**
     * Get numeric parameter with default
     */
    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}