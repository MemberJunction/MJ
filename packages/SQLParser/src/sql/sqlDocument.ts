import type { ParserDialect } from '@memberjunction/sql-dialect';
import { MakeDiagnostic } from '../common/analysis.js';
import type { Analysis, Diagnostic, Span } from '../common/analysis.js';
import { SqlTokens } from '../lexer/sqlTokens.js';
import { EditSet } from '../edit/editSet.js';
import type {
    CTEInfo, ColumnReference, DuplicateOutputName, DuplicateOutputNameOptions, OutputItems, ReadOnlyCheck, RowCap,
    TableReference, TopLevelOrderBy, WholeRowConstruct,
} from './analyses/analysisTypes.js';
import { FindColumnReferences, FindWholeRowConstructs } from './analyses/columnAnalyses.js';
import {
    CheckReadOnly, FindCTEs, FindDuplicateOutputNames, FindOutputItems, FindRowCaps, FindTableReferences,
    FindTopLevelOrderBy, NonEmptyStatements, TopQuery,
} from './analyses/structureAnalyses.js';
import { ParseContext } from './parser/parseContext.js';
import { QueryParser } from './parser/queryParser.js';
import { SqlDocumentDiagnosticCodes } from './sqlDiagnosticCodes.js';
import type { QueryExpression, SqlNode, SqlStatementKind, StatementNode } from './sqlNodes.js';
import { SqlScope } from './sqlScope.js';
import { TokenTable } from './tokenTable.js';

/**
 * A SQL text in one dialect, parsed into statements by MJ's tolerant structural parser.
 *
 * - **Lossless:** every node covers a range of whole tokens; {@link Text} returns its slice of
 *   the input, and {@link Print} returns the input byte for byte.
 * - **Tolerant:** parsing never throws. Syntax the parser does not know becomes an `Unknown`
 *   node plus a diagnostic, and the rest of the tree is still read.
 * - **Expressions are token ranges** (`SqlExpression`) with helpers for identifier paths,
 *   function calls and stars; nested `(SELECT …)` are parsed as child queries.
 * - **Analyses** are methods, computed on first call and kept. Each returns an
 *   {@link Analysis}: `Complete` is false whenever an Unknown node or a parse diagnostic could
 *   affect the answer.
 *
 * Template tags are not part of SQL: render the template first. A tag in the text is read as an
 * opaque value and reported with a diagnostic.
 *
 * ```ts
 * const doc = SqlDocument.Parse(sql, new SQLServerDialect());
 * if (!doc.IsReadOnly().Value.IsReadOnly) refuse();
 * const tables = doc.TableReferences().Value.filter(t => t.Kind === 'Table');
 * ```
 */
export class SqlDocument {
    private readonly tokens: SqlTokens;
    private readonly table: TokenTable;
    private readonly statements: readonly StatementNode[];
    private readonly diagnostics: readonly Diagnostic[];
    private readonly complete: boolean;
    private scope: SqlScope | null = null;
    private tableReferences: Analysis<readonly TableReference[]> | null = null;
    private ctes: Analysis<readonly CTEInfo[]> | null = null;
    private outputItems: Analysis<OutputItems> | null = null;
    private topLevelOrderBy: Analysis<TopLevelOrderBy | null> | null = null;
    private rowCaps: Analysis<readonly RowCap[]> | null = null;
    private readOnly: Analysis<ReadOnlyCheck> | null = null;
    private columnReferences: Analysis<readonly ColumnReference[]> | null = null;
    private wholeRow: Analysis<readonly WholeRowConstruct[]> | null = null;

    private constructor(tokens: SqlTokens, dialect: ParserDialect) {
        this.tokens = tokens;
        this.table = new TokenTable(tokens, dialect);
        const context = new ParseContext(this.table);
        this.statements = Object.freeze(new QueryParser(context).ParseStatements());
        this.diagnostics = Object.freeze([...tokens.Diagnostics, ...this.table.Diagnostics, ...templateDiagnostics(this.table), ...context.Diagnostics]
            .sort((a, b) => a.Span.Start - b.Span.Start));
        this.complete = !this.diagnostics.some(d => d.Severity !== 'Info');
    }

    /**
     * Parses SQL text. Never throws.
     * @param text - The SQL, one or more statements.
     * @param dialect - The dialect whose lexical and grammar rules read it.
     */
    static Parse(text: string, dialect: ParserDialect): SqlDocument {
        return new SqlDocument(SqlTokens.Lex(typeof text === 'string' ? text : '', dialect), dialect);
    }

    /** The dialect the text was read with. */
    get Dialect(): ParserDialect {
        return this.table.Dialect;
    }

    /** The token stream. */
    get Tokens(): SqlTokens {
        return this.tokens;
    }

    /** The statements, in order. An empty statement (`;;`) is not included. */
    get Statements(): readonly StatementNode[] {
        return this.statements;
    }

    /** What the lexer and parser found wrong, in text order. */
    get Diagnostics(): readonly Diagnostic[] {
        return this.diagnostics;
    }

    /** Whether everything was read: no Unknown node and no diagnostic above `Info`. */
    get IsComplete(): boolean {
        return this.complete;
    }

    /** The input text a node or span covers; the whole input when called with nothing. */
    Text(target?: SqlNode | Span): string {
        if (target === undefined) return this.tokens.Text;
        const span = 'Span' in target ? target.Span : target;
        return this.tokens.Slice(span);
    }

    /** The document printed from its tokens: equal to the input, byte for byte. */
    Print(): string {
        return this.tokens.Tokens.map(t => t.Text).join('');
    }

    /** The top-level query expression of the first statement; `null` when it is not a query. */
    TopLevelQuery(): QueryExpression | null {
        return TopQuery(this.statements);
    }

    /** An empty edit set over this document's text. */
    Edit(): EditSet {
        return EditSet.For(this.tokens.Text);
    }

    /** Catalog-free name resolution: CTE visibility, FROM-source names and qualifier binding. */
    Scope(): SqlScope {
        this.scope ??= new SqlScope(this.statements, this.Dialect);
        return this.scope;
    }

    /** Every table, CTE and table-valued function read anywhere, subqueries and CTE bodies included. */
    TableReferences(): Analysis<readonly TableReference[]> {
        this.tableReferences ??= this.wrap(Object.freeze(FindTableReferences(this.statements, this.Scope())));
        return this.tableReferences;
    }

    /** Every CTE declared, leading or nested. */
    CTEs(): Analysis<readonly CTEInfo[]> {
        this.ctes ??= this.wrap(Object.freeze(FindCTEs(this.statements)));
        return this.ctes;
    }

    /** The first statement's output columns; for a set operation, the first branch's, plus every branch's. */
    OutputItems(): Analysis<OutputItems> {
        this.outputItems ??= this.wrap(FindOutputItems(this.statements));
        return this.outputItems;
    }

    /** The first statement's top-level ORDER BY, with its exact span; `null` when there is none. */
    TopLevelOrderBy(): Analysis<TopLevelOrderBy | null> {
        this.topLevelOrderBy ??= this.wrap(FindTopLevelOrderBy(this.statements));
        return this.topLevelOrderBy;
    }

    /** The row caps (TOP, LIMIT, OFFSET, FETCH) the first statement's top-level query carries itself. */
    RowCaps(): Analysis<readonly RowCap[]> {
        this.rowCaps ??= this.wrap(Object.freeze(FindRowCaps(this.statements)));
        return this.rowCaps;
    }

    /**
     * Whether the document is exactly one read statement. `SELECT … INTO`, writes in CTEs or
     * subqueries, row locks, non-query statements and stacked statements are refused, with the
     * reason; so is anything that could not be read (fail closed).
     */
    IsReadOnly(): Analysis<ReadOnlyCheck> {
        this.readOnly ??= this.wrap(CheckReadOnly(this.statements, this.complete));
        return this.readOnly;
    }

    /** The kind of each statement. */
    StatementKinds(): Analysis<readonly SqlStatementKind[]> {
        return this.wrap(Object.freeze(this.statements.map(s => s.StatementKind)));
    }

    /** Whether the document holds more than one statement. */
    HasStackedStatements(): Analysis<boolean> {
        return this.wrap(NonEmptyStatements(this.statements).length > 1);
    }

    /** Every identifier path that can be a column, with its clause and bound source when resolvable. */
    ColumnReferences(): Analysis<readonly ColumnReference[]> {
        this.columnReferences ??= this.wrap(Object.freeze(FindColumnReferences(this.statements, this.Scope())));
        return this.columnReferences;
    }

    /** Every construct that reads or compares whole rows: stars, FOR JSON / XML, NATURAL JOIN, set operations, …. */
    WholeRowConstructs(): Analysis<readonly WholeRowConstruct[]> {
        this.wholeRow ??= this.wrap(Object.freeze(FindWholeRowConstructs(this.statements, this.Scope(), this.Dialect)));
        return this.wholeRow;
    }

    /**
     * Output names used more than once in the first statement's output. Incomplete when the output
     * has a star, whose names are not known without the catalog.
     */
    DuplicateOutputNames(options: DuplicateOutputNameOptions = {}): Analysis<readonly DuplicateOutputName[]> {
        const items = this.OutputItems().Value.Items;
        const value = FindDuplicateOutputNames(items, this.Dialect, options);
        return { Value: Object.freeze(value), Complete: this.complete && !items.some(i => i.IsStar), Diagnostics: this.diagnostics };
    }

    private wrap<T>(value: T): Analysis<T> {
        return Object.freeze({ Value: value, Complete: this.complete, Diagnostics: this.diagnostics });
    }
}

function templateDiagnostics(table: TokenTable): Diagnostic[] {
    const found: Diagnostic[] = [];
    table.Tokens.forEach((token, i) => {
        if (!table.IsTemplate(i)) return;
        found.push(MakeDiagnostic(SqlDocumentDiagnosticCodes.TemplateToken, 'Warning', token.Span,
            'A template tag in SQL text is read as an opaque value; the structure around it may be wrong.',
            'Render the template before reading the SQL.'));
    });
    return found;
}
