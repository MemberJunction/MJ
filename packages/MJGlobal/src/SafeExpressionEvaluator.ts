/**
 * @fileoverview Safe expression evaluator for conditional logic in MemberJunction.
 *
 * This module provides a secure way to evaluate boolean expressions against
 * context objects without allowing arbitrary code execution. It supports
 * dot notation for nested property access and common comparison operations.
 *
 * @module @memberjunction/global
 * @author MemberJunction.com
 * @since 2.76.0
 */

import { parse } from 'acorn';
import type {
    Node,
    Program,
    ExpressionStatement,
    Literal,
    Identifier,
    MemberExpression,
    CallExpression,
    ArrowFunctionExpression,
    BinaryExpression,
    LogicalExpression,
    UnaryExpression,
    ConditionalExpression,
    ArrayExpression,
    ChainExpression,
    Expression,
    Super,
} from 'acorn';
import { MJLruCache } from './MJLruCache';

/**
 * Namespace globals whose listed methods a condition may CALL, keyed by namespace name.
 *
 * Both halves of `Math.abs(x)` are fixed identifiers in the AST, so admitting them adds no dynamic
 * lookup: the four invariants that close the sandbox escape — literal-only computed keys, no
 * `constructor`/`__proto__`/`prototype`, a closed non-computed call surface with no
 * `call`/`apply`/`bind`, and screened free identifiers — are all untouched by this list.
 *
 * Every entry is a pure value function. `Math.random` is deliberately absent (a condition that
 * evaluates differently on each run is not a guard), as are `Object.assign`,
 * `Object.defineProperty` and `Object.setPrototypeOf`, which mutate.
 */
export const SAFE_GLOBAL_NAMESPACE_METHODS: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([
    ['Math', new Set([
        'abs', 'ceil', 'floor', 'round', 'trunc', 'sign', 'min', 'max',
        'pow', 'sqrt', 'cbrt', 'log', 'log2', 'log10', 'exp', 'hypot',
    ])],
    ['JSON', new Set(['parse', 'stringify'])],
    ['Object', new Set(['keys', 'values', 'entries'])],
    ['Array', new Set(['isArray'])],
    ['Number', new Set(['isInteger', 'isFinite', 'isNaN', 'isSafeInteger', 'parseInt', 'parseFloat'])],
    ['Date', new Set(['now'])],
]);

/**
 * Global functions a condition may call by bare name — the coercions and numeric predicates that
 * authored specs use (`Number(payload.count) > 3`, `isNaN(payload.count)`).
 */
export const SAFE_GLOBAL_CALLABLES: ReadonlySet<string> = new Set([
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Number', 'String', 'Boolean',
]);

/**
 * Every global name a condition may reference, as a namespace or as a bare callable.
 *
 * **This is the single source of truth for the ambient globals of the condition dialect.** It lives
 * beside the policy screen that enforces it so a caller validating conditions ahead of evaluation
 * (`ai-core-plus`'s task-graph door) cannot bless a name the runtime would refuse — the failure mode
 * that shipped once already, where the door's own list and the evaluator disagreed silently.
 */
export const SAFE_EXPRESSION_GLOBALS: ReadonlySet<string> = new Set([
    ...SAFE_GLOBAL_NAMESPACE_METHODS.keys(),
    ...SAFE_GLOBAL_CALLABLES,
]);

/**
 * Result of expression evaluation including success status and diagnostics
 */
export interface ExpressionEvaluationResult {
    success: boolean;
    value?: boolean;
    error?: string;
    diagnostics?: {
        expression: string;
        context: Record<string, any>;
        evaluationTime: number;
    };
}

/**
 * Safe expression evaluator that prevents arbitrary code execution while
 * supporting common boolean expressions and property access patterns.
 *
 * Supported operations:
 * - Comparison: ==, ===, !=, !==, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Property access: dot notation (e.g., payload.customer.name), including optional chaining (`?.`)
 * - Array access: bracket notation with a literal index/key (e.g., items[0])
 * - Safe methods: .length, .includes(), .startsWith(), .endsWith()
 * - Array methods: .some(), .every(), .find(), .filter()
 * - Safe globals: the namespaces and bare callables in {@link SAFE_EXPRESSION_GLOBALS}
 *   (e.g. `Math.abs(output.delta) < 5`, `Number(payload.count) > 3`, `Object.keys(payload).length`)
 * - Type checking: typeof
 *
 * Safety is enforced by parsing the expression to an AST and walking it against
 * an ALLOWLIST of node types before it is compiled — an unlisted construct
 * (computed member access with a non-literal key, `.constructor`/`__proto__`
 * access, any call outside the safe-method and safe-global lists, host-global
 * identifiers, etc.) is rejected at validation time and never reaches the compiler. A structural
 * allowlist cannot be defeated by string concatenation the way a textual
 * denylist can, and it does not over-reject data that merely mentions a reserved
 * word (e.g. `name == 'constructor'` is a legal comparison).
 *
 * @class SafeExpressionEvaluator
 *
 * @example
 * ```typescript
 * const evaluator = new SafeExpressionEvaluator();
 *
 * // Simple comparison
 * const result1 = evaluator.evaluate(
 *   "status == 'active'",
 *   { status: 'active' }
 * );
 *
 * // Nested property access
 * const result2 = evaluator.evaluate(
 *   "payload.customer.tier == 'premium' && payload.order.total > 1000",
 *   { payload: { customer: { tier: 'premium' }, order: { total: 1500 } } }
 * );
 *
 * // Array methods
 * const result3 = evaluator.evaluate(
 *   "items.some(item => item.price > 100)",
 *   { items: [{ price: 50 }, { price: 150 }] }
 * );
 * ```
 */
export class SafeExpressionEvaluator {
    /**
     * Identifiers that must never resolve to a host global. Because the compiled
     * function runs in global scope, a bare `process`/`Function`/`globalThis`/…
     * would reach the real global object; identifiers are atomic AST tokens, so a
     * name that is split with string concatenation parses as separate identifiers
     * or an operator and is caught by the structural rules instead.
     * @private
     */
    private static readonly DANGEROUS_IDENTIFIERS = new Set<string>([
        'eval', 'Function', 'globalThis', 'global', 'window', 'document', 'process',
        'require', 'module', 'exports', '__dirname', '__filename', 'self', 'top',
        'parent', 'frames', 'Reflect', 'Proxy', 'WebAssembly', 'Atomics',
        'SharedArrayBuffer', 'import', 'arguments', 'constructor', 'prototype', '__proto__',
    ]);

    /**
     * Property names that open the prototype chain / constructor climb. Denied on
     * both dotted (`x.constructor`) and literal-bracket (`x["constructor"]`) access.
     * @private
     */
    private static readonly DANGEROUS_PROPERTY_NAMES = new Set<string>([
        'constructor', '__proto__', 'prototype',
    ]);

    /** Binary operators the evaluator permits. `instanceof`/`in`/bitwise are excluded. @private */
    private static readonly ALLOWED_BINARY_OPERATORS = new Set<string>([
        '==', '!=', '===', '!==', '<', '<=', '>', '>=', '+', '-', '*', '/', '%',
    ]);

    /** Unary operators the evaluator permits. `delete`/`void` are excluded. @private */
    private static readonly ALLOWED_UNARY_OPERATORS = new Set<string>(['!', '-', '+', 'typeof']);

    /**
     * Cache for compiled expressions to improve performance on repeated evaluations
     * @private
     */
    private readonly _compiledExpressionCache = new MJLruCache<string, Function>({ maxSize: 1000 });

    /**
     * Safe methods that can be called on objects
     * @private
     */
    private static readonly SAFE_METHODS = [
        'length',
        'includes',
        'startsWith',
        'endsWith',
        'indexOf',
        'lastIndexOf',
        'toLowerCase',
        'toUpperCase',
        'trim',
        'trimStart',
        'trimEnd',
        'toString',
        'valueOf',
        'some',
        'every',
        'find',
        'filter',
        'map',
        'reduce'
    ];

    /**
     * Evaluates a boolean expression against a context object
     *
     * @param {string} expression - The boolean expression to evaluate
     * @param {Record<string, any>} context - The context object containing variables
     * @param {boolean} [enableDiagnostics=false] - Whether to include diagnostic information
     *
     * @returns {ExpressionEvaluationResult} The evaluation result
     */
    public evaluate(
        expression: string,
        context: Record<string, any>,
        enableDiagnostics: boolean = false
    ): ExpressionEvaluationResult {
        const startTime = Date.now();

        try {
            // Validate expression safety
            const validationError = this.validateExpression(expression);
            if (validationError) {
                return {
                    success: false,
                    error: validationError,
                    diagnostics: enableDiagnostics ? {
                        expression,
                        context,
                        evaluationTime: Date.now() - startTime
                    } : undefined
                };
            }

            // Prepare safe context
            const safeContext = this.createSafeContext(context);

            // Create evaluation function
            const contextKeys = Object.keys(safeContext);
            const contextValues = contextKeys.map(key => safeContext[key]);

            // Check cache for compiled expression
            const cacheKey = `${expression}|${contextKeys.join(',')}`;
            let evaluator = this._compiledExpressionCache.Get(cacheKey);

            if (!evaluator) {
                // Build function body with strict mode
                const functionBody = `
                    "use strict";
                    try {
                        return Boolean(${expression});
                    } catch (e) {
                        throw new Error('Expression evaluation failed: ' + e.message);
                    }
                `;

                // Create and execute function
                evaluator = new Function(...contextKeys, functionBody);

                // Store in cache
                this._compiledExpressionCache.Set(cacheKey, evaluator);
            }

            const result = evaluator(...contextValues);

            return {
                success: true,
                value: Boolean(result),
                diagnostics: enableDiagnostics ? {
                    expression,
                    context,
                    evaluationTime: Date.now() - startTime
                } : undefined
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                diagnostics: enableDiagnostics ? {
                    expression,
                    context,
                    evaluationTime: Date.now() - startTime
                } : undefined
            };
        }
    }

    /**
     * Validates an expression for safety by parsing it and walking the AST against
     * an allowlist. Returns an error message if any construct is not permitted.
     *
     * @param {string} expression - The expression to validate
     *
     * @returns {string | null} Error message if invalid, null if valid
     *
     * @private
     */
    private validateExpression(expression: string): string | null {
        if (!expression || typeof expression !== 'string') {
            return 'Expression must be a non-empty string';
        }

        if (expression.length > 1000) {
            return 'Expression exceeds maximum length of 1000 characters';
        }

        // Basic syntax validation - ensure balanced parentheses (kept for a precise
        // error message ahead of the parser, which would otherwise report a generic
        // syntax error).
        let parenCount = 0;
        for (const char of expression) {
            if (char === '(') parenCount++;
            if (char === ')') parenCount--;
            if (parenCount < 0) {
                return 'Unbalanced parentheses in expression';
            }
        }
        if (parenCount !== 0) {
            return 'Unbalanced parentheses in expression';
        }

        // A whitespace-only expression compiles to `Boolean( )`, i.e. false — there
        // is nothing to parse or validate.
        if (expression.trim() === '') {
            return null;
        }

        let program: Program;
        try {
            program = parse(expression, { ecmaVersion: 2022 });
        } catch (e) {
            return this.forbidden(`it is not a parseable single expression (${e instanceof Error ? e.message : String(e)})`);
        }

        if (program.body.length !== 1 || program.body[0].type !== 'ExpressionStatement') {
            return this.forbidden('only a single expression is permitted — no statements, blocks, or semicolons');
        }

        return this.checkNode((program.body[0] as ExpressionStatement).expression);
    }

    /** Builds the standard rejection message. @private */
    private forbidden(detail: string): string {
        return `Expression contains a forbidden construct: ${detail}`;
    }

    /**
     * Walks an AST node against the allowlist. Returns an error message on the first
     * disallowed construct, or null if the entire subtree is permitted.
     * @private
     */
    private checkNode(node: Node): string | null {
        switch (node.type) {
            case 'Literal': {
                const lit = node as Literal;
                // Regex literals can be crafted for catastrophic backtracking; permit strings/numbers/booleans/null only.
                if (lit.value instanceof RegExp || 'regex' in lit) {
                    return this.forbidden('regular expression literals are not allowed');
                }
                return null;
            }
            case 'Identifier': {
                const name = (node as Identifier).name;
                if (SafeExpressionEvaluator.DANGEROUS_IDENTIFIERS.has(name)) {
                    return this.forbidden(`the identifier "${name}"`);
                }
                return null;
            }
            case 'ChainExpression':
                // `a?.b`, `a?.[0]`, `a?.b()` — the optional marker changes only whether the member
                // read short-circuits on null/undefined, so unwrapping lands the inner node back in
                // the ordinary member/call rules and `a?.constructor` stays blocked.
                return this.checkNode((node as ChainExpression).expression);
            case 'MemberExpression':
                return this.checkMemberExpression(node as MemberExpression);
            case 'CallExpression':
                return this.checkCallExpression(node as CallExpression);
            case 'ArrowFunctionExpression':
                return this.checkArrowFunction(node as ArrowFunctionExpression);
            case 'BinaryExpression': {
                const bin = node as BinaryExpression;
                if (!SafeExpressionEvaluator.ALLOWED_BINARY_OPERATORS.has(bin.operator)) {
                    return this.forbidden(`the operator "${bin.operator}"`);
                }
                return this.checkNode(bin.left) ?? this.checkNode(bin.right);
            }
            case 'LogicalExpression': {
                const log = node as LogicalExpression;
                return this.checkNode(log.left) ?? this.checkNode(log.right);
            }
            case 'UnaryExpression': {
                const un = node as UnaryExpression;
                if (!SafeExpressionEvaluator.ALLOWED_UNARY_OPERATORS.has(un.operator)) {
                    return this.forbidden(`the unary operator "${un.operator}"`);
                }
                return this.checkNode(un.argument);
            }
            case 'ConditionalExpression': {
                const cond = node as ConditionalExpression;
                return this.checkNode(cond.test) ?? this.checkNode(cond.consequent) ?? this.checkNode(cond.alternate);
            }
            case 'ArrayExpression': {
                const arr = node as ArrayExpression;
                for (const el of arr.elements) {
                    if (!el) continue; // array hole
                    if (el.type === 'SpreadElement') {
                        return this.forbidden('spread elements are not allowed');
                    }
                    const err = this.checkNode(el);
                    if (err) return err;
                }
                return null;
            }
            default:
                return this.forbidden(`${node.type} is not allowed`);
        }
    }

    /**
     * Member access is allowed for dotted property reads and literal-key bracket
     * reads, but never for a computed key built at runtime (the string-concat
     * escape route) or a prototype-chain property.
     * @private
     */
    private checkMemberExpression(node: MemberExpression): string | null {
        if (node.property.type === 'PrivateIdentifier') {
            return this.forbidden('private fields are not allowed');
        }
        if (node.computed) {
            // Bracket access must use a literal — a computed key (`x["con"+"structor"]`,
            // `x[y]`) is exactly the route a textual denylist misses, so reject anything
            // that is not a plain string/number literal.
            if (node.property.type !== 'Literal') {
                return this.forbidden('computed member access must use a literal index/key');
            }
            const value = (node.property as Literal).value;
            if (typeof value === 'string') {
                if (SafeExpressionEvaluator.DANGEROUS_PROPERTY_NAMES.has(value)) {
                    return this.forbidden(`access to "${value}"`);
                }
            } else if (typeof value !== 'number') {
                return this.forbidden('computed member access must use a string or numeric literal');
            }
        } else {
            const name = (node.property as Identifier).name;
            if (SafeExpressionEvaluator.DANGEROUS_PROPERTY_NAMES.has(name)) {
                return this.forbidden(`access to "${name}"`);
            }
        }
        return this.checkNode(node.object);
    }

    /**
     * A call is admitted only when its callee is a FIXED name on one of two allowlists: a bare
     * safe global (`parseInt(...)`) or a dotted method that is either a safe instance method or a
     * method of a safe global namespace (`Math.abs(...)`). Everything else — a computed callee, an
     * unlisted bare identifier (`eval(...)`, `Function(...)`), a call on a call's result that is
     * not itself a safe method — is rejected.
     * @private
     */
    private checkCallExpression(node: CallExpression): string | null {
        const callee = node.callee;

        if (callee.type === 'Identifier') {
            const name = (callee as Identifier).name;
            if (!SAFE_GLOBAL_CALLABLES.has(name)) {
                return this.forbidden(`calling "${name}" — only safe methods and safe global functions may be invoked`);
            }
            return this.checkCallArguments(node);
        }

        if (callee.type !== 'MemberExpression') {
            return this.forbidden('only method calls on the safe-method allowlist may be invoked');
        }
        const member = callee as MemberExpression;
        if (member.computed || member.property.type !== 'Identifier') {
            return this.forbidden('methods must be called by a dotted, non-computed name');
        }
        const method = (member.property as Identifier).name;
        if (!this.isCallableMethod(member.object, method)) {
            return this.forbidden(`the method "${method}" is not on the safe-method allowlist`);
        }
        const receiverError = this.checkNode(member.object);
        if (receiverError) return receiverError;
        return this.checkCallArguments(node);
    }

    /**
     * Whether `<receiver>.<method>()` names a permitted call: a safe instance method on any value,
     * or a method of a safe global namespace when the receiver is that namespace by bare name.
     * @private
     */
    private isCallableMethod(receiver: Expression | Super, method: string): boolean {
        if (SafeExpressionEvaluator.SAFE_METHODS.includes(method)) {
            return true;
        }
        if (receiver.type !== 'Identifier') {
            return false;
        }
        return SAFE_GLOBAL_NAMESPACE_METHODS.get((receiver as Identifier).name)?.has(method) === true;
    }

    /** Walks a call's arguments; spreads are rejected outright. @private */
    private checkCallArguments(node: CallExpression): string | null {
        for (const arg of node.arguments) {
            if (arg.type === 'SpreadElement') {
                return this.forbidden('spread arguments are not allowed');
            }
            const err = this.checkNode(arg);
            if (err) return err;
        }
        return null;
    }

    /**
     * Arrow functions are permitted only as callback arguments to the safe array
     * methods; parameters must be simple identifiers and the body an expression.
     * @private
     */
    private checkArrowFunction(node: ArrowFunctionExpression): string | null {
        if (node.async) {
            return this.forbidden('async functions are not allowed');
        }
        for (const param of node.params) {
            if (param.type !== 'Identifier') {
                return this.forbidden('arrow-function parameters must be simple identifiers');
            }
            if (SafeExpressionEvaluator.DANGEROUS_IDENTIFIERS.has((param as Identifier).name)) {
                return this.forbidden(`the parameter "${(param as Identifier).name}"`);
            }
        }
        if (node.body.type === 'BlockStatement') {
            return this.forbidden('arrow-function bodies must be an expression, not a block');
        }
        return this.checkNode(node.body);
    }

    /**
     * Creates a safe context object with only allowed properties
     *
     * @param {Record<string, any>} context - The original context
     *
     * @returns {Record<string, any>} The safe context
     *
     * @private
     */
    private createSafeContext(context: Record<string, any>): Record<string, any> {
        // Deep clone to prevent modifications to original
        const safeContext: Record<string, any> = {};

        for (const [key, value] of Object.entries(context)) {
            // Skip dangerous property names
            if (this.isDangerousPropertyName(key)) {
                continue;
            }

            // Clone value safely
            safeContext[key] = this.cloneValue(value);
        }

        return safeContext;
    }

    /**
     * Checks if a property name is potentially dangerous
     *
     * @param {string} name - The property name
     *
     * @returns {boolean} True if dangerous
     *
     * @private
     */
    private isDangerousPropertyName(name: string): boolean {
        const dangerous = [
            '__proto__',
            'constructor',
            'prototype',
            'eval',
            'Function'
        ];
        return dangerous.includes(name);
    }

    /**
     * Safely clones a value for use in evaluation context
     *
     * @param {any} value - The value to clone
     *
     * @returns {any} The cloned value
     *
     * @private
     */
    private cloneValue(value: any): any {
        if (value === null || value === undefined) {
            return value;
        }

        const type = typeof value;

        // Primitives are safe
        if (type === 'string' || type === 'number' || type === 'boolean') {
            return value;
        }

        // Arrays
        if (Array.isArray(value)) {
            return value.map(item => this.cloneValue(item));
        }

        // Plain objects - clone by copying enumerable own properties
        if (type === 'object' && value.constructor === Object) {
            const cloned: Record<string, any> = {};
            for (const [key, val] of Object.entries(value)) {
                if (!this.isDangerousPropertyName(key)) {
                    cloned[key] = this.cloneValue(val);
                }
            }
            return cloned;
        }

        // Dates
        if (value instanceof Date) {
            return new Date(value);
        }

        // Class instances - shallow clone enumerable properties without recursion
        // to avoid issues with circular references or complex nested objects
        if (type === 'object' && typeof value.constructor === 'function') {
            const cloned: Record<string, any> = {};
            for (const [key, val] of Object.entries(value)) {
                if (!this.isDangerousPropertyName(key)) {
                    // Don't recursively clone class instance properties
                    // Just copy them directly for safe shallow access
                    cloned[key] = val;
                }
            }
            return cloned;
        }

        // For other types, try safe string conversion
        try {
            return String(value);
        } catch {
            // If String() fails, return a placeholder
            return '[Object]';
        }
    }

    /**
     * Checks whether an expression *could* be evaluated, without evaluating it.
     *
     * The difference matters because `evaluate` reports two unrelated problems the same way. Given
     * a condition authored against a runtime envelope, an empty context makes `payload.x > 1` fail
     * with `payload is not defined` — indistinguishable, by result shape, from `payload.x >` failing
     * with `Unexpected token`. One is a typo the author should be told about at the door; the other
     * is a perfectly good condition that simply has no data yet. A submit-time check built on
     * `evaluate` therefore refuses every legitimate condition.
     *
     * So this compiles and never runs. The expression goes through the same policy screen
     * `evaluate` applies (the AST allowlist), then the same function body is BUILT and discarded —
     * never invoked. Values are never consulted, which is precisely the property wanted: unknown
     * identifiers, absent properties and undefined chains all PASS, because none of them is a syntax
     * error and whether they resolve is a question about a run that has not happened yet.
     *
     * **Compilation is not evaluation**, and the distinction is load-bearing for safety: `Function`
     * parses the body and returns; nothing in the expression executes. The policy screen still runs
     * first, so the constructs `evaluate` refuses are refused here too — those produce a permanent
     * runtime refusal, and an author is better told now.
     *
     * `Undecidable` is the honest third answer. A host that forbids dynamic compilation (a strict
     * CSP without `unsafe-eval`) cannot answer the question at all, and a validator that read that
     * as "invalid" would refuse every condition in the browser. Callers should treat it as a pass.
     *
     * @param expression the expression to check
     * @returns `Valid: true` when it parses; `Valid: false` with `Error` when it definitely does
     *          not; `Valid: true` with `Undecidable: true` when this environment cannot compile
     */
    public validateSyntax(expression: string): { Valid: boolean; Error?: string; Undecidable?: boolean } {
        const policyError = this.validateExpression(expression);
        if (policyError) {
            return { Valid: false, Error: policyError };
        }

        try {
            // Same wrapper `evaluate` compiles, so anything that parses here parses there. Built and
            // discarded — never invoked.
            new Function(`"use strict"; return Boolean(${expression});`);
            return { Valid: true };
        } catch (e) {
            if (e instanceof SyntaxError) {
                return { Valid: false, Error: e.message };
            }
            // Anything else — an EvalError from a CSP, a host without `Function` — means this
            // environment cannot judge, not that the expression is wrong.
            return { Valid: true, Undecidable: true };
        }
    }

    /**
     * Evaluates multiple expressions and returns all results
     *
     * @param {Array<{expression: string, name?: string}>} expressions - Array of expressions to evaluate
     * @param {Record<string, any>} context - The context object
     *
     * @returns {Record<string, ExpressionEvaluationResult>} Map of results by name or index
     */
    public evaluateMultiple(
        expressions: Array<{expression: string, name?: string}>,
        context: Record<string, any>
    ): Record<string, ExpressionEvaluationResult> {
        const results: Record<string, ExpressionEvaluationResult> = {};

        expressions.forEach((expr, index) => {
            const key = expr.name || `expression_${index}`;
            results[key] = this.evaluate(expr.expression, context);
        });

        return results;
    }
}

/**
 * Default instance for convenience
 */
export const defaultExpressionEvaluator = new SafeExpressionEvaluator();
