/**
 * `validateSyntax` — checking that an expression *could* run, without running it.
 *
 * The distinction this draws is the whole point. `evaluate` reports two unrelated problems the same
 * way: given an empty context, `payload.x > 1` fails with "payload is not defined" exactly as
 * `payload.x >` fails with "Unexpected token". One is a typo; the other is a perfectly good
 * condition that simply has no data yet. Anything built on `evaluate` to check authoring-time
 * correctness therefore refuses every legitimate reference — which is the bug this method exists to
 * make impossible.
 *
 * So the accept-list below matters more than the refuse-list: each entry is a shape somebody has
 * already written, and over-refusing breaks saving work that runs fine.
 */
import { describe, it, expect } from 'vitest';
import { SafeExpressionEvaluator } from '../SafeExpressionEvaluator';

const evaluator = new SafeExpressionEvaluator();

describe('validateSyntax — parses without evaluating', () => {
    it.each([
        ['payload.x > 1', 'an identifier that will only exist at runtime'],
        ['payload.x.y === \'a\'', 'a chain one property deeper than the envelope'],
        ['payload.title.includes(\'x\')', 'a method call on a value we cannot see yet'],
        ['stepResult.step === \'Success\'', 'the flow dialect'],
        ['unknownVar === 1', 'an identifier in no dialect at all — D2 may yet add it'],
        ['succeeded', 'the shortest legal condition there is'],
        ['output.count > 0 && !failed', 'operators either dialect uses'],
    ])('accepts %s (%s)', (expression) => {
        expect(evaluator.validateSyntax(expression)).toEqual({ Valid: true });
    });

    it.each([
        ['payload.x >', 'a comparison with nothing on the right'],
        ['foo(', 'an unclosed call'],
        ['(payload.x > 1', 'unbalanced parentheses'],
        ['payload.x > 1)', 'a stray closer'],
        ['a ==== b', 'an operator that does not exist'],
    ])('refuses %s (%s)', (expression) => {
        const verdict = evaluator.validateSyntax(expression);
        expect(verdict.Valid).toBe(false);
        expect(verdict.Error).toBeTruthy();
    });

    it('refuses what the runtime would refuse anyway, rather than letting it hold forever', () => {
        // These are policy, not grammar — but the evaluator rejects them at run time, so the edge
        // would hold on every poll for the life of the graph. Better said now.
        expect(evaluator.validateSyntax('a; b').Valid).toBe(false);
        expect(evaluator.validateSyntax('this.x').Valid).toBe(false);
        expect(evaluator.validateSyntax('x.constructor').Valid).toBe(false);
    });

    it('never runs the expression it is checking', () => {
        // The guarantee that makes compile-don't-execute safe. If validation invoked the body, a
        // condition would have side effects at SAVE time — on somebody else's machine.
        let touched = false;
        const globalScope = globalThis as unknown as Record<string, unknown>;
        globalScope.__mjConditionProbe = () => { touched = true; return true; };
        try {
            evaluator.validateSyntax('__mjConditionProbe()');
            expect(touched).toBe(false);
        } finally {
            delete globalScope.__mjConditionProbe;
        }
    });
});
