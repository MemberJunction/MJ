import type { SQLDialect } from '@memberjunction/sql-dialect';
import {
    AnalyzePagingShape, AnalyzeTopLevelOrderBy, HoistCTEs, IsKeyword, LexSQL, RenameCTE, SignificantTokens, SplitLeadingCTEs,
    SqlDocument, StripOrderBy,
} from '@memberjunction/sql-parser';
import type { EditSet, QueryExpression } from '@memberjunction/sql-parser';
import { SymbolTable } from '../symbolTable.js';
import type { CompositionInstance } from './compositionRender.js';

/** What assembly did to one instance. */
export interface AssembledInstance {
    readonly Instance: CompositionInstance;
    /** Whether its top-level ORDER BY was removed (the dialect forbids it in a CTE and it has no row cap of its own). */
    readonly OrderByStripped: boolean;
    /** How many of its own leading CTEs were hoisted into the outer WITH clause. */
    readonly InnerCTEsHoisted: number;
}

/** The plain SQL a composed query runs as. */
export interface AssembledComposition {
    readonly SQL: string;
    readonly Instances: readonly AssembledInstance[];
}

/** A statement split for assembly. */
interface StatementParts {
    /** Its leading CTE definitions, as written. */
    readonly Definitions: string[];
    /** The query after its WITH clause, without its hint clause when hints were taken. */
    readonly Body: string;
    readonly Hints: string[];
    readonly Recursive: boolean;
    readonly OrderByStripped: boolean;
}

/**
 * Assembles the rendered outer query and its rendered instances into one plain statement. Text is
 * edited by position (`SqlDocument` + edits), never regenerated, and never rendered again.
 *
 * - Each instance becomes a CTE named by its instance name. Its own leading CTEs are hoisted
 *   before it (no nested WITH), renamed with the dialect's quoting where a name is already taken
 *   (only the declaration and the references the scope analysis binds to it). Its top-level ORDER
 *   BY is removed when the dialect forbids one in a CTE and it has no TOP / OFFSET / FETCH / FOR
 *   XML or JSON of its own. Its query hints move to the outer statement; semicolons are trimmed.
 * - One WITH clause: instances dependencies first, then the outer query's own CTEs, opened with
 *   the dialect's recursive keyword when any CTE needs it.
 * - A statement the structural parser cannot read completely (T-SQL `JOIN … JOIN … ON … ON`,
 *   `(NOLOCK)`) is split with the token-level helpers instead, so it still composes.
 */
export class CompositionAssembler {
    static Assemble(outerSQL: string, instances: readonly CompositionInstance[], dialect: SQLDialect): AssembledComposition {
        const symbols = new SymbolTable(dialect);
        instances.forEach(i => symbols.Seed(canonicalName(i.CTEName)));
        leadingCTENames(outerSQL, dialect).forEach(n => symbols.Seed(n));
        const definitions: string[] = [];
        const hints: string[] = [];
        const assembled: AssembledInstance[] = [];
        let recursive = false;
        for (const instance of instances) {
            const renamed = renameCollisions(withoutStatementSemicolons(instance.RenderedSQL, dialect), dialect, symbols);
            const parts = splitStatement(renamed, dialect, { TakeHints: true, StripOrderBy: !dialect.AllowsOrderByInCTE, Label: instance.Path.FullPath });
            definitions.push(...parts.Definitions, `${instance.CTEName} AS (\n${parts.Body}\n)`);
            hints.push(...parts.Hints);
            recursive = recursive || parts.Recursive;
            assembled.push({ Instance: instance, OrderByStripped: parts.OrderByStripped, InnerCTEsHoisted: parts.Definitions.length });
        }
        const outer = outerParts(withoutLeadingSemicolons(outerSQL, dialect), distinctHints(hints), dialect);
        const keyword = (recursive || outer.Recursive) && dialect.Grammar.RecursiveKeyword ? `WITH ${dialect.Grammar.RecursiveKeyword}` : 'WITH';
        return { SQL: `${keyword} ${[...definitions, ...outer.Definitions].join(',\n')}\n${outer.Main}`, Instances: assembled };
    }
}

/** The outer statement split for assembly, with the instances' hints merged into it. */
interface OuterParts {
    /** Its own leading CTE definitions, as written. */
    readonly Definitions: string[];
    /** Everything after its WITH clause, trailing semicolon and comments included. */
    readonly Main: string;
    readonly Recursive: boolean;
}

/**
 * The outer statement with `hints` merged into its hint clause (or a new one added after its last
 * clause, ahead of a trailing semicolon or comment), split into its leading CTEs and the rest.
 */
function outerParts(sql: string, hints: string[], dialect: SQLDialect): OuterParts {
    const doc = SqlDocument.Parse(sql, dialect);
    const top = completeTopQuery(doc);
    if (top !== null) {
        const text = hints.length > 0 ? mergeHintsInto(doc, top, hints, dialect).Apply().Text : sql;
        const hoisted = HoistCTEs(text === sql ? doc : SqlDocument.Parse(text, dialect));
        if (hoisted !== null) {
            // Without a WITH clause of its own the statement is kept whole, leading comments included.
            const main = hoisted.With === null ? text : text.substring(hoisted.BodyStart);
            return { Definitions: hoisted.CTEs.map(c => c.Text), Main: main, Recursive: hoisted.Recursive };
        }
    }
    const withHints = appendHintsByTokens(sql, hints, dialect);
    const split = SplitLeadingCTEs(withHints, dialect);
    return split
        ? { Definitions: split.Definitions.map(d => d.Text), Main: split.Main, Recursive: split.Recursive }
        : { Definitions: [], Main: withHints, Recursive: false };
}

/** Edits that merge `hints` into the top-level query's hint clause, or add one after its last clause. */
function mergeHintsInto(doc: SqlDocument, top: Exclude<QueryExpression, { Kind: 'Unknown' }>, hints: string[], dialect: SQLDialect): EditSet {
    const keyword = dialect.QueryHintKeyword;
    if (keyword === null || hints.length === 0) return doc.Edit();
    if (top.Option === null) {
        const end = top.Span.End;
        return doc.Edit().InsertAfter({ Start: end, End: end }, ` ${keyword} (${hints.join(', ')})`);
    }
    const list = { Start: top.Option.ListSpan.Start + 1, End: top.Option.ListSpan.End - 1 };
    const merged = distinctHints([...splitHintList(doc.Text(list), dialect), ...hints]);
    return doc.Edit().Replace(list, merged.join(', '));
}

interface SplitOptions {
    readonly TakeHints: boolean;
    readonly StripOrderBy: boolean;
    /** Names the statement in errors. */
    readonly Label: string;
}

function splitStatement(text: string, dialect: SQLDialect, options: SplitOptions): StatementParts {
    return structuralSplit(text, dialect, options) ?? tokenSplit(text, dialect, options);
}

// ─── Structural path (SqlDocument + edits) ──────────────────

/** Splits a statement the structural parser reads completely; `null` when it does not. */
function structuralSplit(text: string, dialect: SQLDialect, options: SplitOptions): StatementParts | null {
    const doc = SqlDocument.Parse(text, dialect);
    const top = completeTopQuery(doc);
    if (top === null) return null;
    const option = options.TakeHints ? top.Option : null;
    const hints = option ? splitHintList(doc.Text({ Start: option.ListSpan.Start + 1, End: option.ListSpan.End - 1 }), dialect) : [];
    const rest = option ? `${text.substring(0, option.Span.Start).trimEnd()}${text.substring(option.Span.End)}`.trimEnd() : text;
    const hoisted = HoistCTEs(option ? SqlDocument.Parse(rest, dialect) : doc);
    if (hoisted === null) return null;
    const body = options.StripOrderBy ? stripOwnOrderBy(hoisted.Body, dialect) : { Text: hoisted.Body, Stripped: false };
    if (body === null) return null;
    return { Definitions: hoisted.CTEs.map(c => c.Text), Body: body.Text.trim(), Hints: hints, Recursive: hoisted.Recursive, OrderByStripped: body.Stripped };
}

/** The top-level query of a document read completely with one statement, or `null`. */
function completeTopQuery(doc: SqlDocument): Exclude<QueryExpression, { Kind: 'Unknown' }> | null {
    const top = doc.TopLevelQuery();
    if (!doc.IsComplete || top === null || top.Kind === 'Unknown' || doc.Statements.length !== 1) return null;
    return top;
}

/** Removes a query's top-level ORDER BY unless a row cap or FOR XML / JSON of its own needs it; `null` when the body cannot be read. */
function stripOwnOrderBy(body: string, dialect: SQLDialect): { Text: string; Stripped: boolean } | null {
    const doc = SqlDocument.Parse(body, dialect);
    const top = completeTopQuery(doc);
    if (top === null) return null;
    if (top.OrderBy === null || top.For !== null || hasOwnCap(top)) return { Text: body, Stripped: false };
    const stripped = StripOrderBy(doc);
    return stripped.Applied ? { Text: stripped.Text, Stripped: true } : null;
}

function hasOwnCap(query: Exclude<QueryExpression, { Kind: 'Unknown' }>): boolean {
    return query.Limit !== null || query.Offset !== null || query.Fetch !== null || (query.Kind === 'Select' && query.Top !== null);
}

/** Renames the instance's leading CTEs whose names are taken, registering every name it keeps. */
function renameCollisions(text: string, dialect: SQLDialect, symbols: SymbolTable): string {
    let result = text;
    for (const name of leadingCTENames(text, dialect)) {
        const actual = symbols.Register(name);
        if (actual === name) continue;
        const renamed = RenameCTE(SqlDocument.Parse(result, dialect), dialect, name, actual);
        result = renamed.Applied ? renamed.Text : renameByTokens(result, dialect, name, actual);
    }
    return result;
}

/** A statement's leading CTE names, unquoted. */
function leadingCTENames(text: string, dialect: SQLDialect): string[] {
    const doc = SqlDocument.Parse(text, dialect);
    const hoisted = completeTopQuery(doc) ? HoistCTEs(doc) : null;
    if (hoisted) return hoisted.CTEs.map(c => c.Name);
    return (SplitLeadingCTEs(text, dialect)?.Definitions ?? []).map(d => canonicalName(d.Name));
}

// ─── Token path (for statements the structural parser cannot read) ───

function tokenSplit(text: string, dialect: SQLDialect, options: SplitOptions): StatementParts {
    const option = options.TakeHints ? findOptionList(text, dialect) : null;
    const statement = option ? text.substring(0, option.OptionStart).trimEnd() : text;
    const split = SplitLeadingCTEs(statement, dialect);
    const main = split ? split.Main : statement;
    const body = options.StripOrderBy ? tokenStripOrderBy(main, dialect, options.Label) : { Text: main, Stripped: false };
    return {
        Definitions: split ? split.Definitions.map(d => d.Text) : [], Body: body.Text.trim(), Hints: option?.Hints ?? [],
        Recursive: split?.Recursive ?? false, OrderByStripped: body.Stripped,
    };
}

/**
 * Removes a top-level ORDER BY found by tokens, unless the statement has its own row cap or
 * returns a document.
 * @throws Error when an ORDER BY the dialect forbids in a CTE is left.
 */
function tokenStripOrderBy(main: string, dialect: SQLDialect, label: string): { Text: string; Stripped: boolean } {
    const shape = AnalyzePagingShape(main, dialect);
    if (shape.OrderBy === null || shape.OwnCaps.length > 0 || shape.ReturnsDocument !== null) return { Text: main, Stripped: false };
    const text = `${main.substring(0, shape.OrderBy.Start).trimEnd()}${main.substring(shape.OrderBy.End)}`;
    const left = AnalyzeTopLevelOrderBy(text, dialect);
    if (left.Positions.length > 0 && !left.IsLegalInCTE) {
        throw new Error(
            `Composition error: dependency '${label}' has a trailing ORDER BY that could not be removed. ` +
            'SQL Server does not allow ORDER BY in CTEs without TOP, OFFSET, or FOR XML. Either remove the ORDER BY from the dependency, or add TOP/OFFSET.',
        );
    }
    return { Text: text, Stripped: true };
}

/** Renames a name by tokens: every word or quoted identifier equal to it that is not a member after `.`. */
function renameByTokens(sql: string, dialect: SQLDialect, from: string, to: string): string {
    const target = from.toLowerCase();
    let previous: string | null = null;
    return LexSQL(sql, dialect).map(token => {
        const isName = (token.Kind === 'word' || token.Kind === 'identifier') && canonicalName(token.Text).toLowerCase() === target && previous !== 'dot';
        if (token.Kind !== 'whitespace' && token.Kind !== 'comment') previous = token.Kind;
        return isName ? dialect.QuoteIdentifier(to) : token.Text;
    }).join('');
}

/**
 * A statement's top-level trailing query-hint clause (`OPTION (…)` on SQL Server): where it
 * starts and its hints, split at top-level commas. `null` when the dialect has none or there is none.
 */
function findOptionList(sql: string, dialect: SQLDialect): { OptionStart: number; ListStart: number; ListEnd: number; Hints: string[] } | null {
    const keyword = dialect.QueryHintKeyword;
    if (keyword === null) return null;
    const shape = AnalyzePagingShape(sql, dialect);
    const tokens = SignificantTokens(LexSQL(sql, dialect)).filter(t => t.Start >= shape.TailStart);
    if (!IsKeyword(tokens[0], keyword.toUpperCase()) || tokens[1]?.Kind !== 'open') return null;
    const close = tokens.findIndex((t, i) => i > 1 && t.Kind === 'close' && t.Depth === tokens[1].Depth);
    if (close === -1) return null;
    return {
        OptionStart: tokens[0].Start, ListStart: tokens[1].End, ListEnd: tokens[close].Start,
        Hints: splitHintList(sql.substring(tokens[1].End, tokens[close].Start), dialect),
    };
}

// ─── Shared helpers ─────────────────────────────────────────

/** The hints of a hint list (the text inside `OPTION (…)`), split at top-level commas. */
function splitHintList(list: string, dialect: SQLDialect): string[] {
    const hints: string[] = [];
    let start = 0;
    for (const token of SignificantTokens(LexSQL(list, dialect))) {
        if (token.Kind !== 'comma' || token.Depth !== 0) continue;
        hints.push(list.substring(start, token.Start).trim());
        start = token.End;
    }
    hints.push(list.substring(start).trim());
    return hints.filter(h => h.length > 0);
}

/**
 * Merges `hints` into a statement read by tokens: into its own hint clause when it has one,
 * otherwise as a new clause after its last token, ahead of any trailing semicolon or comment.
 */
function appendHintsByTokens(sql: string, hints: string[], dialect: SQLDialect): string {
    const keyword = dialect.QueryHintKeyword;
    if (hints.length === 0 || keyword === null) return sql;
    const list = findOptionList(sql, dialect);
    if (list) {
        const merged = distinctHints([...list.Hints, ...hints]).join(', ');
        return `${sql.substring(0, list.ListStart)}${merged}${sql.substring(list.ListEnd)}`;
    }
    const tokens = SignificantTokens(LexSQL(sql, dialect));
    let last = tokens.length - 1;
    while (last > 0 && tokens[last].Kind === 'semicolon') last--;
    const at = last >= 0 ? tokens[last].End : sql.length;
    return `${sql.substring(0, at)} ${keyword} (${hints.join(', ')})${sql.substring(at)}`;
}

/** Hints with repeats removed, comparing case- and spacing-insensitively; first spelling kept. */
function distinctHints(hints: string[]): string[] {
    const seen = new Set<string>();
    return hints.filter(h => {
        const key = h.replace(/\s+/g, ' ').toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** The statement without semicolons before or after it (`;WITH …`, `… ;`), which a CTE body cannot hold. */
function withoutStatementSemicolons(sql: string, dialect: SQLDialect): string {
    const tokens = SignificantTokens(LexSQL(sql, dialect));
    const first = tokens.findIndex(t => t.Kind !== 'semicolon');
    if (first === -1) return sql.trim();
    let last = tokens.length - 1;
    while (tokens[last].Kind === 'semicolon') last--;
    return sql.substring(tokens[first].Start, tokens[last].End);
}

/**
 * The outer statement without the semicolons before it (`;SELECT …`): the assembled WITH clause is
 * written in front of the statement, and a semicolon between the two would end the statement there.
 * Text before the semicolons (comments) is kept.
 */
function withoutLeadingSemicolons(sql: string, dialect: SQLDialect): string {
    const tokens = SignificantTokens(LexSQL(sql, dialect));
    let index = 0;
    while (index < tokens.length && tokens[index].Kind === 'semicolon') index++;
    if (index === 0 || index === tokens.length) return sql;
    return sql.substring(0, tokens[0].Start) + sql.substring(tokens[index].Start);
}

/** A name without its surrounding brackets or double quotes. */
function canonicalName(name: string): string {
    return name.replace(/^[[\"]|[\]"]$/g, '');
}
