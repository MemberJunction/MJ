/**
 * Categorizes error types that can occur during AI model operations.
 * These categories help determine appropriate retry and failover strategies.
 * 
 * @typedef {'RateLimit' | 'Authentication' | 'ServiceUnavailable' | 'InternalServerError' | 'NetworkError' | 'InvalidRequest' | 'ModelError' | 'Unknown'} AIErrorType
 * 
 * @description
 * - `RateLimit`: Rate limit exceeded - typically HTTP 429. Suggests switching to another provider or waiting
 * - `Authentication`: Authentication or authorization failure - typically HTTP 401/403. Usually indicates invalid API key or permissions issue
 * - `ServiceUnavailable`: Service temporarily unavailable - typically HTTP 503. Suggests the service is down or overloaded
 * - `InternalServerError`: Internal server error - typically HTTP 500. Indicates a problem on the provider's side
 * - `NetworkError`: Network connectivity issues. Connection timeouts, DNS failures, etc.
 * - `InvalidRequest`: Invalid request format or parameters - typically HTTP 400. Usually indicates a problem with the request itself
 * - `ModelError`: Model-specific errors. Model not found, model overloaded, etc.
 * - `Unknown`: Unknown or unclassified error
 * 
 * @since 2.47.0
 */
export type AIErrorType = 
    | 'RateLimit'
    | 'Authentication'
    | 'ServiceUnavailable'
    | 'InternalServerError'
    | 'NetworkError'
    | 'InvalidRequest'
    | 'ModelError'
    | 'Unknown';

/**
 * Categorizes error severity levels to guide retry and failover strategies.
 * 
 * @typedef {'Transient' | 'Retriable' | 'Fatal'} ErrorSeverity
 * 
 * @description
 * - `Transient`: Temporary error that may resolve with immediate retry
 * - `Retriable`: Error that requires waiting or switching providers before retry
 * - `Fatal`: Fatal error that won't be resolved by retrying
 * 
 * @since 2.47.0
 */
export type ErrorSeverity = 
    | 'Transient'
    | 'Retriable'
    | 'Fatal';

/**
 * Provides detailed, structured error information for AI operations.
 * This interface enables intelligent error handling, retry logic, and provider failover decisions.
 * 
 * @interface AIErrorInfo
 * @since 2.47.0
 * 
 * @example
 * ```typescript
 * const errorInfo: AIErrorInfo = {
 *   httpStatusCode: 429,
 *   errorType: 'RateLimit',
 *   severity: 'Retriable',
 *   suggestedRetryDelaySeconds: 30,
 *   canFailover: true,
 *   providerErrorCode: 'rate_limit_exceeded'
 * };
 * ```
 */
export interface AIErrorInfo {
    /**
     * HTTP status code returned by the provider's API.
     * Common codes include:
     * - 429: Rate limit exceeded
     * - 401/403: Authentication/Authorization failure
     * - 500: Internal server error
     * - 503: Service unavailable
     * 
     * @type {number | undefined}
     * @memberof AIErrorInfo
     */
    httpStatusCode?: number;
    
    /**
     * Categorized error type for standardized error handling.
     * This allows consistent error handling across different AI providers.
     * 
     * @type {AIErrorType}
     * @memberof AIErrorInfo
     */
    errorType: AIErrorType;
    
    /**
     * Severity level indicating how the error should be handled.
     * Used to determine whether to retry immediately, wait, or fail permanently.
     * 
     * @type {ErrorSeverity}
     * @memberof AIErrorInfo
     */
    severity: ErrorSeverity;
    
    /**
     * Suggested delay in seconds before retrying the operation.
     * For rate limits, this often comes from the provider's Retry-After header.
     * If undefined, the caller should use exponential backoff or default delays.
     * 
     * @type {number | undefined}
     * @memberof AIErrorInfo
     */
    suggestedRetryDelaySeconds?: number;
    
    /**
     * Indicates whether this error might be resolved by switching to another provider.
     * - `true`: Error is provider-specific (rate limit, service down)
     * - `false`: Error is request-specific (bad API key, invalid parameters)
     * 
     * @type {boolean}
     * @memberof AIErrorInfo
     */
    canFailover: boolean;
    
    /**
     * Original error code from the provider's SDK or API.
     * This preserves provider-specific error codes for debugging.
     * Examples: 'rate_limit_exceeded', 'model_not_found', 'invalid_api_key'
     * 
     * @type {string | undefined}
     * @memberof AIErrorInfo
     */
    providerErrorCode?: string;
    
    /**
     * Additional context or metadata about the error.
     * Can include provider name, error timestamps, request IDs, etc.
     * This field is flexible to accommodate provider-specific information.
     * 
     * @type {Record<string, any> | undefined}
     * @memberof AIErrorInfo
     */
    context?: Record<string, any>;
}