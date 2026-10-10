import {
    create,
    parseDependencies,
    addDependencies,
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    powDependencies,
    modDependencies,
    unaryMinusDependencies,
    unaryPlusDependencies,
    absDependencies,
    acosDependencies,
    asinDependencies,
    atanDependencies,
    atan2Dependencies,
    cbrtDependencies,
    ceilDependencies,
    cosDependencies,
    coshDependencies,
    expDependencies,
    fixDependencies,
    floorDependencies,
    logDependencies,
    log10Dependencies,
    log2Dependencies,
    maxDependencies,
    minDependencies,
    randomDependencies,
    roundDependencies,
    signDependencies,
    sinDependencies,
    sinhDependencies,
    sqrtDependencies,
    tanDependencies,
    tanhDependencies,
    eDependencies,
    piDependencies,
    isConstantNode,
    isFunctionNode,
    isOperatorNode,
    isParenthesisNode,
    isSymbolNode,
    type MathNode,
} from 'mathjs/number';

/** Longest expression accepted, in characters. */
const MAX_EXPRESSION_LENGTH = 1000;

/** The mathjs function names behind the operators an expression may use: `+ - * / ^ %` and unary `-`/`+`. */
const ALLOWED_OPERATORS: ReadonlySet<string> = new Set([
    'add', 'subtract', 'multiply', 'divide', 'pow', 'mod', 'unaryMinus', 'unaryPlus',
]);

/** Constants an expression may name. `PI` and `E` are supplied in the evaluation scope. */
const ALLOWED_CONSTANTS: ReadonlySet<string> = new Set(['pi', 'PI', 'e', 'E']);

/** Functions an expression may call. `trunc` is supplied in the evaluation scope. */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
    'abs', 'acos', 'asin', 'atan', 'atan2', 'cbrt', 'ceil', 'cos', 'cosh', 'exp', 'fix', 'floor',
    'log', 'log10', 'log2', 'max', 'min', 'pow', 'random', 'round', 'sign', 'sin', 'sinh', 'sqrt',
    'tan', 'tanh', 'trunc',
]);

/**
 * A number-only mathjs instance holding the parser, the operators and the allowed functions and
 * constants, and nothing else.
 */
const math = create({
    parseDependencies,
    addDependencies, subtractDependencies, multiplyDependencies, divideDependencies, powDependencies,
    modDependencies, unaryMinusDependencies, unaryPlusDependencies,
    absDependencies, acosDependencies, asinDependencies, atanDependencies, atan2Dependencies,
    cbrtDependencies, ceilDependencies, cosDependencies, coshDependencies, expDependencies,
    fixDependencies, floorDependencies, logDependencies, log10Dependencies, log2Dependencies,
    maxDependencies, minDependencies, randomDependencies, roundDependencies, signDependencies,
    sinDependencies, sinhDependencies, sqrtDependencies, tanDependencies, tanhDependencies,
    eDependencies, piDependencies,
});

/** Names the action has always accepted that the mathjs instance spells differently. */
const SCOPE_ENTRIES: ReadonlyArray<[string, number | ((value: number) => number)]> = [
    ['trunc', Math.trunc],
    ['PI', Math.PI],
    ['E', Math.E],
];

/**
 * Evaluates arithmetic text without running it as JavaScript.
 *
 * The text is parsed by mathjs and every node of the parse tree is checked against an allowlist:
 * numeric literals, parentheses, the operators `+ - * / ^ %`, the constants in
 * {@link ALLOWED_CONSTANTS} and calls to the functions in {@link ALLOWED_FUNCTIONS}. Property
 * access, assignment, strings, arrays, objects, ranges and calls to any other function are refused
 * before anything is evaluated.
 */
export class SafeMathEvaluator {
    /**
     * Evaluates an arithmetic expression to a number. Accepts `**` for `^` and a `Math.` prefix on
     * function and constant names.
     * @param expression the arithmetic expression
     * @returns the result
     * @throws Error when the expression is too long, does not parse, uses a construct that is not
     *   allowed, or does not evaluate to a number
     */
    public Evaluate(expression: string): number {
        const text = this.normalize(expression);
        if (text.length > MAX_EXPRESSION_LENGTH) {
            throw new Error(`Expression exceeds the maximum length of ${MAX_EXPRESSION_LENGTH} characters`);
        }
        const root = math.parse(text);
        const refusal = this.findRefusal(root);
        if (refusal) {
            throw new Error(`Expression contains a construct that is not allowed: ${refusal}`);
        }
        const value: unknown = root.evaluate(new Map(SCOPE_ENTRIES));
        if (typeof value !== 'number' || Number.isNaN(value)) {
            throw new Error('Expression did not evaluate to a valid number');
        }
        return value;
    }

    /** Maps the JavaScript spellings the action has always accepted onto mathjs syntax. */
    private normalize(expression: string): string {
        return expression.trim().replace(/\*\*/g, '^').replace(/\bMath\./g, '');
    }

    /** The first node in the tree that is not allowed, described, or null when every node is allowed. */
    private findRefusal(root: MathNode): string | null {
        let refusal: string | null = null;
        root.traverse((node, path, parent) => {
            refusal ??= this.describeRefusal(node, path, parent);
        });
        return refusal;
    }

    /** Why a single node is not allowed, or null when it is. */
    private describeRefusal(node: MathNode, path: string, parent: MathNode | null): string | null {
        if (isConstantNode(node)) {
            return typeof node.value === 'number' ? null : 'only numbers are allowed as values';
        }
        if (isParenthesisNode(node)) {
            return null;
        }
        if (isOperatorNode(node)) {
            return ALLOWED_OPERATORS.has(node.fn) ? null : `the operator "${node.op}"`;
        }
        if (isFunctionNode(node)) {
            return isSymbolNode(node.fn) && ALLOWED_FUNCTIONS.has(node.fn.name) ? null : 'only the listed math functions can be called';
        }
        if (isSymbolNode(node)) {
            const isCalledName = path === 'fn' && parent !== null && isFunctionNode(parent);
            return isCalledName || ALLOWED_CONSTANTS.has(node.name) ? null : `the name "${node.name}"`;
        }
        return node.type;
    }
}
