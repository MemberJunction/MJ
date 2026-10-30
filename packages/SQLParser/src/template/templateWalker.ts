import type { TemplateSqlContext } from '../lexer/sqlTokenTypes.js';
import { ExpressionChildren } from './expressionTypes.js';
import type {
    ContextExpression,
    FilterExpression,
    LoopMemberExpression,
    NameExpression,
    TemplateExpression,
} from './expressionTypes.js';
import type { IfNode, TemplateNode } from './templateNodes.js';

/**
 * How a value is used.
 *
 * - `Expression`: in a `{{ }}` hole.
 * - `Condition`: in an `{% if %}` or `{% elif %}` condition, or the condition of an inline if.
 * - `LoopIterable`: as the array a `{% for %}` loops over.
 * - `SetValue`: in the value of a `{% set %}`.
 * - `CompositionArgument`: in an argument of a `{{query:"…"}}` composition.
 */
export type ValueUseRole = 'Expression' | 'Condition' | 'LoopIterable' | 'SetValue' | 'CompositionArgument';

/** A name, `Context` token or loop member read somewhere in the template. */
export type ValueReference = NameExpression | ContextExpression | LoopMemberExpression;

/** Where the walker is: the blocks around the current node. */
export interface WalkScope {
    /**
     * Whether the current node is inside an `{% if %}` branch, or is an `{% if %}` condition. For
     * a value read, also whether the read sits in any part of an inline if.
     */
    readonly Conditional: boolean;
    /** The loop variables in scope, innermost last. */
    readonly LoopVariables: readonly string[];
    /** The `{% if %}` blocks around the current node, outermost first, with the branch index taken (branch count = else). */
    readonly IfPath: readonly { readonly Node: IfNode; readonly Branch: number }[];
}

/** One read of a value. */
export interface ValueVisit {
    readonly Reference: ValueReference;
    readonly Role: ValueUseRole;
    /** The node whose expression holds the read. */
    readonly Owner: TemplateNode;
    readonly Scope: WalkScope;
    /**
     * For a value a `{{ }}` hole writes (the hole's own value, or a branch of an inline if in it):
     * the filters applied to it, innermost first. Otherwise empty.
     */
    readonly Filters: readonly FilterExpression[];
    /** Whether the read is `<name>.length`: the length of the value, not the value itself. */
    readonly ReadsLength: boolean;
    /** Where the owning tag sits in the SQL. */
    readonly SqlContext: TemplateSqlContext;
}

/** What {@link WalkTemplate} reports. */
export interface TemplateVisitor {
    /** Called for every value read. */
    Value?(visit: ValueVisit): void;
    /** Called for every node, with the scope it sits in. */
    Node?(node: TemplateNode, scope: WalkScope): void;
}

const ROOT_SCOPE: WalkScope = { Conditional: false, LoopVariables: [], IfPath: [] };

/** Walks the tree in source order, reporting every node and every value read with its scope. */
export function WalkTemplate(nodes: readonly TemplateNode[], visitor: TemplateVisitor): void {
    walkNodes(nodes, ROOT_SCOPE, visitor);
}

/** The value a `{{ }}` hole starts from and the filters on it, innermost first. */
export function UnwrapFilters(expression: TemplateExpression): { Base: TemplateExpression; Filters: FilterExpression[] } {
    const filters: FilterExpression[] = [];
    let node = expression;
    while (node.Kind === 'Filter') {
        filters.unshift(node);
        node = node.Input;
    }
    return { Base: node, Filters: filters };
}

function walkNodes(nodes: readonly TemplateNode[], scope: WalkScope, visitor: TemplateVisitor): void {
    for (const node of nodes) {
        visitor.Node?.(node, scope);
        walkNode(node, scope, visitor);
    }
}

function walkNode(node: TemplateNode, scope: WalkScope, visitor: TemplateVisitor): void {
    switch (node.Kind) {
        case 'Expression':
            visitHole(node, node.Expression, scope, [], visitor);
            break;
        case 'If':
            walkIf(node, scope, visitor);
            break;
        case 'For':
            visitExpression(node.Iterable, 'LoopIterable', node, scope, [], visitor);
            walkNodes(node.Body, { ...scope, LoopVariables: [...scope.LoopVariables, node.LoopVariable] }, visitor);
            break;
        case 'Set':
            visitExpression(node.Value, 'SetValue', node, scope, [], visitor);
            break;
        case 'Composition':
            for (const argument of node.Arguments) visitExpression(argument.Expression, 'CompositionArgument', node, scope, [], visitor);
            break;
        default:
            break;
    }
}

function walkIf(node: IfNode, scope: WalkScope, visitor: TemplateVisitor): void {
    const conditional: WalkScope = { ...scope, Conditional: true };
    node.Branches.forEach((branch, index) => {
        visitExpression(branch.Condition, 'Condition', node, conditional, [], visitor);
        walkNodes(branch.Body, { ...conditional, IfPath: [...scope.IfPath, { Node: node, Branch: index }] }, visitor);
    });
    if (node.Else) {
        walkNodes(node.Else.Body, { ...conditional, IfPath: [...scope.IfPath, { Node: node, Branch: node.Branches.length }] }, visitor);
    }
}

/**
 * Reports the reads of a `{{ }}` hole. `outer` are the filters applied around this part of the
 * hole, innermost first: an inline if passes its own to the branches it writes.
 */
function visitHole(owner: TemplateNode, expression: TemplateExpression, scope: WalkScope, outer: readonly FilterExpression[], visitor: TemplateVisitor): void {
    const { Base, Filters } = UnwrapFilters(expression);
    const filters = [...Filters, ...outer];
    if (Base.Kind === 'InlineIf') {
        const branch: WalkScope = { ...scope, Conditional: true };
        visitHole(owner, Base.Body, branch, filters, visitor);
        visitExpression(Base.Condition, 'Condition', owner, branch, [], visitor);
        if (Base.Else !== null) visitHole(owner, Base.Else, branch, filters, visitor);
    } else {
        visitExpression(Base, 'Expression', owner, scope, filters, visitor);
    }
    for (const filter of Filters) {
        for (const argument of filter.Arguments) visitExpression(argument, 'Expression', owner, scope, [], visitor);
    }
}

/** What a read inherits from where it sits in an expression. */
interface ReadContext {
    readonly Role: ValueUseRole;
    readonly Owner: TemplateNode;
    readonly Scope: WalkScope;
    readonly SqlContext: TemplateSqlContext;
    readonly Visitor: TemplateVisitor;
}

/** Reports every read inside `expression`. Only a reference that is the expression itself gets `filters`. */
function visitExpression(
    expression: TemplateExpression,
    role: ValueUseRole,
    owner: TemplateNode,
    scope: WalkScope,
    filters: readonly FilterExpression[],
    visitor: TemplateVisitor,
): void {
    if (!visitor.Value) return;
    visitReads(expression, { Role: role, Owner: owner, Scope: scope, SqlContext: ownerContext(owner), Visitor: visitor }, filters);
}

/**
 * Reports the reads in an expression, in source order. Every part of an inline if is conditional,
 * and its condition is a `Condition` read.
 */
function visitReads(expression: TemplateExpression, context: ReadContext, filters: readonly FilterExpression[]): void {
    switch (expression.Kind) {
        case 'Name':
        case 'Context':
        case 'LoopMember':
            report(expression, context, filters, false);
            return;
        case 'Length':
            report(expression.Object, context, [], true);
            return;
        case 'InlineIf': {
            const branch: ReadContext = { ...context, Scope: { ...context.Scope, Conditional: true } };
            visitReads(expression.Body, branch, []);
            visitReads(expression.Condition, { ...branch, Role: 'Condition' }, []);
            if (expression.Else !== null) visitReads(expression.Else, branch, []);
            return;
        }
        default:
            for (const child of ExpressionChildren(expression)) visitReads(child, context, []);
    }
}

function report(reference: ValueReference, context: ReadContext, filters: readonly FilterExpression[], readsLength: boolean): void {
    context.Visitor.Value?.({
        Reference: reference, Role: context.Role, Owner: context.Owner, Scope: context.Scope,
        Filters: filters, SqlContext: context.SqlContext, ReadsLength: readsLength,
    });
}

function ownerContext(owner: TemplateNode): TemplateSqlContext {
    if (owner.Kind === 'Expression' || owner.Kind === 'Composition') return owner.SqlContext;
    return 'Code';
}
