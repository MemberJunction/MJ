import type { ParserDialect, QueryDialect } from '@memberjunction/sql-dialect';
import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import { SqlDocumentDiagnosticCodes } from '../sql/sqlDiagnosticCodes.js';
import type { SqlDocument } from '../sql/sqlDocument.js';
import type { QueryExpression, StatementNode } from '../sql/sqlNodes.js';
import { NonEmptyStatements } from '../sql/analyses/structureAnalyses.js';
import type { EditSet } from './editSet.js';

/** A dialect a transform that writes names needs: the parser facets plus the writer. */
export type TransformDialect = ParserDialect & Pick<QueryDialect, 'Writer'>;

/** What a transform returns. */
export interface SqlTransformResult {
    /** The new text; the original text when the transform was not applied. */
    readonly Text: string;
    /** Whether the text was changed. */
    readonly Applied: boolean;
    /** The edits over the original text, for a transform made of edits; `null` for one that rebuilds the text. */
    readonly Edits: EditSet | null;
    /** Why the transform did not apply, or what it could not do. */
    readonly Diagnostics: readonly Diagnostic[];
}

/** A document's single query statement, as the transforms need it. */
export interface SingleQuery {
    readonly Statement: StatementNode;
    readonly Body: Exclude<QueryExpression, { Kind: 'Unknown' }>;
}

/**
 * The document's single query statement, or the reason a transform cannot apply: the text has
 * no statement or several, is not a query, or was not read completely (transforms fail closed).
 */
export function SingleQueryOf(doc: SqlDocument): SingleQuery | string {
    const statements = NonEmptyStatements(doc.Statements);
    if (statements.length !== 1) return statements.length === 0 ? 'the text has no statement' : 'the text holds more than one statement';
    const statement = statements[0];
    if (statement.StatementKind !== 'Select' || statement.Body.Kind === 'Unknown') return 'the statement is not a query';
    if (!doc.IsComplete) return 'part of the statement could not be read';
    return { Statement: statement, Body: statement.Body };
}

/** A result that leaves the text unchanged, with a not-applicable diagnostic when `reason` is given. */
export function NotApplied(doc: SqlDocument, transform: string, reason: string | null): SqlTransformResult {
    const diagnostics = reason === null ? [] : [NotApplicable(doc, transform, reason)];
    return Object.freeze({ Text: doc.Text(), Applied: false, Edits: null, Diagnostics: Object.freeze(diagnostics) });
}

/** The not-applicable diagnostic for a transform. */
export function NotApplicable(doc: SqlDocument, transform: string, reason: string): Diagnostic {
    const span: Span = { Start: 0, End: doc.Text().length };
    return MakeDiagnostic(SqlDocumentDiagnosticCodes.TransformNotApplicable, 'Error', span, `${transform} does not apply: ${reason}.`);
}

/** A result made of edits. */
export function FromEdits(edits: EditSet): SqlTransformResult {
    const applied = edits.Apply();
    return Object.freeze({ Text: applied.Text, Applied: !edits.IsEmpty, Edits: edits, Diagnostics: Object.freeze([]) });
}

/** A result that rebuilt the text. */
export function FromText(doc: SqlDocument, text: string): SqlTransformResult {
    return Object.freeze({ Text: text, Applied: text !== doc.Text(), Edits: null, Diagnostics: Object.freeze([]) });
}

/**
 * The span to remove for a clause: the clause and the whitespace before it, unless a line comment
 * ends just before that whitespace (removing the line break would join the next text to the comment).
 */
export function ClauseRemovalSpan(doc: SqlDocument, clause: Span): Span {
    const tokens = doc.Tokens.Tokens;
    const index = doc.Tokens.IndexAt(clause.Start);
    const before = tokens[index - 1];
    if (before === undefined || before.Kind !== 'Whitespace') return clause;
    const beforeThat = tokens[index - 2];
    if (beforeThat !== undefined && beforeThat.Kind === 'Comment' && !beforeThat.Text.startsWith('/*')) return clause;
    return { Start: before.Span.Start, End: clause.End };
}

/** Whether a query expression carries a row cap of its own (TOP, LIMIT, OFFSET or FETCH). */
export function HasOwnCap(body: SingleQuery['Body']): boolean {
    return body.Limit !== null || body.Offset !== null || body.Fetch !== null || (body.Kind === 'Select' && body.Top !== null);
}

/** Where clauses appended to a query expression go: before its FOR and OPTION clauses, or at its end. */
export function TailInsertionPoint(body: SingleQuery['Body']): { readonly At: number; readonly BeforeClause: boolean } {
    const next = body.For ?? body.Option;
    return next !== null ? { At: next.Span.Start, BeforeClause: true } : { At: body.Span.End, BeforeClause: false };
}

/** The ORDER BY expression paging needs when a query has none, by the dialect's grammar. */
export function PagingOrderBy(dialect: ParserDialect, body: SingleQuery['Body']): string {
    const selectListOnly = body.Kind !== 'Select' || body.Distinct?.Form === 'Distinct' || body.Distinct?.Form === 'DistinctOn';
    return selectListOnly ? (dialect.Grammar.SelectListPagingOrderBy ?? dialect.Grammar.DefaultPagingOrderBy) : dialect.Grammar.DefaultPagingOrderBy;
}
