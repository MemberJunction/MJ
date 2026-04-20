import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { ActionEngineServer } from "@memberjunction/actions";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that executes multiple actions in parallel
 * 
 * @example
 * ```typescript
 * // Execute multiple actions in parallel
 * await runAction({
 *   ActionName: 'Parallel Execute',
 *   Params: [{
 *     Name: 'Actions',
 *     Value: [
 *       {
 *         ActionName: 'Web Search',
 *         Params: { Query: 'latest news' }
 *       },
 *       {
 *         ActionName: 'Get Weather',
 *         Params: { Location: 'New York' }
 *       },
 *       {
 *         ActionName: 'Get Stock Price',
 *         Params: { Symbol: 'AAPL' }
 *       }
 *     ]
 *   }]
 * });
 * 
 * // Wait for first result only
 * await runAction({
 *   ActionName: 'Parallel Execute',
 *   Params: [{
 *     Name: 'Actions',
 *     Value: [api1Action, api2Action, api3Action]
 *   }, {
 *     Name: 'WaitForAll',
 *     Value: false
 *   }]
 * });
 * 
 * // With timeout and error handling
 * await runAction({
 *   ActionName: 'Parallel Execute',
 *   Params: [{
 *     Name: 'Actions',
 *     Value: actions
 *   }, {
 *     Name: 'ContinueOnError',
 *     Value: true
 *   }, {
 *     Name: 'Timeout',
 *     Value: 10000
 *   }, {
 *     Name: 'MaxConcurrent',
 *     Value: 5
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Parallel Execute")
export class ParallelExecuteAction extends BaseAction {
    
    /**
     * Executes multiple actions in parallel
     * 
     * @param params - The action parameters containing:
     *   - Actions: Array of action configurations to execute (required)
     *   - WaitForAll: Boolean - wait for all vs first (default: true)
     *   - ContinueOnError: Boolean - continue if actions fail (default: false)
     *   - MaxConcurrent: Max parallel executions (default: unlimited)
     *   - Timeout: Overall timeout in milliseconds (optional)
     *   - IncludeContext: Additional context to pass to all actions (optional)
     * 
     * @returns Array of results or first result based on WaitForAll
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const actions = JSONParamHelper.getJSONParam(params, 'actions');
            const waitForAll = this.getBooleanParam(params, 'waitforall', true);
            const continueOnError = this.getBooleanParam(params, 'continueonerror', false);
            const maxConcurrent = this.getNumericParam(params, 'maxconcurrent', 0); // 0 = unlimited
            const timeout = this.getNumericParam(params, 'timeout', 0); // 0 = no timeout
            const includeContext = JSONParamHelper.getJSONParam(params, 'includecontext') || {};

            // Validate actions
            if (!actions || !Array.isArray(actions) || actions.length === 0) {
                return {
                    Success: false,
                    Message: "Actions parameter must be a non-empty array",
                    ResultCode: "INVALID_ACTIONS"
                };
            }

            // Validate action configurations
            for (let i = 0; i < actions.length; i++) {
                if (!actions[i] || !actions[i].ActionName) {
                    return {
                        Success: false,
                        Message: `Action at index ${i} must have ActionName`,
                        ResultCode: "INVALID_ACTION_CONFIG"
                    };
                }
            }

            // Prepare actions with context
            const preparedActions = actions.map(action => 
                this.prepareActionConfig(action, includeContext)
            );

            // Execute based on mode
            if (waitForAll) {
                return await this.executeAllActions(
                    preparedActions, 
                    continueOnError, 
                    maxConcurrent, 
                    timeout, 
                    params.ContextUser,
                    params
                );
            } else {
                return await this.executeFirstAction(
                    preparedActions, 
                    maxConcurrent, 
                    timeout, 
                    params.ContextUser,
                    params
                );
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Parallel execute failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "PARALLEL_FAILED"
            };
        }
    }

    /**
     * Execute all actions and wait for completion
     */
    private async executeAllActions(
        actions: any[], 
        continueOnError: boolean, 
        maxConcurrent: number,
        timeout: number,
        contextUser: any,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        const engine = new ActionEngineServer();
        const results: any[] = [];
        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        // Create execution function
        const executeAction = async (action: any, index: number) => {
            try {
                // Check timeout
                if (timeout > 0 && Date.now() - startTime > timeout) {
                    throw new Error('Timeout exceeded');
                }

                const result = await engine.RunAction(action);
                results[index] = {
                    actionName: action.ActionName,
                    success: result.Success,
                    result: result,
                    duration: Date.now() - startTime
                };

                if (result.Success) {
                    successCount++;
                } else {
                    errorCount++;
                }

                return result;
            } catch (error) {
                errorCount++;
                const errorResult = {
                    actionName: action.ActionName,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    duration: Date.now() - startTime
                };
                results[index] = errorResult;
                
                if (!continueOnError) {
                    throw error;
                }
                
                return errorResult;
            }
        };

        // Execute with or without concurrency limit
        if (maxConcurrent > 0 && maxConcurrent < actions.length) {
            // Execute with concurrency limit
            for (let i = 0; i < actions.length; i += maxConcurrent) {
                const batch = actions.slice(i, i + maxConcurrent);
                const batchPromises = batch.map((action, batchIndex) => 
                    executeAction(action, i + batchIndex)
                );

                try {
                    await Promise.all(batchPromises);
                } catch (error) {
                    if (!continueOnError) {
                        break;
                    }
                }
            }
        } else {
            // Execute all at once
            const promises = actions.map((action, index) => executeAction(action, index));
            
            if (continueOnError) {
                await Promise.allSettled(promises);
            } else {
                await Promise.all(promises);
            }
        }

        // Add output parameters
        params.Params.push({
            Name: 'Results',
            Type: 'Output',
            Value: results
        });

        params.Params.push({
            Name: 'SuccessCount',
            Type: 'Output',
            Value: successCount
        });

        params.Params.push({
            Name: 'ErrorCount',
            Type: 'Output',
            Value: errorCount
        });

        params.Params.push({
            Name: 'TotalDuration',
            Type: 'Output',
            Value: Date.now() - startTime
        });

        // Determine overall success
        const allSuccessful = errorCount === 0;
        const someSuccessful = successCount > 0;

        return {
            Success: continueOnError ? someSuccessful : allSuccessful,
            ResultCode: allSuccessful ? "ALL_SUCCESS" : (someSuccessful ? "PARTIAL_SUCCESS" : "ALL_FAILED"),
            Message: JSON.stringify({
                message: `Parallel execution completed: ${successCount} successful, ${errorCount} failed`,
                totalActions: actions.length,
                successCount: successCount,
                errorCount: errorCount,
                totalDuration: Date.now() - startTime,
                results: results
            }, null, 2)
        };
    }

    /**
     * Execute actions and return first result
     */
    private async executeFirstAction(
        actions: any[], 
        maxConcurrent: number,
        timeout: number,
        contextUser: any,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        const engine = new ActionEngineServer();
        const startTime = Date.now();

        return new Promise<ActionResultSimple>((resolve) => {
            let resolved = false;
            const results: any[] = [];
            let completedCount = 0;

            // Create execution function
            const executeAction = async (action: any, index: number) => {
                try {
                    // Check if already resolved
                    if (resolved) return;

                    // Check timeout
                    if (timeout > 0 && Date.now() - startTime > timeout) {
                        throw new Error('Timeout exceeded');
                    }

                    const result = await engine.RunAction(action);
                    
                    if (!resolved) {
                        if (result.Success) {
                            resolved = true;
                            
                            // Add output parameters
                            params.Params.push({
                                Name: 'FirstResult',
                                Type: 'Output',
                                Value: result
                            });

                            params.Params.push({
                                Name: 'FirstActionName',
                                Type: 'Output',
                                Value: action.ActionName
                            });

                            params.Params.push({
                                Name: 'FirstActionIndex',
                                Type: 'Output',
                                Value: index
                            });

                            params.Params.push({
                                Name: 'Duration',
                                Type: 'Output',
                                Value: Date.now() - startTime
                            });

                            resolve({
                                Success: true,
                                ResultCode: "FIRST_SUCCESS",
                                Message: JSON.stringify({
                                    message: "First successful action completed",
                                    actionName: action.ActionName,
                                    actionIndex: index,
                                    duration: Date.now() - startTime,
                                    result: result
                                }, null, 2)
                            });
                        } else {
                            results[index] = {
                                actionName: action.ActionName,
                                success: false,
                                error: result.Message
                            };
                            completedCount++;

                            // Check if all failed
                            if (completedCount === actions.length) {
                                params.Params.push({
                                    Name: 'AllResults',
                                    Type: 'Output',
                                    Value: results
                                });

                                resolve({
                                    Success: false,
                                    ResultCode: "ALL_FAILED",
                                    Message: JSON.stringify({
                                        message: "All actions failed",
                                        results: results,
                                        duration: Date.now() - startTime
                                    }, null, 2)
                                });
                            }
                        }
                    }
                } catch (error) {
                    if (!resolved) {
                        results[index] = {
                            actionName: action.ActionName,
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        };
                        completedCount++;

                        // Check if all failed
                        if (completedCount === actions.length) {
                            params.Params.push({
                                Name: 'AllResults',
                                Type: 'Output',
                                Value: results
                            });

                            resolve({
                                Success: false,
                                ResultCode: "ALL_FAILED",
                                Message: JSON.stringify({
                                    message: "All actions failed",
                                    results: results,
                                    duration: Date.now() - startTime
                                }, null, 2)
                            });
                        }
                    }
                }
            };

            // Execute with or without concurrency limit
            if (maxConcurrent > 0 && maxConcurrent < actions.length) {
                // Execute with concurrency limit
                let currentIndex = 0;
                
                const executeNext = () => {
                    if (currentIndex < actions.length && !resolved) {
                        const action = actions[currentIndex];
                        const index = currentIndex;
                        currentIndex++;
                        
                        executeAction(action, index).then(() => executeNext());
                    }
                };

                // Start initial batch
                for (let i = 0; i < Math.min(maxConcurrent, actions.length); i++) {
                    executeNext();
                }
            } else {
                // Execute all at once
                actions.forEach((action, index) => executeAction(action, index));
            }

            // Handle timeout
            if (timeout > 0) {
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve({
                            Success: false,
                            ResultCode: "TIMEOUT",
                            Message: `Parallel execution timed out after ${timeout}ms`
                        });
                    }
                }, timeout);
            }
        });
    }

    /**
     * Prepare action configuration with context
     */
    private prepareActionConfig(actionConfig: any, context: any): any {
        if (!context || Object.keys(context).length === 0) {
            return actionConfig;
        }

        // Deep clone the config
        const preparedConfig = JSON.parse(JSON.stringify(actionConfig));

        // Merge context into params
        if (!preparedConfig.Params) {
            preparedConfig.Params = {};
        }

        // If Params is an array, convert to object
        if (Array.isArray(preparedConfig.Params)) {
            const paramsObj: any = {};
            preparedConfig.Params.forEach((param: any) => {
                if (param.Name) {
                    paramsObj[param.Name] = param.Value;
                }
            });
            preparedConfig.Params = paramsObj;
        }

        // Merge context (existing params take precedence)
        preparedConfig.Params = { ...context, ...preparedConfig.Params };

        return preparedConfig;
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