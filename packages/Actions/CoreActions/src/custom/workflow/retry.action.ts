import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { ActionEngineServer } from "@memberjunction/actions";

/**
 * Action that retries failed actions with exponential backoff
 * 
 * @example
 * ```typescript
 * // Basic retry with defaults
 * await runAction({
 *   ActionName: 'Retry',
 *   Params: [{
 *     Name: 'Action',
 *     Value: {
 *       ActionName: 'HTTP Request',
 *       Params: { URL: 'https://api.example.com/data' }
 *     }
 *   }]
 * });
 * 
 * // Advanced retry with custom configuration
 * await runAction({
 *   ActionName: 'Retry',
 *   Params: [{
 *     Name: 'Action',
 *     Value: {
 *       ActionName: 'Database Query',
 *       Params: { Query: 'SELECT * FROM orders' }
 *     }
 *   }, {
 *     Name: 'MaxRetries',
 *     Value: 5
 *   }, {
 *     Name: 'RetryDelay',
 *     Value: 2000
 *   }, {
 *     Name: 'BackoffMultiplier',
 *     Value: 2
 *   }, {
 *     Name: 'RetryOn',
 *     Value: ['TIMEOUT', 'CONNECTION_ERROR']
 *   }, {
 *     Name: 'GiveUpOn',
 *     Value: ['INVALID_CREDENTIALS', 'NOT_FOUND']
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Retry")
export class RetryAction extends BaseAction {
    
    /**
     * Retries failed actions with exponential backoff
     * 
     * @param params - The action parameters containing:
     *   - Action: Action configuration to retry (required)
     *   - MaxRetries: Maximum number of retry attempts (default: 3)
     *   - RetryDelay: Initial delay in milliseconds (default: 1000)
     *   - BackoffMultiplier: Multiplier for exponential backoff (default: 2)
     *   - MaxDelay: Maximum delay between retries in ms (default: 30000)
     *   - UseJitter: Add random jitter to delays (default: true)
     *   - RetryOn: Array of error codes to retry on (optional - retries all by default)
     *   - GiveUpOn: Array of error codes to not retry (optional)
     * 
     * @returns Result of the successful action or final failure
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const action = this.getParamValue(params, 'action');
            const maxRetries = this.getNumericParam(params, 'maxretries', 3);
            const retryDelay = this.getNumericParam(params, 'retrydelay', 1000);
            const backoffMultiplier = this.getNumericParam(params, 'backoffmultiplier', 2);
            const maxDelay = this.getNumericParam(params, 'maxdelay', 30000);
            const useJitter = this.getBooleanParam(params, 'usejitter', true);
            const retryOn = this.getParamValue(params, 'retryon');
            const giveUpOn = this.getParamValue(params, 'giveupon');

            // Validate required parameters
            if (!action) {
                return {
                    Success: false,
                    Message: "Action parameter is required",
                    ResultCode: "MISSING_ACTION"
                };
            }

            if (!action.ActionName) {
                return {
                    Success: false,
                    Message: "Action configuration must include ActionName",
                    ResultCode: "INVALID_ACTION"
                };
            }

            // Validate numeric parameters
            if (maxRetries < 0) {
                return {
                    Success: false,
                    Message: "MaxRetries must be non-negative",
                    ResultCode: "INVALID_MAX_RETRIES"
                };
            }

            if (retryDelay < 0) {
                return {
                    Success: false,
                    Message: "RetryDelay must be non-negative",
                    ResultCode: "INVALID_RETRY_DELAY"
                };
            }

            if (backoffMultiplier < 1) {
                return {
                    Success: false,
                    Message: "BackoffMultiplier must be at least 1",
                    ResultCode: "INVALID_BACKOFF_MULTIPLIER"
                };
            }

            // Prepare action configuration
            const preparedAction = {
                ...action,
                Params: action.Params || []
            };

            // Create action engine
            const engine = new ActionEngineServer();

            // Track attempts
            const attempts: any[] = [];
            const startTime = Date.now();
            let lastResult: ActionResultSimple;

            // Execute with retries
            let currentDelay = retryDelay;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                const attemptStart = Date.now();

                try {
                    // Execute the action
                    const result = await engine.RunAction(preparedAction);
                    const attemptDuration = Date.now() - attemptStart;

                    // Convert ActionResult to ActionResultSimple
                    const simpleResult: ActionResultSimple = {
                        Success: result.Success,
                        ResultCode: result.Result?.ResultCode || (result.Success ? "SUCCESS" : "FAILED"),
                        Message: result.Message,
                        Params: result.Params
                    };

                    // Record attempt
                    attempts.push({
                        attempt: attempt + 1,
                        success: simpleResult.Success,
                        resultCode: simpleResult.ResultCode,
                        duration: attemptDuration,
                        delay: attempt > 0 ? currentDelay : 0
                    });

                    if (simpleResult.Success) {
                        // Success! Return the result
                        params.Params.push({
                            Name: 'Attempts',
                            Type: 'Output',
                            Value: attempts
                        });

                        params.Params.push({
                            Name: 'TotalAttempts',
                            Type: 'Output',
                            Value: attempt + 1
                        });

                        params.Params.push({
                            Name: 'ActionResult',
                            Type: 'Output',
                            Value: simpleResult
                        });

                        return {
                            Success: true,
                            ResultCode: "SUCCESS_WITH_RETRIES",
                            Message: JSON.stringify({
                                message: `Action succeeded after ${attempt + 1} attempt(s)`,
                                attempts: attempts,
                                finalResult: simpleResult
                            }, null, 2)
                        };
                    }

                    // Check if we should retry this error
                    lastResult = simpleResult;
                    const shouldRetry = this.shouldRetry(simpleResult, retryOn, giveUpOn);

                    if (!shouldRetry || attempt === maxRetries) {
                        // Don't retry or final attempt
                        params.Params.push({
                            Name: 'Attempts',
                            Type: 'Output',
                            Value: attempts
                        });

                        params.Params.push({
                            Name: 'TotalAttempts',
                            Type: 'Output',
                            Value: attempt + 1
                        });

                        params.Params.push({
                            Name: 'FinalError',
                            Type: 'Output',
                            Value: simpleResult
                        });

                        return {
                            Success: false,
                            ResultCode: shouldRetry ? "MAX_RETRIES_EXCEEDED" : "NON_RETRYABLE_ERROR",
                            Message: JSON.stringify({
                                message: shouldRetry 
                                    ? `Action failed after ${attempt + 1} attempt(s)` 
                                    : `Action failed with non-retryable error`,
                                attempts: attempts,
                                finalError: simpleResult
                            }, null, 2)
                        };
                    }

                    // Wait before retry
                    if (attempt < maxRetries) {
                        await this.delay(currentDelay, useJitter);
                        currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
                    }

                } catch (error) {
                    const attemptDuration = Date.now() - attemptStart;

                    // Create error result
                    const errorResult: ActionResultSimple = {
                        Success: false,
                        ResultCode: "EXECUTION_ERROR",
                        Message: error instanceof Error ? error.message : String(error)
                    };

                    // Record attempt
                    attempts.push({
                        attempt: attempt + 1,
                        success: false,
                        resultCode: errorResult.ResultCode,
                        error: error instanceof Error ? error.message : String(error),
                        duration: attemptDuration,
                        delay: attempt > 0 ? currentDelay : 0
                    });

                    lastResult = errorResult;
                    const shouldRetry = this.shouldRetry(errorResult, retryOn, giveUpOn);

                    if (!shouldRetry || attempt === maxRetries) {
                        // Don't retry or final attempt
                        params.Params.push({
                            Name: 'Attempts',
                            Type: 'Output',
                            Value: attempts
                        });

                        params.Params.push({
                            Name: 'TotalAttempts',
                            Type: 'Output',
                            Value: attempt + 1
                        });

                        params.Params.push({
                            Name: 'FinalError',
                            Type: 'Output',
                            Value: error instanceof Error ? error.message : String(error)
                        });

                        return {
                            Success: false,
                            ResultCode: shouldRetry ? "MAX_RETRIES_EXCEEDED" : "NON_RETRYABLE_ERROR",
                            Message: JSON.stringify({
                                message: shouldRetry 
                                    ? `Action failed after ${attempt + 1} attempt(s)` 
                                    : `Action failed with non-retryable error`,
                                attempts: attempts,
                                finalError: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        };
                    }

                    // Wait before retry
                    if (attempt < maxRetries) {
                        await this.delay(currentDelay, useJitter);
                        currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
                    }
                }
            }

            // Should never reach here
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: "Retry logic completed unexpectedly"
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Retry action failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "RETRY_FAILED"
            };
        }
    }

    /**
     * Check if error should be retried
     */
    private shouldRetry(result: ActionResultSimple, retryOn?: string[], giveUpOn?: string[]): boolean {
        // If giveUpOn is specified and matches, don't retry
        if (giveUpOn && Array.isArray(giveUpOn) && giveUpOn.length > 0) {
            if (giveUpOn.includes(result.ResultCode || '')) {
                return false;
            }
            // Also check if error message contains any giveUpOn values
            if (result.Message) {
                for (const giveUp of giveUpOn) {
                    if (result.Message.toLowerCase().includes(giveUp.toLowerCase())) {
                        return false;
                    }
                }
            }
        }

        // If retryOn is not specified, retry all errors
        if (!retryOn || !Array.isArray(retryOn) || retryOn.length === 0) {
            return true;
        }

        // Check if error code matches retryOn list
        if (retryOn.includes(result.ResultCode || '')) {
            return true;
        }

        // Check if error message contains any retryOn values
        if (result.Message) {
            for (const retry of retryOn) {
                if (result.Message.toLowerCase().includes(retry.toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Delay with optional jitter
     */
    private delay(milliseconds: number, useJitter: boolean): Promise<void> {
        const actualDelay = useJitter 
            ? milliseconds * (0.5 + Math.random() * 0.5) // 50% to 100% of delay
            : milliseconds;
        
        return new Promise(resolve => setTimeout(resolve, actualDelay));
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