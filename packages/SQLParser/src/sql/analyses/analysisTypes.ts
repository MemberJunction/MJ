import type { Span } from '../../common/analysis.js';
import type { ColumnClause, QualifierBinding, QueryScope, ScopeSource } from '../sqlScope.js';
import type {
    CTEDeclaration, FetchClause, FunctionSource, IdentifierNode, LimitClause, ObjectName, OffsetClause, OrderByClause,
    QueryExpression, SelectItem, SqlStatementKind, TableSource, TopClause,
} from '../sqlNodes.js';

/** One table, CTE or table-valued function a statement reads. */
export interface TableReference {
    /** The name as written: parts unquoted, with their original spans. */
    readonly Name: ObjectName;
    readonly Kind: 'Table' | 'CTE' | 'Function';
    /** The schema part when one is written; `null` when the name is unqualified. */
    readonly Schema: string | null;
    readonly Span: Span;
    readonly Source: TableSource | FunctionSource;
    /** The CTE a `CTE` reference resolves to; `null` otherwise. */
    readonly CTE: CTEDeclaration | null;
}

/** One common table expression declared anywhere in the document. */
export interface CTEInfo {
    readonly Name: IdentifierNode;
    readonly Node: CTEDeclaration;
    readonly ColumnList: readonly IdentifierNode[] | null;
    /** Whether its WITH clause is recursive. */
    readonly Recursive: boolean;
    /** Whether it is in a statement's leading WITH clause (rather than a nested one). */
    readonly Leading: boolean;
    /** The index of the statement it is in. */
    readonly StatementIndex: number;
}

/** One output column of a query, as the select list writes it. */
export interface OutputItem {
    /** The output name: the alias, or the last part of a bare column path; `null` when unnamed. */
    readonly Name: string | null;
    /** The identifier the name comes from; `null` when unnamed. */
    readonly NameNode: IdentifierNode | null;
    readonly Alias: IdentifierNode | null;
    readonly ExpressionSpan: Span;
    readonly IsStar: boolean;
    readonly StarQualifier: ObjectName | null;
    readonly Item: SelectItem;
}

/** A query's output columns. For a set operation, `Items` are the first branch's and `Branches` every branch's. */
export interface OutputItems {
    readonly Items: readonly OutputItem[];
    readonly Branches: readonly (readonly OutputItem[])[];
    readonly IsSetOperation: boolean;
}

/** The ORDER BY of the top-level query expression. */
export interface TopLevelOrderBy {
    readonly Node: OrderByClause;
    readonly Span: Span;
    /** The query expression it belongs to. */
    readonly Owner: QueryExpression;
}

/** One row cap the top-level query expression carries. */
export interface RowCap {
    readonly Form: 'Top' | 'Limit' | 'Offset' | 'Fetch';
    readonly Node: TopClause | LimitClause | OffsetClause | FetchClause;
    readonly Span: Span;
    /** Rows kept; `null` when not a plain integer, or for `LIMIT ALL` and `OFFSET`. */
    readonly Rows: number | null;
    /** Rows skipped, for `OFFSET` and `LIMIT m, n`; `null` otherwise or when not a plain integer. */
    readonly Skip: number | null;
    /** Whether the cap is plain integer literals (no expression, parameter, PERCENT or WITH TIES). */
    readonly Numeric: boolean;
    readonly Percent: boolean;
    readonly WithTies: boolean;
}

/** Whether a document is one read query, and why not. */
export interface ReadOnlyCheck {
    readonly IsReadOnly: boolean;
    /** Why it is refused; `null` when it is a read query. */
    readonly Reason: string | null;
}

/** How a column reference was bound to a source. */
export interface ColumnBinding {
    readonly Source: ScopeSource;
    readonly Scope: QueryScope;
    /** `Qualifier`: its qualifier names the source. `OnlySource`: unqualified, and the block has one source. */
    readonly Via: 'Qualifier' | 'OnlySource';
    /** Whether the source belongs to an enclosing query. */
    readonly Outer: boolean;
}

/** An identifier path that can be a column, with where it sits and what it binds to. */
export interface ColumnReference {
    readonly Path: readonly IdentifierNode[];
    /** The last part: the column name. */
    readonly Column: IdentifierNode;
    /** The parts before the column; empty when unqualified. */
    readonly Qualifier: readonly IdentifierNode[];
    readonly Span: Span;
    readonly Clause: ColumnClause;
    /** The bound source; `null` when it cannot be told without the catalog. */
    readonly Binding: ColumnBinding | null;
    /** Whether an unqualified ORDER BY name matches an output alias of its block. */
    readonly RefersToOutputAlias: boolean;
    readonly Scope: QueryScope | null;
}

/** The constructs that read or compare whole rows. */
export type WholeRowKind =
    | 'Star' | 'QualifiedStar' | 'ForDocument' | 'NaturalJoin' | 'SetOperation' | 'RowFunction' | 'RowReference'
    | 'OrdinalOrderBy';

/** One construct that reads, outputs or compares whole rows rather than named columns. */
export interface WholeRowConstruct {
    readonly Kind: WholeRowKind;
    readonly Span: Span;
    /** The clause it sits in; `null` for a construct that is not inside an expression. */
    readonly Clause: ColumnClause | null;
    /** The source a qualified star, row function or row reference binds to; `null` otherwise. */
    readonly Binding: QualifierBinding | null;
    /** For `OrdinalOrderBy`: whether the same query expression also carries a row cap. False otherwise. */
    readonly Paged: boolean;
    /** A short description, such as `UNION ALL` or `FOR JSON`. */
    readonly Detail: string;
}

/** Output columns sharing one name. */
export interface DuplicateOutputName {
    readonly Name: string;
    readonly Items: readonly OutputItem[];
}

/** Options for duplicate output names. */
export interface DuplicateOutputNameOptions {
    /** Compare names exactly. By default unquoted names fold by the dialect's rule and otherwise compare ignoring case. */
    readonly CaseSensitive?: boolean;
}

/** The statement kinds of a document, one per statement. */
export type StatementKinds = readonly SqlStatementKind[];
