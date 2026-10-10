import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { SafeMathEvaluator } from "../utilities/safe-math-evaluator";

/**
 * Action that evaluates mathematical expressions: arithmetic, parentheses, and common math functions
 * and constants. The expression is parsed as math, never run as JavaScript — see {@link SafeMathEvaluator}.
 * 
 * @example
 * ```typescript
 * // Simple arithmetic
 * await runAction({
 *   ActionName: 'Calculate Expression',
 *   Params: [{
 *     Name: 'Expression',
 *     Value: '(2 * 3) + 4 / 15'
 *   }]
 * });
 * 
 * // Using math functions
 * await runAction({
 *   ActionName: 'Calculate Expression',
 *   Params: [{
 *     Name: 'Expression',
 *     Value: 'sqrt(16) + pow(2, 3) + sin(PI/2)'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__CalculateExpression")
export class CalculateExpressionAction extends BaseAction {
    /**
     * Executes the calculation for the provided mathematical expression
     * 
     * @param params - The action parameters containing:
     *   - Expression: A mathematical expression to evaluate
     * 
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if calculation was successful
     *   - ResultCode: "SUCCESS", "INVALID_EXPRESSION", or "FAILED"
     *   - ResultData: Object containing the result and formatted expression
     *   - Message: Error message if failed
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const expressionParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'expression');

            if (!expressionParam || !expressionParam.Value) {
                return {
                    Success: false,
                    Message: "Expression parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const expression = String(expressionParam.Value).trim();
            const result = new SafeMathEvaluator().Evaluate(expression);

            const resultData = {
                expression: expression,
                result: result,
                formattedResult: this.formatNumber(result),
                isInteger: Number.isInteger(result),
                scientificNotation: result.toExponential(),
                evaluatedAt: new Date().toISOString()
            };

            // Include both the simple message and the full result data
            const message = {
                summary: `${expression} = ${this.formatNumber(result)}`,
                details: resultData
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(message, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to calculate expression: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "INVALID_EXPRESSION"
            };
        }
    }

    /**
     * Formats a number for display, handling very large/small numbers appropriately
     */
    private formatNumber(num: number): string {
        if (Number.isInteger(num) && num >= -1e15 && num <= 1e15) {
            return num.toString();
        } else if (Math.abs(num) < 1e-6 || Math.abs(num) > 1e15) {
            return num.toExponential(6);
        } else {
            // Round to 10 decimal places and remove trailing zeros
            return parseFloat(num.toFixed(10)).toString();
        }
    }
}