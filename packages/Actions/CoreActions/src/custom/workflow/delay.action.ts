import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";

/**
 * Action that adds delays to workflows
 * 
 * @example
 * ```typescript
 * // Fixed delay
 * await runAction({
 *   ActionName: 'Delay',
 *   Params: [{
 *     Name: 'DelayMs',
 *     Value: 5000
 *   }]
 * });
 * 
 * // Random delay between min and max
 * await runAction({
 *   ActionName: 'Delay',
 *   Params: [{
 *     Name: 'DelayType',
 *     Value: 'random'
 *   }, {
 *     Name: 'MinDelayMs',
 *     Value: 1000
 *   }, {
 *     Name: 'MaxDelayMs',
 *     Value: 5000
 *   }]
 * });
 * 
 * // Delay with message
 * await runAction({
 *   ActionName: 'Delay',
 *   Params: [{
 *     Name: 'DelayMs',
 *     Value: 3000
 *   }, {
 *     Name: 'Message',
 *     Value: 'Waiting for external system to process...'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Delay")
export class DelayAction extends BaseAction {
    
    /**
     * Adds a delay to the workflow
     * 
     * @param params - The action parameters containing:
     *   - DelayMs: Delay in milliseconds (required for fixed delay)
     *   - DelayType: "fixed" | "random" (default: "fixed")
     *   - MinDelayMs: Minimum delay for random delays (required for random)
     *   - MaxDelayMs: Maximum delay for random delays (required for random)
     *   - Message: Optional message to include in result
     * 
     * @returns Success with actual delay applied
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const delayType = (this.getParamValue(params, 'delaytype') || 'fixed').toLowerCase();
            const message = this.getParamValue(params, 'message');

            let actualDelay: number;

            if (delayType === 'random') {
                // Random delay
                const minDelay = this.getNumericParam(params, 'mindelayms', 0);
                const maxDelay = this.getNumericParam(params, 'maxdelayms', 0);

                if (minDelay < 0 || maxDelay < 0) {
                    return {
                        Success: false,
                        Message: "Delay values must be non-negative",
                        ResultCode: "INVALID_DELAY"
                    };
                }

                if (minDelay > maxDelay) {
                    return {
                        Success: false,
                        Message: "MinDelayMs must be less than or equal to MaxDelayMs",
                        ResultCode: "INVALID_DELAY_RANGE"
                    };
                }

                // Calculate random delay
                actualDelay = Math.floor(minDelay + Math.random() * (maxDelay - minDelay + 1));
            } else {
                // Fixed delay
                actualDelay = this.getNumericParam(params, 'delayms', 0);

                if (actualDelay < 0) {
                    return {
                        Success: false,
                        Message: "DelayMs must be non-negative",
                        ResultCode: "INVALID_DELAY"
                    };
                }
            }

            // Record start time
            const startTime = Date.now();

            // Perform the delay
            await this.delay(actualDelay);

            // Calculate actual elapsed time
            const elapsedTime = Date.now() - startTime;

            // Add output parameters
            params.Params.push({
                Name: 'ActualDelayMs',
                Type: 'Output',
                Value: actualDelay
            });

            params.Params.push({
                Name: 'ElapsedTimeMs',
                Type: 'Output',
                Value: elapsedTime
            });

            params.Params.push({
                Name: 'DelayType',
                Type: 'Output',
                Value: delayType
            });

            // Build result message
            const resultData: any = {
                message: message || `Delay completed`,
                delayType: delayType,
                requestedDelayMs: actualDelay,
                actualElapsedMs: elapsedTime,
                timeDifference: elapsedTime - actualDelay
            };

            if (delayType === 'random') {
                resultData.minDelayMs = this.getNumericParam(params, 'mindelayms', 0);
                resultData.maxDelayMs = this.getNumericParam(params, 'maxdelayms', 0);
            }

            return {
                Success: true,
                ResultCode: "DELAY_COMPLETED",
                Message: JSON.stringify(resultData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Delay action failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "DELAY_FAILED"
            };
        }
    }

    /**
     * Perform the actual delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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