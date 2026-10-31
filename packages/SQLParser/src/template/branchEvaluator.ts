import type { InlineIfExpression, NameExpression, TemplateExpression, TemplateLiteralValue } from './expressionTypes.js';

/**
 * The value a branch variant gives a parameter.
 *
 * - `Sample`: a representative value of the parameter's type that is truthy (a non-empty
 *   string or array, a non-zero number, `true`, a date). The caller picks the actual value.
 * - `Absent`: no value; the parameter is left out, so it is falsy.
 * - `Literal`: exactly this value, to satisfy a comparison such as `mode == 'big'`.
 */
export type BranchValue =
    | { readonly Kind: 'Sample' }
    | { readonly Kind: 'Absent' }
    | { readonly Kind: 'Literal'; readonly Value: TemplateLiteralValue };

/** Looks up the branch value of a parameter; `undefined` when it has none. */
export type BranchLookup = (name: string) => BranchValue | undefined;

/** Looks up the value of a `loop.<member>`, such as `last`; `undefined` when it cannot be known. */
export type LoopMemberLookup = (member: string) => TemplateLiteralValue | undefined;

/**
 * What an expression is known to evaluate to. `SampleLength` is the length of a `Sample`: a
 * whole number of at least 1, whose exact value is not known.
 */
type Abstract =
    | { readonly Kind: 'Absent' }
    | { readonly Kind: 'Sample' }
    | { readonly Kind: 'SampleLength' }
    | { readonly Kind: 'Value'; readonly Value: TemplateLiteralValue }
    | { readonly Kind: 'Unknown' };

const UNKNOWN: Abstract = { Kind: 'Unknown' };
const SAMPLE: Abstract = { Kind: 'Sample' };
const ABSENT: Abstract = { Kind: 'Absent' };
const SAMPLE_LENGTH: Abstract = { Kind: 'SampleLength' };
const RELATIONAL: ReadonlySet<string> = new Set(['<', '>', '<=', '>=']);
const MIRRORED: Readonly<Record<string, string>> = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '==', '!=': '!=' };

/**
 * Evaluates `{% if %}` conditions over branch values, as far as they can be known. A `Sample`
 * is truthy but cannot be compared, and its length is at least 1; loop values and filtered values
 * are unknown. `<name>.length` of an absent value, or of a value with no length, is `undefined`,
 * so every comparison with it but `!=` is false. An inline if takes the branch its condition
 * picks. Comparisons and arithmetic on literals follow the template engine's (JavaScript's) rules.
 */
export class BranchEvaluator {
    /**
     * @param lookup - The branch value of each parameter.
     * @param opaqueNames - Names whose value cannot be known: loop and `{% set %}` variables.
     * @param loopMembers - The values of `loop.<member>`, when a caller knows the iteration; without it they are unknown.
     */
    constructor(
        private readonly lookup: BranchLookup,
        private readonly opaqueNames: ReadonlySet<string>,
        private readonly loopMembers: LoopMemberLookup | null = null,
    ) {}

    /** Whether the expression is truthy: `true`, `false`, or `null` when it cannot be known. */
    Truth(expression: TemplateExpression): boolean | null {
        return truthOf(this.evaluate(expression));
    }

    private evaluate(expression: TemplateExpression): Abstract {
        switch (expression.Kind) {
            case 'Literal': return { Kind: 'Value', Value: expression.Value };
            case 'Name': return this.evaluateName(expression.Name);
            case 'Context': return SAMPLE;
            case 'LoopMember': return this.evaluateLoopMember(expression.Member);
            case 'Length': return this.evaluateLength(expression.Object);
            case 'InlineIf': return this.evaluateInlineIf(expression);
            case 'Unary': return this.evaluateUnary(expression.Operator, this.evaluate(expression.Operand));
            case 'Binary': return this.evaluateBinary(expression.Operator, expression.Left, expression.Right);
            default: return UNKNOWN;
        }
    }

    private evaluateName(name: string): Abstract {
        if (this.opaqueNames.has(name)) return UNKNOWN;
        const value = this.lookup(name);
        if (value === undefined || value.Kind === 'Absent') return { Kind: 'Absent' };
        if (value.Kind === 'Sample') return SAMPLE;
        return { Kind: 'Value', Value: value.Value };
    }

    private evaluateLength(object: NameExpression): Abstract {
        const value = this.evaluateName(object.Name);
        switch (value.Kind) {
            case 'Sample': return SAMPLE_LENGTH;
            case 'Value': return typeof value.Value === 'string' ? { Kind: 'Value', Value: value.Value.length } : ABSENT;
            case 'Absent': return ABSENT;
            default: return UNKNOWN;
        }
    }

    /** The branch the condition picks; with no `else`, a false condition gives the empty string. */
    private evaluateInlineIf(expression: InlineIfExpression): Abstract {
        const truth = this.Truth(expression.Condition);
        if (truth === null) return UNKNOWN;
        if (truth) return this.evaluate(expression.Body);
        return expression.Else === null ? { Kind: 'Value', Value: '' } : this.evaluate(expression.Else);
    }

    private evaluateLoopMember(member: string): Abstract {
        const value = this.loopMembers?.(member);
        return value === undefined ? UNKNOWN : { Kind: 'Value', Value: value };
    }

    private evaluateUnary(operator: string, operand: Abstract): Abstract {
        if (operator === 'not') {
            const truth = truthOf(operand);
            return truth === null ? UNKNOWN : { Kind: 'Value', Value: !truth };
        }
        if (operand.Kind !== 'Value' || typeof operand.Value !== 'number') return UNKNOWN;
        return { Kind: 'Value', Value: operator === '-' ? -operand.Value : operand.Value };
    }

    private evaluateBinary(operator: string, left: TemplateExpression, right: TemplateExpression): Abstract {
        if (operator === 'and' || operator === 'or') return this.evaluateLogical(operator, left, right);
        const a = this.evaluate(left);
        const b = this.evaluate(right);
        if (a.Kind === 'SampleLength') return compareSampleLength(operator, b);
        if (b.Kind === 'SampleLength') return compareSampleLength(MIRRORED[operator] ?? '', a);
        if (!isComparable(a) || !isComparable(b)) return UNKNOWN;
        const x = a.Kind === 'Absent' ? undefined : a.Value;
        const y = b.Kind === 'Absent' ? undefined : b.Value;
        const result = applyOperator(operator, x, y);
        return result === undefined ? UNKNOWN : { Kind: 'Value', Value: result };
    }

    private evaluateLogical(operator: 'and' | 'or', left: TemplateExpression, right: TemplateExpression): Abstract {
        const l = this.Truth(left);
        const decisive = operator === 'or';
        if (l === decisive) return { Kind: 'Value', Value: decisive };
        const r = this.Truth(right);
        if (l === null) return r === decisive ? { Kind: 'Value', Value: decisive } : UNKNOWN;
        return r === null ? UNKNOWN : { Kind: 'Value', Value: r };
    }
}

function truthOf(value: Abstract): boolean | null {
    switch (value.Kind) {
        case 'Absent': return false;
        case 'Sample': return true;
        case 'SampleLength': return true;
        case 'Value': return Boolean(value.Value);
        default: return null;
    }
}

function isComparable(value: Abstract): value is { readonly Kind: 'Absent' } | { readonly Kind: 'Value'; readonly Value: TemplateLiteralValue } {
    return value.Kind === 'Absent' || value.Kind === 'Value';
}

type Primitive = TemplateLiteralValue | undefined;

/**
 * `length <operator> other`, where the length is a whole number of at least 1: known only when
 * every such number gives the same answer. Arithmetic on it is unknown.
 */
function compareSampleLength(operator: string, other: Abstract): Abstract {
    if (other.Kind === 'Absent' || (other.Kind === 'Value' && other.Value === null)) {
        if (operator === '==' || operator === '!=') return { Kind: 'Value', Value: operator === '!=' };
    }
    const bound = other.Kind === 'Absent' ? NaN : other.Kind === 'Value' ? Number(other.Value) : null;
    if (bound === null || (other.Kind === 'Value' && typeof other.Value === 'string')) return UNKNOWN;
    const result = lengthComparison(operator, bound);
    return result === null ? UNKNOWN : { Kind: 'Value', Value: result };
}

/** Whether every whole number n >= 1 gives the same `n <operator> bound`: that answer, or `null`. */
function lengthComparison(operator: string, bound: number): boolean | null {
    if (isNaN(bound)) return RELATIONAL.has(operator) ? false : null;
    const reachable = bound >= 1 && Number.isInteger(bound);
    switch (operator) {
        case '>': return bound < 1 ? true : null;
        case '>=': return bound <= 1 ? true : null;
        case '<': return bound <= 1 ? false : null;
        case '<=': return bound < 1 ? false : null;
        case '==': return reachable ? null : false;
        case '!=': return reachable ? null : true;
        default: return null;
    }
}

/** Applies an operator with JavaScript's rules; `undefined` when the result is not a literal value. */
function applyOperator(operator: string, x: Primitive, y: Primitive): TemplateLiteralValue | undefined {
    switch (operator) {
        case '==': return looseEquals(x, y);
        case '!=': return !looseEquals(x, y);
        case '<': return relational(x, y, (a, b) => a < b, (a, b) => a < b);
        case '>': return relational(x, y, (a, b) => a > b, (a, b) => a > b);
        case '<=': return relational(x, y, (a, b) => a <= b, (a, b) => a <= b);
        case '>=': return relational(x, y, (a, b) => a >= b, (a, b) => a >= b);
        default: return arithmetic(operator, x, y);
    }
}

/** JavaScript `==` over primitives. */
function looseEquals(x: Primitive, y: Primitive): boolean {
    if (x === undefined || x === null || y === undefined || y === null) return (x ?? null) === (y ?? null);
    if (typeof x === typeof y) return x === y;
    return Number(x) === Number(y);
}

/** JavaScript `<`-style comparison: strings compare as strings, anything else as numbers. */
function relational(x: Primitive, y: Primitive, onStrings: (a: string, b: string) => boolean, onNumbers: (a: number, b: number) => boolean): boolean {
    if (typeof x === 'string' && typeof y === 'string') return onStrings(x, y);
    const a = x === undefined ? NaN : Number(x);
    const b = y === undefined ? NaN : Number(y);
    return onNumbers(a, b);
}

function arithmetic(operator: string, x: Primitive, y: Primitive): TemplateLiteralValue | undefined {
    if (operator === '+' && (typeof x === 'string' || typeof y === 'string')) return `${x ?? ''}${y ?? ''}`;
    if (typeof x !== 'number' || typeof y !== 'number') return undefined;
    switch (operator) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': return x / y;
        case '%': return x % y;
        default: return undefined;
    }
}
