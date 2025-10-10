import { AIErrorInfo, AIErrorType, ErrorSeverity } from './errorTypes.js';

/**
 * Utility class for analyzing errors from various AI providers and mapping them to standardized error information.
 * This class provides a consistent way to interpret errors across different provider SDKs.
 * 
 * @class ErrorAnalyzer
 * @since 2.47.0
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await provider.chat(params);
 * } catch (error) {
 *   const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI');
 *   if (errorInfo.canFailover) {
 *     // Try another provider
 *   }
 * }
 * ```
 */
export class ErrorAnalyzer {
    /**
     * Analyzes an error from an AI provider and returns standardized error information.
     * This method extracts relevant details from provider-specific error formats and
     * maps them to a consistent structure for easier handling.
     * 
     * @static
     * @param {any} error - The error object thrown by the provider SDK
     * @param {string} [providerName] - Optional name of the provider for context
     * @returns {AIErrorInfo} Standardized error information
     * 
     * @example
     * ```typescript
     * const errorInfo = ErrorAnalyzer.analyzeError(error, 'Anthropic');
     * console.log(`Error type: ${errorInfo.errorType}`);
     * console.log(`Can retry: ${errorInfo.severity !== 'Fatal'}`);
     * ```
     */
    static analyzeError(error: any, providerName?: string): AIErrorInfo {
        // Extract HTTP status code if available
        const httpStatusCode = this.extractHttpStatusCode(error);
        
        // Determine error type based on status code and error properties
        const errorType = this.determineErrorType(error, httpStatusCode);
        
        // Determine severity
        const severity = this.determineSeverity(errorType);
        
        // Check if failover is appropriate
        const canFailover = this.canFailoverForError(errorType);
        
        // Extract retry delay if available
        const suggestedRetryDelaySeconds = this.extractRetryDelay(error);
        
        // Extract provider error code
        const providerErrorCode = this.extractProviderErrorCode(error);
        
        // Check provider error code for context length exceeded (in case message parsing missed it)
        if (providerErrorCode === 'context_length_exceeded') {
            return {
                httpStatusCode,
                errorType: 'ContextLengthExceeded',
                severity: 'Fatal',
                canFailover: true,
                suggestedRetryDelaySeconds,
                providerErrorCode,
                context: {
                    provider: providerName,
                    errorName: error?.name,
                    errorConstructor: error?.constructor?.name
                }
            };
        }
        
        return {
            httpStatusCode,
            errorType,
            severity,
            canFailover,
            suggestedRetryDelaySeconds,
            providerErrorCode,
            context: {
                provider: providerName,
                errorName: error?.name,
                errorConstructor: error?.constructor?.name
            }
        };
    }
    
    /**
     * Extracts HTTP status code from various error object structures.
     * Different provider SDKs store status codes in different locations.
     * 
     * @private
     * @static
     * @param {any} error - The error object to extract status code from
     * @returns {number | undefined} The HTTP status code if found, undefined otherwise
     */
    private static extractHttpStatusCode(error: any): number | undefined {
        // Common patterns across different provider SDKs
        return error?.status || 
               error?.statusCode || 
               error?.response?.status || 
               error?.response?.statusCode ||
               error?.code ||
               undefined;
    }
    
    /**
     * Determines the standardized error type based on status code and error properties.
     * Uses a combination of HTTP status codes, error messages, and error class names.
     * 
     * @private
     * @static
     * @param {any} error - The error object to analyze
     * @param {number} [statusCode] - The HTTP status code if available
     * @returns {AIErrorType} The categorized error type
     */
    private static determineErrorType(error: any, statusCode?: number): AIErrorType {
        // IMPORTANT: Check error message patterns FIRST before status codes
        // This allows us to correctly classify vendor-specific errors that may use
        // non-standard status codes (e.g., xAI using 403 for billing/quota issues)
        const errorString = (error?.message || error?.name || '').toLowerCase();

        // Check for context length exceeded errors first (highest priority)
        if (errorString.includes('context_length_exceeded') ||
            errorString.includes('context length exceeded') ||
            errorString.includes('reduce the length of the messages') ||
            errorString.includes('maximum context length')) {
            return 'ContextLengthExceeded';
        }

        // Check for rate limit errors
        if (errorString.includes('rate limit') ||
            errorString.includes('too many requests')) {
            return 'RateLimit';
        }

        // Check for billing/credit/quota errors (separate from rate limits)
        if (errorString.includes('credit') ||       // xAI "no credits" errors
            errorString.includes('billing') ||      // Generic billing issues
            errorString.includes('payment') ||      // Payment required errors
            errorString.includes('insufficient funds') ||
            errorString.includes('quota exceeded') ||
            errorString.includes('balance') ||      // Account balance issues
            errorString.includes('no funds')) {
            return 'NoCredit';
        }

        // Check for clear authentication/authorization errors (must be specific)
        if (errorString.includes('unauthorized') ||
            errorString.includes('authentication failed') ||
            errorString.includes('invalid api key') ||
            errorString.includes('invalid key') ||
            errorString.includes('api key is invalid')) {
            return 'Authentication';
        }

        // Check for service availability issues
        if (errorString.includes('service unavailable') ||
            errorString.includes('service is down') ||
            errorString.includes('maintenance') ||
            errorString.includes('temporarily unavailable')) {
            return 'ServiceUnavailable';
        }

        // Check for network errors
        if (errorString.includes('network') ||
            errorString.includes('timeout') ||
            errorString.includes('econnrefused') ||
            errorString.includes('dns') ||
            errorString.includes('connection reset')) {
            return 'NetworkError';
        }

        // Check for model-specific errors
        if (errorString.includes('model') &&
            (errorString.includes('not found') ||
             errorString.includes('does not exist') ||
             errorString.includes('overloaded') ||
             errorString.includes('not available'))) {
            return 'ModelError';
        }

        // Check for invalid request patterns (be specific to avoid false positives)
        if (errorString.includes('invalid request') ||
            errorString.includes('bad request') ||
            errorString.includes('malformed request') ||
            errorString.includes('validation error')) {
            return 'InvalidRequest';
        }

        // Check for specific error types from provider SDKs
        const errorTypeName = error?.constructor?.name || error?.name || '';

        if (errorTypeName.includes('RateLimit')) return 'RateLimit';
        if (errorTypeName.includes('Authentication')) return 'Authentication';
        if (errorTypeName.includes('APIError') && statusCode === 500) return 'InternalServerError';

        // NOW check status codes as fallback (lower priority than message content)
        if (statusCode) {
            switch (statusCode) {
                case 429:
                    return 'RateLimit';
                case 401:
                    // 401 is almost always authentication
                    return 'Authentication';
                case 403:
                    // 403 can be auth OR quota/billing - if we got here, message didn't clarify,
                    // so treat as retriable ServiceUnavailable to allow failover
                    return 'ServiceUnavailable';
                case 503:
                    return 'ServiceUnavailable';
                case 500:
                case 502:
                case 504:
                    return 'InternalServerError';
                case 400:
                case 422:
                    // Only treat as InvalidRequest if we have a status code but message didn't match
                    // anything more specific above
                    return 'InvalidRequest';
            }
        }

        return 'Unknown';
    }
    
    /**
     * Determines the error severity based on the error type.
     * This helps decide whether to retry immediately, wait, or fail permanently.
     * 
     * @private
     * @static
     * @param {AIErrorType} errorType - The categorized error type
     * @returns {ErrorSeverity} The severity level of the error
     */
    private static determineSeverity(errorType: AIErrorType): ErrorSeverity {
        switch (errorType) {
            case 'RateLimit':
            case 'NoCredit':              // Billing/credit errors are retriable with another provider
            case 'ServiceUnavailable':
            case 'NetworkError':
                return 'Retriable';

            case 'InternalServerError':
            case 'ModelError':
                return 'Transient';

            case 'Authentication':
            case 'InvalidRequest':
                return 'Fatal';

            case 'ContextLengthExceeded':
                return 'Fatal';

            default:
                return 'Transient';
        }
    }
    
    /**
     * Determines whether an error can potentially be resolved by switching providers.
     *
     * Strategy: We're permissive with failover - most errors should allow trying another
     * provider/model since vendors may use different status codes and error messages.
     * Only block failover for clear client-side errors that won't be fixed by switching.
     *
     * @private
     * @static
     * @param {AIErrorType} errorType - The categorized error type
     * @returns {boolean} True if failover might help, false otherwise
     */
    private static canFailoverForError(errorType: AIErrorType): boolean {
        switch (errorType) {
            // Provider-specific errors - ALWAYS allow failover
            case 'RateLimit':              // Different provider may have capacity
            case 'NoCredit':               // Different provider may have credits/quota
            case 'ServiceUnavailable':     // Different provider may be available
            case 'InternalServerError':    // Different provider may be stable
            case 'NetworkError':           // Different provider/region may be reachable
            case 'ModelError':             // Different provider may have working model
            case 'ContextLengthExceeded':  // Different model may have larger context
                return true;

            // Clear client-side errors - DO NOT failover (won't help)
            case 'Authentication':         // Invalid API key won't work elsewhere
            case 'InvalidRequest':         // Malformed request won't work elsewhere
                return false;

            // Unknown errors - DEFAULT to allowing failover (permissive approach)
            default:
                return true;
        }
    }
    
    /**
     * Extracts suggested retry delay from error response.
     * Looks for Retry-After headers and provider-specific retry delay fields.
     * 
     * @private
     * @static
     * @param {any} error - The error object to extract retry delay from
     * @returns {number | undefined} Suggested retry delay in seconds, or undefined
     */
    private static extractRetryDelay(error: any): number | undefined {
        // Check for Retry-After header (can be in seconds or HTTP date)
        const retryAfter = error?.response?.headers?.['retry-after'] || 
                          error?.headers?.['retry-after'];
        
        if (retryAfter) {
            const seconds = parseInt(retryAfter);
            if (!isNaN(seconds)) {
                return seconds;
            }
            // Could be an HTTP date - for now, just return a default
            return 60; // Default to 1 minute
        }
        
        // Some providers include retry delay in error object
        if (error?.retryDelay) {
            return error.retryDelay;
        }
        
        // Default retry delays based on error type
        const statusCode = this.extractHttpStatusCode(error);
        if (statusCode === 429) {
            return 30; // Default 30 seconds for rate limits
        }
        
        return undefined;
    }
    
    /**
     * Extracts the provider-specific error code from the error object.
     * Different providers store error codes in different locations.
     * 
     * @private
     * @static
     * @param {any} error - The error object to extract provider code from
     * @returns {string | undefined} The provider error code if found, undefined otherwise
     */
    private static extractProviderErrorCode(error: any): string | undefined {
        // Try to extract from various common locations
        const code = error?.code || 
               error?.errorCode || 
               error?.error?.code ||
               error?.response?.data?.error?.code ||
               undefined;
               
        if (code) {
            return code;
        }
        
        // Try to parse from error message if it contains JSON
        const errorMessage = error?.message || error?.errorMessage || '';
        if (errorMessage.includes('{') && errorMessage.includes('}')) {
            try {
                // Extract JSON from error message
                const jsonMatch = errorMessage.match(/\{.*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return parsed?.error?.code || parsed?.code || undefined;
                }
            } catch (parseError) {
                // If JSON parsing fails, continue with undefined
            }
        }
        
        return undefined;
    }
}