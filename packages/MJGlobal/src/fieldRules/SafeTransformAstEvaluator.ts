import { parse } from 'acorn';
import type {
    ArrayExpression,
    ArrowFunctionExpression,
    BinaryExpression,
    CallExpression,
    ChainExpression,
    ConditionalExpression,
    Expression,
    ExpressionStatement,
    Identifier,
    Literal,
    LogicalExpression,
    MemberExpression,
    Node,
    ObjectExpression,
    Program,
    Property,
    TemplateLiteral,
    UnaryExpression,
} from 'acorn';
import { SAFE_GLOBAL_NAMESPACE_METHODS } from '../SafeExpressionEvaluator';
import type { CompiledExpression } from './FieldTransformEngine';

const MAX_EXPRESSION_LENGTH = 2000;
const MAX_AST_DEPTH = 64;
const MAX_PAD_LENGTH = 10_000;
const MAX_FLAT_DEPTH = 5;

/** Sentinel propagated inside a `ChainExpression` when an `optional` link hits null/undefined. */
const OPTIONAL_SHORT_CIRCUIT: unique symbol = Symbol('OPTIONAL_SHORT_CIRCUIT');
type EvalValue = unknown;

const DANGEROUS_IDENTIFIERS: ReadonlySet<string> = new Set<string>([
    'eval', 'Function', 'globalThis', 'global', 'window', 'document', 'process',
    'require', 'module', 'exports', '__dirname', '__filename', 'self', 'top',
    'parent', 'frames', 'Reflect', 'Proxy', 'WebAssembly', 'Atomics',
    'SharedArrayBuffer', 'import', 'arguments', 'constructor', 'prototype', '__proto__',
    'fetch', 'Buffer', 'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker',
    'ServiceWorker', 'BroadcastChannel', 'MessageChannel', 'setTimeout', 'setInterval',
    'setImmediate', 'queueMicrotask', 'crypto', 'navigator', 'location', 'history',
    'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'Deno', 'Bun',
]);

const DANGEROUS_PROPERTY_NAMES: ReadonlySet<string> = new Set<string>([
    'constructor', '__proto__', 'prototype',
]);

const ALLOWED_BINARY_OPERATORS: ReadonlySet<string> = new Set<string>([
    '==', '!=', '===', '!==', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', '**',
]);

const ALLOWED_LOGICAL_OPERATORS: ReadonlySet<string> = new Set<string>(['&&', '||', '??']);

const ALLOWED_UNARY_OPERATORS: ReadonlySet<string> = new Set<string>(['!', '-', '+', 'typeof']);

type SafeCallableFn = (...args: EvalValue[]) => EvalValue;

const SAFE_TRANSFORM_CALLABLES: ReadonlyMap<string, SafeCallableFn> = new Map<string, SafeCallableFn>([
    ['parseInt', (s, radix) => Number.parseInt(String(s), radix === undefined ? undefined : Number(radix))],
    ['parseFloat', (s) => Number.parseFloat(String(s))],
    ['isNaN', (v) => isNaN(Number(v))],
    ['isFinite', (v) => isFinite(Number(v))],
    ['Number', (v) => (v === undefined ? 0 : Number(v))],
    ['String', (v) => (v === undefined ? '' : String(v))],
    ['Boolean', (v) => Boolean(v)],
    ['encodeURIComponent', (v) => encodeURIComponent(String(v))],
    ['decodeURIComponent', (v) => decodeURIComponent(String(v))],
]);

const SAFE_CALLBACK_IDENTIFIERS: ReadonlySet<string> = new Set<string>([
    'Boolean', 'Number', 'String', 'isNaN', 'isFinite',
]);

const HIGHER_ORDER_ARRAY_METHODS: ReadonlySet<string> = new Set<string>([
    'some', 'every', 'find', 'findIndex', 'filter', 'map', 'reduce', 'flatMap',
]);

const SAFE_STRING_METHODS: ReadonlySet<string> = new Set<string>([
    'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf',
    'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd',
    'slice', 'substring', 'split', 'replace', 'replaceAll',
    'padStart', 'padEnd', 'charAt', 'charCodeAt', 'at', 'concat',
    'toString', 'valueOf',
]);

const SAFE_ARRAY_VALUE_METHODS: ReadonlySet<string> = new Set<string>([
    'includes', 'indexOf', 'lastIndexOf', 'join', 'slice', 'concat', 'flat', 'at', 'toString',
]);

const SAFE_NUMBER_METHODS: ReadonlySet<string> = new Set<string>(['toFixed', 'toString', 'valueOf']);
const SAFE_BOOLEAN_METHODS: ReadonlySet<string> = new Set<string>(['toString', 'valueOf']);
const SAFE_DATE_METHODS: ReadonlySet<string> = new Set<string>([
    'toISOString', 'getTime', 'getFullYear', 'getUTCFullYear',
    'getMonth', 'getUTCMonth', 'getDate', 'getUTCDate', 'toString', 'valueOf',
]);

const ALL_SAFE_INSTANCE_METHODS: ReadonlySet<string> = new Set<string>([
    ...SAFE_STRING_METHODS,
    ...SAFE_ARRAY_VALUE_METHODS,
    ...HIGHER_ORDER_ARRAY_METHODS,
    ...SAFE_NUMBER_METHODS,
    ...SAFE_BOOLEAN_METHODS,
    ...SAFE_DATE_METHODS,
]);

interface EvalScope {
    readonly bindings: ReadonlyMap<string, EvalValue>;
    readonly parent: EvalScope | null;
}

/**
 * Parses, structurally validates against an AST allowlist, and compiles a transform/formula
 * expression into a pure AST-interpreted {@link CompiledExpression} closure.
 *
 * Security invariants:
 * - **Never invokes `new Function` or `eval`** — eliminates dynamic JS compilation, CSP `unsafe-eval`
 *   dependence, and ambient host-global reachability (`process`, `globalThis`, `fetch`, `Buffer`, …).
 * - **Own-property-only object reads** — prototype-chain climbs (`constructor`, `__proto__`,
 *   `prototype`) are blocked at both compile time and runtime.
 * - **Intrinsic-bound method dispatch** — instance methods dispatch only against intrinsic
 *   `String` / `Array` / `Number` / `Boolean` / `Date` receivers, never arbitrary functions stored
 *   on untrusted data records.
 */
export function CompileTransformExpression(expression: string): CompiledExpression | Error {
    if (typeof expression !== 'string' || expression.trim().length === 0) {
        return new Error('Transform expression must be a non-empty string');
    }
    if (expression.length > MAX_EXPRESSION_LENGTH) {
        return new Error(`Transform expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`);
    }

    const parsed = parseSingleExpression(expression);
    if (parsed instanceof Error) {
        return parsed;
    }

    const policyError = validateNode(parsed, 0);
    if (policyError) {
        return new Error(`Transform expression rejected by the safe-expression allowlist: ${policyError}`);
    }

    return (value: unknown, fields: Record<string, unknown>): unknown => {
        const safeFields = fields && typeof fields === 'object' ? fields : {};
        const rootBindings = new Map<string, EvalValue>([
            ['value', value],
            ['fields', safeFields],
            ['undefined', undefined],
        ]);
        const rootScope: EvalScope = { bindings: rootBindings, parent: null };
        const out = evaluateNode(parsed, rootScope, 0);
        return out === OPTIONAL_SHORT_CIRCUIT ? undefined : out;
    };
}

function parseSingleExpression(expression: string): Expression | Error {
    let program: Program;
    try {
        program = parse(expression, { ecmaVersion: 2022 });
    } catch (err) {
        // Bare object literals like `{ a: 1 }` parse as a labeled BlockStatement unless parenthesized.
        if (expression.trim().startsWith('{')) {
            return parseObjectLiteralFallback(expression, err);
        }
        return err instanceof Error ? err : new Error(String(err));
    }

    if (program.body.length === 1 && program.body[0].type === 'ExpressionStatement') {
        return (program.body[0] as ExpressionStatement).expression;
    }

    if (expression.trim().startsWith('{') && program.body.length === 1 && program.body[0].type === 'BlockStatement') {
        return parseObjectLiteralFallback(expression, new Error('Block statements are not allowed'));
    }

    return new Error('Transform expression must be a single expression — statements, blocks, and semicolons are not allowed');
}

function parseObjectLiteralFallback(expression: string, originalError: unknown): Expression | Error {
    try {
        const wrapped = parse(`(\n${expression}\n)`, { ecmaVersion: 2022 });
        if (
            wrapped.body.length === 1 &&
            wrapped.body[0].type === 'ExpressionStatement' &&
            (wrapped.body[0] as ExpressionStatement).expression.type === 'ObjectExpression'
        ) {
            return (wrapped.body[0] as ExpressionStatement).expression;
        }
    } catch {
        // Fall through to original error
    }
    return originalError instanceof Error ? originalError : new Error(String(originalError));
}

function forbidden(detail: string): string {
    return `Expression contains a forbidden construct: ${detail}`;
}

function validateNode(node: Node, depth: number): string | null {
    if (depth > MAX_AST_DEPTH) {
        return forbidden(`expression nesting exceeds maximum depth of ${MAX_AST_DEPTH}`);
    }
    const next = depth + 1;

    switch (node.type) {
        case 'Literal': {
            const lit = node as Literal;
            if (lit.value instanceof RegExp || 'regex' in lit) {
                return forbidden('regular expression literals are not allowed');
            }
            if ('bigint' in lit) {
                return forbidden('BigInt literals are not allowed');
            }
            return null;
        }
        case 'TemplateLiteral': {
            const tpl = node as TemplateLiteral;
            for (const expr of tpl.expressions) {
                const err = validateNode(expr, next);
                if (err) return err;
            }
            return null;
        }
        case 'Identifier': {
            const name = (node as Identifier).name;
            if (DANGEROUS_IDENTIFIERS.has(name)) {
                return forbidden(`the identifier "${name}"`);
            }
            return null;
        }
        case 'ChainExpression':
            return validateNode((node as ChainExpression).expression, next);
        case 'MemberExpression':
            return validateMemberExpression(node as MemberExpression, next);
        case 'CallExpression':
            return validateCallExpression(node as CallExpression, next);
        case 'ArrowFunctionExpression':
            return validateArrowFunction(node as ArrowFunctionExpression, next);
        case 'BinaryExpression': {
            const bin = node as BinaryExpression;
            if (!ALLOWED_BINARY_OPERATORS.has(bin.operator)) {
                return forbidden(`the operator "${bin.operator}"`);
            }
            return validateNode(bin.left, next) ?? validateNode(bin.right, next);
        }
        case 'LogicalExpression': {
            const log = node as LogicalExpression;
            if (!ALLOWED_LOGICAL_OPERATORS.has(log.operator)) {
                return forbidden(`the logical operator "${log.operator}"`);
            }
            return validateNode(log.left, next) ?? validateNode(log.right, next);
        }
        case 'UnaryExpression': {
            const un = node as UnaryExpression;
            if (!ALLOWED_UNARY_OPERATORS.has(un.operator)) {
                return forbidden(`the unary operator "${un.operator}"`);
            }
            return validateNode(un.argument, next);
        }
        case 'ConditionalExpression': {
            const cond = node as ConditionalExpression;
            return validateNode(cond.test, next)
                ?? validateNode(cond.consequent, next)
                ?? validateNode(cond.alternate, next);
        }
        case 'ArrayExpression': {
            const arr = node as ArrayExpression;
            for (const el of arr.elements) {
                if (!el) continue;
                if (el.type === 'SpreadElement') {
                    return forbidden('spread elements are not allowed');
                }
                const err = validateNode(el, next);
                if (err) return err;
            }
            return null;
        }
        case 'ObjectExpression':
            return validateObjectExpression(node as ObjectExpression, next);
        default:
            return forbidden(`${node.type} is not allowed`);
    }
}

function validateObjectExpression(node: ObjectExpression, depth: number): string | null {
    for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') {
            return forbidden('object spread elements are not allowed');
        }
        const p = prop as Property;
        if (p.kind !== 'init' || p.method || p.computed) {
            return forbidden('only plain non-computed data properties are allowed in object literals');
        }
        let keyName: string;
        if (p.key.type === 'Identifier') {
            keyName = (p.key as Identifier).name;
        } else if (p.key.type === 'Literal' && (typeof (p.key as Literal).value === 'string' || typeof (p.key as Literal).value === 'number')) {
            keyName = String((p.key as Literal).value);
        } else {
            return forbidden('object property keys must be identifiers or string/number literals');
        }
        if (DANGEROUS_PROPERTY_NAMES.has(keyName)) {
            return forbidden(`object property key "${keyName}"`);
        }
        const err = validateNode(p.value, depth);
        if (err) return err;
    }
    return null;
}

function validateMemberExpression(node: MemberExpression, depth: number): string | null {
    if (node.property.type === 'PrivateIdentifier') {
        return forbidden('private fields are not allowed');
    }
    if (node.computed) {
        if (node.property.type !== 'Literal') {
            return forbidden('computed member access must use a literal index/key');
        }
        const val = (node.property as Literal).value;
        if (typeof val === 'string') {
            if (DANGEROUS_PROPERTY_NAMES.has(val)) {
                return forbidden(`access to "${val}"`);
            }
        } else if (typeof val !== 'number') {
            return forbidden('computed member access must use a string or numeric literal');
        }
    } else {
        const name = (node.property as Identifier).name;
        if (DANGEROUS_PROPERTY_NAMES.has(name)) {
            return forbidden(`access to "${name}"`);
        }
    }
    return validateNode(node.object, depth);
}

function validateCallExpression(node: CallExpression, depth: number): string | null {
    const callee = node.callee;

    if (callee.type === 'Identifier') {
        const name = (callee as Identifier).name;
        if (!SAFE_TRANSFORM_CALLABLES.has(name)) {
            return forbidden(`calling "${name}" — only safe methods and safe global functions may be invoked`);
        }
        return validateCallArguments(node, depth);
    }

    if (callee.type !== 'MemberExpression') {
        return forbidden('only method calls on the safe-method allowlist may be invoked');
    }
    const member = callee as MemberExpression;
    if (member.computed || member.property.type !== 'Identifier') {
        return forbidden('methods must be called by a dotted, non-computed name');
    }
    const method = (member.property as Identifier).name;
    const isNamespaceMethod =
        member.object.type === 'Identifier' &&
        SAFE_GLOBAL_NAMESPACE_METHODS.get((member.object as Identifier).name)?.has(method) === true;

    if (!isNamespaceMethod && !ALL_SAFE_INSTANCE_METHODS.has(method)) {
        return forbidden(`the method "${method}" is not on the safe-method allowlist`);
    }

    if (!isNamespaceMethod && HIGHER_ORDER_ARRAY_METHODS.has(method)) {
        const cb = node.arguments[0];
        if (!cb) {
            return forbidden(`"${method}" requires a callback argument`);
        }
        const isAllowedCallback =
            cb.type === 'ArrowFunctionExpression' ||
            (cb.type === 'Identifier' && SAFE_CALLBACK_IDENTIFIERS.has((cb as Identifier).name));
        if (!isAllowedCallback) {
            return forbidden(`"${method}" callback must be an arrow function or safe coercion (Boolean/Number/String)`);
        }
    }

    const receiverErr = validateNode(member.object, depth);
    if (receiverErr) return receiverErr;
    return validateCallArguments(node, depth);
}

function validateCallArguments(node: CallExpression, depth: number): string | null {
    for (const arg of node.arguments) {
        if (arg.type === 'SpreadElement') {
            return forbidden('spread arguments are not allowed');
        }
        const err = validateNode(arg, depth);
        if (err) return err;
    }
    return null;
}

function validateArrowFunction(node: ArrowFunctionExpression, depth: number): string | null {
    if (node.async || node.generator) {
        return forbidden('async/generator functions are not allowed');
    }
    for (const param of node.params) {
        if (param.type !== 'Identifier') {
            return forbidden('arrow-function parameters must be simple identifiers');
        }
        const name = (param as Identifier).name;
        if (DANGEROUS_IDENTIFIERS.has(name)) {
            return forbidden(`the parameter "${name}"`);
        }
    }
    if (node.body.type === 'BlockStatement') {
        return forbidden('arrow-function bodies must be an expression, not a block');
    }
    return validateNode(node.body, depth);
}

// ─── Runtime AST Interpreter ─────────────────────────────────────────────────

function evaluateNode(node: Node, scope: EvalScope, depth: number): EvalValue {
    if (depth > MAX_AST_DEPTH) {
        throw new RangeError(`Transform expression evaluation exceeded maximum depth of ${MAX_AST_DEPTH}`);
    }
    const next = depth + 1;

    switch (node.type) {
        case 'Literal':
            return (node as Literal).value;
        case 'TemplateLiteral': {
            const tpl = node as TemplateLiteral;
            let out = '';
            for (let i = 0; i < tpl.quasis.length; i++) {
                out += tpl.quasis[i].value.cooked ?? tpl.quasis[i].value.raw;
                if (i < tpl.expressions.length) {
                    const part = unwrapOptional(evaluateNode(tpl.expressions[i], scope, next));
                    out += String(part);
                }
            }
            return out;
        }
        case 'Identifier':
            return resolveIdentifier((node as Identifier).name, scope, true);
        case 'ChainExpression': {
            const inner = evaluateNode((node as ChainExpression).expression, scope, next);
            return inner === OPTIONAL_SHORT_CIRCUIT ? undefined : inner;
        }
        case 'MemberExpression':
            return evaluateMemberExpression(node as MemberExpression, scope, next);
        case 'CallExpression':
            return evaluateCallExpression(node as CallExpression, scope, next);
        case 'ArrowFunctionExpression':
            return evaluateArrowFunction(node as ArrowFunctionExpression, scope, next);
        case 'BinaryExpression':
            return evaluateBinaryExpression(node as BinaryExpression, scope, next);
        case 'LogicalExpression':
            return evaluateLogicalExpression(node as LogicalExpression, scope, next);
        case 'UnaryExpression':
            return evaluateUnaryExpression(node as UnaryExpression, scope, next);
        case 'ConditionalExpression': {
            const cond = node as ConditionalExpression;
            const test = unwrapOptional(evaluateNode(cond.test, scope, next));
            return test
                ? unwrapOptional(evaluateNode(cond.consequent, scope, next))
                : unwrapOptional(evaluateNode(cond.alternate, scope, next));
        }
        case 'ArrayExpression': {
            const arr = node as ArrayExpression;
            return arr.elements.map((el) => (el ? unwrapOptional(evaluateNode(el, scope, next)) : undefined));
        }
        case 'ObjectExpression': {
            const obj = node as ObjectExpression;
            const result: Record<string, unknown> = {};
            for (const prop of obj.properties) {
                const p = prop as Property;
                const key = p.key.type === 'Identifier'
                    ? (p.key as Identifier).name
                    : String((p.key as Literal).value);
                if (!DANGEROUS_PROPERTY_NAMES.has(key)) {
                    result[key] = unwrapOptional(evaluateNode(p.value, scope, next));
                }
            }
            return result;
        }
        default:
            throw new Error(`Unsupported AST node type: ${node.type}`);
    }
}

function unwrapOptional(val: EvalValue): EvalValue {
    return val === OPTIONAL_SHORT_CIRCUIT ? undefined : val;
}

function hasLexicalBinding(name: string, scope: EvalScope | null): boolean {
    let cur = scope;
    while (cur) {
        if (cur.bindings.has(name)) return true;
        cur = cur.parent;
    }
    return false;
}

function resolveIdentifier(name: string, scope: EvalScope | null, throwIfUnbound: boolean): EvalValue {
    let cur = scope;
    while (cur) {
        if (cur.bindings.has(name)) {
            return cur.bindings.get(name);
        }
        cur = cur.parent;
    }
    const callable = SAFE_TRANSFORM_CALLABLES.get(name);
    if (callable) {
        return callable;
    }
    if (throwIfUnbound) {
        throw new ReferenceError(`${name} is not defined`);
    }
    return undefined;
}

function evaluateMemberExpression(node: MemberExpression, scope: EvalScope, depth: number): EvalValue {
    const target = evaluateNode(node.object, scope, depth);
    if (target === OPTIONAL_SHORT_CIRCUIT) {
        return OPTIONAL_SHORT_CIRCUIT;
    }
    if (node.optional && (target === null || target === undefined)) {
        return OPTIONAL_SHORT_CIRCUIT;
    }
    const key: string | number = node.computed
        ? ((node.property as Literal).value as string | number)
        : (node.property as Identifier).name;

    return readSafeProperty(target, key);
}

function readSafeProperty(target: EvalValue, key: string | number): EvalValue {
    if (target === null || target === undefined) {
        throw new TypeError(`Cannot read properties of ${String(target)} (reading '${String(key)}')`);
    }
    const keyStr = String(key);
    if (DANGEROUS_PROPERTY_NAMES.has(keyStr)) {
        throw new Error(`Access to property "${keyStr}" is forbidden`);
    }

    if (typeof target === 'string') {
        if (key === 'length') return target.length;
        const idx = typeof key === 'number' ? key : (/^\d+$/.test(keyStr) ? Number(keyStr) : -1);
        return Number.isInteger(idx) && idx >= 0 ? target[idx] : undefined;
    }

    if (Array.isArray(target)) {
        if (key === 'length') return target.length;
        const idx = typeof key === 'number' ? key : (/^\d+$/.test(keyStr) ? Number(keyStr) : -1);
        return Number.isInteger(idx) && idx >= 0 ? target[idx] : undefined;
    }

    if (typeof target === 'object') {
        return Object.prototype.hasOwnProperty.call(target, keyStr)
            ? (target as Record<string, unknown>)[keyStr]
            : undefined;
    }

    return undefined;
}

function evaluateCallExpression(node: CallExpression, scope: EvalScope, depth: number): EvalValue {
    const callee = node.callee;

    if (callee.type === 'Identifier') {
        const name = (callee as Identifier).name;
        const fn = SAFE_TRANSFORM_CALLABLES.get(name);
        if (!fn) {
            throw new TypeError(`${name} is not a safe callable function`);
        }
        const args = node.arguments.map((a) => unwrapOptional(evaluateNode(a, scope, depth)));
        return fn(...args);
    }

    const member = callee as MemberExpression;
    const method = (member.property as Identifier).name;

    // Namespace static method (Math.abs, JSON.parse, Object.keys, Array.isArray, Number.isFinite, Date.now)
    if (
        member.object.type === 'Identifier' &&
        !hasLexicalBinding((member.object as Identifier).name, scope) &&
        SAFE_GLOBAL_NAMESPACE_METHODS.get((member.object as Identifier).name)?.has(method) === true
    ) {
        const nsName = (member.object as Identifier).name;
        const args = node.arguments.map((a) => unwrapOptional(evaluateNode(a, scope, depth)));
        return invokeNamespaceMethod(nsName, method, args);
    }

    const receiver = evaluateNode(member.object, scope, depth);
    if (receiver === OPTIONAL_SHORT_CIRCUIT) {
        return OPTIONAL_SHORT_CIRCUIT;
    }
    if ((member.optional || node.optional) && (receiver === null || receiver === undefined)) {
        return OPTIONAL_SHORT_CIRCUIT;
    }
    if (receiver === null || receiver === undefined) {
        throw new TypeError(`Cannot read properties of ${String(receiver)} (reading '${method}')`);
    }

    const args = node.arguments.map((a) => unwrapOptional(evaluateNode(a, scope, depth)));
    return invokeInstanceMethod(receiver, method, args);
}

function invokeMathMethod(method: string, args: EvalValue[]): number {
    const n0 = Number(args[0]);
    const n1 = Number(args[1]);
    switch (method) {
        case 'abs': return Math.abs(n0);
        case 'ceil': return Math.ceil(n0);
        case 'floor': return Math.floor(n0);
        case 'round': return Math.round(n0);
        case 'trunc': return Math.trunc(n0);
        case 'sign': return Math.sign(n0);
        case 'min': return Math.min(...args.map((a) => Number(a)));
        case 'max': return Math.max(...args.map((a) => Number(a)));
        case 'pow': return Math.pow(n0, n1);
        case 'sqrt': return Math.sqrt(n0);
        case 'cbrt': return Math.cbrt(n0);
        case 'log': return Math.log(n0);
        case 'log2': return Math.log2(n0);
        case 'log10': return Math.log10(n0);
        case 'exp': return Math.exp(n0);
        case 'hypot': return Math.hypot(...args.map((a) => Number(a)));
        default:
            throw new TypeError(`Unsupported Math method "${method}"`);
    }
}

function invokeNamespaceMethod(ns: string, method: string, args: EvalValue[]): EvalValue {
    switch (ns) {
        case 'Math':
            return invokeMathMethod(method, args);
        case 'JSON':
            if (method === 'parse') return JSON.parse(String(args[0]));
            if (method === 'stringify') return JSON.stringify(args[0]);
            break;
        case 'Object':
            if (args[0] === null || args[0] === undefined) {
                throw new TypeError('Cannot convert undefined or null to object');
            }
            if (method === 'keys') return Object.keys(Object(args[0]));
            if (method === 'values') return Object.values(Object(args[0]));
            if (method === 'entries') return Object.entries(Object(args[0]));
            break;
        case 'Array':
            if (method === 'isArray') return Array.isArray(args[0]);
            break;
        case 'Number':
            if (method === 'isInteger') return Number.isInteger(args[0]);
            if (method === 'isFinite') return Number.isFinite(args[0]);
            if (method === 'isNaN') return Number.isNaN(args[0]);
            if (method === 'isSafeInteger') return Number.isSafeInteger(args[0]);
            if (method === 'parseInt') return Number.parseInt(String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
            if (method === 'parseFloat') return Number.parseFloat(String(args[0]));
            break;
        case 'Date':
            if (method === 'now') return Date.now();
            break;
    }
    throw new TypeError(`Unsupported namespace call ${ns}.${method}`);
}

function invokeInstanceMethod(receiver: EvalValue, method: string, args: EvalValue[]): EvalValue {
    if (typeof receiver === 'string' && SAFE_STRING_METHODS.has(method)) {
        return invokeStringMethod(receiver, method, args);
    }
    if (Array.isArray(receiver) && (SAFE_ARRAY_VALUE_METHODS.has(method) || HIGHER_ORDER_ARRAY_METHODS.has(method))) {
        return invokeArrayMethod(receiver, method, args);
    }
    if (typeof receiver === 'number' && SAFE_NUMBER_METHODS.has(method)) {
        if (method === 'toFixed') return receiver.toFixed(args[0] === undefined ? undefined : Number(args[0]));
        if (method === 'toString') return receiver.toString(args[0] === undefined ? undefined : Number(args[0]));
        if (method === 'valueOf') return receiver.valueOf();
    }
    if (typeof receiver === 'boolean' && SAFE_BOOLEAN_METHODS.has(method)) {
        return method === 'toString' ? receiver.toString() : receiver.valueOf();
    }
    if (receiver instanceof Date && SAFE_DATE_METHODS.has(method)) {
        return invokeDateMethod(receiver, method);
    }
    throw new TypeError(`Method "${method}" is not callable on value of type ${typeof receiver}`);
}

function invokeStringMethod(s: string, method: string, args: EvalValue[]): EvalValue {
    switch (method) {
        case 'includes': return s.includes(String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'startsWith': return s.startsWith(String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'endsWith': return s.endsWith(String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'indexOf': return s.indexOf(String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'lastIndexOf': return s.lastIndexOf(String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'toLowerCase': return s.toLowerCase();
        case 'toUpperCase': return s.toUpperCase();
        case 'trim': return s.trim();
        case 'trimStart': return s.trimStart();
        case 'trimEnd': return s.trimEnd();
        case 'slice': return s.slice(args[0] === undefined ? undefined : Number(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'substring': return s.substring(Number(args[0] ?? 0), args[1] === undefined ? undefined : Number(args[1]));
        case 'split': return s.split(args[0] === undefined ? '' : String(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'replace': {
            if (typeof args[0] !== 'string' || typeof args[1] !== 'string') {
                throw new TypeError('String.replace in safe expressions requires string search and replacement arguments');
            }
            const replacement = args[1];
            return s.replace(args[0], () => replacement);
        }
        case 'replaceAll': {
            if (typeof args[0] !== 'string' || typeof args[1] !== 'string') {
                throw new TypeError('String.replaceAll in safe expressions requires string search and replacement arguments');
            }
            const replacement = args[1];
            return s.replaceAll(args[0], () => replacement);
        }
        case 'padStart': {
            const targetLen = Math.min(Number(args[0] ?? 0), MAX_PAD_LENGTH);
            return s.padStart(targetLen, args[1] === undefined ? undefined : String(args[1]));
        }
        case 'padEnd': {
            const targetLen = Math.min(Number(args[0] ?? 0), MAX_PAD_LENGTH);
            return s.padEnd(targetLen, args[1] === undefined ? undefined : String(args[1]));
        }
        case 'charAt': return s.charAt(Number(args[0] ?? 0));
        case 'charCodeAt': return s.charCodeAt(Number(args[0] ?? 0));
        case 'at': return s.at(Number(args[0] ?? 0));
        case 'concat': return s.concat(...args.map((a) => String(a)));
        case 'toString':
        case 'valueOf':
            return s;
        default:
            throw new TypeError(`Unsupported string method "${method}"`);
    }
}

function invokeArrayMethod(arr: EvalValue[], method: string, args: EvalValue[]): EvalValue {
    if (HIGHER_ORDER_ARRAY_METHODS.has(method)) {
        const cb = args[0];
        if (typeof cb !== 'function') {
            throw new TypeError(`"${method}" callback is not a function`);
        }
        const fn = cb as (item: EvalValue, idx: number, array: EvalValue[]) => EvalValue;
        switch (method) {
            case 'some': return arr.some((item, idx, a) => Boolean(fn(item, idx, a)));
            case 'every': return arr.every((item, idx, a) => Boolean(fn(item, idx, a)));
            case 'find': return arr.find((item, idx, a) => Boolean(fn(item, idx, a)));
            case 'findIndex': return arr.findIndex((item, idx, a) => Boolean(fn(item, idx, a)));
            case 'filter': return arr.filter((item, idx, a) => Boolean(fn(item, idx, a)));
            case 'map': return arr.map((item, idx, a) => fn(item, idx, a));
            case 'flatMap': return arr.flatMap((item, idx, a) => fn(item, idx, a));
            case 'reduce': {
                const reducer = cb as (acc: EvalValue, item: EvalValue, idx: number, array: EvalValue[]) => EvalValue;
                return args.length >= 2
                    ? arr.reduce((acc, item, idx, a) => reducer(acc, item, idx, a), args[1])
                    : arr.reduce((acc, item, idx, a) => reducer(acc, item, idx, a));
            }
        }
    }

    switch (method) {
        case 'includes': return arr.includes(args[0], args[1] === undefined ? undefined : Number(args[1]));
        case 'indexOf': return arr.indexOf(args[0], args[1] === undefined ? undefined : Number(args[1]));
        case 'lastIndexOf': return arr.lastIndexOf(args[0], args[1] === undefined ? undefined : Number(args[1]));
        case 'join': return arr.join(args[0] === undefined ? ',' : String(args[0]));
        case 'slice': return arr.slice(args[0] === undefined ? undefined : Number(args[0]), args[1] === undefined ? undefined : Number(args[1]));
        case 'concat': return arr.concat(...args);
        case 'flat': return arr.flat(Math.min(Math.max(0, Number(args[0] ?? 1)), MAX_FLAT_DEPTH));
        case 'at': return arr.at(Number(args[0] ?? 0));
        case 'toString': return arr.toString();
        default:
            throw new TypeError(`Unsupported array method "${method}"`);
    }
}

function invokeDateMethod(d: Date, method: string): EvalValue {
    switch (method) {
        case 'toISOString': return d.toISOString();
        case 'getTime': return d.getTime();
        case 'getFullYear': return d.getFullYear();
        case 'getUTCFullYear': return d.getUTCFullYear();
        case 'getMonth': return d.getMonth();
        case 'getUTCMonth': return d.getUTCMonth();
        case 'getDate': return d.getDate();
        case 'getUTCDate': return d.getUTCDate();
        case 'toString': return d.toString();
        case 'valueOf': return d.valueOf();
        default:
            throw new TypeError(`Unsupported Date method "${method}"`);
    }
}

function evaluateArrowFunction(node: ArrowFunctionExpression, parentScope: EvalScope, depth: number): SafeCallableFn {
    const paramNames = node.params.map((p) => (p as Identifier).name);
    return (...callArgs: EvalValue[]): EvalValue => {
        const bindings = new Map<string, EvalValue>();
        for (let i = 0; i < paramNames.length; i++) {
            bindings.set(paramNames[i], callArgs[i]);
        }
        const childScope: EvalScope = { bindings, parent: parentScope };
        return unwrapOptional(evaluateNode(node.body, childScope, depth));
    };
}

function evaluateBinaryExpression(node: BinaryExpression, scope: EvalScope, depth: number): EvalValue {
    const left = unwrapOptional(evaluateNode(node.left, scope, depth));
    const right = unwrapOptional(evaluateNode(node.right, scope, depth));

    switch (node.operator) {
        // eslint-disable-next-line eqeqeq
        case '==': return left == right;
        // eslint-disable-next-line eqeqeq
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return (left as number) < (right as number);
        case '<=': return (left as number) <= (right as number);
        case '>': return (left as number) > (right as number);
        case '>=': return (left as number) >= (right as number);
        case '+':
            if (typeof left === 'string' || typeof right === 'string') {
                return `${String(left)}${String(right)}`;
            }
            return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/': return Number(left) / Number(right);
        case '%': return Number(left) % Number(right);
        case '**': return Number(left) ** Number(right);
        default:
            throw new Error(`Unsupported binary operator "${node.operator}"`);
    }
}

function evaluateLogicalExpression(node: LogicalExpression, scope: EvalScope, depth: number): EvalValue {
    const left = unwrapOptional(evaluateNode(node.left, scope, depth));
    switch (node.operator) {
        case '&&': return left ? unwrapOptional(evaluateNode(node.right, scope, depth)) : left;
        case '||': return left ? left : unwrapOptional(evaluateNode(node.right, scope, depth));
        case '??': return left !== null && left !== undefined ? left : unwrapOptional(evaluateNode(node.right, scope, depth));
        default:
            throw new Error(`Unsupported logical operator "${node.operator}"`);
    }
}

function evaluateUnaryExpression(node: UnaryExpression, scope: EvalScope, depth: number): EvalValue {
    if (node.operator === 'typeof') {
        if (node.argument.type === 'Identifier') {
            const name = (node.argument as Identifier).name;
            if (!hasLexicalBinding(name, scope) && !SAFE_TRANSFORM_CALLABLES.has(name)) {
                return 'undefined';
            }
        }
        return typeof unwrapOptional(evaluateNode(node.argument, scope, depth));
    }
    const arg = unwrapOptional(evaluateNode(node.argument, scope, depth));
    switch (node.operator) {
        case '!': return !arg;
        case '-': return -Number(arg);
        case '+': return +Number(arg);
        default:
            throw new Error(`Unsupported unary operator "${node.operator}"`);
    }
}
