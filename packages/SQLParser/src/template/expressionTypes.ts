import type { Span } from '../common/analysis.js';

/** Binary operators of the MJ Query expression grammar. */
export type TemplateBinaryOperator = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '>' | '<=' | '>=' | 'and' | 'or';

/** Unary operators of the MJ Query expression grammar. */
export type TemplateUnaryOperator = 'not' | '-' | '+';

/**
 * Why an expression is outside the grammar.
 *
 * - `FunctionCall`: `f(x)` or `x.method()`.
 * - `Subscript`: `x[0]`.
 * - `MemberAccess`: `x.y`, other than `Context.<Token>`, `loop.<member>` and `<name>.length`.
 * - `Operator`: an operator or literal form the grammar leaves out (`in`, `is`, `~`, `**`, `//`, `===`, lists, objects).
 * - `Syntax`: text that does not parse at all.
 */
export type UnsupportedConstruct = 'FunctionCall' | 'Subscript' | 'MemberAccess' | 'Operator' | 'Syntax';

/** The value of a literal. */
export type TemplateLiteralValue = string | number | boolean | null;

/** A parameter, loop variable or `{% set %}` variable, by name. */
export interface NameExpression {
    readonly Kind: 'Name';
    readonly Span: Span;
    readonly Name: string;
}

/** `Context.<Token>`: a value the server fills from the context user and the clock. */
export interface ContextExpression {
    readonly Kind: 'Context';
    readonly Span: Span;
    /** The token after `Context.`, such as `UserID`. */
    readonly Token: string;
    /** The whole reference, such as `Context.UserID`. */
    readonly FullName: string;
}

/** `loop.<member>` inside a `{% for %}` body, such as `loop.first`. */
export interface LoopMemberExpression {
    readonly Kind: 'LoopMember';
    readonly Span: Span;
    readonly Member: string;
}

/**
 * `<name>.length`: the length of the array or string a name holds. Like the template engine, a
 * name with no value, or a value with no length, gives `undefined`.
 */
export interface LengthExpression {
    readonly Kind: 'Length';
    readonly Span: Span;
    /** The name whose value's length is read. */
    readonly Object: NameExpression;
}

/**
 * `body if condition else otherwise`, or `body if condition`: `body` when the condition is
 * truthy, otherwise `otherwise`, or the empty string when there is no `else`.
 */
export interface InlineIfExpression {
    readonly Kind: 'InlineIf';
    readonly Span: Span;
    readonly Body: TemplateExpression;
    readonly Condition: TemplateExpression;
    readonly Else: TemplateExpression | null;
}

/** A string, number, boolean or null literal. */
export interface LiteralExpression {
    readonly Kind: 'Literal';
    readonly Span: Span;
    readonly LiteralType: 'String' | 'Number' | 'Boolean' | 'Null';
    readonly Value: TemplateLiteralValue;
}

/** `not x`, `-x` or `+x`. */
export interface UnaryExpression {
    readonly Kind: 'Unary';
    readonly Span: Span;
    readonly Operator: TemplateUnaryOperator;
    readonly Operand: TemplateExpression;
}

/** An arithmetic, comparison or logical operation. */
export interface BinaryExpression {
    readonly Kind: 'Binary';
    readonly Span: Span;
    readonly Operator: TemplateBinaryOperator;
    readonly Left: TemplateExpression;
    readonly Right: TemplateExpression;
}

/** `input | name` or `input | name(arguments)`. */
export interface FilterExpression {
    readonly Kind: 'Filter';
    readonly Span: Span;
    readonly Input: TemplateExpression;
    readonly Name: string;
    readonly NameSpan: Span;
    readonly Arguments: readonly TemplateExpression[];
}

/**
 * An expression outside the grammar. Its readable sub-expressions are kept in {@link Parts}, so
 * the names it reads are still known.
 */
export interface UnsupportedExpression {
    readonly Kind: 'Unsupported';
    readonly Span: Span;
    readonly Construct: UnsupportedConstruct;
    readonly Text: string;
    readonly Parts: readonly TemplateExpression[];
}

/**
 * An expression of the MJ Query language. Consumers must handle kinds they do not recognise:
 * kinds may be added.
 */
export type TemplateExpression =
    | NameExpression
    | ContextExpression
    | LoopMemberExpression
    | LengthExpression
    | InlineIfExpression
    | LiteralExpression
    | UnaryExpression
    | BinaryExpression
    | FilterExpression
    | UnsupportedExpression;

/** The sub-expressions of an expression, in source order. */
export function ExpressionChildren(expression: TemplateExpression): readonly TemplateExpression[] {
    switch (expression.Kind) {
        case 'Length': return [expression.Object];
        case 'InlineIf': return expression.Else === null ? [expression.Body, expression.Condition] : [expression.Body, expression.Condition, expression.Else];
        case 'Unary': return [expression.Operand];
        case 'Binary': return [expression.Left, expression.Right];
        case 'Filter': return [expression.Input, ...expression.Arguments];
        case 'Unsupported': return expression.Parts;
        default: return [];
    }
}

/** Calls `visit` on an expression and every sub-expression, parents first. */
export function WalkExpression(expression: TemplateExpression, visit: (node: TemplateExpression) => void): void {
    const stack: TemplateExpression[] = [expression];
    let node = stack.pop();
    while (node !== undefined) {
        visit(node);
        const children = ExpressionChildren(node);
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        node = stack.pop();
    }
}
