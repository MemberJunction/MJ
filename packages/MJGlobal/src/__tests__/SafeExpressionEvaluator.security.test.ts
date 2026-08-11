import { describe, it, expect, beforeEach } from 'vitest';
import { SafeExpressionEvaluator } from '../SafeExpressionEvaluator';

/**
 * Adversarial security tests for SafeExpressionEvaluator.
 *
 * SafeExpressionEvaluator compiles the caller's expression into a real JavaScript
 * function via `new Function(...)` and runs it. Its ONLY defense against arbitrary
 * code execution is a regular-expression denylist (DANGEROUS_PATTERNS) plus a
 * property-name filter on the context object. This suite documents, with evidence:
 *
 *   (a) which attacks the denylist stops (the promises the code keeps), and
 *   (b) the former bracket-string sandbox-escape route (globalThis["Function"](...)),
 *       now CLOSED by denying the dangerous identifiers as whole words — see the
 *       "SANDBOX ESCAPE — bracket-string member access" block below.
 *
 * The escape tests assert the route is BLOCKED; they are regression guards that the
 * hole stays closed. Any weakening of the denylist will surface here as a failure.
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

    it('should block template-expression syntax ${...}', () => {
      // ${ can never appear without a { , so the curly-brace rule fires first; either way it is rejected.
      expectBlocked("a == '${x}'", { a: 'x' });
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

  // ---------------------------------------------------------------
  // Denylist over-blocking (false positives) — a usability limitation
  // ---------------------------------------------------------------
  describe('denylist over-blocking (false positives)', () => {
    it('should (over-)reject comparing against the literal string "constructor"', () => {
      // Harmless data comparison, but "constructor" as a token is denied even inside a string literal.
      expectBlocked('name == "constructor"', { name: 'a' });
    });

    it('should (over-)reject comparing against the literal string "this"', () => {
      expectBlocked('label == "this"', { label: 'a' });
    });

    it('should still allow words that merely contain a reserved token as a substring', () => {
      // "thistle" contains "this" but not as a whole word, so the \bthis\b boundary spares it.
      const r = evaluator.evaluate('label == "thistle"', { label: 'thistle' });
      expect(r.success).toBe(true);
      expect(r.value).toBe(true);
    });
  });
});
