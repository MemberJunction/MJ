/**
 * Execute Code Action
 *
 * Thin wrapper action that exposes code execution capabilities to AI agents and workflows.
 * Delegates all logic to CodeExecutionService following MJ's pattern of Actions as boundaries.
 *
 * @module @memberjunction/core-actions
 */

import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';
import {
    CodeExecutionService,
    CodeExecutionParams,
    CodeExecutionResult
} from '@memberjunction/code-execution';
import { LogError } from '@memberjunction/core';

/**
 * Action for executing JavaScript code in a sandboxed environment
 *
 * This is a THIN WRAPPER - all core logic lives in CodeExecutionService.
 * The action's job is simply to:
 * 1. Extract parameters from the action interface
 * 2. Delegate to CodeExecutionService
 * 3. Map results back to ActionResultSimple
 *
 * Security is enforced entirely by CodeExecutionService.
 *
 * @example Agent usage:
 * ```json
 * {
 *   "type": "Action",
 *   "action": {
 *     "name": "Execute Code",
 *     "params": {
 *       "code": "const sum = input.values.reduce((a,b) => a+b, 0); output = sum;",
 *       "language": "javascript",
 *       "inputData": "{\"values\": [1,2,3,4,5]}"
 *     }
 *   }
 * }
 * ```
 */
@RegisterClass(BaseAction, "__ExecuteCode")
export class ExecuteCodeAction extends BaseAction {
    /**
     * Execute the action by delegating to CodeExecutionService
     *
     * @param params - Action parameters including code, language, inputData
     * @returns ActionResultSimple with execution results or errors
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Extract parameters (this is all the action does besides delegation)
            const code = this.getStringParam(params, "code");
            const language = this.getStringParam(params, "language", "javascript") as 'javascript';
            const inputDataStr = this.getStringParam(params, "inputData");
            const timeout = this.getNumericParam(params, "timeout", 30);
            const memoryLimit = this.getNumericParam(params, "memoryLimit", 128);

            // Validate required parameters
            if (!code) {
                return {
                    Success: false,
                    ResultCode: "MISSING_CODE",
                    Message: "Parameter 'code' is required"
                };
            }

            // Parse input data if provided
            let inputData: any = undefined;
            if (inputDataStr) {
                try {
                    inputData = JSON.parse(inputDataStr);
                } catch (parseError) {
                    return {
                        Success: false,
                        ResultCode: "INVALID_INPUT_DATA",
                        Message: `Failed to parse inputData as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
                    };
                }
            }

            // 2. Delegate to service (DIRECT IMPORT - not another action!)
            const executionService = new CodeExecutionService();

            const executionParams: CodeExecutionParams = {
                code,
                language,
                inputData,
                timeoutSeconds: timeout,
                memoryLimitMB: memoryLimit
            };

            const result: CodeExecutionResult = await executionService.execute(executionParams);

            // 3. Map results to action format
            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: result.errorType || "EXECUTION_FAILED",
                    Message: result.error || "Code execution failed"
                };
            }

            // Add output parameters for agents to use
            if (result.output !== undefined) {
                this.addOutputParam(params, "output", result.output);
            }
            if (result.logs && result.logs.length > 0) {
                this.addOutputParam(params, "logs", result.logs);
            }
            if (result.executionTimeMs !== undefined) {
                this.addOutputParam(params, "executionTimeMs", result.executionTimeMs);
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    output: result.output,
                    logs: result.logs,
                    executionTimeMs: result.executionTimeMs
                })
            };

        } catch (error) {
            LogError(`Error in ExecuteCodeAction: ${error}`);
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Helper to get string parameter from action params
     * @private
     */
    private getStringParam(params: RunActionParams, name: string, defaultValue?: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : defaultValue;
    }

    /**
     * Helper to get numeric parameter from action params
     * @private
     */
    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Helper to add output parameter to action results
     * @private
     */
    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: "Output",
            Value: value
        });
    }
}