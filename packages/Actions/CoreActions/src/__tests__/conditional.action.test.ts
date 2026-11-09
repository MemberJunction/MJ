/**
 * Conditional evaluates a condition the caller wrote, against a context the caller supplied. It
 * must never hand that text to JavaScript unscreened: there, `x['constructor']['constructor']`
 * reaches the Function constructor. Conditions go through SafeExpressionEvaluator, which parses the
 * text and admits only an allowlist of constructs.
 *
 * Every condition below is harmless. The constructor case computes 6*7 if it gets through.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: { Instance: { RunAction: vi.fn() } },
}));

import { ConditionalAction } from '../custom/workflow/conditional.action';

type Param = { Name: string; Type: 'Input' | 'Output'; Value: unknown };
type Result = { Success: boolean; ResultCode: string; Message?: string };
type Runnable = { InternalRunAction(params: { Params: Param[] }): Promise<Result> };

function evaluate(condition: string, context: Record<string, unknown>): Promise<Result> {
    const action = new ConditionalAction() as unknown as Runnable;
    return action.InternalRunAction({
        Params: [
            { Name: 'Condition', Type: 'Input', Value: condition },
            { Name: 'Context', Type: 'Input', Value: context },
        ],
    });
}

describe('Conditional', () => {
    describe('refuses conditions that reach the Function constructor', () => {
        it.each([
            // The bracket-with-spaces form passed the old denylist and evaluated to true.
            ["x[ 'constructor' ][ 'constructor' ]( 'ret'+'urn 6*7 === 42' )()"],
            ["x['con' + 'structor']"],
            ['x.constructor'],
            ['Function("return 6*7")()'],
        ])('refuses %s', async (condition) => {
            const result = await evaluate(condition, { x: 'a' });

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_CONDITION');
        });
    });

    describe('evaluates conditions', () => {
        it.each([
            ['value > 100', { value: 150 }, 'CONDITION_TRUE'],
            ['value > 100', { value: 50 }, 'CONDITION_FALSE'],
            ['user.role === "admin" && value > 100', { user: { role: 'admin' }, value: 150 }, 'CONDITION_TRUE'],
            ['items.some(i => i.price > 100)', { items: [{ price: 50 }, { price: 150 }] }, 'CONDITION_TRUE'],
        ])('%s with %j is %s', async (condition, context, expected) => {
            const result = await evaluate(condition, context);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe(expected);
        });

        it('reports a condition that fails at run time', async () => {
            const result = await evaluate('missing.value > 1', {});

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('CONDITION_ERROR');
        });

        it('requires a condition', async () => {
            const result = await evaluate('', {});

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_CONDITION');
        });
    });
});
