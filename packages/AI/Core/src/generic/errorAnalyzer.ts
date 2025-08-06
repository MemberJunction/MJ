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
        // Check status code first
        if (statusCode) {
            switch (statusCode) {
                case 429:
                    return 'RateLimit';
                case 401:
                case 403:
                    return 'Authentication';
                case 503:
                    return 'ServiceUnavailable';
                case 500:
                case 502:
                case 504:
                    return 'InternalServerError';
                case 400:
                case 422:
                    return 'InvalidRequest';
            }
        }
        
        // Check error message and name patterns
        const errorString = (error?.message || error?.name || '').toLowerCase();
        
        // Check for context length exceeded errors first (before general InvalidRequest)
        if (errorString.includes('context_length_exceeded') || 
            errorString.includes('context length exceeded') ||
            errorString.includes('reduce the length of the messages') ||
            errorString.includes('maximum context length')) {
            return 'ContextLengthExceeded';
        }
        
        if (errorString.includes('rate limit') || 
            errorString.includes('too many requests') ||
            errorString.includes('quota exceeded')) {
            return 'RateLimit';
        }
        
        if (errorString.includes('unauthorized') || 
            errorString.includes('authentication') ||
            errorString.includes('api key') ||
            errorString.includes('invalid key')) {
            return 'Authentication';
        }
        
        if (errorString.includes('service unavailable') || 
            errorString.includes('service is down') ||
            errorString.includes('maintenance')) {
            return 'ServiceUnavailable';
        }
        
        if (errorString.includes('network') || 
            errorString.includes('timeout') ||
            errorString.includes('econnrefused') ||
            errorString.includes('dns')) {
            return 'NetworkError';
        }
        
        if (errorString.includes('model') && 
            (errorString.includes('not found') || 
             errorString.includes('does not exist') ||
             errorString.includes('overloaded'))) {
            return 'ModelError';
        }
        
        if (errorString.includes('invalid') || 
            errorString.includes('bad request') ||
            errorString.includes('malformed')) {
            return 'InvalidRequest';
        }
        
        // Check for specific error types from provider SDKs
        const errorTypeName = error?.constructor?.name || error?.name || '';
        
        if (errorTypeName.includes('RateLimit')) return 'RateLimit';
        if (errorTypeName.includes('Authentication')) return 'Authentication';
        if (errorTypeName.includes('APIError') && statusCode === 500) return 'InternalServerError';
        
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
     * Some errors are provider-specific while others are request-specific.
     * 
     * @private
     * @static
     * @param {AIErrorType} errorType - The categorized error type
     * @returns {boolean} True if failover might help, false otherwise
     */
    private static canFailoverForError(errorType: AIErrorType): boolean {
        switch (errorType) {
            case 'RateLimit':
            case 'ServiceUnavailable':
            case 'InternalServerError':
            case 'NetworkError':
            case 'ModelError':
                return true;
                
            case 'Authentication':
            case 'InvalidRequest':
                return false;
                
            case 'ContextLengthExceeded':
                return true;
                
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