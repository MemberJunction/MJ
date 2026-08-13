import { describe, it, expect, beforeEach } from 'vitest';
import { SafeExpressionEvaluator } from '../SafeExpressionEvaluator';

/**
 * Adversarial security tests for SafeExpressionEvaluator.
 *
 * SafeExpressionEvaluator compiles the caller's expression into a real JavaScript
 * function via `new Function(...)` and runs it. Its defense against arbitrary code
 * execution is a STRUCTURAL ALLOWLIST: the expression is parsed to an AST and every
 * node is checked against a whitelist before it is ever compiled. A construct that
 * is not on the list — computed member access with a non-literal key, `.constructor`
 * / `__proto__` access, any call outside the safe-method list, a host-global
 * identifier — is rejected at validation time and never reaches `new Function`.
 *
 * This is what closes the string-concatenation escape a textual denylist could not:
 * `[]["cons"+"tructor"]["cons"+"tructor"]("…")()` parses to computed member access
 * whose key is a `+` expression, not a literal, so it is rejected structurally no
 * matter how the dangerous name is spelled. See the "string-concatenation escape"
 * block below. Because the check is structural, it also stops over-rejecting data
 * that merely mentions a reserved word (`name == 'constructor'` is a legal compare).
 */
describe('SafeExpressionEvaluator - Security', () => {
  let evaluator: SafeExpressionEvaluator;

  beforeEach(() => {
    evaluator = new SafeExpressionEvaluator();
  });

  /** Assert an expression is rejected at the validation stage (never compiled/run). */
  const expectBlocked = (expr: string, ctx: Record<string, unknown> = {}): void => {
    const r = evaluator.evaluate(expr, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toContain('forbidden construct');
  };

  // ---------------------------------------------------------------
  // Direct code-execution primitives — denylist HOLDS
  // ---------------------------------------------------------------
  describe('direct eval / Function constructor (textual forms blocked)', () => {
    it('should block eval(...)', () => {
      expectBlocked("eval('1+1')");
    });

    it('should block new Function(...)', () => {
      expectBlocked("new Function('return 1')");
    });

    it('should block a bare Function(...) call', () => {
      expectBlocked("Function('return 1')()");
    });

    it('should block require(...)', () => {
      expectBlocked("require('child_process')");
    });

    it('should block import statements', () => {
      expectBlocked("import 'fs'");
    });
  });

  // ---------------------------------------------------------------
  // Prototype-chain escapes — denylist HOLDS
  // ---------------------------------------------------------------
  describe('prototype-chain escapes (blocked)', () => {
    it('should block .constructor access (dotted)', () => {
      expectBlocked('x.constructor', { x: 1 });
    });

    it('should block constructor.constructor (the classic Function-constructor climb)', () => {
      expectBlocked("x.constructor.constructor('return process')()", { x: 1 });
    });

    it('should block constructor via bracket string', () => {
      // The word-boundary denylist matches "constructor" even inside ["..."]
      expectBlocked('x["constructor"]', { x: 1 });
    });

    it('should block __proto__ access (dotted)', () => {
      expectBlocked('x.__proto__', { x: {} });
    });

    it('should block __proto__ via bracket string', () => {
      expectBlocked('x["__proto__"]', { x: {} });
    });

    it('should block prototype access', () => {
      expectBlocked('x.prototype', { x: {} });
    });
  });

  // ---------------------------------------------------------------
  // Dotted access to host globals — denylist HOLDS for the dotted form
  // ---------------------------------------------------------------
  describe('dotted host-global access (blocked)', () => {
    it('should block process.<member>', () => {
      expectBlocked('process.exit');
    });

    it('should block global.<member>', () => {
      expectBlocked('global.process');
    });

    it('should block window.<member>', () => {
      expectBlocked('window.location');
    });

    it('should block document.<member>', () => {
      expectBlocked('document.cookie');
    });
  });

  // ---------------------------------------------------------------
  // Statement / control-flow injection — denylist HOLDS
  // ---------------------------------------------------------------
  describe('statement and control-flow injection (blocked)', () => {
    it('should block semicolons (statement chaining)', () => {
      expectBlocked('a == 1; b == 2', { a: 1, b: 2 });
    });

    it('should block curly braces (code blocks)', () => {
      expectBlocked('{ a: 1 }', { a: 1 });
    });

    it('should block template literals', () => {
      expectBlocked('a == `x`', { a: 'x' });
    });

    it.each(['throw', 'try', 'catch', 'finally', 'async', 'await', 'class', 'extends', 'this'])(
      'should block the "%s" keyword',
      (keyword) => {
        expectBlocked(`${keyword} x`, { x: 1 });
      }
    );
  });

  // ---------------------------------------------------------------
  // Input-size guard (the one DoS-ish protection the code promises)
  // ---------------------------------------------------------------
  describe('input-size guard', () => {
    it('should reject expressions over 1000 characters', () => {
      const huge = 'a == 1 && '.repeat(150) + 'a == 1';
      const r = evaluator.evaluate(huge, { a: 1 });
      expect(r.success).toBe(false);
      expect(r.error).toContain('maximum length');
    });
  });

  // ---------------------------------------------------------------
  // Context sanitisation
  // ---------------------------------------------------------------
  describe('context sanitisation', () => {
    it('should drop a dangerous "eval" context key so compilation still succeeds', () => {
      // A parameter named "eval" is a SyntaxError inside the strict-mode compiled function,
      // so if createSafeContext did NOT strip it, evaluation would fail. Success here proves
      // the dangerous key was dropped before `new Function(...)` was built.
      const r = evaluator.evaluate('normal == 1', { eval: 99, normal: 1 });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('should drop a dangerous "constructor" context key and keep normal keys usable', () => {
      const r = evaluator.evaluate('normal == 1', { constructor: 99, normal: 1 });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });

  // ===============================================================
  // SANDBOX ESCAPE — bracket-string member access (now CLOSED)
  // ===============================================================
  //
  // The escape reached host globals two ways the old dotted/call rules missed:
  //   - the bare identifiers `globalThis` / `global` (host global object), and
  //   - BRACKET-STRING member access, e.g. globalThis["Function"] or globalThis["process"],
  //     which contains neither `Function(` nor `process.` and so slipped every rule.
  //
  // Because `new Function` runs in global scope, `globalThis`/`global` resolved to the real
  // host global, giving arbitrary code execution and `process` reachability:
  //
  //     globalThis["Function"]("<attacker JS>")()          // was: arbitrary code execution
  //     globalThis["process"]["mainModule"]["require"]("child_process")  // was: RCE gateway
  //
  // Fixed by denying the dangerous identifiers as WHOLE WORDS (\bglobalThis\b, \bglobal\b,
  // \bFunction\b, \bprocess\b, \beval\b, \brequire\b, …) — a bare-word match also catches the
  // bracket-string form. These tests pin that the route stays blocked.
  // ===============================================================
  describe('sandbox escape via bracket-string member access (blocked)', () => {
    it('blocks the bare `globalThis` host global', () => {
      expectBlocked('globalThis');
    });

    it('blocks the Function constructor reached via bracket string', () => {
      expectBlocked('globalThis["Function"]("return 40+2")() === 42');
    });

    it('blocks `process` reached via bracket string on globalThis', () => {
      expectBlocked('typeof globalThis["process"] === "object"');
    });

    it('blocks `process` reached via the bare `global` identifier', () => {
      expectBlocked('typeof global["process"] === "object"');
    });

    it('blocks chained bracket-string access to process internals', () => {
      expectBlocked('globalThis["process"]["version"].length > 0');
    });

    it('blocks single-segment dotted host global (globalThis.process)', () => {
      expectBlocked('globalThis.process');
    });
  });

  // ===============================================================
  // STRING-CONCATENATION ESCAPE — the route a textual denylist missed (blocked)
  // ===============================================================
  //
  // The prior whole-word denylist matched only literal tokens, so splitting a
  // dangerous name across a `+` expression spelled it nowhere in the source:
  //
  //     []["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()
  //
  // `[].constructor` is Array; `Array.constructor` is Function; the resulting
  // Function constructor runs in global scope and reaches `process`. The AST walk
  // rejects it because the computed member key is a `+` (BinaryExpression), not a
  // literal — no matter how the name is assembled.
  // ===============================================================
  describe('string-concatenation sandbox escape (blocked)', () => {
    it('blocks the Function-constructor climb built from split string literals', () => {
      expectBlocked('[]["cons"+"tructor"]["cons"+"tructor"]("return 1")()');
    });

    it('blocks a split-name computed member access on a context value', () => {
      expectBlocked('x["con"+"structor"]', { x: 1 });
    });

    it('blocks a split host-global name reached via computed access', () => {
      expectBlocked('({})["__pro"+"to__"]', {});
    });

    it('blocks any dynamic (non-literal) computed member key', () => {
      // Even a harmless-looking dynamic key is refused: dynamic keys are the escape surface.
      expectBlocked('x[y]', { x: { a: 1 }, y: 'a' });
    });

    it('blocks a parenthesized string key that resolves to a dangerous property', () => {
      expectBlocked('x[("constructor")]', { x: 1 });
    });
  });

  // ---------------------------------------------------------------
  // No over-blocking of harmless data — the structural allowlist fix
  // ---------------------------------------------------------------
  // The old denylist rejected any expression whose TEXT mentioned a reserved token,
  // even inside a string literal or as a field name. The AST walk distinguishes a
  // reserved word used as CODE (blocked) from the same characters used as DATA
  // (allowed), so these legitimate comparisons now succeed.
  describe('legitimate data that mentions reserved words (allowed)', () => {
    it('allows comparing a field against the literal string "constructor"', () => {
      const r = evaluator.evaluate('name == "constructor"', { name: 'constructor' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('allows comparing a field against the literal string "this"', () => {
      const r = evaluator.evaluate('label == "this"', { label: 'this' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('allows a `${...}` sequence inside a plain string literal', () => {
      const r = evaluator.evaluate("a == '${x}'", { a: '${x}' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('allows reading a context field whose name is a former reserved token', () => {
      // `payload.window` is a data field read, not host-global access.
      const r = evaluator.evaluate("payload.window == 'morning'", { payload: { window: 'morning' } });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });

    it('still allows words that merely contain a reserved token as a substring', () => {
      const r = evaluator.evaluate('label == "thistle"', { label: 'thistle' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });
});
