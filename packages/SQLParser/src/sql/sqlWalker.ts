import { SqlExpression } from './sqlExpression.js';
import type {
    CTEDeclaration, FromSource, QueryExpression, QueryTailClauses, SelectCore, SqlNode, StatementNode,
} from './sqlNodes.js';

/**
 * The direct children of a node, in source order. Identifier and name nodes are leaves; an
 * expression's children are its nested queries. A kind this function does not know has none.
 */
export function SqlNodeChildren(node: SqlNode): readonly SqlNode[] {
    if (node instanceof SqlExpression) return node.Subqueries();
    switch (node.Kind) {
        case 'Statement': return statementChildren(node);
        case 'Query': return compact([node.With, node.Body, ...node.Tail]);
        case 'With': return node.CTEs;
        case 'CTE': return cteChildren(node);
        case 'Select': return selectChildren(node);
        case 'SetOperation': return [node.Left, node.Right, ...tailChildren(node)];
        case 'Parenthesized': return [node.Query, ...tailChildren(node)];
        case 'Values': return [...node.Rows, ...tailChildren(node)];
        case 'SelectItem': return compact([node.Expression, node.Alias, node.StarQualifier]);
        case 'Distinct': return node.On;
        case 'Top': return [node.Value];
        case 'Into': return compact([node.Target]);
        case 'From': return node.Sources;
        case 'Where': case 'Having': case 'Qualify': return [node.Condition];
        case 'GroupBy': return node.Items;
        case 'Window': return node.Definitions;
        case 'WindowDefinition': return [node.Name, node.Specification];
        case 'OrderBy': return node.Items;
        case 'OrderByItem': return [node.Expression];
        case 'Limit': return compact([node.LeadingOffset, node.Value]);
        case 'Offset': return [node.Value];
        case 'Fetch': return compact([node.Value]);
        case 'Option': return [node.Hints];
        case 'ObjectName': return node.Parts;
        default: return sourceChildren(node);
    }
}

function statementChildren(node: StatementNode): readonly SqlNode[] {
    return compact([node.With, node.Body, ...node.Tail]);
}

function cteChildren(node: CTEDeclaration): readonly SqlNode[] {
    return [node.Name, ...(node.ColumnList ?? []), node.Body];
}

function selectChildren(node: SelectCore): readonly SqlNode[] {
    return compact([
        node.Distinct, node.Top, ...node.SelectList, node.Into, node.From, node.Where, node.GroupBy, node.Having,
        node.Window, node.Qualify, ...node.Unrecognized, ...tailChildren(node),
    ]);
}

function tailChildren(node: QueryTailClauses): SqlNode[] {
    return compact([node.OrderBy, node.Limit, node.Offset, node.Fetch, node.For, node.Option]);
}

function sourceChildren(node: SqlNode): readonly SqlNode[] {
    if (!isFromSource(node)) return [];
    switch (node.Kind) {
        case 'Table': return compact([node.Name, node.Alias, ...node.ColumnAliases]);
        case 'Derived': return compact([node.Query, node.Alias, ...node.ColumnAliases]);
        case 'Function': return compact([node.Name, node.Arguments, node.Alias, ...node.ColumnAliases]);
        case 'ValuesSource': return compact([...node.Rows, node.Alias, ...node.ColumnAliases]);
        case 'Join': return compact([node.Left, node.Right, node.On, ...(node.Using ?? [])]);
        case 'Apply': return [node.Left, node.Right];
        case 'Pivot': return compact([node.Source, node.Body, node.Alias, ...node.ColumnAliases]);
        case 'ParenthesizedSource': return compact([node.Inner, node.Alias, ...node.ColumnAliases]);
        default: return [];
    }
}

const SOURCE_KINDS: ReadonlySet<string> = new Set(['Table', 'Derived', 'Function', 'ValuesSource', 'Join', 'Apply', 'Pivot', 'ParenthesizedSource']);

function isFromSource(node: SqlNode): node is FromSource {
    return SOURCE_KINDS.has(node.Kind) && !(node instanceof SqlExpression);
}

function compact(nodes: readonly (SqlNode | null)[]): SqlNode[] {
    return nodes.filter((n): n is SqlNode => n !== null);
}

/**
 * Visits every node under `roots` (roots included) in source order, depth first, without
 * recursion, so a chain of thousands of set operations is safe. `visit` receives each node and
 * its parent (`null` for a root).
 */
export function WalkSqlNodes(roots: readonly SqlNode[], visit: (node: SqlNode, parent: SqlNode | null) => void): void {
    const stack: { Node: SqlNode; Parent: SqlNode | null }[] = [];
    for (let i = roots.length - 1; i >= 0; i--) stack.push({ Node: roots[i], Parent: null });
    for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
        const { Node, Parent } = entry;
        visit(Node, Parent);
        const children = SqlNodeChildren(Node);
        for (let i = children.length - 1; i >= 0; i--) stack.push({ Node: children[i], Parent: Node });
    }
}

/** The leftmost select block of a query expression: the block a set operation's output names come from. */
export function LeftmostSelect(expression: QueryExpression): SelectCore | null {
    let current: QueryExpression = expression;
    for (;;) {
        if (current.Kind === 'Select') return current;
        if (current.Kind === 'SetOperation') current = current.Left;
        else if (current.Kind === 'Parenthesized' && current.Query.Body.Kind !== 'Unknown') current = current.Query.Body;
        else return null;
    }
}

/** Whether a node is a query expression (a select block, set operation, parenthesized query or VALUES list). */
export function IsQueryExpression(node: SqlNode): node is QueryExpression {
    if (node instanceof SqlExpression) return false;
    return node.Kind === 'Select' || node.Kind === 'SetOperation' || node.Kind === 'Parenthesized' || node.Kind === 'Values';
}
