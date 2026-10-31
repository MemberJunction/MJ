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

/** One approved global: whether it may be called by bare name, and which of its methods may be called. */
export interface ApprovedExpressionGlobal {
    /** `true` when the global itself may be called: `Number(x)`, `parseInt(x)`. */
    readonly Callable: boolean;
    /** Methods that may be called on the global by dotted name: `Math.max(a, b)`. */
    readonly Methods: ReadonlySet<string>;
}

/**
 * **The approved globals — the only host globals an expression can reach.**
 *
 * This is the single list reviewers should check. Every other free identifier in an expression must
 * be an evaluation-context key or an arrow-function parameter in scope; anything else is refused
 * before compilation (see {@link SafeExpressionEvaluator.ScreenExpression}).
 *
 * An approved global is usable ONLY in call position — `Math.max(a, b)`, `Number(x)` — never as a
 * bare value, a property read (`Math.PI`), or a callback (`items.map(Number)`). That rule is what
 * stops a function being handed to code that calls it with attacker-chosen arguments: two confirmed
 * bypasses of the earlier denylist did exactly that (`a.reduce(fetch)` and
 * `p.reduce(Object.assign)`).
 *
 * Every listed member is a pure function of its arguments. Deliberately absent: `Object.assign`,
 * `Object.defineProperty`, `Object.getPrototypeOf`/`setPrototypeOf` (mutate or open the prototype
 * chain), `Math.random` (a guard that changes per run is not a guard), `String.fromCharCode`, and
 * every host API (`fetch`, `setTimeout`, `require`, `process`, ...).
 *
 * Both halves of `Math.abs(x)` are fixed identifiers in the AST, so admitting them adds no dynamic
 * lookup.
 */
export const APPROVED_EXPRESSION_GLOBALS: ReadonlyMap<string, ApprovedExpressionGlobal> = new Map<string, ApprovedExpressionGlobal>([
    ['Math', { Callable: false, Methods: new Set([
        'abs', 'ceil', 'floor', 'round', 'trunc', 'sign', 'min', 'max',
        'pow', 'sqrt', 'cbrt', 'log', 'log2', 'log10', 'exp', 'hypot',
    ]) }],
    ['JSON', { Callable: false, Methods: new Set(['parse', 'stringify']) }],
    ['Object', { Callable: false, Methods: new Set(['keys', 'values', 'entries']) }],
    ['Array', { Callable: false, Methods: new Set(['isArray']) }],
    ['Number', { Callable: true, Methods: new Set(['isInteger', 'isFinite', 'isNaN', 'isSafeInteger', 'parseInt', 'parseFloat']) }],
    ['String', { Callable: true, Methods: new Set<string>() }],
    ['Boolean', { Callable: true, Methods: new Set<string>() }],
    ['Date', { Callable: false, Methods: new Set(['now']) }],
    ['parseInt', { Callable: true, Methods: new Set<string>() }],
    ['parseFloat', { Callable: true, Methods: new Set<string>() }],
    ['isNaN', { Callable: true, Methods: new Set<string>() }],
    ['isFinite', { Callable: true, Methods: new Set<string>() }],
]);

/**
 * Global names that are VALUES, not functions, and may appear anywhere a value can: `x === undefined`.
 * Each is a non-writable primitive, so referencing one cannot reach host code.
 */
export const APPROVED_VALUE_GLOBALS: ReadonlySet<string> = new Set(['undefined', 'NaN', 'Infinity']);

/**
 * Namespace globals whose listed methods an expression may CALL, keyed by namespace name.
 * Derived from {@link APPROVED_EXPRESSION_GLOBALS}.
 */
export const SAFE_GLOBAL_NAMESPACE_METHODS: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>(
    [...APPROVED_EXPRESSION_GLOBALS].filter(([, g]) => g.Methods.size > 0).map(([name, g]) => [name, g.Methods]),
);

/**
 * Global functions an expression may call by bare name (`Number(payload.count) > 3`).
 * Derived from {@link APPROVED_EXPRESSION_GLOBALS}.
 */
export const SAFE_GLOBAL_CALLABLES: ReadonlySet<string> = new Set(
    [...APPROVED_EXPRESSION_GLOBALS].filter(([, g]) => g.Callable).map(([name]) => name),
);

/**
 * Every global name an expression may reference (in call position), as a namespace or as a bare
 * callable. Derived from {@link APPROVED_EXPRESSION_GLOBALS}, so a caller validating conditions ahead
 * of evaluation (`ai-core-plus`'s task-graph door) cannot bless a name the runtime would refuse.
 */
export const SAFE_EXPRESSION_GLOBALS: ReadonlySet<string> = new Set(APPROVED_EXPRESSION_GLOBALS.keys());

/**
 * Identifiers that must never resolve to a host global, kept as a second layer behind the allowlist.
 * Under the allowlist none of these can be reached anyway (they are neither context keys nor
 * approved globals); listing them keeps a precise rejection message when the screen runs without
 * known context keys ({@link SafeExpressionEvaluator.ValidateSyntax}) and bars them as arrow
 * parameter names.
 */
const DANGEROUS_IDENTIFIERS: ReadonlySet<string> = new Set<string>([
    'eval', 'Function', 'globalThis', 'global', 'window', 'document', 'process',
    'require', 'module', 'exports', '__dirname', '__filename', 'self', 'top',
    'parent', 'frames', 'Reflect', 'Proxy', 'WebAssembly', 'Atomics',
    'SharedArrayBuffer', 'import', 'arguments', 'constructor', 'prototype', '__proto__',
]);

/**
 * Property names that open the prototype chain / constructor climb. Denied on both dotted
 * (`x.constructor`) and literal-bracket (`x["constructor"]`) access.
 */
const DANGEROUS_PROPERTY_NAMES: ReadonlySet<string> = new Set<string>([
    'constructor', '__proto__', 'prototype',
]);

/** Binary operators the evaluator permits. `instanceof`/`in`/bitwise are excluded. */
const ALLOWED_BINARY_OPERATORS: ReadonlySet<string> = new Set<string>([
    '==', '!=', '===', '!==', '<', '<=', '>', '>=', '+', '-', '*', '/', '%',
]);

/** Unary operators the evaluator permits. `delete`/`void` are excluded. */
const ALLOWED_UNARY_OPERATORS: ReadonlySet<string> = new Set<string>(['!', '-', '+', 'typeof']);

/**
 * Instance methods an expression may call on any value. None takes a function argument except the
 * {@link CALLBACK_METHODS}, whose callback must be written inline.
 *
 * The string/array/number methods after `reduce` (`split` ... `toPrecision`) were added when
 * field-rule and integration formulas began going through this screen: they are pure, take no
 * callback, and cover the formula shapes in use (`value.split(' ')[0]`, `value.toFixed(2)`).
 * `replace`/`replaceAll` (accept a replacer function) and `repeat` (unbounded allocation) stay out.
 */
const SAFE_METHODS: ReadonlySet<string> = new Set<string>([
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
    'reduce',
    'split',
    'slice',
    'substring',
    'join',
    'concat',
    'charAt',
    'at',
    'padStart',
    'padEnd',
    'toFixed',
    'toPrecision',
]);

/**
 * Safe methods whose first argument is a callback. The callback must be an inline arrow function —
 * never an identifier or member expression — so no existing function (host or context) can be
 * handed to them and invoked with arguments the expression chose.
 */
const CALLBACK_METHODS: ReadonlySet<string> = new Set<string>(['some', 'every', 'find', 'filter', 'map', 'reduce']);

/**
 * Approved-global methods that would call a function passed at the given argument index
 * (`JSON.parse`'s reviver, `JSON.stringify`'s replacer). The argument there must be a literal or an
 * array literal (`JSON.stringify(x, null, 2)`), never a function value.
 *
 * Only that one slot is constrained. Arguments after it (`JSON.stringify`'s `space`) are screened
 * like any other value, since neither method ever calls them; `JSON.parse` ignores extra arguments.
 */
const NON_FUNCTION_ARGUMENT_SLOTS: ReadonlyMap<string, number> = new Map<string, number>([
    ['JSON.parse', 1],
    ['JSON.stringify', 1],
]);

/** A context key must be a plain identifier: keys become parameter names of the compiled function. */
const CONTEXT_KEY_PATTERN = /^[A-Za-z_$][\w$]*$/;

/** Maximum expression length accepted by the screen. */
const MAX_EXPRESSION_LENGTH = 1000;

/** Builds the standard rejection message. Callers match on "forbidden construct". */
function forbidden(detail: string): string {
    return `Expression contains a forbidden construct: ${detail}`;
}

/**
 * Walks one parsed expression against the allowlist.
 *
 * Free identifiers are checked against, in order: arrow parameters in scope, the evaluation-context
 * keys (when known), and {@link APPROVED_VALUE_GLOBALS}. Approved globals are recognised only where a
 * call is built from them. When the context keys are NOT known (`ValidateSyntax` without keys), a
 * free identifier that is not an approved global or a denied name is let through, because whether it
 * resolves is a question about a run that has not happened; `Evaluate` re-screens with the real keys.
 */
class ExpressionScreen {
    private readonly scopes: ReadonlySet<string>[] = [];

    constructor(private readonly contextKeys: ReadonlySet<string> | null) {}

    public Check(node: Node): string | null {
        switch (node.type) {
            case 'Literal': {
                const lit = node as Literal;
                // Regex literals can be crafted for catastrophic backtracking; permit strings/numbers/booleans/null only.
                if (lit.value instanceof RegExp || 'regex' in lit) {
                    return forbidden('regular expression literals are not allowed');
                }
                return null;
            }
            case 'Identifier':
                return this.checkValueIdentifier((node as Identifier).name);
            case 'ChainExpression':
                // `a?.b`, `a?.[0]`, `a?.b()` — the optional marker changes only whether the member
                // read short-circuits on null/undefined, so unwrapping lands the inner node back in
                // the ordinary member/call rules and `a?.constructor` stays blocked.
                return this.Check((node as ChainExpression).expression);
            case 'MemberExpression':
                return this.checkMemberExpression(node as MemberExpression);
            case 'CallExpression':
                return this.checkCallExpression(node as CallExpression);
            case 'ArrowFunctionExpression':
                return forbidden(`arrow functions are allowed only as the inline callback of ${[...CALLBACK_METHODS].map(m => `.${m}()`).join(', ')}`);
            case 'BinaryExpression': {
                const bin = node as BinaryExpression;
                if (!ALLOWED_BINARY_OPERATORS.has(bin.operator)) {
                    return forbidden(`the operator "${bin.operator}"`);
                }
                return this.Check(bin.left) ?? this.Check(bin.right);
            }
            case 'LogicalExpression': {
                const log = node as LogicalExpression;
                return this.Check(log.left) ?? this.Check(log.right);
            }
            case 'UnaryExpression': {
                const un = node as UnaryExpression;
                if (!ALLOWED_UNARY_OPERATORS.has(un.operator)) {
                    return forbidden(`the unary operator "${un.operator}"`);
                }
                return this.Check(un.argument);
            }
            case 'ConditionalExpression': {
                const cond = node as ConditionalExpression;
                return this.Check(cond.test) ?? this.Check(cond.consequent) ?? this.Check(cond.alternate);
            }
            case 'ArrayExpression': {
                const arr = node as ArrayExpression;
                for (const el of arr.elements) {
                    if (!el) continue; // array hole
                    if (el.type === 'SpreadElement') {
                        return forbidden('spread elements are not allowed');
                    }
                    const err = this.Check(el);
                    if (err) return err;
                }
                return null;
            }
            default:
                return forbidden(`${node.type} is not allowed`);
        }
    }

    /** Whether `name` is bound by an enclosing arrow function. */
    private isBoundParameter(name: string): boolean {
        return this.scopes.some(scope => scope.has(name));
    }

    /**
     * An identifier in VALUE position (anything but the callee of a call): it must be an arrow
     * parameter in scope, a context key, or an approved value global (`undefined`). Approved function
     * globals are refused here — `items.map(Number)` and `[Math][0]` hand a host function out as a value.
     */
    private checkValueIdentifier(name: string): string | null {
        if (this.isBoundParameter(name)) {
            return null;
        }
        if (this.contextKeys?.has(name)) {
            return null;
        }
        if (DANGEROUS_IDENTIFIERS.has(name)) {
            return forbidden(`the identifier "${name}"`);
        }
        if (APPROVED_VALUE_GLOBALS.has(name)) {
            return null;
        }
        if (APPROVED_EXPRESSION_GLOBALS.has(name)) {
            return forbidden(`"${name}" may only be called (e.g. ${name}${APPROVED_EXPRESSION_GLOBALS.get(name)?.Callable ? '(x)' : '.method(x)'}), not used as a value or callback`);
        }
        if (this.contextKeys === null) {
            // Context keys unknown (ValidateSyntax): resolution is decided at evaluation time.
            return null;
        }
        return forbidden(`the identifier "${name}" is not defined in the evaluation context and is not an arrow-function parameter`);
    }

    /**
     * Member access is allowed for dotted property reads and literal-key bracket reads, but never
     * for a computed key built at runtime (the string-concat escape route) or a prototype-chain
     * property.
     */
    private checkMemberExpression(node: MemberExpression): string | null {
        if (node.property.type === 'PrivateIdentifier') {
            return forbidden('private fields are not allowed');
        }
        if (node.computed) {
            // Bracket access must use a literal — a computed key (`x["con"+"structor"]`, `x[y]`) is
            // exactly the route a textual denylist misses.
            if (node.property.type !== 'Literal') {
                return forbidden('computed member access must use a literal index/key');
            }
            const value = (node.property as Literal).value;
            if (typeof value === 'string') {
                if (DANGEROUS_PROPERTY_NAMES.has(value)) {
                    return forbidden(`access to "${value}"`);
                }
            } else if (typeof value !== 'number') {
                return forbidden('computed member access must use a string or numeric literal');
            }
        } else {
            const name = (node.property as Identifier).name;
            if (DANGEROUS_PROPERTY_NAMES.has(name)) {
                return forbidden(`access to "${name}"`);
            }
        }
        return this.Check(node.object);
    }

    /**
     * A call is admitted only when its callee is a FIXED name: a callable approved global
     * (`parseInt(...)`), a listed method of an approved global namespace (`Math.abs(...)`), or a safe
     * instance method on a screened receiver (`payload.title.includes(...)`). Everything else — a
     * computed callee, an unlisted bare identifier, a call on an arrow or call result that is not
     * itself a safe method — is rejected.
     */
    private checkCallExpression(node: CallExpression): string | null {
        const callee = node.callee;

        if (callee.type === 'Identifier') {
            const name = (callee as Identifier).name;
            if (this.isBoundParameter(name) || !SAFE_GLOBAL_CALLABLES.has(name)) {
                return forbidden(`calling "${name}" — only safe methods and approved global functions may be invoked`);
            }
            return this.checkCallArguments(node, null, null);
        }

        if (callee.type !== 'MemberExpression') {
            return forbidden('only method calls on the safe-method allowlist may be invoked');
        }
        const member = callee as MemberExpression;
        if (member.computed || member.property.type !== 'Identifier') {
            return forbidden('methods must be called by a dotted, non-computed name');
        }
        const method = (member.property as Identifier).name;
        const receiver = member.object;

        // `Math.max(...)`: the namespace is an approved global in call position, so it is not
        // screened as a value. A parameter or context key with the same name shadows the global
        // and is screened as an ordinary receiver below.
        if (receiver.type === 'Identifier') {
            const namespace = (receiver as Identifier).name;
            const shadowed = this.isBoundParameter(namespace) || this.contextKeys?.has(namespace) === true;
            if (!shadowed && SAFE_GLOBAL_NAMESPACE_METHODS.get(namespace)?.has(method) === true) {
                return this.checkCallArguments(node, null, `${namespace}.${method}`);
            }
        }

        if (!SAFE_METHODS.has(method)) {
            return forbidden(`the method "${method}" is not on the safe-method allowlist`);
        }
        const receiverError = this.checkReceiver(receiver);
        if (receiverError) return receiverError;
        return this.checkCallArguments(node, method, null);
    }

    /** Screens the receiver of a safe instance method. `super.x()` is never valid. */
    private checkReceiver(receiver: Expression | Super): string | null {
        if (receiver.type === 'Super') {
            return forbidden('super is not allowed');
        }
        return this.Check(receiver);
    }

    /**
     * Walks a call's arguments. Spreads are rejected outright. For a callback method the first
     * argument must be an inline arrow function; for `JSON.parse`/`JSON.stringify` the reviver /
     * replacer slot must be a literal or array literal.
     */
    private checkCallArguments(node: CallExpression, instanceMethod: string | null, globalMethod: string | null): string | null {
        const callbackMethod = instanceMethod !== null && CALLBACK_METHODS.has(instanceMethod);
        const nonFunctionSlot = globalMethod !== null ? NON_FUNCTION_ARGUMENT_SLOTS.get(globalMethod) : undefined;

        for (let i = 0; i < node.arguments.length; i++) {
            const arg = node.arguments[i];
            if (arg.type === 'SpreadElement') {
                return forbidden('spread arguments are not allowed');
            }
            if (callbackMethod && i === 0) {
                if (arg.type !== 'ArrowFunctionExpression') {
                    return forbidden(`the callback of .${instanceMethod}() must be an inline arrow function (e.g. x => x.price > 100)`);
                }
                const err = this.checkArrowFunction(arg as ArrowFunctionExpression);
                if (err) return err;
                continue;
            }
            if (nonFunctionSlot === i && arg.type !== 'Literal' && arg.type !== 'ArrayExpression') {
                return forbidden(`argument ${i + 1} of ${globalMethod}() must be a literal or an array literal`);
            }
            const err = this.Check(arg);
            if (err) return err;
        }
        return null;
    }

    /**
     * An inline callback: parameters must be simple identifiers that do not shadow an approved or
     * denied global, and the body must be an expression. Parameters are in scope for the body only.
     */
    private checkArrowFunction(node: ArrowFunctionExpression): string | null {
        if (node.async) {
            return forbidden('async functions are not allowed');
        }
        if (node.body.type === 'BlockStatement') {
            return forbidden('arrow-function bodies must be an expression, not a block');
        }
        const params = new Set<string>();
        for (const param of node.params) {
            if (param.type !== 'Identifier') {
                return forbidden('arrow-function parameters must be simple identifiers');
            }
            const name = (param as Identifier).name;
            if (DANGEROUS_IDENTIFIERS.has(name) || APPROVED_EXPRESSION_GLOBALS.has(name) || APPROVED_VALUE_GLOBALS.has(name)) {
                return forbidden(`the parameter "${name}"`);
            }
            params.add(name);
        }
        this.scopes.push(params);
        try {
            return this.Check(node.body);
        } finally {
            this.scopes.pop();
        }
    }
}

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
 * - Safe methods: .length, .includes(), .startsWith(), .endsWith(), .split(), .slice(), ...
 * - Array methods: .some(), .every(), .find(), .filter(), .map(), .reduce() — the callback must be
 *   an inline arrow function (`items.some(i => i.price > 100)`, never `items.some(fn)`)
 * - Approved globals, in call position only: {@link APPROVED_EXPRESSION_GLOBALS}
 *   (e.g. `Math.abs(output.delta) < 5`, `Number(payload.count) > 3`, `Object.keys(payload).length`)
 * - Type checking: typeof
 *
 * Safety is enforced by parsing the expression to an AST and walking it against
 * an ALLOWLIST before it is compiled. Node types, operators, methods and free identifiers are
 * all allowlisted: a free identifier must be a context key, an arrow parameter in scope, or an
 * approved global used as a call. An unlisted construct (computed member access with a non-literal
 * key, `.constructor`/`__proto__` access, any call outside the safe-method and approved-global
 * lists, any other identifier, etc.) is rejected at validation time and never reaches the compiler. A structural
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
     * Cache for compiled expressions to improve performance on repeated evaluations
     * @private
     */
    private readonly _compiledExpressionCache = new MJLruCache<string, Function>({ maxSize: 1000 });

    /**
     * Evaluates a boolean expression against a context object
     *
     * @param {string} expression - The boolean expression to evaluate
     * @param {Record<string, any>} [context={}] - The context object containing variables. Its keys
     *        are the only free names the expression may use; a key named like an approved global
     *        shadows it (see {@link ScreenExpression}).
     * @param {boolean} [enableDiagnostics=false] - Whether to include diagnostic information
     *
     * @returns {ExpressionEvaluationResult} The evaluation result
     */
    public Evaluate(
        expression: string,
        context: Record<string, any> = {},
        enableDiagnostics: boolean = false
    ): ExpressionEvaluationResult {
        const startTime = Date.now();

        try {
            // Prepare safe context first: its keys are the only free names the expression may use.
            // Throws on a key that is not a plain identifier (keys become parameter names).
            const safeContext = this.createSafeContext(context);
            const contextKeys = Object.keys(safeContext);

            // Validate expression safety against the allowlist, with the real context keys
            const validationError = SafeExpressionEvaluator.ScreenExpression(expression, contextKeys);
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

            // Create evaluation function
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

    /** @deprecated Use {@link Evaluate}. */
    public evaluate(
        expression: string,
        context: Record<string, any> = {},
        enableDiagnostics: boolean = false
    ): ExpressionEvaluationResult {
        return this.Evaluate(expression, context, enableDiagnostics);
    }

    /**
     * Screens an expression against the allowlist WITHOUT compiling or running it. Returns the
     * rejection message, or `null` when every construct is permitted.
     *
     * This is the single policy gate for every place MemberJunction compiles a user- or LLM-authored
     * expression: {@link Evaluate}, {@link ValidateSyntax}, and the field-rule / integration formula
     * engine (`FieldTransformEngine`), which passes `['value', 'fields']`.
     *
     * A context key or arrow parameter named like an approved global (`Math`, `JSON`, ...) shadows
     * it and is screened as data, so `Math.abs(x)` with a `Math` context key is refused because
     * `abs` is not a safe instance method. Do not pass approved-global names as context keys.
     *
     * @param expression the expression to screen
     * @param allowedIdentifiers the names the expression may reference as values — the evaluation
     *        context keys. Pass `null` only when they are not yet known (authoring-time syntax
     *        checks); free identifiers are then left for evaluation time to decide, while approved
     *        globals used as values, callbacks that are not inline arrows, and every structural rule
     *        are still enforced.
     */
    public static ScreenExpression(expression: string, allowedIdentifiers: Iterable<string> | null): string | null {
        if (!expression || typeof expression !== 'string') {
            return 'Expression must be a non-empty string';
        }

        if (expression.length > MAX_EXPRESSION_LENGTH) {
            return `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`;
        }

        // A whitespace-only expression compiles to `Boolean( )`, i.e. false — there is nothing to
        // parse or validate.
        if (expression.trim() === '') {
            return null;
        }

        let program: Program;
        try {
            program = parse(expression, { ecmaVersion: 2022 });
        } catch (e) {
            // A precise message for the commonest typo. Counted only after the parser fails, so a
            // parenthesis inside a string literal (`'(' + value + ')'`) is not miscounted.
            if (SafeExpressionEvaluator.hasUnbalancedParentheses(expression)) {
                return 'Unbalanced parentheses in expression';
            }
            return forbidden(`it is not a parseable single expression (${e instanceof Error ? e.message : String(e)})`);
        }

        if (program.body.length !== 1 || program.body[0].type !== 'ExpressionStatement') {
            return forbidden('only a single expression is permitted — no statements, blocks, or semicolons');
        }

        const keys = allowedIdentifiers === null ? null : new Set(allowedIdentifiers);
        return new ExpressionScreen(keys).Check((program.body[0] as ExpressionStatement).expression);
    }

    /** Counts parentheses textually; used only to word the error for an expression that failed to parse. @private */
    private static hasUnbalancedParentheses(expression: string): boolean {
        let depth = 0;
        for (const char of expression) {
            if (char === '(') depth++;
            if (char === ')') depth--;
            if (depth < 0) return true;
        }
        return depth !== 0;
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
        if (context === null || typeof context !== 'object') {
            throw new Error('Context must be an object');
        }

        // Deep clone to prevent modifications to original
        const safeContext: Record<string, any> = {};

        for (const [key, value] of Object.entries(context)) {
            // Skip dangerous property names
            if (this.isDangerousPropertyName(key)) {
                continue;
            }

            // Every key becomes a parameter name of the compiled function, so anything but a plain
            // identifier (`a = fetch(x)`, `...rest`, `a, b`) would be injected as code. Fail closed.
            if (!CONTEXT_KEY_PATTERN.test(key)) {
                throw new Error(`Context key "${key}" is not a valid identifier; context keys must match ${CONTEXT_KEY_PATTERN.source}`);
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
     * Functions are never carried into the context: a context should hold data, and a function
     * reachable from an expression is one more thing that could be invoked. A function value
     * becomes `undefined`, and function-valued properties are dropped from plain objects and
     * class instances alike.
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

        if (type === 'function') {
            return undefined;
        }

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
                if (!this.isDangerousPropertyName(key) && typeof val !== 'function') {
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
                if (!this.isDangerousPropertyName(key) && typeof val !== 'function') {
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
     * So this parses and never runs. The expression goes through the same policy screen
     * `evaluate` applies (the AST allowlist), then the same function body `evaluate` compiles is
     * parsed in strict mode — never compiled, never invoked. Values are never consulted, which is precisely the property wanted: unknown
     * identifiers, absent properties and undefined chains all PASS, because none of them is a syntax
     * error and whether they resolve is a question about a run that has not happened yet. Pass
     * `contextKeys` when the evaluation context's keys ARE known, and unknown identifiers are refused
     * here exactly as {@link Evaluate} would refuse them.
     *
     * **Parsing is not evaluation**, and the distinction is load-bearing for safety: no code is
     * constructed from the expression here, so nothing in it can execute. The policy screen still
     * runs first, so the constructs `evaluate` refuses are refused here too — those produce a
     * permanent runtime refusal, and an author is better told now.
     *
     * Because nothing is compiled, the answer does not depend on the host allowing dynamic code (a
     * strict CSP without `unsafe-eval`). `Undecidable` is kept in the result type for callers that
     * check it, and is no longer returned.
     *
     * @param expression the expression to check
     * @param contextKeys the names the expression may reference, when known; omitted, free
     *        identifiers are left for evaluation time (see {@link ScreenExpression})
     * @returns `Valid: true` when it parses; `Valid: false` with `Error` when it does not
     */
    public ValidateSyntax(expression: string, contextKeys?: Iterable<string>): { Valid: boolean; Error?: string; Undecidable?: boolean } {
        const policyError = SafeExpressionEvaluator.ScreenExpression(expression, contextKeys ?? null);
        if (policyError) {
            return { Valid: false, Error: policyError };
        }

        try {
            // Same body `evaluate` compiles, parsed in strict mode so strict-only syntax errors are
            // caught too. Parsed, never compiled.
            parse(`"use strict"; return Boolean(${expression});`, { ecmaVersion: 2022, allowReturnOutsideFunction: true });
            return { Valid: true };
        } catch (e) {
            return { Valid: false, Error: e instanceof Error ? e.message : String(e) };
        }
    }

    /** @deprecated Use {@link ValidateSyntax}. */
    public validateSyntax(expression: string, contextKeys?: Iterable<string>): { Valid: boolean; Error?: string; Undecidable?: boolean } {
        return this.ValidateSyntax(expression, contextKeys);
    }

    /**
     * Evaluates multiple expressions and returns all results
     *
     * @param {Array<{expression: string, name?: string}>} expressions - Array of expressions to evaluate
     * @param {Record<string, any>} context - The context object
     *
     * @returns {Record<string, ExpressionEvaluationResult>} Map of results by name or index
     */
    public EvaluateMultiple(
        expressions: Array<{expression: string, name?: string}>,
        context: Record<string, any>
    ): Record<string, ExpressionEvaluationResult> {
        const results: Record<string, ExpressionEvaluationResult> = {};

        expressions.forEach((expr, index) => {
            const key = expr.name || `expression_${index}`;
            results[key] = this.Evaluate(expr.expression, context);
        });

        return results;
    }

    /** @deprecated Use {@link EvaluateMultiple}. */
    public evaluateMultiple(
        expressions: Array<{expression: string, name?: string}>,
        context: Record<string, any>
    ): Record<string, ExpressionEvaluationResult> {
        return this.EvaluateMultiple(expressions, context);
    }
}

/**
 * Default instance for convenience
 */
export const DefaultExpressionEvaluator = new SafeExpressionEvaluator();

/** @deprecated Use {@link DefaultExpressionEvaluator}. */
export const defaultExpressionEvaluator = DefaultExpressionEvaluator;
