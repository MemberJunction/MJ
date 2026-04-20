import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { ActionEngineServer } from "@memberjunction/actions";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that executes different actions based on a condition
 * 
 * @example
 * ```typescript
 * // Simple condition with action execution
 * await runAction({
 *   ActionName: 'Conditional',
 *   Params: [{
 *     Name: 'Condition',
 *     Value: 'value > 100'
 *   }, {
 *     Name: 'Context',
 *     Value: { value: 150 }
 *   }, {
 *     Name: 'TrueAction',
 *     Value: {
 *       ActionName: 'Send Single Message',
 *       Params: {
 *         MessageTypeID: 'alert-id',
 *         To: 'admin@example.com',
 *         Subject: 'High Value Alert'
 *       }
 *     }
 *   }, {
 *     Name: 'FalseAction',
 *     Value: {
 *       ActionName: 'Calculate Expression',
 *       Params: { Expression: 'value * 0.9', value: 150 }
 *     }
 *   }]
 * });
 * 
 * // With passthrough context
 * await runAction({
 *   ActionName: 'Conditional',
 *   Params: [{
 *     Name: 'Condition',
 *     Value: 'user.role === "admin"'
 *   }, {
 *     Name: 'Context',
 *     Value: { user: { role: 'admin', id: 123 } }
 *   }, {
 *     Name: 'PassthroughContext',
 *     Value: true
 *   }, {
 *     Name: 'TrueAction',
 *     Value: {
 *       ActionName: 'Get Record',
 *       Params: { EntityName: 'Admin Settings' }
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Conditional")
export class ConditionalAction extends BaseAction {
    
    /**
     * Executes actions based on a condition
     * 
     * @param params - The action parameters containing:
     *   - Condition: JavaScript expression string to evaluate (required)
     *   - Context: Object with variables for condition evaluation (optional)
     *   - TrueAction: Action configuration to run if condition is true (optional)
     *   - FalseAction: Action configuration to run if condition is false (optional)
     *   - PassthroughContext: Boolean - pass context to child actions (default: false)
     *   - StrictMode: Boolean - use strict mode for evaluation (default: true)
     * 
     * @returns Result from executed action or condition result
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const condition = this.getParamValue(params, 'condition');
            const context = JSONParamHelper.getJSONParam(params, 'context') || {};
            const trueAction = JSONParamHelper.getJSONParam(params, 'trueaction');
            const falseAction = JSONParamHelper.getJSONParam(params, 'falseaction');
            const passthroughContext = this.getBooleanParam(params, 'passthroughcontext', false);
            const strictMode = this.getBooleanParam(params, 'strictmode', true);

            // Validate condition
            if (!condition) {
                return {
                    Success: false,
                    Message: "Condition parameter is required",
                    ResultCode: "MISSING_CONDITION"
                };
            }

            // Evaluate condition
            let conditionResult: boolean;
            try {
                conditionResult = this.evaluateCondition(condition, context, strictMode);
            } catch (error) {
                return {
                    Success: false,
                    Message: `Failed to evaluate condition: ${error instanceof Error ? error.message : String(error)}`,
                    ResultCode: "CONDITION_ERROR"
                };
            }

            // Add output parameter for condition result
            params.Params.push({
                Name: 'ConditionResult',
                Type: 'Output',
                Value: conditionResult
            });

            // Determine which action to run
            const actionToRun = conditionResult ? trueAction : falseAction;

            if (!actionToRun) {
                // No action to run, just return condition result
                return {
                    Success: true,
                    ResultCode: conditionResult ? "CONDITION_TRUE" : "CONDITION_FALSE",
                    Message: JSON.stringify({
                        message: `Condition evaluated to ${conditionResult}`,
                        condition: condition,
                        result: conditionResult,
                        context: context
                    }, null, 2)
                };
            }

            // Prepare action parameters
            const actionConfig = this.prepareActionConfig(actionToRun, context, passthroughContext);

            // Execute the action
            try {
                const engine = new ActionEngineServer();
                const actionResult = await engine.RunAction(actionConfig);

                // Add output parameters from child action
                params.Params.push({
                    Name: 'ChildActionResult',
                    Type: 'Output',
                    Value: actionResult
                });

                if (actionResult.Success) {
                    return {
                        Success: true,
                        ResultCode: conditionResult ? "TRUE_ACTION_SUCCESS" : "FALSE_ACTION_SUCCESS",
                        Message: JSON.stringify({
                            message: `${conditionResult ? 'True' : 'False'} action executed successfully`,
                            conditionResult: conditionResult,
                            actionName: actionConfig.ActionName,
                            actionResult: actionResult
                        }, null, 2)
                    };
                } else {
                    return {
                        Success: false,
                        ResultCode: conditionResult ? "TRUE_ACTION_FAILED" : "FALSE_ACTION_FAILED",
                        Message: JSON.stringify({
                            message: `${conditionResult ? 'True' : 'False'} action failed`,
                            conditionResult: conditionResult,
                            actionName: actionConfig.ActionName,
                            actionError: actionResult.Message
                        }, null, 2)
                    };
                }

            } catch (error) {
                return {
                    Success: false,
                    Message: `Failed to execute action: ${error instanceof Error ? error.message : String(error)}`,
                    ResultCode: "ACTION_EXECUTION_ERROR"
                };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Conditional action failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "CONDITIONAL_FAILED"
            };
        }
    }

    /**
     * Evaluate condition safely
     */
    private evaluateCondition(condition: string, context: any, strictMode: boolean): boolean {
        // Create a safe evaluation context
        const safeContext = { ...context };
        
        // Build the evaluation function
        const functionBody = strictMode 
            ? `"use strict"; return (${condition});`
            : `return (${condition});`;

        // Create function with context variables
        const contextKeys = Object.keys(safeContext);
        const contextValues = contextKeys.map(key => safeContext[key]);
        
        try {
            const evaluator = new Function(...contextKeys, functionBody);
            const result = evaluator(...contextValues);
            
            // Ensure boolean result
            return Boolean(result);
        } catch (error) {
            throw new Error(`Invalid condition: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Prepare action configuration
     */
    private prepareActionConfig(actionConfig: any, context: any, passthroughContext: boolean): any {
        // Validate action config
        if (!actionConfig || typeof actionConfig !== 'object') {
            throw new Error('Invalid action configuration');
        }

        if (!actionConfig.ActionName) {
            throw new Error('Action configuration must include ActionName');
        }

        // Prepare parameters
        let preparedConfig = { ...actionConfig };

        if (passthroughContext && context) {
            // Merge context into action parameters
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

            // Merge context (context takes precedence over existing params)
            preparedConfig.Params = { ...preparedConfig.Params, ...context };
        }

        return preparedConfig;
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