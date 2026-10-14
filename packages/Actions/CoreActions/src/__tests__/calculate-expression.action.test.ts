/**
 * Calculate Expression evaluates text the caller wrote. It must never hand that text to JavaScript:
 * in JavaScript, a property read such as `abs['constructor']` reaches the Function constructor, and
 * from there any code at all. The action evaluates with a math parser that accepts numbers,
 * arithmetic operators and a fixed list of math functions and constants, and nothing else.
 *
 * Every expression below is harmless. The constructor cases compute 6*7 if they get through.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

import { CalculateExpressionAction } from '../custom/demo/calculate-expression.action';

type Result = { Success: boolean; ResultCode: string; Message?: string };
type Runnable = { InternalRunAction(params: { Params: Array<{ Name: string; Type: 'Input'; Value: string }> }): Promise<Result> };

function calculate(expression: string): Promise<Result> {
    const action = new CalculateExpressionAction() as unknown as Runnable;
    return action.InternalRunAction({ Params: [{ Name: 'Expression', Type: 'Input', Value: expression }] });
}

/** The numeric result inside a successful run's JSON message. */
function valueOf(result: Result): number {
    const message: { details: { result: number } } = JSON.parse(result.Message ?? '{}');
    return message.details.result;
}

describe('Calculate Expression', () => {
    describe('refuses expressions that reach the Function constructor', () => {
        it.each([
            // The bracket-with-spaces form passed the old denylist and evaluated to 42.
            ["abs[ 'constructor' ]( 'ret'+'urn 6*7' )()"],
            ["abs[ 'constructor' ]( 'ret'+'urn 6*7' )"],
            ['abs["constructor"]("return 6*7")'],
            ['abs.constructor'],
            ["sqrt['con' + 'structor']"],
        ])('refuses %s', async (expression) => {
            const result = await calculate(expression);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_EXPRESSION');
            expect(result.Message).not.toContain('42');
        });
    });

    describe('refuses anything that is not arithmetic', () => {
        it.each([
            ['config({number: "BigNumber"})'],
            ['evaluate("6*7")'],
            ['x = 5'],
            ['f(x) = x^2'],
            ['[1, 2, 3]'],
            ['"text"'],
            ['undefinedName + 1'],
            ['sqrt(4); 2'],
        ])('refuses %s', async (expression) => {
            const result = await calculate(expression);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_EXPRESSION');
        });
    });

    describe('evaluates arithmetic', () => {
        it.each([
            ['(2 * 3) + 4 / 15', 6.266666666666667],
            ['sqrt(16) + pow(2, 3) + sin(PI/2)', 13],
            ['2^3', 8],
            ['2 ** 3', 8],
            ['10 % 3', 1],
            ['-abs(-5) + max(1, 2, 3)', -2],
            ['log(E) + floor(2.7) + ceil(2.1)', 6],
            ['trunc(-2.7)', -2],
            ['Math.sqrt(16) + Math.PI - PI', 4],
        ])('%s = %d', async (expression, expected) => {
            const result = await calculate(expression);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(valueOf(result)).toBeCloseTo(expected, 12);
        });

        it('refuses a result that is not a number', async () => {
            const result = await calculate('sqrt(-1)');

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_EXPRESSION');
        });

        it('requires an expression', async () => {
            const result = await calculate('');

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETERS');
        });
    });
});
