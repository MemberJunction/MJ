import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsKeyword, LexSQL, SignificantTokens } from './sqlLexer.js';
import type { SQLLexToken } from './sqlLexer.js';
import { SplitLeadingCTEs, WithoutLeadingSemicolons } from './sqlShape.js';
import type { LeadingCTEs } from './sqlShape.js';

/** A row cap the query itself carries, as written. */
export interface OwnRowCap {
    /** `top` for `SELECT TOP …`; `clause` for `LIMIT` / `OFFSET` / `FETCH` at the end of the statement. */
    Form: 'top' | 'clause';
    /** Rows the cap keeps; `null` when it keeps all of them (`OFFSET` alone, `LIMIT ALL`). */
    Rows: number | null;
    /** Rows the cap skips before keeping any. */
    Skip: number;
    /**
     * Whether the cap is plain integer literals, so it can be reasoned about as a row count.
     * False for `PERCENT`, `WITH TIES` and any expression or parameter.
     */
    Numeric: boolean;
    /** Offset in the statement where the cap's text starts. */
    Start: number;
    /** Offset just past the cap's text. */
    End: number;
}

/**
 * What the paging and row-cap steps need to know about a statement, read from tokens so it works
 * on SQL the AST parser cannot read. All offsets are positions in {@link PagingShape.Statement}.
 */
export interface PagingShape {
    /** The statement analysed. */
    Statement: string;
    /** The leading `WITH` clause, split by position; `null` when there is none. */
    CTEs: LeadingCTEs | null;
    /** Where the main statement (after any leading CTEs) starts. */
    MainStart: number;
    /**
     * Where a trailing clause that must stay last starts: `OPTION (…)` on SQL Server, `FOR UPDATE`
     * / `FOR SHARE` on PostgreSQL. Equal to the statement length when there is none.
     */
    TailStart: number;
    /** The caps the main statement itself carries, at its top level, in order. */
    OwnCaps: OwnRowCap[];
    /** The main statement's last top-level `ORDER BY`, from the keyword to the end of its list. */
    OrderBy: { Start: number; End: number } | null;
    /** Whether the main statement is a `UNION` / `INTERSECT` / `EXCEPT`. */
    IsSetOperation: boolean;
    /** Whether the main statement is `SELECT DISTINCT`. */
    IsDistinct: boolean;
    /** A top-level `FOR JSON` or `FOR XML`, which makes the statement return a document, not rows. */
    ReturnsDocument: 'json' | 'xml' | null;
    /**
     * Offset just after the main statement's first top-level `SELECT [ALL | DISTINCT]`, where a
     * `TOP n` would go; `null` when the statement has no top-level SELECT (it is parenthesized,
     * or a bare `VALUES` list).
     */
    SelectListStart: number | null;
}

/** Reads the shape of a single statement for paging and row caps. */
export function AnalyzePagingShape(statement: string, dialect: SQLParserDialect): PagingShape {
    const ctes = SplitLeadingCTEs(statement, dialect);
    const mainStart = ctes ? ctes.MainStart : leadingTriviaEnd(statement, dialect);
    const tokens = SignificantTokens(LexSQL(statement, dialect)).filter(t => t.Start >= mainStart);
    const top = tokens.filter(t => t.Depth === 0);
    const tailStart = findTailStart(top, dialect, statement.length);
    const body = top.filter(t => t.Start < tailStart);
    const clauseCap = readClauseCap(body, statement, tailStart);
    const orderBy = findOrderBy(body, clauseCap?.Start ?? tailStart, statement);
    return {
        Statement: statement,
        CTEs: ctes,
        MainStart: mainStart,
        TailStart: tailStart,
        OwnCaps: [...readTopCaps(tokens), ...(clauseCap ? [clauseCap] : [])],
        OrderBy: orderBy,
        IsSetOperation: body.some(t => IsKeyword(t, 'UNION') || IsKeyword(t, 'INTERSECT') || IsKeyword(t, 'EXCEPT')),
        IsDistinct: body.some((t, i) => IsKeyword(t, 'SELECT') && IsKeyword(body[i + 1], 'DISTINCT')),
        ReturnsDocument: findDocumentClause(body),
        SelectListStart: findSelectListStart(body)
    };
}

function findSelectListStart(body: SQLLexToken[]): number | null {
    const select = body.findIndex(t => IsKeyword(t, 'SELECT'));
    if (select === -1) return null;
    const modifier = IsKeyword(body[select + 1], 'ALL') || IsKeyword(body[select + 1], 'DISTINCT');
    return (modifier ? body[select + 1] : body[select]).End;
}

/** Offset of the first token that is not whitespace, a comment or a leading semicolon. */
function leadingTriviaEnd(statement: string, dialect: SQLParserDialect): number {
    const first = WithoutLeadingSemicolons(SignificantTokens(LexSQL(statement, dialect)))[0];
    return first ? first.Start : statement.length;
}

/** Start of a trailing `OPTION (…)` (SQL Server) or `FOR UPDATE` / `FOR SHARE` (PostgreSQL). */
function findTailStart(top: SQLLexToken[], dialect: SQLParserDialect, length: number): number {
    for (let i = 0; i < top.length; i++) {
        const t = top[i];
        if (IsKeyword(t, 'OPTION') && top[i + 1]?.Kind === 'open') return t.Start;
        if (IsKeyword(t, 'FOR') && isRowLockClause(top, i + 1)) return t.Start;
    }
    return length;
}

function isRowLockClause(top: SQLLexToken[], i: number): boolean {
    return IsKeyword(top[i], 'UPDATE') || IsKeyword(top[i], 'SHARE') ||
        (IsKeyword(top[i], 'NO') && IsKeyword(top[i + 1], 'KEY')) ||
        (IsKeyword(top[i], 'KEY') && IsKeyword(top[i + 1], 'SHARE'));
}

function findDocumentClause(body: SQLLexToken[]): 'json' | 'xml' | null {
    for (let i = 0; i < body.length; i++) {
        if (!IsKeyword(body[i], 'FOR')) continue;
        if (IsKeyword(body[i + 1], 'JSON')) return 'json';
        if (IsKeyword(body[i + 1], 'XML')) return 'xml';
    }
    return null;
}

/** Every `TOP` that follows a top-level `SELECT [ALL | DISTINCT]`. */
function readTopCaps(tokens: SQLLexToken[]): OwnRowCap[] {
    const caps: OwnRowCap[] = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].Depth !== 0 || !IsKeyword(tokens[i], 'SELECT')) continue;
        let j = i + 1;
        if (IsKeyword(tokens[j], 'ALL') || IsKeyword(tokens[j], 'DISTINCT')) j++;
        if (IsKeyword(tokens[j], 'TOP')) caps.push(readTop(tokens, j));
    }
    return caps;
}

/** Reads `TOP n`, `TOP (n)`, `TOP (expr)`, with optional `PERCENT` and `WITH TIES`. */
function readTop(tokens: SQLLexToken[], topIndex: number): OwnRowCap {
    let j = topIndex + 1;
    let rows: number | null = null;
    let numeric = true;
    if (tokens[j]?.Kind === 'open') {
        const close = tokens.findIndex((t, k) => k > j && t.Kind === 'close' && t.Depth === tokens[j].Depth);
        const inner = tokens.slice(j + 1, close);
        rows = inner.length === 1 ? integerValue(inner[0]) : null;
        j = close === -1 ? tokens.length : close + 1;
    } else {
        rows = integerValue(tokens[j]);
        j++;
    }
    if (rows === null) numeric = false;
    if (IsKeyword(tokens[j], 'PERCENT')) { numeric = false; j++; }
    if (IsKeyword(tokens[j], 'WITH') && IsKeyword(tokens[j + 1], 'TIES')) { numeric = false; j += 2; }
    return { Form: 'top', Rows: rows, Skip: 0, Numeric: numeric, Start: tokens[topIndex].Start, End: tokens[j - 1].End };
}

function integerValue(token: SQLLexToken | undefined): number | null {
    return token?.Kind === 'number' && /^\d+$/.test(token.Text) ? Number(token.Text) : null;
}

/**
 * Reads the statement's trailing `LIMIT` / `OFFSET` / `FETCH` clauses, which cap the whole
 * statement (both PostgreSQL forms and SQL Server's `OFFSET … FETCH`). They run from the first
 * such keyword at the top level to the trailing clause, if any.
 */
function readClauseCap(body: SQLLexToken[], statement: string, tailStart: number): OwnRowCap | null {
    const first = body.findIndex(t => IsKeyword(t, 'LIMIT') || IsKeyword(t, 'OFFSET') || IsKeyword(t, 'FETCH'));
    if (first === -1) return null;
    const parts = body.slice(first);
    let rows: number | null = null;
    let skip = 0;
    let numeric = true;
    for (let i = 0; i < parts.length; i++) {
        const t = parts[i];
        if (IsKeyword(t, 'LIMIT')) {
            if (IsKeyword(parts[i + 1], 'ALL')) { rows = null; i++; continue; }
            rows = integerValue(parts[i + 1]);
            if (rows === null) numeric = false;
            i++;
        } else if (IsKeyword(t, 'OFFSET')) {
            const value = integerValue(parts[i + 1]);
            if (value === null) numeric = false; else skip = value;
            i++;
        } else if (IsKeyword(t, 'FETCH')) {
            const value = integerValue(parts[i + 2]);
            rows = value ?? 1;
            if (value === null && !isRowsKeyword(parts[i + 2])) numeric = false;
            if (parts.some(p => IsKeyword(p, 'TIES'))) numeric = false;
        } else if (!isClauseFiller(t)) {
            numeric = false;
        }
    }
    return { Form: 'clause', Rows: rows, Skip: skip, Numeric: numeric, Start: parts[0].Start, End: trimmedEnd(statement, tailStart) };
}

/** Words that make up `LIMIT` / `OFFSET` / `FETCH` clauses besides the keywords and numbers. */
function isClauseFiller(t: SQLLexToken): boolean {
    return t.Kind === 'number' || ['ROW', 'ROWS', 'FIRST', 'NEXT', 'ONLY', 'ALL', 'WITH', 'TIES'].some(w => IsKeyword(t, w));
}

function isRowsKeyword(t: SQLLexToken | undefined): boolean {
    return IsKeyword(t, 'ROW') || IsKeyword(t, 'ROWS');
}

/** `end`, moved back over trailing whitespace. */
function trimmedEnd(statement: string, end: number): number {
    let e = end;
    while (e > 0 && /\s/.test(statement[e - 1])) e--;
    return e;
}

/** The last top-level `ORDER BY`, ending where the cap clause or the trailing clause begins. */
function findOrderBy(body: SQLLexToken[], end: number, statement: string): { Start: number; End: number } | null {
    for (let i = body.length - 2; i >= 0; i--) {
        if (IsKeyword(body[i], 'ORDER') && IsKeyword(body[i + 1], 'BY') && body[i].Start < end) {
            return { Start: body[i].Start, End: trimmedEnd(statement, end) };
        }
    }
    return null;
}
