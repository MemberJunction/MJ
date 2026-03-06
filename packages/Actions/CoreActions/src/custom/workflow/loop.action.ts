import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { ActionEngineServer } from "@memberjunction/actions";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that iterates over collections executing actions for each item
 * 
 * @example
 * ```typescript
 * // Process array of items
 * await runAction({
 *   ActionName: 'Loop',
 *   Params: [{
 *     Name: 'Items',
 *     Value: [
 *       { name: 'John', email: 'john@example.com' },
 *       { name: 'Jane', email: 'jane@example.com' }
 *     ]
 *   }, {
 *     Name: 'ItemVariableName',
 *     Value: 'user'
 *   }, {
 *     Name: 'Action',
 *     Value: {
 *       ActionName: 'Send Single Message',
 *       Params: {
 *         To: '{{user.email}}',
 *         Subject: 'Welcome {{user.name}}'
 *       }
 *     }
 *   }]
 * });
 * 
 * // Parallel processing with limit
 * await runAction({
 *   ActionName: 'Loop',
 *   Params: [{
 *     Name: 'Items',
 *     Value: fileUrls
 *   }, {
 *     Name: 'Parallel',
 *     Value: true
 *   }, {
 *     Name: 'MaxConcurrent',
 *     Value: 5
 *   }, {
 *     Name: 'Action',
 *     Value: {
 *       ActionName: 'Web Page Content',
 *       Params: { URL: '{{item}}' }
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Loop")
export class LoopAction extends BaseAction {
    
    /**
     * Iterates over collections executing actions
     * 
     * @param params - The action parameters containing:
     *   - Items: Array to iterate over (required)
     *   - ItemVariableName: Variable name for current item (default: 'item')
     *   - IndexVariableName: Variable name for current index (default: 'index')
     *   - Action: Action configuration to execute per item (required)
     *   - Parallel: Boolean - run iterations in parallel (default: false)
     *   - MaxConcurrent: Max parallel executions (default: 10)
     *   - ContinueOnError: Boolean - continue if an iteration fails (default: false)
     *   - IncludeContext: Additional context to pass to each action (optional)
     * 
     * @returns Array of results from each iteration
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const items = JSONParamHelper.getJSONParam(params, 'items');
            const itemVariableName = this.getParamValue(params, 'itemvariablename') || 'item';
            const indexVariableName = this.getParamValue(params, 'indexvariablename') || 'index';
            const actionConfig = JSONParamHelper.getJSONParam(params, 'action');
            const parallel = this.getBooleanParam(params, 'parallel', false);
            const maxConcurrent = this.getNumericParam(params, 'maxconcurrent', 10);
            const continueOnError = this.getBooleanParam(params, 'continueonerror', false);
            const includeContext = JSONParamHelper.getJSONParam(params, 'includecontext') || {};

            // Validate required parameters
            if (!items) {
                return {
                    Success: false,
                    Message: "Items parameter is required",
                    ResultCode: "MISSING_ITEMS"
                };
            }

            if (!Array.isArray(items)) {
                return {
                    Success: false,
                    Message: "Items must be an array",
                    ResultCode: "INVALID_ITEMS"
                };
            }

            if (!actionConfig) {
                return {
                    Success: false,
                    Message: "Action parameter is required",
                    ResultCode: "MISSING_ACTION"
                };
            }

            if (!actionConfig.ActionName) {
                return {
                    Success: false,
                    Message: "Action configuration must include ActionName",
                    ResultCode: "INVALID_ACTION"
                };
            }

            // Track results
            const results: any[] = [];
            const errors: any[] = [];
            let successCount = 0;
            let errorCount = 0;

            // Execute iterations
            if (parallel) {
                // Parallel execution with concurrency limit
                const chunks = this.chunkArray(items, maxConcurrent);
                
                for (const chunk of chunks) {
                    const chunkPromises = chunk.map((item, chunkIndex) => {
                        const globalIndex = chunks.indexOf(chunk) * maxConcurrent + chunkIndex;
                        return this.executeIteration(
                            item, 
                            globalIndex, 
                            itemVariableName, 
                            indexVariableName, 
                            actionConfig, 
                            includeContext,
                            params.ContextUser
                        );
                    });

                    const chunkResults = await Promise.allSettled(chunkPromises);
                    
                    for (let i = 0; i < chunkResults.length; i++) {
                        const result = chunkResults[i];
                        const globalIndex = chunks.indexOf(chunk) * maxConcurrent + i;
                        
                        if (result.status === 'fulfilled') {
                            results[globalIndex] = result.value;
                            if (result.value.Success) {
                                successCount++;
                            } else {
                                errorCount++;
                                errors.push({ index: globalIndex, error: result.value.Message });
                                if (!continueOnError) break;
                            }
                        } else {
                            errorCount++;
                            const errorResult = {
                                Success: false,
                                Message: result.reason?.message || String(result.reason),
                                ResultCode: "ITERATION_ERROR"
                            };
                            results[globalIndex] = errorResult;
                            errors.push({ index: globalIndex, error: result.reason });
                            if (!continueOnError) break;
                        }
                    }

                    if (!continueOnError && errorCount > 0) break;
                }
            } else {
                // Sequential execution
                for (let i = 0; i < items.length; i++) {
                    try {
                        const result = await this.executeIteration(
                            items[i], 
                            i, 
                            itemVariableName, 
                            indexVariableName, 
                            actionConfig, 
                            includeContext,
                            params.ContextUser
                        );
                        
                        results.push(result);
                        
                        if (result.Success) {
                            successCount++;
                        } else {
                            errorCount++;
                            errors.push({ index: i, error: result.Message });
                            if (!continueOnError) break;
                        }
                    } catch (error) {
                        errorCount++;
                        const errorResult = {
                            Success: false,
                            Message: error instanceof Error ? error.message : String(error),
                            ResultCode: "ITERATION_ERROR"
                        };
                        results.push(errorResult);
                        errors.push({ index: i, error: error });
                        if (!continueOnError) break;
                    }
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

            if (errors.length > 0) {
                params.Params.push({
                    Name: 'Errors',
                    Type: 'Output',
                    Value: errors
                });
            }

            // Determine overall success
            const allSuccessful = errorCount === 0;
            const someSuccessful = successCount > 0;

            return {
                Success: continueOnError ? someSuccessful : allSuccessful,
                ResultCode: allSuccessful ? "ALL_SUCCESS" : (someSuccessful ? "PARTIAL_SUCCESS" : "ALL_FAILED"),
                Message: JSON.stringify({
                    message: `Loop completed: ${successCount} successful, ${errorCount} failed`,
                    totalItems: items.length,
                    successCount: successCount,
                    errorCount: errorCount,
                    parallel: parallel,
                    continueOnError: continueOnError,
                    errors: errors.length > 0 ? errors : undefined
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Loop action failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "LOOP_FAILED"
            };
        }
    }

    /**
     * Execute a single iteration
     */
    private async executeIteration(
        item: any, 
        index: number, 
        itemVariableName: string, 
        indexVariableName: string,
        actionConfig: any,
        includeContext: any,
        contextUser?: any
    ): Promise<ActionResultSimple> {
        // Build context for this iteration
        const iterationContext = {
            ...includeContext,
            [itemVariableName]: item,
            [indexVariableName]: index
        };

        // Prepare action configuration with context
        const preparedConfig = this.prepareActionConfig(actionConfig, iterationContext);

        // Execute the action
        const engine = new ActionEngineServer();
        const result = await engine.RunAction(preparedConfig);

        // Convert ActionResult to ActionResultSimple
        return {
            Success: result.Success,
            ResultCode: result.Result?.ResultCode || (result.Success ? "SUCCESS" : "FAILED"),
            Message: result.Message,
            Params: result.Params
        };
    }

    /**
     * Prepare action configuration with template replacement
     */
    private prepareActionConfig(actionConfig: any, context: any): any {
        // Deep clone the config
        const preparedConfig = JSON.parse(JSON.stringify(actionConfig));

        // Replace templates in the configuration
        this.replaceTemplates(preparedConfig, context);

        return preparedConfig;
    }

    /**
     * Replace template variables in object recursively
     */
    private replaceTemplates(obj: any, context: any): void {
        if (typeof obj === 'string') {
            // Can't modify string in place, would need parent reference
            return;
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                
                if (typeof value === 'string') {
                    // Replace template variables
                    obj[key] = this.replaceTemplateString(value, context);
                } else if (typeof value === 'object' && value !== null) {
                    // Recurse into objects and arrays
                    this.replaceTemplates(value, context);
                }
            }
        }
    }

    /**
     * Replace template variables in a string
     */
    private replaceTemplateString(template: string, context: any): string {
        // Simple template replacement for {{variable}} and {{object.property}}
        return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const trimmedPath = path.trim();
            const value = this.getValueByPath(context, trimmedPath);
            return value !== undefined ? String(value) : match;
        });
    }

    /**
     * Get value from object by dot-notation path
     */
    private getValueByPath(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return undefined;
            }
        }
        
        return current;
    }

    /**
     * Chunk array into smaller arrays
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
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