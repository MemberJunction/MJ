import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios, { AxiosRequestConfig, Method } from "axios";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that makes HTTP requests with full control over headers, authentication, and request options
 * 
 * @example
 * ```typescript
 * // Simple GET request
 * await runAction({
 *   ActionName: 'HTTP Request',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://api.example.com/data'
 *   }]
 * });
 * 
 * // POST request with JSON body
 * await runAction({
 *   ActionName: 'HTTP Request',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://api.example.com/users'
 *   }, {
 *     Name: 'Method',
 *     Value: 'POST'
 *   }, {
 *     Name: 'Body',
 *     Value: { name: 'John Doe', email: 'john@example.com' }
 *   }, {
 *     Name: 'Headers',
 *     Value: { 'Content-Type': 'application/json' }
 *   }]
 * });
 * 
 * // Request with authentication
 * await runAction({
 *   ActionName: 'HTTP Request',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://api.example.com/protected'
 *   }, {
 *     Name: 'Authentication',
 *     Value: {
 *       type: 'bearer',
 *       token: 'your-api-token'
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "HTTP Request")
export class HTTPRequestAction extends BaseAction {
    
    /**
     * Makes an HTTP request with configurable options
     * 
     * @param params - The action parameters containing:
     *   - URL: Target URL (required)
     *   - Method: HTTP method (GET, POST, PUT, DELETE, etc.) - default: GET
     *   - Headers: Object with request headers
     *   - Body: Request body (string or object)
     *   - BodyType: "json" | "form" | "text" | "binary" - default: "json"
     *   - Authentication: Auth config object { type: 'basic'|'bearer', username?, password?, token? }
     *   - Timeout: Request timeout in milliseconds - default: 30000
     *   - FollowRedirects: Boolean - default: true
     *   - MaxRedirects: Number - default: 5
     *   - ValidateStatus: Function string to validate response status
     *   - ResponseType: "json" | "text" | "arraybuffer" | "stream" - default: "json"
     * 
     * @returns Response object with status, headers, and body
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const url = this.getParamValue(params, 'url');
            const method = (this.getParamValue(params, 'method') || 'GET').toUpperCase() as Method;
            const headers = JSONParamHelper.getJSONParam(params, 'headers') || {};
            const body = JSONParamHelper.getJSONParam(params, 'body');
            const bodyType = this.getParamValue(params, 'bodytype') || 'json';
            const authentication = JSONParamHelper.getJSONParam(params, 'authentication');
            const timeout = this.getNumericParam(params, 'timeout', 30000);
            const followRedirects = this.getBooleanParam(params, 'followredirects', true);
            const maxRedirects = this.getNumericParam(params, 'maxredirects', 5);
            const responseType = this.getParamValue(params, 'responsetype') || 'json';

            // Validate URL
            if (!url) {
                return {
                    Success: false,
                    Message: "URL parameter is required",
                    ResultCode: "MISSING_URL"
                };
            }

            // Build request config
            const config: AxiosRequestConfig = {
                url,
                method,
                headers: { ...headers },
                timeout,
                maxRedirects: followRedirects ? maxRedirects : 0,
                responseType: responseType as any,
                validateStatus: () => true // We'll handle status validation ourselves
            };

            // Handle authentication
            if (authentication) {
                const authResult = this.configureAuthentication(config, authentication);
                if (!authResult.success) {
                    return {
                        Success: false,
                        Message: authResult.error,
                        ResultCode: "AUTH_CONFIG_ERROR"
                    };
                }
            }

            // Handle request body
            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                const bodyResult = this.configureRequestBody(config, body, bodyType);
                if (!bodyResult.success) {
                    return {
                        Success: false,
                        Message: bodyResult.error,
                        ResultCode: "BODY_CONFIG_ERROR"
                    };
                }
            }

            // Make request
            const response = await axios(config);

            // Prepare response data
            let responseData = response.data;
            if (responseType === 'arraybuffer' && Buffer.isBuffer(responseData)) {
                responseData = responseData.toString('base64');
            }

            // Add output parameters
            params.Params.push({
                Name: 'ResponseStatus',
                Type: 'Output',
                Value: response.status
            });

            params.Params.push({
                Name: 'ResponseHeaders',
                Type: 'Output',
                Value: response.headers
            });

            params.Params.push({
                Name: 'ResponseData',
                Type: 'Output',
                Value: responseData
            });

            // Check if request was successful (2xx status)
            const isSuccess = response.status >= 200 && response.status < 300;

            return {
                Success: true,
                ResultCode: isSuccess ? "SUCCESS" : `HTTP_${response.status}`,
                Message: JSON.stringify({
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    data: responseData,
                    requestUrl: url,
                    requestMethod: method
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "REQUEST_FAILED"
            };
        }
    }

    /**
     * Configure authentication for the request
     */
    private configureAuthentication(config: AxiosRequestConfig, auth: any): { success: boolean; error?: string } {
        if (!auth.type) {
            return { success: false, error: "Authentication type is required" };
        }

        switch (auth.type.toLowerCase()) {
            case 'basic':
                if (!auth.username || !auth.password) {
                    return { success: false, error: "Basic auth requires username and password" };
                }
                config.auth = {
                    username: auth.username,
                    password: auth.password
                };
                break;

            case 'bearer':
                if (!auth.token) {
                    return { success: false, error: "Bearer auth requires token" };
                }
                config.headers = config.headers || {};
                config.headers['Authorization'] = `Bearer ${auth.token}`;
                break;

            case 'apikey':
                if (!auth.key || !auth.value) {
                    return { success: false, error: "API key auth requires key name and value" };
                }
                if (auth.location === 'query') {
                    config.params = config.params || {};
                    config.params[auth.key] = auth.value;
                } else {
                    config.headers = config.headers || {};
                    config.headers[auth.key] = auth.value;
                }
                break;

            default:
                return { success: false, error: `Unsupported authentication type: ${auth.type}` };
        }

        return { success: true };
    }

    /**
     * Configure request body based on type
     */
    private configureRequestBody(config: AxiosRequestConfig, body: any, bodyType: string): { success: boolean; error?: string } {
        switch (bodyType.toLowerCase()) {
            case 'json':
                config.data = body;
                if (!config.headers!['Content-Type']) {
                    config.headers!['Content-Type'] = 'application/json';
                }
                break;

            case 'form':
                if (typeof body === 'object') {
                    const formData = new URLSearchParams();
                    for (const [key, value] of Object.entries(body)) {
                        formData.append(key, String(value));
                    }
                    config.data = formData.toString();
                    if (!config.headers!['Content-Type']) {
                        config.headers!['Content-Type'] = 'application/x-www-form-urlencoded';
                    }
                } else {
                    return { success: false, error: "Form body type requires an object" };
                }
                break;

            case 'text':
                config.data = String(body);
                if (!config.headers!['Content-Type']) {
                    config.headers!['Content-Type'] = 'text/plain';
                }
                break;

            case 'binary':
                if (typeof body === 'string') {
                    // Assume base64 encoded
                    config.data = Buffer.from(body, 'base64');
                } else {
                    config.data = body;
                }
                if (!config.headers!['Content-Type']) {
                    config.headers!['Content-Type'] = 'application/octet-stream';
                }
                break;

            default:
                return { success: false, error: `Unsupported body type: ${bodyType}` };
        }

        return { success: true };
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
     * Get boolean parameter with default
     */
    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}