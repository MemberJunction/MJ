import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { SafeFetch, SSRFError } from "@memberjunction/network-utils";

/** Authentication configuration accepted by the HTTP Request action. */
interface HTTPAuthConfig {
    type?: string;
    username?: string;
    password?: string;
    token?: string;
    key?: string;
    value?: string;
    location?: string;
}

/** Mutable request context assembled from the action parameters before the fetch is made. */
interface HTTPRequestContext {
    url: URL;
    headers: Record<string, string>;
    body?: BodyInit;
}

/**
 * Action that makes HTTP requests with full control over headers, authentication, and request options.
 *
 * The target URL is caller-controlled, so it is routed through {@link SafeFetch}, which blocks
 * private/loopback/link-local/reserved addresses (including the cloud metadata endpoint) and
 * re-validates every redirect hop to defeat DNS-rebinding / redirect SSRF bypasses.
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
     *   - ResponseType: "json" | "text" | "arraybuffer" - default: "json"
     *
     * @returns Response object with status, headers, and body
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const url = this.getParamValue(params, 'url');
            const method = (this.getParamValue(params, 'method') || 'GET').toUpperCase();
            const headers = (JSONParamHelper.getJSONParam(params, 'headers') as Record<string, string> | undefined) || {};
            const body = JSONParamHelper.getJSONParam(params, 'body');
            const bodyType = this.getParamValue(params, 'bodytype') || 'json';
            const authentication = JSONParamHelper.getJSONParam(params, 'authentication') as HTTPAuthConfig | undefined;
            const timeout = this.getNumericParam(params, 'timeout', 30000);
            const followRedirects = this.getBooleanParam(params, 'followredirects', true);
            const maxRedirects = this.getNumericParam(params, 'maxredirects', 5);
            const responseType = (this.getParamValue(params, 'responsetype') || 'json').toLowerCase();

            if (!url) {
                return { Success: false, Message: "URL parameter is required", ResultCode: "MISSING_URL" };
            }

            let context: HTTPRequestContext;
            try {
                context = { url: new URL(String(url)), headers: { ...headers } };
            } catch {
                return { Success: false, Message: `Invalid URL: ${url}`, ResultCode: "INVALID_URL" };
            }

            if (authentication) {
                const authResult = this.configureAuthentication(context, authentication);
                if (!authResult.success) {
                    return { Success: false, Message: authResult.error, ResultCode: "AUTH_CONFIG_ERROR" };
                }
            }

            if (body !== undefined && body !== null && ['POST', 'PUT', 'PATCH'].includes(method)) {
                const bodyResult = this.configureRequestBody(context, body, bodyType);
                if (!bodyResult.success) {
                    return { Success: false, Message: bodyResult.error, ResultCode: "BODY_CONFIG_ERROR" };
                }
            }

            const response = await SafeFetch(context.url.href, {
                method,
                headers: context.headers,
                body: context.body,
                signal: AbortSignal.timeout(timeout),
                MaxRedirects: followRedirects ? maxRedirects : 0
            });

            return await this.buildResult(params, response, responseType, String(url), method);

        } catch (error) {
            if (error instanceof SSRFError) {
                return {
                    Success: false,
                    Message: "URL resolves to a private or reserved address and was blocked",
                    ResultCode: "SSRF_BLOCKED"
                };
            }
            return {
                Success: false,
                Message: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "REQUEST_FAILED"
            };
        }
    }

    /**
     * Reads the response, populates output parameters, and builds the action result.
     */
    private async buildResult(
        params: RunActionParams,
        response: Response,
        responseType: string,
        requestUrl: string,
        requestMethod: string
    ): Promise<ActionResultSimple> {
        const responseHeaders = this.headersToObject(response.headers);
        const responseData = await this.readResponseBody(response, responseType);

        params.Params.push({ Name: 'ResponseStatus', Type: 'Output', Value: response.status });
        params.Params.push({ Name: 'ResponseHeaders', Type: 'Output', Value: responseHeaders });
        params.Params.push({ Name: 'ResponseData', Type: 'Output', Value: responseData });

        const isSuccess = response.status >= 200 && response.status < 300;
        return {
            Success: true,
            ResultCode: isSuccess ? "SUCCESS" : `HTTP_${response.status}`,
            Message: JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                data: responseData,
                requestUrl,
                requestMethod
            }, null, 2)
        };
    }

    /**
     * Reads the response body in the requested representation.
     * `arraybuffer` is returned as a base64 string; unknown types fall back to text.
     */
    private async readResponseBody(response: Response, responseType: string): Promise<unknown> {
        if (responseType === 'arraybuffer' || responseType === 'binary') {
            const buffer = await response.arrayBuffer();
            return Buffer.from(buffer).toString('base64');
        }
        const text = await response.text();
        if (responseType === 'json') {
            try {
                return text.length > 0 ? JSON.parse(text) : null;
            } catch {
                return text; // Not valid JSON — return raw text rather than failing.
            }
        }
        return text;
    }

    /** Converts a fetch `Headers` object into a plain record. */
    private headersToObject(headers: Headers): Record<string, string> {
        const result: Record<string, string> = {};
        headers.forEach((value, name) => {
            result[name] = value;
        });
        return result;
    }

    /**
     * Configure authentication for the request (basic, bearer, or apikey).
     */
    private configureAuthentication(context: HTTPRequestContext, auth: HTTPAuthConfig): { success: boolean; error?: string } {
        if (!auth.type) {
            return { success: false, error: "Authentication type is required" };
        }

        switch (auth.type.toLowerCase()) {
            case 'basic':
                if (!auth.username || !auth.password) {
                    return { success: false, error: "Basic auth requires username and password" };
                }
                context.headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
                break;

            case 'bearer':
                if (!auth.token) {
                    return { success: false, error: "Bearer auth requires token" };
                }
                context.headers['Authorization'] = `Bearer ${auth.token}`;
                break;

            case 'apikey':
                if (!auth.key || !auth.value) {
                    return { success: false, error: "API key auth requires key name and value" };
                }
                if (auth.location === 'query') {
                    context.url.searchParams.set(auth.key, auth.value);
                } else {
                    context.headers[auth.key] = auth.value;
                }
                break;

            default:
                return { success: false, error: `Unsupported authentication type: ${auth.type}` };
        }

        return { success: true };
    }

    /**
     * Configure request body based on type (json, form, text, binary).
     */
    private configureRequestBody(context: HTTPRequestContext, body: unknown, bodyType: string): { success: boolean; error?: string } {
        const hasContentType = Object.keys(context.headers).some(h => h.toLowerCase() === 'content-type');

        switch (bodyType.toLowerCase()) {
            case 'json':
                context.body = typeof body === 'string' ? body : JSON.stringify(body);
                if (!hasContentType) {
                    context.headers['Content-Type'] = 'application/json';
                }
                break;

            case 'form':
                if (typeof body === 'object' && body !== null) {
                    const formData = new URLSearchParams();
                    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
                        formData.append(key, String(value));
                    }
                    context.body = formData.toString();
                    if (!hasContentType) {
                        context.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                    }
                } else {
                    return { success: false, error: "Form body type requires an object" };
                }
                break;

            case 'text':
                context.body = String(body);
                if (!hasContentType) {
                    context.headers['Content-Type'] = 'text/plain';
                }
                break;

            case 'binary':
                context.body = typeof body === 'string' ? Buffer.from(body, 'base64') : Buffer.from(String(body));
                if (!hasContentType) {
                    context.headers['Content-Type'] = 'application/octet-stream';
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
    private getParamValue(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        const value = param?.Value;
        return value === undefined || value === null ? undefined : String(value);
    }
}
