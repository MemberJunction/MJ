import type { Span } from '../common/analysis.js';
import type { SqlToken, TemplateSqlContext } from '../lexer/sqlTokenTypes.js';
import type { TemplateExpression } from './expressionTypes.js';

/** A run of SQL between template tags. */
export interface SqlTextNode {
    readonly Kind: 'SqlText';
    readonly Span: Span;
    readonly Text: string;
    readonly Tokens: readonly SqlToken[];
}

/** A `{{ … }}` hole that writes a value into the SQL. */
export interface ExpressionNode {
    readonly Kind: 'Expression';
    readonly Span: Span;
    readonly Token: SqlToken;
    readonly Expression: TemplateExpression;
    readonly SqlContext: TemplateSqlContext;
}

/** One `{% if %}` or `{% elif %}` branch: its condition and body. */
export interface IfBranch {
    readonly Kind: 'If' | 'ElseIf';
    /** From the branch's tag to the end of its body. */
    readonly Span: Span;
    readonly TagSpan: Span;
    readonly Condition: TemplateExpression;
    readonly Body: readonly TemplateNode[];
}

/** The `{% else %}` branch of an `{% if %}`. */
export interface ElseBranch {
    readonly Span: Span;
    readonly TagSpan: Span;
    readonly Body: readonly TemplateNode[];
}

/** `{% if %} … {% elif %} … {% else %} … {% endif %}`. */
export interface IfNode {
    readonly Kind: 'If';
    readonly Span: Span;
    /** The `if` branch first, then each `elif`. */
    readonly Branches: readonly IfBranch[];
    readonly Else: ElseBranch | null;
    /** Whether an `{% endif %}` closes the block. */
    readonly Closed: boolean;
}

/** `{% for Variable in Iterable %} … {% endfor %}`. */
export interface ForNode {
    readonly Kind: 'For';
    readonly Span: Span;
    readonly TagSpan: Span;
    readonly LoopVariable: string;
    readonly LoopVariableSpan: Span;
    readonly Iterable: TemplateExpression;
    readonly Body: readonly TemplateNode[];
    readonly Closed: boolean;
}

/** `{% set Name = Value %}`. */
export interface SetNode {
    readonly Kind: 'Set';
    readonly Span: Span;
    readonly Name: string;
    readonly NameSpan: Span;
    readonly Value: TemplateExpression;
}

/** One `Name=Value` argument of a composition. */
export interface CompositionArgument {
    readonly Name: string;
    readonly NameSpan: Span;
    readonly Expression: TemplateExpression;
    readonly Span: Span;
    /** Whether the value is fixed: it reads no parameter, `Context` token or loop value. */
    readonly IsStatic: boolean;
    /** The outer parameters the value reads, in order of first use. */
    readonly ReferencedNames: readonly string[];
}

/** `{{query:"Category/Path/Name(Arg=Value, …)"}}`: another saved query used as a table source. */
export interface CompositionNode {
    readonly Kind: 'Composition';
    readonly Span: Span;
    readonly Token: SqlToken;
    /** The category path and name, joined by `/`, without the argument list. */
    readonly FullPath: string;
    /** The category path, or `''` for a query with no category. */
    readonly CategoryPath: string;
    readonly Name: string;
    readonly PathSpan: Span;
    readonly Arguments: readonly CompositionArgument[];
    readonly SqlContext: TemplateSqlContext;
}

/** A `{# … #}` template comment. Doc-comment tags in it are read by `QueryTemplate.DocComments()`. */
export interface DocCommentNode {
    readonly Kind: 'DocComment';
    readonly Span: Span;
    readonly Token: SqlToken;
    readonly Body: string;
    readonly BodySpan: Span;
}

/** A tag outside the language, or text that could not be read. A diagnostic always explains it. */
export interface UnknownTemplateNode {
    readonly Kind: 'Unknown';
    readonly Span: Span;
    readonly Text: string;
    readonly Reason: string;
}

/**
 * A node of a parsed MJ Query template. Consumers must handle kinds they do not recognise:
 * kinds may be added.
 */
export type TemplateNode =
    | SqlTextNode
    | ExpressionNode
    | IfNode
    | ForNode
    | SetNode
    | CompositionNode
    | DocCommentNode
    | UnknownTemplateNode;

/** The child node lists of a node: an If's branch bodies, a For's body; empty for leaves. */
export function ChildBodies(node: TemplateNode): readonly (readonly TemplateNode[])[] {
    if (node.Kind === 'If') {
        const bodies = node.Branches.map(b => b.Body);
        return node.Else ? [...bodies, node.Else.Body] : bodies;
    }
    if (node.Kind === 'For') return [node.Body];
    return [];
}

/** Every node in the tree, parents before children, in source order. */
export function AllNodes(nodes: readonly TemplateNode[]): TemplateNode[] {
    const result: TemplateNode[] = [];
    const stack: TemplateNode[] = [...nodes].reverse();
    let node = stack.pop();
    while (node !== undefined) {
        result.push(node);
        const bodies = ChildBodies(node);
        for (let b = bodies.length - 1; b >= 0; b--) {
            for (let i = bodies[b].length - 1; i >= 0; i--) stack.push(bodies[b][i]);
        }
        node = stack.pop();
    }
    return result;
}

/** The expressions a node holds itself, not those of its children: a hole's expression, an If's conditions, and so on. */
export function NodeExpressions(node: TemplateNode): TemplateExpression[] {
    switch (node.Kind) {
        case 'Expression': return [node.Expression];
        case 'If': return node.Branches.map(b => b.Condition);
        case 'For': return [node.Iterable];
        case 'Set': return [node.Value];
        case 'Composition': return node.Arguments.map(a => a.Expression);
        default: return [];
    }
}
