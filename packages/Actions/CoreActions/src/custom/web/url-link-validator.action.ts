import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that validates URLs by checking accessibility, response codes, and basic health checks
 * Provides detailed information about URL status, redirects, and response headers
 * 
 * @example
 * ```typescript
 * // Validate a single URL
 * await runAction({
 *   ActionName: 'URL Link Validator',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://example.com'
 *   }]
 * });
 * 
 * // Validate multiple URLs
 * await runAction({
 *   ActionName: 'URL Link Validator',
 *   Params: [{
 *     Name: 'URLs',
 *     Value: ['https://example.com', 'https://google.com', 'https://invalid-url-test.com']
 *   }]
 * });
 * 
 * // Custom timeout and options
 * await runAction({
 *   ActionName: 'URL Link Validator',
 *   Params: [{
 *     Name: 'URL',
 *     Value: 'https://slow-site.com'
 *   }, {
 *     Name: 'TimeoutMs',
 *     Value: 10000
 *   }, {
 *     Name: 'FollowRedirects',
 *     Value: false
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__URLLinkValidator")
export class URLLinkValidatorAction extends BaseAction {

    private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds
    private readonly MAX_TIMEOUT = 30000; // 30 seconds
    private readonly MAX_URLS = 50; // Maximum URLs to validate in one request

    /**
     * Executes URL validation for one or more URLs
     * 
     * @param params - The action parameters containing:
     *   - URL: Single URL to validate (use this OR URLs)
     *   - URLs: Array of URLs to validate (use this OR URL)
     *   - TimeoutMs: Request timeout in milliseconds (default: 5000, max: 30000)
     *   - FollowRedirects: Whether to follow redirects (default: true)
     *   - CheckSSL: Whether to check SSL certificate validity (default: true)
     *   - UserAgent: Custom User-Agent string (optional)
     * 
     * @returns URL validation results with status, response time, and details
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const urlParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'url');
            const urlsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'urls');
            const timeoutParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'timeoutms');
            const followRedirectsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'followredirects');
            const checkSSLParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'checkssl');
            const userAgentParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'useragent');

            // Determine URLs to validate
            let urlsToValidate: string[] = [];
            
            if (urlParam && urlParam.Value) {
                urlsToValidate.push(urlParam.Value.toString());
            }
            
            if (urlsParam && urlsParam.Value) {
                const urlsValue = urlsParam.Value;
                if (Array.isArray(urlsValue)) {
                    urlsToValidate.push(...urlsValue.map(u => u.toString()));
                } else if (typeof urlsValue === 'string') {
                    // Handle comma-separated string
                    urlsToValidate.push(...urlsValue.split(',').map(u => u.trim()));
                }
            }

            if (urlsToValidate.length === 0) {
                return {
                    Success: false,
                    Message: "Either URL or URLs parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            if (urlsToValidate.length > this.MAX_URLS) {
                return {
                    Success: false,
                    Message: `Too many URLs to validate. Maximum is ${this.MAX_URLS}, received ${urlsToValidate.length}`,
                    ResultCode: "TOO_MANY_URLS"
                };
            }

            // Parse options
            const timeout = Math.min(parseInt(timeoutParam?.Value?.toString() || this.DEFAULT_TIMEOUT.toString()), this.MAX_TIMEOUT);
            const followRedirects = followRedirectsParam?.Value !== false && followRedirectsParam?.Value !== 'false';
            const checkSSL = checkSSLParam?.Value !== false && checkSSLParam?.Value !== 'false';
            const userAgent = userAgentParam?.Value?.toString() || 'Mozilla/5.0 (compatible; MemberJunction URL Validator/1.0; +https://memberjunction.org)';

            // Validate URLs
            const results = await Promise.all(
                urlsToValidate.map(url => this.validateURL(url, timeout, followRedirects, checkSSL, userAgent))
            );

            // Calculate summary statistics
            const summary = {
                totalURLs: results.length,
                validURLs: results.filter(r => r.isValid).length,
                invalidURLs: results.filter(r => !r.isValid).length,
                averageResponseTime: results.reduce((sum, r) => sum + (r.responseTime || 0), 0) / results.length,
                successRate: (results.filter(r => r.isValid).length / results.length) * 100
            };

            const resultData = {
                summary,
                options: {
                    timeout,
                    followRedirects,
                    checkSSL,
                    userAgent
                },
                results,
                validatedAt: new Date().toISOString()
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(resultData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to validate URLs: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Validates a single URL
     */
    private async validateURL(url: string, timeout: number, followRedirects: boolean, checkSSL: boolean, userAgent: string): Promise<any> {
        const startTime = Date.now();
        const result: any = {
            url: url.trim(),
            isValid: false,
            responseTime: null,
            statusCode: null,
            statusText: null,
            error: null,
            redirects: [],
            headers: {},
            ssl: null,
            finalUrl: null
        };

        try {
            // Basic URL validation
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(result.url);
                if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                    throw new Error('Only HTTP and HTTPS URLs are supported');
                }
            } catch (error) {
                result.error = `Invalid URL format: ${error instanceof Error ? error.message : String(error)}`;
                return result;
            }

            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(result.url, {
                    method: 'HEAD', // Use HEAD to minimize data transfer
                    headers: {
                        'User-Agent': userAgent
                    },
                    redirect: followRedirects ? 'follow' : 'manual',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                result.responseTime = Date.now() - startTime;
                result.statusCode = response.status;
                result.statusText = response.statusText;
                result.finalUrl = response.url;

                // Extract response headers
                response.headers.forEach((value, name) => {
                    result.headers[name] = value;
                });

                // Check if URL is valid (2xx or 3xx status codes)
                result.isValid = response.status >= 200 && response.status < 400;

                // Handle redirects
                if (response.redirected) {
                    result.redirects.push({
                        from: result.url,
                        to: result.finalUrl,
                        statusCode: result.statusCode
                    });
                }

                // SSL information for HTTPS URLs
                if (parsedUrl.protocol === 'https:' && checkSSL) {
                    result.ssl = await this.checkSSL(parsedUrl.hostname);
                }

            } catch (fetchError) {
                clearTimeout(timeoutId);
                result.responseTime = Date.now() - startTime;
                
                if (fetchError instanceof Error) {
                    if (fetchError.name === 'AbortError') {
                        result.error = `Request timed out after ${timeout}ms`;
                    } else {
                        result.error = fetchError.message;
                    }
                } else {
                    result.error = String(fetchError);
                }
            }

        } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            result.responseTime = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Performs basic SSL certificate check
     */
    private async checkSSL(hostname: string): Promise<any> {
        try {
            // Simple SSL check by making a request and checking for SSL errors
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const response = await fetch(`https://${hostname}`, {
                    method: 'HEAD',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                return {
                    isValid: true,
                    hostname,
                    protocol: 'TLS',
                    error: null
                };
            } catch (error) {
                clearTimeout(timeoutId);
                return {
                    isValid: false,
                    hostname,
                    protocol: 'TLS',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        } catch (error) {
            return {
                isValid: false,
                hostname,
                protocol: 'TLS',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}