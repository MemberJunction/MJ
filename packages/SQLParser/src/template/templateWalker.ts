import type { TemplateSqlContext } from '../lexer/sqlTokenTypes.js';
import { WalkExpression } from './expressionTypes.js';
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
 * - `Condition`: in an `{% if %}` or `{% elif %}` condition.
 * - `LoopIterable`: as the array a `{% for %}` loops over.
 * - `SetValue`: in the value of a `{% set %}`.
 * - `CompositionArgument`: in an argument of a `{{query:"…"}}` composition.
 */
export type ValueUseRole = 'Expression' | 'Condition' | 'LoopIterable' | 'SetValue' | 'CompositionArgument';

/** A name, `Context` token or loop member read somewhere in the template. */
export type ValueReference = NameExpression | ContextExpression | LoopMemberExpression;

/** Where the walker is: the blocks around the current node. */
export interface WalkScope {
    /** Whether the current node is inside an `{% if %}` branch, or is an `{% if %}` condition. */
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
    /** For the value a `{{ }}` hole starts from: the filters applied to it, innermost first. Otherwise empty. */
    readonly Filters: readonly FilterExpression[];
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
            visitHole(node, node.Expression, scope, visitor);
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

function visitHole(owner: TemplateNode, expression: TemplateExpression, scope: WalkScope, visitor: TemplateVisitor): void {
    const { Base, Filters } = UnwrapFilters(expression);
    visitExpression(Base, 'Expression', owner, scope, Filters, visitor);
    for (const filter of Filters) {
        for (const argument of filter.Arguments) visitExpression(argument, 'Expression', owner, scope, [], visitor);
    }
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
    const context = ownerContext(owner);
    WalkExpression(expression, node => {
        if (node.Kind !== 'Name' && node.Kind !== 'Context' && node.Kind !== 'LoopMember') return;
        const own = node === expression ? filters : [];
        visitor.Value?.({ Reference: node, Role: role, Owner: owner, Scope: scope, Filters: own, SqlContext: context });
    });
}

function ownerContext(owner: TemplateNode): TemplateSqlContext {
    if (owner.Kind === 'Expression' || owner.Kind === 'Composition') return owner.SqlContext;
    return 'Code';
}
