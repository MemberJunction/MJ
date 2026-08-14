import { describe, it, expect, beforeEach } from 'vitest';
import {
  SafeExpressionEvaluator,
  ExpressionEvaluationResult,
  defaultExpressionEvaluator,
} from '../SafeExpressionEvaluator';

/**
 * Functional tests for SafeExpressionEvaluator.
 *
 * These exercise the documented contract: evaluate a boolean expression against a
 * context object, returning an {@link ExpressionEvaluationResult}. Adversarial /
 * sandbox-escape scenarios live in SafeExpressionEvaluator.security.test.ts.
 */
describe('SafeExpressionEvaluator', () => {
  let evaluator: SafeExpressionEvaluator;

  beforeEach(() => {
    evaluator = new SafeExpressionEvaluator();
  });

  // ---------------------------------------------------------------
  // Simple comparisons over context data
  // ---------------------------------------------------------------
  describe('comparison operators', () => {
    it('should evaluate == to true when values match', () => {
      const r = evaluator.evaluate("status == 'active'", { status: 'active' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('should evaluate == to false when values differ', () => {
      const r = evaluator.evaluate("status == 'active'", { status: 'inactive' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(false);
    });

    it('should evaluate strict === correctly', () => {
      expect(evaluator.evaluate('count === 5', { count: 5 }).value).toBe(true);
      expect(evaluator.evaluate('count === 5', { count: 6 }).value).toBe(false);
    });

    it('should evaluate != and !==', () => {
      expect(evaluator.evaluate('count != 5', { count: 6 }).value).toBe(true);
      expect(evaluator.evaluate('count !== 5', { count: 5 }).value).toBe(false);
    });

    it('should evaluate <, >, <=, >=', () => {
      expect(evaluator.evaluate('n < 10', { n: 5 }).value).toBe(true);
      expect(evaluator.evaluate('n > 10', { n: 5 }).value).toBe(false);
      expect(evaluator.evaluate('n <= 5', { n: 5 }).value).toBe(true);
      expect(evaluator.evaluate('n >= 6', { n: 5 }).value).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Logical operators
  // ---------------------------------------------------------------
  describe('logical operators', () => {
    it('should evaluate && (AND)', () => {
      const ctx = { a: true, b: false };
      expect(evaluator.evaluate('a && b', ctx).value).toBe(false);
      expect(evaluator.evaluate('a && !b', ctx).value).toBe(true);
    });

    it('should evaluate || (OR)', () => {
      const ctx = { a: false, b: true };
      expect(evaluator.evaluate('a || b', ctx).value).toBe(true);
      expect(evaluator.evaluate('a || false', ctx).value).toBe(false);
    });

    it('should evaluate ! (NOT)', () => {
      expect(evaluator.evaluate('!isActive', { isActive: false }).value).toBe(true);
      expect(evaluator.evaluate('!isActive', { isActive: true }).value).toBe(false);
    });

    it('should combine comparisons with logical operators', () => {
      const ctx = { tier: 'premium', total: 1500 };
      const r = evaluator.evaluate("tier == 'premium' && total > 1000", ctx);
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Nested property + array access
  // ---------------------------------------------------------------
  describe('property and array access', () => {
    it('should resolve nested dot-notation properties', () => {
      const ctx = {
        payload: { customer: { tier: 'premium' }, order: { total: 1500 } },
      };
      const r = evaluator.evaluate(
        "payload.customer.tier == 'premium' && payload.order.total > 1000",
        ctx
      );
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('should resolve array index access', () => {
      const ctx = { items: [10, 20, 30] };
      expect(evaluator.evaluate('items[0] == 10', ctx).value).toBe(true);
      expect(evaluator.evaluate('items[2] > items[0]', ctx).value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Safe methods
  // ---------------------------------------------------------------
  describe('safe string/array methods', () => {
    it('should support .length', () => {
      expect(evaluator.evaluate('name.length > 3', { name: 'Alice' }).value).toBe(true);
      expect(evaluator.evaluate('name.length > 3', { name: 'Al' }).value).toBe(false);
    });

    it('should support .includes()', () => {
      expect(
        evaluator.evaluate("tags.includes('urgent')", { tags: ['work', 'urgent'] }).value
      ).toBe(true);
    });

    it('should support .startsWith() and .endsWith()', () => {
      const ctx = { code: 'AB-123' };
      expect(evaluator.evaluate("code.startsWith('AB')", ctx).value).toBe(true);
      expect(evaluator.evaluate("code.endsWith('123')", ctx).value).toBe(true);
    });

    it('should support .toLowerCase() in a comparison', () => {
      const r = evaluator.evaluate("name.toLowerCase() == 'alice'", { name: 'ALICE' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Array higher-order methods
  // ---------------------------------------------------------------
  describe('array higher-order methods', () => {
    interface PricedItem {
      price: number;
    }

    it('should support .some()', () => {
      const ctx: { items: PricedItem[] } = { items: [{ price: 50 }, { price: 150 }] };
      const r = evaluator.evaluate('items.some(item => item.price > 100)', ctx);
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('should support .every()', () => {
      const ctx: { items: PricedItem[] } = { items: [{ price: 50 }, { price: 150 }] };
      expect(evaluator.evaluate('items.every(item => item.price > 0)', ctx).value).toBe(true);
      expect(evaluator.evaluate('items.every(item => item.price > 100)', ctx).value).toBe(false);
    });

    it('should support .filter().length', () => {
      const ctx: { items: PricedItem[] } = {
        items: [{ price: 50 }, { price: 150 }, { price: 200 }],
      };
      const r = evaluator.evaluate('items.filter(item => item.price > 100).length == 2', ctx);
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // typeof
  // ---------------------------------------------------------------
  describe('typeof', () => {
    it('should evaluate typeof checks', () => {
      expect(evaluator.evaluate("typeof name == 'string'", { name: 'x' }).value).toBe(true);
      expect(evaluator.evaluate("typeof count == 'number'", { count: 5 }).value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Edge values: null / undefined / empty
  // ---------------------------------------------------------------
  describe('edge values', () => {
    it('should compare against null', () => {
      expect(evaluator.evaluate('x == null', { x: null }).value).toBe(true);
      expect(evaluator.evaluate('x === null', { x: null }).value).toBe(true);
    });

    it('should treat missing property (undefined) loosely equal to null', () => {
      const ctx: { obj: Record<string, unknown> } = { obj: {} };
      // obj.missing is undefined; undefined == null is true in JS
      expect(evaluator.evaluate('obj.missing == null', ctx).value).toBe(true);
    });

    it('should coerce a truthy non-boolean result via Boolean()', () => {
      // The evaluator wraps the expression in Boolean(...): a bare truthy string yields true
      const r = evaluator.evaluate('name', { name: 'non-empty' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('should coerce an empty-string result to false', () => {
      const r = evaluator.evaluate('name', { name: '' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(false);
    });

    it('should handle an empty context object with a self-contained expression', () => {
      const r = evaluator.evaluate('1 < 2', {});
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Error paths for malformed / invalid input
  // ---------------------------------------------------------------
  describe('error handling', () => {
    it('should fail on an empty expression', () => {
      const r = evaluator.evaluate('', { a: 1 });
      expect(r.success).toBe(false);
      expect(r.error).toContain('non-empty string');
    });

    it('should evaluate a whitespace-only expression to false (Boolean() of no argument)', () => {
      // A non-empty but whitespace-only string passes validation and compiles to
      // `Boolean(   )`, which is Boolean() === false — so it succeeds with value false.
      const r = evaluator.evaluate('   ', { a: 1 });
      expect(r.success).toBe(true);
      expect(r.value).toBe(false);
    });

    it('should fail on unbalanced parentheses', () => {
      const r = evaluator.evaluate('(a > 1', { a: 5 });
      expect(r.success).toBe(false);
      expect(r.error).toContain('Unbalanced parentheses');
    });

    it('should fail on a closing paren before an opening paren', () => {
      const r = evaluator.evaluate('a > 1)', { a: 5 });
      expect(r.success).toBe(false);
      expect(r.error).toContain('Unbalanced parentheses');
    });

    it('should fail on a syntactically malformed expression', () => {
      const r = evaluator.evaluate('a ===', { a: 1 });
      expect(r.success).toBe(false);
      expect(r.error).toBeDefined();
    });

    it('should fail when referencing an unknown identifier not in context', () => {
      const r = evaluator.evaluate('missingVar > 1', { a: 1 });
      expect(r.success).toBe(false);
      expect(r.error).toContain('Expression evaluation failed');
    });

    it('should fail when the expression exceeds the 1000-character limit', () => {
      const long = '1 == 1 && '.repeat(200) + '1 == 1'; // well over 1000 chars
      const r = evaluator.evaluate(long, {});
      expect(r.success).toBe(false);
      expect(r.error).toContain('maximum length');
    });

    it('should fail when a context key is not a valid JS identifier', () => {
      // Context keys become Function parameter names; "my-key" is not a valid identifier.
      const ctx: Record<string, unknown> = { 'my-key': 1 };
      const r = evaluator.evaluate('1 == 1', ctx);
      expect(r.success).toBe(false);
      expect(r.error).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------
  describe('diagnostics', () => {
    it('should omit diagnostics by default', () => {
      const r = evaluator.evaluate('a == 1', { a: 1 });
      expect(r.diagnostics).toBeUndefined();
    });

    it('should include diagnostics when enabled on success', () => {
      const r = evaluator.evaluate('a == 1', { a: 1 }, true);
      expect(r.diagnostics).toBeDefined();
      expect(r.diagnostics?.expression).toBe('a == 1');
      expect(r.diagnostics?.context).toEqual({ a: 1 });
      expect(typeof r.diagnostics?.evaluationTime).toBe('number');
    });

    it('should include diagnostics when enabled on failure', () => {
      const r = evaluator.evaluate('', { a: 1 }, true);
      expect(r.success).toBe(false);
      expect(r.diagnostics).toBeDefined();
      expect(r.diagnostics?.expression).toBe('');
    });
  });

  // ---------------------------------------------------------------
  // Caching behaviour (observable: repeated evals stay consistent)
  // ---------------------------------------------------------------
  describe('compiled-expression cache', () => {
    it('should return consistent results across repeated evaluations of the same expression', () => {
      const first = evaluator.evaluate('a > 1', { a: 5 });
      const second = evaluator.evaluate('a > 1', { a: 5 });
      expect(first.value).toBe(true);
      expect(second.value).toBe(true);
    });

    it('should honour different context values on a cached expression', () => {
      // Same expression + same context keys -> cache hit, but different values must still be applied
      expect(evaluator.evaluate('a > 1', { a: 5 }).value).toBe(true);
      expect(evaluator.evaluate('a > 1', { a: 0 }).value).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // evaluateMultiple
  // ---------------------------------------------------------------
  describe('evaluateMultiple', () => {
    it('should evaluate several named expressions against one context', () => {
      const results: Record<string, ExpressionEvaluationResult> = evaluator.evaluateMultiple(
        [
          { expression: 'a > 1', name: 'aPositive' },
          { expression: "b == 'x'", name: 'bIsX' },
        ],
        { a: 5, b: 'x' }
      );
      expect(results.aPositive.value).toBe(true);
      expect(results.bIsX.value).toBe(true);
    });

    it('should key unnamed expressions by index', () => {
      const results = evaluator.evaluateMultiple([{ expression: 'a > 1' }], { a: 5 });
      expect(results.expression_0.value).toBe(true);
    });

    it('should report per-expression failures independently', () => {
      const results = evaluator.evaluateMultiple(
        [
          { expression: 'a > 1', name: 'ok' },
          { expression: 'a ===', name: 'broken' },
        ],
        { a: 5 }
      );
      expect(results.ok.success).toBe(true);
      expect(results.broken.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Safe globals — the shapes authored specs write
  // ---------------------------------------------------------------
  describe('safe global calls', () => {
    // `condition-roots.ts` blesses these twelve names at the task-graph door, and
    // `1efc248ac5` shipped that decision precisely because refusing them rejects specs
    // that run correctly. Receiver and method are both fixed identifiers, so nothing
    // here is reachable by string assembly.
    const ctx = { payload: { count: 4, raw: '7', id: 42 }, output: { delta: -3 } };

    it.each([
      ['Math.abs(output.delta) < 5', true],
      ['Math.max(payload.count, 9) === 9', true],
      ['Number(payload.count) > 3', true],
      ['String(payload.id).length > 0', true],
      ['Boolean(payload.count) === true', true],
      ['Array.isArray(output) === false', true],
      ['Object.keys(payload).length > 0', true],
      ["JSON.stringify(payload) !== ''", true],
      ['Date.now() > 0', true],
      ['parseInt(payload.raw) > 0', true],
      ['parseFloat(payload.raw) === 7', true],
      ['isNaN(payload.count) === false', true],
      ['isFinite(payload.count) === true', true],
      ['Number.isInteger(payload.count)', true],
    ])('should evaluate %s', (expression, expected) => {
      const r = evaluator.evaluate(expression, ctx);
      expect(r.error).toBeUndefined();
      expect(r.value).toBe(expected);
    });

    it('should reject a namespace method that is not on the list', () => {
      // Mutators stay out even on an allowed namespace.
      const r = evaluator.evaluate('Object.assign(payload) !== null', ctx);
      expect(r.success).toBe(false);
      expect(r.error).toContain('forbidden construct');
    });

    it('should reject a global that is not on the list', () => {
      expect(evaluator.evaluate('Symbol("x") !== null', {}).success).toBe(false);
      expect(evaluator.evaluate('fetch("/x") !== null', {}).success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Optional chaining
  // ---------------------------------------------------------------
  describe('optional chaining', () => {
    it('should read through a present chain', () => {
      const r = evaluator.evaluate("payload?.customer?.tier == 'premium'", {
        payload: { customer: { tier: 'premium' } },
      });
      expect(r.value).toBe(true);
    });

    it('should short-circuit on an absent link rather than throwing', () => {
      const r = evaluator.evaluate("payload?.customer?.tier == 'premium'", { payload: {} });
      expect(r.success).toBe(true);
      expect(r.value).toBe(false);
    });

    it('should apply the same rules to an optional index and an optional call', () => {
      expect(evaluator.evaluate('items?.[0]?.price > 100', { items: [{ price: 150 }] }).value).toBe(true);
      expect(evaluator.evaluate("name?.toLowerCase() == 'ada'", { name: 'Ada' }).value).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Default exported instance
  // ---------------------------------------------------------------
  describe('defaultExpressionEvaluator', () => {
    it('should be a usable SafeExpressionEvaluator instance', () => {
      expect(defaultExpressionEvaluator).toBeInstanceOf(SafeExpressionEvaluator);
      expect(defaultExpressionEvaluator.evaluate('1 == 1', {}).value).toBe(true);
    });
  });
});
