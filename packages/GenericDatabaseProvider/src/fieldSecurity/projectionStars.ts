/**
 * SECURITY — finds the `*` and `alias.*` select items of a saved query's rendered SQL whose columns
 * can only reach the caller as output columns: the star is a whole select item of a select block
 * whose rows flow, unchanged in shape, into the statement's result. Field-level security lets such
 * a star run and drops the denied columns from the result; every other star (and every statement
 * this reading cannot vouch for) stays refused by the token gate.
 */
import { SqlDocument, WalkSqlNodes } from '@memberjunction/sql-parser';
import type {
    FromSource, QueryExpression, QueryNode, SelectCore, SelectItem, StatementNode, WholeRowKind,
} from '@memberjunction/sql-parser';
import type { ParserDialect } from '@memberjunction/sql-dialect';

/**
 * Whole-row constructs that let a denied column shape the result without being named, so a
 * statement carrying one gets no projection star: a document form (`FOR JSON`), a natural join,
 * a row value (`row_to_json(t)`, a bare relation name on PostgreSQL) and an ordinal ORDER BY,
 * which can sort by a column the star brought in.
 */
const DISQUALIFYING_CONSTRUCTS: ReadonlySet<WholeRowKind> = new Set<WholeRowKind>([
    'ForDocument', 'NaturalJoin', 'RowFunction', 'RowReference', 'OrdinalOrderBy',
]);

/**
 * The character offsets of the `*` of every projection star in `sql` (see the module comment).
 * Empty when the statement is not read completely, holds more than one statement, carries a
 * disqualifying whole-row construct or a PIVOT / UNPIVOT, or has no such star.
 *
 * A star qualifies only in a select block that is the statement's query, a CTE body or a derived
 * table reached from it, that is not a branch of a set operation, and that has no DISTINCT and no
 * GROUP BY (each compares the star's columns, denied ones included, across rows).
 *
 * @param sql - The rendered statement.
 * @param dialect - The dialect it runs under.
 */
export function FindProjectionStars(sql: string, dialect: ParserDialect): ReadonlySet<number> {
    const doc = SqlDocument.Parse(sql, dialect);
    if (!statementQualifies(doc)) return new Set();
    const offsets = new Set<number>();
    for (const core of rowSourceCores(doc.Statements[0])) {
        if (!coreQualifies(core)) continue;
        for (const item of core.SelectList) {
            const offset = item.IsStar ? starOffset(doc, item) : -1;
            if (offset >= 0) offsets.add(offset);
        }
    }
    return offsets;
}

/** Whether the document is one fully read statement with no disqualifying construct or pivot. */
function statementQualifies(doc: SqlDocument): boolean {
    if (!doc.IsComplete || doc.Statements.length !== 1) return false;
    const constructs = doc.WholeRowConstructs();
    if (!constructs.Complete || constructs.Value.some(c => DISQUALIFYING_CONSTRUCTS.has(c.Kind))) return false;
    let pivot = false;
    WalkSqlNodes(doc.Statements, node => {
        if (node.Kind === 'Pivot') pivot = true;
    });
    return !pivot;
}

/** The select blocks whose rows reach the statement's result as rows: the query, CTE bodies and derived tables. */
function rowSourceCores(statement: StatementNode): SelectCore[] {
    const cores: SelectCore[] = [];
    visitQuery(statement, cores);
    return cores;
}

function visitQuery(node: StatementNode | QueryNode, cores: SelectCore[]): void {
    for (const cte of node.With?.CTEs ?? []) visitQuery(cte.Body, cores);
    if (node.Body.Kind !== 'Unknown') visitExpression(node.Body, cores);
}

/** A set operation's branches and a VALUES list are not row sources: their rows are compared or built. */
function visitExpression(expression: QueryExpression, cores: SelectCore[]): void {
    if (expression.Kind === 'Select') {
        cores.push(expression);
        for (const source of expression.From?.Sources ?? []) visitSource(source, cores);
    } else if (expression.Kind === 'Parenthesized') {
        visitQuery(expression.Query, cores);
    }
}

function visitSource(source: FromSource, cores: SelectCore[]): void {
    switch (source.Kind) {
        case 'Derived': visitQuery(source.Query, cores); return;
        case 'Join': visitSource(source.Left, cores); visitSource(source.Right, cores); return;
        case 'Apply': visitSource(source.Left, cores); visitSource(source.Right, cores); return;
        case 'ParenthesizedSource': visitSource(source.Inner, cores); return;
        default: return;
    }
}

/** DISTINCT and GROUP BY compare every column of the block's rows, so its stars do not qualify. */
function coreQualifies(core: SelectCore): boolean {
    const distinct = core.Distinct !== null && core.Distinct.Form !== 'All';
    return !distinct && core.GroupBy === null && core.Unrecognized.length === 0;
}

/** The offset of the `*` of a star select item, or -1 when the item is not exactly a star. */
function starOffset(doc: SqlDocument, item: SelectItem): number {
    const stars = item.Expression.Stars();
    if (stars.length !== 1 || stars[0].FunctionName !== null || item.Alias !== null) return -1;
    const text = doc.Text(item.Expression.Span);
    const at = text.lastIndexOf('*');
    return at < 0 || text.slice(at + 1).trim().length > 0 ? -1 : item.Expression.Span.Start + at;
}
