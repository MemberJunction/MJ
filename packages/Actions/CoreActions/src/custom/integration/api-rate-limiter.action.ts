import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass, BaseSingleton } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import axios, { AxiosRequestConfig } from "axios";
import { Subject, from, Observable } from "rxjs";
import { concatMap, delay, map, catchError } from "rxjs/operators";

/**
 * Rate limiter singleton for managing API requests across action instances
 */
class APIRateLimiterManager extends BaseSingleton<APIRateLimiterManager> {
    private limiters: Map<string, APIRateLimiter> = new Map();

    public constructor() {
        super();
    }

    static get Instance(): APIRateLimiterManager {
        return APIRateLimiterManager.getInstance<APIRateLimiterManager>();
    }

    getRateLimiter(key: string, config: RateLimitConfig): APIRateLimiter {
        if (!this.limiters.has(key)) {
            this.limiters.set(key, new APIRateLimiter(config));
        }
        return this.limiters.get(key)!;
    }
}

interface RateLimitConfig {
    maxRequestsPerMinute: number;
    maxConcurrent: number;
    retryOnRateLimit: boolean;
    backoffMs: number;
    maxRetries: number;
}

interface QueuedRequest {
    config: AxiosRequestConfig;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    retryCount: number;
}

class APIRateLimiter {
    private requestQueue$ = new Subject<QueuedRequest>();
    private requestCount = 0;
    private windowStart = Date.now();
    private activeRequests = 0;

    constructor(private config: RateLimitConfig) {
        // Process queue with rate limiting
        this.requestQueue$.pipe(
            concatMap(request => this.processRequest(request))
        ).subscribe();
    }

    async execute(axiosConfig: AxiosRequestConfig): Promise<any> {
        return new Promise((resolve, reject) => {
            this.requestQueue$.next({
                config: axiosConfig,
                resolve,
                reject,
                retryCount: 0
            });
        });
    }

    private processRequest(request: QueuedRequest): Observable<void> {
        return new Observable(observer => {
            const executeRequest = async () => {
                // Check rate limit window
                const now = Date.now();
                const windowElapsed = now - this.windowStart;
                
                if (windowElapsed >= 60000) {
                    // Reset window
                    this.requestCount = 0;
                    this.windowStart = now;
                }

                // Wait if we've hit rate limit
                if (this.requestCount >= this.config.maxRequestsPerMinute) {
                    const waitTime = 60000 - windowElapsed;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    // Reset after waiting
                    this.requestCount = 0;
                    this.windowStart = Date.now();
                }

                // Wait if at concurrent limit
                while (this.activeRequests >= this.config.maxConcurrent) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // Execute request
                this.requestCount++;
                this.activeRequests++;

                try {
                    const response = await axios(request.config);
                    this.activeRequests--;
                    request.resolve(response);
                    observer.next();
                    observer.complete();
                } catch (error: any) {
                    this.activeRequests--;

                    // Check if rate limited
                    const isRateLimited = error.response?.status === 429 || 
                                        error.response?.status === 503 ||
                                        (error.response?.headers && error.response.headers['x-ratelimit-remaining'] === '0');

                    if (isRateLimited && this.config.retryOnRateLimit && request.retryCount < this.config.maxRetries) {
                        // Calculate backoff
                        const backoffTime = this.config.backoffMs * Math.pow(2, request.retryCount);
                        
                        // Retry after backoff
                        setTimeout(() => {
                            request.retryCount++;
                            this.requestQueue$.next(request);
                        }, backoffTime);

                        observer.next();
                        observer.complete();
                    } else {
                        request.reject(error);
                        observer.error(error);
                    }
                }
            };

            executeRequest().catch(err => observer.error(err));
        });
    }
}

/**
 * Action that adds rate limiting to any API endpoint
 * 
 * @example
 * ```typescript
 * // Rate limit API calls
 * await runAction({
 *   ActionName: 'API Rate Limiter',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://api.example.com/data'
 *   }, {
 *     Name: 'Method',
 *     Value: 'GET'
 *   }, {
 *     Name: 'RateLimitKey',
 *     Value: 'example-api'
 *   }, {
 *     Name: 'MaxRequestsPerMinute',
 *     Value: 60
 *   }, {
 *     Name: 'MaxConcurrent',
 *     Value: 5
 *   }]
 * });
 * 
 * // With authentication and retry
 * await runAction({
 *   ActionName: 'API Rate Limiter',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://api.example.com/users'
 *   }, {
 *     Name: 'Headers',
 *     Value: { 'Authorization': 'Bearer token' }
 *   }, {
 *     Name: 'RateLimitKey',
 *     Value: 'example-api'
 *   }, {
 *     Name: 'RetryOnRateLimit',
 *     Value: true
 *   }, {
 *     Name: 'BackoffMs',
 *     Value: 1000
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "API Rate Limiter")
export class APIRateLimiterAction extends BaseAction {
    
    /**
     * Execute API request with rate limiting
     * 
     * @param params - The action parameters containing:
     *   - URL: API endpoint URL (required)
     *   - Method: HTTP method (default: GET)
     *   - Headers: Request headers
     *   - Body: Request body
     *   - RateLimitKey: Unique key for rate limiter instance (required)
     *   - MaxRequestsPerMinute: Max requests per minute (default: 60)
     *   - MaxConcurrent: Max concurrent requests (default: 5)
     *   - RetryOnRateLimit: Retry on 429 errors (default: true)
     *   - BackoffMs: Initial backoff in ms (default: 1000)
     *   - MaxRetries: Max retry attempts (default: 3)
     *   - Timeout: Request timeout in ms (default: 30000)
     * 
     * @returns API response with rate limit info
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const url = this.getParamValue(params, 'url');
            const method = (this.getParamValue(params, 'method') || 'GET').toUpperCase();
            const headers = this.getParamValue(params, 'headers') || {};
            const body = this.getParamValue(params, 'body');
            const rateLimitKey = this.getParamValue(params, 'ratelimitkey');
            const maxRequestsPerMinute = this.getNumericParam(params, 'maxrequestsperminute', 60);
            const maxConcurrent = this.getNumericParam(params, 'maxconcurrent', 5);
            const retryOnRateLimit = this.getBooleanParam(params, 'retryonratelimit', true);
            const backoffMs = this.getNumericParam(params, 'backoffms', 1000);
            const maxRetries = this.getNumericParam(params, 'maxretries', 3);
            const timeout = this.getNumericParam(params, 'timeout', 30000);

            // Validate required parameters
            if (!url) {
                return {
                    Success: false,
                    Message: "URL parameter is required",
                    ResultCode: "MISSING_URL"
                };
            }

            if (!rateLimitKey) {
                return {
                    Success: false,
                    Message: "RateLimitKey parameter is required",
                    ResultCode: "MISSING_RATE_LIMIT_KEY"
                };
            }

            // Validate rate limit config
            if (maxRequestsPerMinute < 1) {
                return {
                    Success: false,
                    Message: "MaxRequestsPerMinute must be at least 1",
                    ResultCode: "INVALID_RATE_LIMIT"
                };
            }

            if (maxConcurrent < 1) {
                return {
                    Success: false,
                    Message: "MaxConcurrent must be at least 1",
                    ResultCode: "INVALID_CONCURRENT_LIMIT"
                };
            }

            // Get or create rate limiter
            const rateLimiterManager = APIRateLimiterManager.Instance;
            const rateLimiter = rateLimiterManager.getRateLimiter(rateLimitKey, {
                maxRequestsPerMinute,
                maxConcurrent,
                retryOnRateLimit,
                backoffMs,
                maxRetries
            });

            // Build request config
            const config: AxiosRequestConfig = {
                url,
                method: method as any,
                headers,
                timeout,
                validateStatus: () => true // Handle all status codes
            };

            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                config.data = body;
            }

            // Execute with rate limiting
            const startTime = Date.now();
            const response = await rateLimiter.execute(config);
            const duration = Date.now() - startTime;

            // Extract rate limit headers
            const rateLimitHeaders: any = {};
            const headerNames = [
                'x-ratelimit-limit',
                'x-ratelimit-remaining',
                'x-ratelimit-reset',
                'x-rate-limit-limit',
                'x-rate-limit-remaining',
                'x-rate-limit-reset',
                'ratelimit-limit',
                'ratelimit-remaining',
                'ratelimit-reset'
            ];

            for (const header of headerNames) {
                if (response.headers[header]) {
                    rateLimitHeaders[header] = response.headers[header];
                }
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
                Value: response.data
            });

            params.Params.push({
                Name: 'RateLimitInfo',
                Type: 'Output',
                Value: rateLimitHeaders
            });

            params.Params.push({
                Name: 'RequestDuration',
                Type: 'Output',
                Value: duration
            });

            // Check if request was successful
            const isSuccess = response.status >= 200 && response.status < 300;

            return {
                Success: true,
                ResultCode: isSuccess ? "SUCCESS" : `HTTP_${response.status}`,
                Message: JSON.stringify({
                    message: "API request completed with rate limiting",
                    status: response.status,
                    statusText: response.statusText,
                    duration: duration,
                    rateLimitInfo: rateLimitHeaders,
                    rateLimitKey: rateLimitKey,
                    data: response.data
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Rate limited API request failed: ${error instanceof Error ? error.message : String(error)}`,
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