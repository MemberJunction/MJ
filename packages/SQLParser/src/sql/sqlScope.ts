import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { SqlExpression } from './sqlExpression.js';
import type {
    CTEDeclaration, FromSource, IdentifierNode, ObjectName, QueryExpression, QueryNode, SelectCore, StatementNode, TableSource,
    WithClause,
} from './sqlNodes.js';
import { LeftmostSelect } from './sqlWalker.js';

/** The clause an expression sits in, for column references. */
export type ColumnClause = 'Select' | 'Where' | 'Join' | 'GroupBy' | 'Having' | 'OrderBy' | 'Expression';

/** What a FROM source is, after name resolution. */
export type ScopeSourceKind = 'Table' | 'CTE' | 'Derived' | 'Function' | 'Values' | 'Other';

/** One FROM source visible in a select block, with the name qualifiers use for it. */
export interface ScopeSource {
    /** The name a qualifier uses: the alias, or a table's last name part; `null` when it has none. */
    readonly Name: string | null;
    /** The identifier {@link Name} was read from; `null` when there is none. */
    readonly NameNode: IdentifierNode | null;
    /** Whether {@link Name} is the table or CTE name itself (no alias was written). */
    readonly NameIsTableName: boolean;
    readonly Source: FromSource;
    readonly Kind: ScopeSourceKind;
    /** The CTE a table source refers to; `null` otherwise. */
    readonly CTE: CTEDeclaration | null;
}

/** One select block's names: its FROM sources, and the scope its correlated references reach next. */
export interface QueryScope {
    readonly Id: number;
    /** The select block. */
    readonly Core: SelectCore;
    /** The enclosing scope a correlated reference resolves to; `null` at the top. */
    readonly Parent: QueryScope | null;
    readonly Sources: readonly ScopeSource[];
}

/** An expression of the document, with the clause and scope it sits in. */
export interface ExpressionContext {
    readonly Expression: SqlExpression;
    readonly Clause: ColumnClause;
    /** The scope names in the expression resolve in; `null` where no FROM source is visible (VALUES rows). */
    readonly Scope: QueryScope | null;
    /** For an ORDER BY, the block whose output names it may use. */
    readonly OutputCore: SelectCore | null;
}

/** A qualifier resolved to a source. */
export interface QualifierBinding {
    readonly Source: ScopeSource;
    readonly Scope: QueryScope;
    /** Whether the source belongs to an enclosing query (a correlated reference). */
    readonly Outer: boolean;
}

/** CTEs visible at one point: one frame per WITH clause, innermost first. */
interface CteFrame {
    readonly Parent: CteFrame | null;
    readonly Names: ReadonlyMap<string, number>;
    readonly CTEs: readonly CTEDeclaration[];
    /** CTEs with an index below this are visible. */
    readonly Visible: number;
}

type Task =
    | { readonly Kind: 'Query'; readonly Node: StatementNode | QueryNode; readonly Env: CteFrame | null; readonly Outer: QueryScope | null }
    | { readonly Kind: 'QueryExpression'; readonly Node: QueryExpression; readonly Env: CteFrame | null; readonly Outer: QueryScope | null }
    | { readonly Kind: 'Expression'; readonly Context: ExpressionContext; readonly Env: CteFrame | null };

/**
 * Catalog-free name resolution over a document: which CTE each table name means, which FROM
 * sources each select block sees under which names, and which source a column qualifier binds
 * to (correlated subqueries see the sources of the queries around them).
 */
export class SqlScope {
    private readonly scopes: QueryScope[] = [];
    private readonly byCore = new Map<SelectCore, QueryScope>();
    private readonly sourceNames = new Map<QueryScope, Map<string, ScopeSource[]>>();
    private readonly cteOf = new Map<TableSource, CTEDeclaration>();
    private readonly references = new Map<CTEDeclaration, TableSource[]>();
    private readonly expressions: ExpressionContext[] = [];
    private readonly stack: Task[] = [];

    /** Resolves the names of the given statements. */
    constructor(statements: readonly StatementNode[], private readonly dialect: ParserDialect) {
        for (let i = statements.length - 1; i >= 0; i--) this.stack.push({ Kind: 'Query', Node: statements[i], Env: null, Outer: null });
        for (let task = this.stack.pop(); task !== undefined; task = this.stack.pop()) this.run(task);
        this.expressions.sort((a, b) => a.Expression.Span.Start - b.Expression.Span.Start);
    }

    /** Every select block's scope, in the order they were reached. */
    get Scopes(): readonly QueryScope[] {
        return this.scopes;
    }

    /** Every expression with its clause and scope, in source order. */
    get Expressions(): readonly ExpressionContext[] {
        return this.expressions;
    }

    /** The scope of a select block. */
    ScopeOf(core: SelectCore): QueryScope | null {
        return this.byCore.get(core) ?? null;
    }

    /** The CTE a table source names; `null` when it names a table or view. */
    CTEOf(source: TableSource): CTEDeclaration | null {
        return this.cteOf.get(source) ?? null;
    }

    /** The table sources that refer to a CTE. */
    ReferencesTo(cte: CTEDeclaration): readonly TableSource[] {
        return this.references.get(cte) ?? [];
    }

    /** The key two names compare equal under, by the dialect's case rules. */
    NameKey(name: IdentifierNode): string {
        return NameKey(name, this.dialect);
    }

    /**
     * Resolves a column's qualifier (`a` in `a.Name`, `dbo.T` in `dbo.T.Name`) from `scope`
     * outwards; `null` when no visible source has that name.
     */
    ResolveQualifier(qualifier: readonly IdentifierNode[], scope: QueryScope | null): QualifierBinding | null {
        if (qualifier.length === 0) return null;
        const key = this.NameKey(qualifier[qualifier.length - 1]);
        for (let current = scope, outer = false; current !== null; current = current.Parent, outer = true) {
            const candidates = this.sourceNames.get(current)?.get(key) ?? [];
            const match = candidates.find(c => qualifier.length === 1 || this.matchesQualifiedName(c, qualifier));
            if (match !== undefined) return { Source: match, Scope: current, Outer: outer };
        }
        return null;
    }

    /** Whether a multi-part qualifier names a table source: its parts match the end of the table name. */
    private matchesQualifiedName(candidate: ScopeSource, qualifier: readonly IdentifierNode[]): boolean {
        if (!candidate.NameIsTableName || candidate.Source.Kind !== 'Table') return false;
        const parts = candidate.Source.Name.Parts;
        if (qualifier.length > parts.length) return false;
        const offset = parts.length - qualifier.length;
        return qualifier.every((q, i) => this.NameKey(q) === this.NameKey(parts[offset + i]));
    }

    private run(task: Task): void {
        if (task.Kind === 'Query') this.query(task.Node, task.Env, task.Outer);
        else if (task.Kind === 'QueryExpression') this.queryExpression(task.Node, task.Env, task.Outer);
        else this.expression(task.Context, task.Env);
    }

    private query(node: StatementNode | QueryNode, env: CteFrame | null, outer: QueryScope | null): void {
        const frame = node.With === null ? env : this.withFrame(node.With, env, outer);
        if (node.Body.Kind !== 'Unknown') this.stack.push({ Kind: 'QueryExpression', Node: node.Body, Env: frame, Outer: outer });
    }

    /** Builds the frame of a WITH clause and queues each CTE body with the CTEs it can see. */
    private withFrame(clause: WithClause, env: CteFrame | null, outer: QueryScope | null): CteFrame {
        const names = new Map<string, number>();
        clause.CTEs.forEach((cte, i) => {
            const key = this.NameKey(cte.Name);
            if (!names.has(key)) names.set(key, i);
        });
        const selfVisible = clause.Recursive || this.dialect.Grammar.RecursiveKeyword === null;
        for (let i = clause.CTEs.length - 1; i >= 0; i--) {
            const visible = selfVisible ? i + 1 : i;
            const bodyFrame: CteFrame = { Parent: env, Names: names, CTEs: clause.CTEs, Visible: visible };
            this.stack.push({ Kind: 'Query', Node: clause.CTEs[i].Body, Env: bodyFrame, Outer: outer });
        }
        return { Parent: env, Names: names, CTEs: clause.CTEs, Visible: clause.CTEs.length };
    }

    private queryExpression(node: QueryExpression, env: CteFrame | null, outer: QueryScope | null): void {
        switch (node.Kind) {
            case 'Select':
                this.select(node, env, outer);
                return;
            case 'SetOperation':
                this.queueOrderBy(node, env);
                this.stack.push({ Kind: 'QueryExpression', Node: node.Right, Env: env, Outer: outer });
                this.stack.push({ Kind: 'QueryExpression', Node: node.Left, Env: env, Outer: outer });
                return;
            case 'Parenthesized':
                this.queueOrderBy(node, env);
                this.stack.push({ Kind: 'Query', Node: node.Query, Env: env, Outer: outer });
                return;
            case 'Values':
                for (const row of node.Rows) this.queueExpression(row, 'Expression', outer, env);
                return;
            default:
                return;
        }
    }

    /** Queues a set-level ORDER BY and row caps, resolved in the leftmost block's scope once it exists. */
    private queueOrderBy(node: Extract<QueryExpression, { Kind: 'SetOperation' | 'Parenthesized' }>, env: CteFrame | null): void {
        const caps = capExpressions(node);
        if (node.OrderBy === null && caps.length === 0) return;
        const core = LeftmostSelect(node);
        const deferred = (expression: SqlExpression, clause: ColumnClause): void => {
            this.stack.push({ Kind: 'Expression', Context: { Expression: expression, Clause: clause, Scope: null, OutputCore: core }, Env: env });
        };
        for (const item of node.OrderBy?.Items ?? []) deferred(item.Expression, 'OrderBy');
        for (const value of caps) deferred(value, 'Expression');
    }

    private select(core: SelectCore, env: CteFrame | null, outer: QueryScope | null): void {
        const sources: ScopeSource[] = [];
        const scope: QueryScope = { Id: this.scopes.length, Core: core, Parent: outer, Sources: sources };
        for (const source of core.From?.Sources ?? []) this.collectSources(source, scope, env, sources);
        Object.freeze(sources);
        this.registerScope(Object.freeze(scope));
        this.queueClauses(core, scope, env);
    }

    private registerScope(scope: QueryScope): void {
        this.scopes.push(scope);
        this.byCore.set(scope.Core, scope);
        const names = new Map<string, ScopeSource[]>();
        for (const source of scope.Sources) {
            if (source.NameNode === null) continue;
            const key = this.NameKey(source.NameNode);
            const list = names.get(key);
            if (list === undefined) names.set(key, [source]);
            else list.push(source);
        }
        this.sourceNames.set(scope, names);
    }

    private queueClauses(core: SelectCore, scope: QueryScope, env: CteFrame | null): void {
        for (const item of core.SelectList) this.queueExpression(item.Expression, 'Select', scope, env);
        for (const on of core.Distinct?.On ?? []) this.queueExpression(on, 'Select', scope, env);
        if (core.Where !== null) this.queueExpression(core.Where.Condition, 'Where', scope, env);
        for (const item of core.GroupBy?.Items ?? []) this.queueExpression(item, 'GroupBy', scope, env);
        if (core.Having !== null) this.queueExpression(core.Having.Condition, 'Having', scope, env);
        if (core.Qualify !== null) this.queueExpression(core.Qualify.Condition, 'Expression', scope, env);
        for (const definition of core.Window?.Definitions ?? []) this.queueExpression(definition.Specification, 'Expression', scope, env);
        for (const item of core.OrderBy?.Items ?? []) this.queueExpression(item.Expression, 'OrderBy', scope, env, core);
        if (core.Top !== null) this.queueExpression(core.Top.Value, 'Expression', scope, env);
        for (const value of capExpressions(core)) this.queueExpression(value, 'Expression', scope, env);
    }

    private queueExpression(expression: SqlExpression, clause: ColumnClause, scope: QueryScope | null, env: CteFrame | null, outputCore: SelectCore | null = null): void {
        this.stack.push({ Kind: 'Expression', Context: { Expression: expression, Clause: clause, Scope: scope, OutputCore: outputCore }, Env: env });
    }

    /**
     * Records an expression. A set-level ORDER BY or cap is queued before its leftmost block is
     * read, and takes that block's scope here, once the block's tasks have run.
     */
    private expression(queued: ExpressionContext, env: CteFrame | null): void {
        const outputCore = queued.OutputCore;
        const context = queued.Scope === null && outputCore !== null ? { ...queued, Scope: this.byCore.get(outputCore) ?? null } : queued;
        this.expressions.push(Object.freeze(context));
        const subqueries = context.Expression.Subqueries();
        for (let i = subqueries.length - 1; i >= 0; i--) {
            this.stack.push({ Kind: 'Query', Node: subqueries[i], Env: env, Outer: context.Scope });
        }
    }

    /** Adds the sources of a FROM item (a join tree) to `sources`, left to right, and queues their parts. */
    private collectSources(root: FromSource, scope: QueryScope, env: CteFrame | null, sources: ScopeSource[]): void {
        const pending: FromSource[] = [root];
        for (let source = pending.pop(); source !== undefined; source = pending.pop()) {
            const children = this.visitSource(source, scope, env, sources);
            for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
        }
    }

    /** Records one source and returns the sources nested in it. */
    private visitSource(source: FromSource, scope: QueryScope, env: CteFrame | null, sources: ScopeSource[]): readonly FromSource[] {
        switch (source.Kind) {
            case 'Table':
                sources.push(this.tableSource(source, env));
                return [];
            case 'Derived':
                sources.push(aliasSource(source, 'Derived', source.Alias));
                this.stack.push({ Kind: 'Query', Node: source.Query, Env: env, Outer: source.Lateral ? scope : scope.Parent });
                return [];
            case 'Function':
                sources.push(aliasSource(source, 'Function', source.Alias ?? lastPart(source.Name)));
                this.queueExpression(source.Arguments, 'Expression', scope, env);
                return [];
            case 'ValuesSource':
                sources.push(aliasSource(source, 'Values', source.Alias));
                for (const row of source.Rows) this.queueExpression(row, 'Expression', scope.Parent, env);
                return [];
            default:
                return this.visitCompound(source, scope, env, sources);
        }
    }

    private visitCompound(source: FromSource, scope: QueryScope, env: CteFrame | null, sources: ScopeSource[]): readonly FromSource[] {
        switch (source.Kind) {
            case 'Join':
                if (source.On !== null) this.queueExpression(source.On, 'Join', scope, env);
                return [source.Left, source.Right];
            case 'Apply':
                return [source.Left, this.lateralRight(source.Right, scope, env, sources)].filter((s): s is FromSource => s !== null);
            case 'Pivot':
                sources.push(aliasSource(source, 'Other', source.Alias));
                this.queueExpression(source.Body, 'Expression', scope, env);
                return [source.Source];
            case 'ParenthesizedSource':
                if (source.Alias !== null) sources.push(aliasSource(source, 'Other', source.Alias));
                return [source.Inner];
            default:
                return [];
        }
    }

    /** A derived table on the right of an APPLY sees the block's own sources (it is lateral). */
    private lateralRight(right: FromSource, scope: QueryScope, env: CteFrame | null, sources: ScopeSource[]): FromSource | null {
        if (right.Kind !== 'Derived') return right;
        sources.push(aliasSource(right, 'Derived', right.Alias));
        this.stack.push({ Kind: 'Query', Node: right.Query, Env: env, Outer: scope });
        return null;
    }

    private tableSource(source: TableSource, env: CteFrame | null): ScopeSource {
        const parts = source.Name.Parts;
        const cte = parts.length === 1 ? lookupCTE(env, this.NameKey(parts[0])) : null;
        if (cte !== null) {
            this.cteOf.set(source, cte);
            const list = this.references.get(cte);
            if (list === undefined) this.references.set(cte, [source]);
            else list.push(source);
        }
        const nameNode = source.Alias ?? parts[parts.length - 1];
        return Object.freeze({
            Name: nameNode.Value, NameNode: nameNode, NameIsTableName: source.Alias === null, Source: source,
            Kind: cte !== null ? 'CTE' : 'Table', CTE: cte,
        });
    }
}

/** The key two names compare equal under: quoted names exactly, unquoted ones folded by the dialect's rule. */
export function NameKey(name: IdentifierNode, dialect: ParserDialect): string {
    switch (dialect.Lexical.UnquotedIdentifierCase) {
        case 'lower': return name.Quoted ? name.Value : name.Value.toLowerCase();
        case 'upper': return name.Quoted ? name.Value : name.Value.toUpperCase();
        default: return name.Value.toLowerCase();
    }
}

function lookupCTE(env: CteFrame | null, key: string): CTEDeclaration | null {
    for (let frame = env; frame !== null; frame = frame.Parent) {
        const index = frame.Names.get(key);
        if (index !== undefined && index < frame.Visible) return frame.CTEs[index];
    }
    return null;
}

function aliasSource(source: FromSource, kind: ScopeSourceKind, alias: IdentifierNode | null): ScopeSource {
    return Object.freeze({ Name: alias?.Value ?? null, NameNode: alias, NameIsTableName: false, Source: source, Kind: kind, CTE: null });
}

function lastPart(name: ObjectName): IdentifierNode {
    return name.Parts[name.Parts.length - 1];
}

/** The row-count expressions of a query expression's own caps. */
function capExpressions(node: Exclude<QueryExpression, { Kind: 'Unknown' }>): SqlExpression[] {
    const values: (SqlExpression | null | undefined)[] = [node.Limit?.Value, node.Limit?.LeadingOffset, node.Offset?.Value, node.Fetch?.Value];
    return values.filter((v): v is SqlExpression => v !== null && v !== undefined);
}
