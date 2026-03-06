import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that evaluates mathematical expressions safely using JavaScript's built-in math functions.
 * Supports basic arithmetic operations, parentheses, and common math functions.
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

            const expression = expressionParam.Value.trim();

            // Validate the expression doesn't contain dangerous code
            if (this.containsDangerousCode(expression)) {
                return {
                    Success: false,
                    Message: "Expression contains invalid or potentially dangerous code",
                    ResultCode: "INVALID_EXPRESSION"
                };
            }

            // Create a safe evaluation context with math functions
            const mathContext = {
                // Basic math functions
                abs: Math.abs,
                acos: Math.acos,
                asin: Math.asin,
                atan: Math.atan,
                atan2: Math.atan2,
                ceil: Math.ceil,
                cos: Math.cos,
                exp: Math.exp,
                floor: Math.floor,
                log: Math.log,
                log10: Math.log10,
                max: Math.max,
                min: Math.min,
                pow: Math.pow,
                random: Math.random,
                round: Math.round,
                sin: Math.sin,
                sqrt: Math.sqrt,
                tan: Math.tan,
                // Constants
                E: Math.E,
                PI: Math.PI,
                // Additional useful functions
                sign: Math.sign,
                trunc: Math.trunc,
                cbrt: Math.cbrt,
                log2: Math.log2,
                // Hyperbolic functions
                sinh: Math.sinh,
                cosh: Math.cosh,
                tanh: Math.tanh
            };

            // Prepare the expression by replacing math function names
            let safeExpression = expression;
            
            // Replace common math notations
            safeExpression = safeExpression.replace(/\^/g, '**'); // Replace ^ with ** for exponentiation
            
            // Create the evaluation function
            const evalFunction = new Function(...Object.keys(mathContext), `
                "use strict";
                try {
                    return (${safeExpression});
                } catch (e) {
                    throw new Error('Invalid expression: ' + e.message);
                }
            `);

            // Evaluate the expression
            const result = evalFunction(...Object.values(mathContext));

            // Check if result is a valid number
            if (typeof result !== 'number' || isNaN(result)) {
                return {
                    Success: false,
                    Message: "Expression did not evaluate to a valid number",
                    ResultCode: "INVALID_EXPRESSION"
                };
            }

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
     * Checks if the expression contains potentially dangerous code patterns
     */
    private containsDangerousCode(expression: string): boolean {
        // List of dangerous patterns to block
        const dangerousPatterns = [
            /import\s/i,
            /require\s*\(/i,
            /eval\s*\(/i,
            /function\s*\(/i,
            /=>/,
            /new\s+/i,
            /\.\s*constructor/i,
            /\[["'`].*["'`]\]/,  // Array access with strings
            /process\./i,
            /global\./i,
            /window\./i,
            /document\./i,
            /console\./i,
            /alert\s*\(/i,
            /prompt\s*\(/i,
            /confirm\s*\(/i,
            /while\s*\(/i,
            /for\s*\(/i,
            /do\s*{/i,
            /if\s*\(/i,
            /else/i,
            /return/i,
            /throw/i,
            /try/i,
            /catch/i,
            /finally/i,
            /await/i,
            /async/i,
            /class\s/i,
            /extends/i,
            /\${/,  // Template literals
            /`/,    // Backticks
            /;/,    // Semicolons (prevent multiple statements)
            /{/,    // Curly braces (prevent code blocks)
            /}/,
        ];

        return dangerousPatterns.some(pattern => pattern.test(expression));
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