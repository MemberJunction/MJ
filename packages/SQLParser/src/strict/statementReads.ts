import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { LexSQL } from '../sqlLexer.js';
import type { StrictRelation, StrictStatementReads } from './strictTypes.js';

/**
 * One parse the reads walk reads: its tree, the bracket identifiers a fallback parse renamed
 * (`null` when none were), the dialect it was read with, and its text. A `SQLParser` is one.
 */
export interface ReadableParse {
    readonly AST: unknown;
    readonly IdentifierAliases: ReadonlyMap<string, string> | null;
    readonly Dialect: SQLParserDialect;
    readonly SQL: string;
}

/**
 * How a dialect matches a FROM item to a CTE. Each function returns the name as the dialect
 * compares it, or null when the walk cannot tell.
 */
interface CTENameRules {
    /** The name a CTE declares, from its name node in the parse tree. */
    DeclaredName(node: unknown): string | null;
    /** The name an unqualified FROM item reads, from its text in the parse tree. */
    ReferenceName(text: string): string | null;
    /** Whether a CTE body sees its own CTE without RECURSIVE (SQL Server). */
    BodySeesItself: boolean;
}

/** The state of one walk of a parse tree. */
interface StatementWalk {
    Reads: StrictStatementReads;
    Visited: WeakSet<object>;
    Aliases: ReadonlyMap<string, string> | null;
    Names: CTENameRules;
    /** A FROM item node to leave out (a fragment's parse wrapper). */
    Skip: object | undefined;
    /** Each CTE name the walk has met, with the number of CTEs of that name in scope at the current node. */
    InScope: Map<string, number>;
}

/** The table name a fragment's parse wrapper reads. */
export const CLAUSE_WRAPPER_TABLE = '__mj_clause_screen';

/**
 * Every FROM item in a parsed statement, and the number of SELECT nodes. The walk visits every
 * property of every node, so it finds a FROM list wherever the grammar puts one: a subquery in a
 * CASE branch, HAVING, a window's ORDER BY or PARTITION BY, a function argument, IN, EXISTS, a
 * set operation or a CTE body. Every FROM item is kept, even when its alias repeats. Names the
 * fallback parse renamed are read back through {@link ReadableParse.IdentifierAliases}, which
 * holds only names the parser put in the tree. `skip` is a FROM item node of the tree to leave out.
 *
 * Each FROM item records whether it reads a CTE in scope there. A WITH covers its own SELECT,
 * everything below it, and the following set-operation branches unless its SELECT is a
 * parenthesized branch. A CTE body sees the CTEs before it, itself on SQL Server, and every CTE of
 * a PostgreSQL WITH RECURSIVE list. Names match by the dialect's identifier rules. The walk keeps a
 * count of the CTEs of each name in scope as it goes, so its time is linear in the tree.
 */
export function CollectReads(parser: ReadableParse, skip?: object): StrictStatementReads {
    const aliases = parser.IdentifierAliases;
    const walk: StatementWalk = {
        Reads: { Relations: [], SelectCount: 0 },
        Visited: new WeakSet<object>(),
        Aliases: aliases,
        Names: cteNameRules(parser, aliases),
        Skip: skip,
        InScope: new Map<string, number>(),
    };
    visitNode(walk, parser.AST);
    return walk.Reads;
}

/** The FROM item of a fragment's parse wrapper: the root statement's only FROM item, when it is the wrapper table. */
export function WrapperFromItem(ast: unknown): object | undefined {
    const root = Array.isArray(ast) ? ast[0] : ast;
    const from = root && typeof root === 'object' ? (root as Record<string, unknown>).from : undefined;
    if (!Array.isArray(from) || from.length !== 1 || !from[0] || typeof from[0] !== 'object') return undefined;
    const item = from[0] as Record<string, unknown>;
    const isWrapper =
        identifierText(item.table, null).toLowerCase() === CLAUSE_WRAPPER_TABLE &&
        !identifierText(item.db, null) &&
        !identifierText(item.schema, null);
    return isWrapper ? item : undefined;
}

/** Removes the bracket, double-quote or backtick quoting around one identifier. */
export function StripIdentifierQuoting(name: string | null | undefined): string {
    if (!name) return '';
    return name.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').replace(/^`|`$/g, '');
}

/** Visits one node of the parse tree. */
function visitNode(walk: StatementWalk, node: unknown): void {
    if (!node || typeof node !== 'object' || walk.Visited.has(node)) return;
    walk.Visited.add(node);
    if (Array.isArray(node)) {
        node.forEach((child) => visitNode(walk, child));
        return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === 'select') {
        visitSelect(walk, record);
        return;
    }
    Object.values(record).forEach((child) => visitNode(walk, child));
}

/**
 * Visits a SELECT node: counts it, adds its FROM items, and visits its CTE bodies and every
 * other property with the CTE names each one can see. The CTEs of its WITH are in scope from
 * their place in the list until the walk leaves the SELECT.
 */
function visitSelect(walk: StatementWalk, select: Record<string, unknown>): void {
    walk.Reads.SelectCount++;
    const ctes: unknown[] = Array.isArray(select.with) ? select.with : [];
    const declared = ctes.map((cte) => walk.Names.DeclaredName(cteNameNode(cte)));
    enterScope(walk, declared);
    addFromItems(walk, select.from);
    leaveScope(walk, declared);
    visitCTEBodies(walk, ctes, declared);
    const ownBranchOnly = ctes.length > 0 && select.parentheses_symbol === true;
    for (const [key, child] of Object.entries(select)) {
        if (key === 'with') continue;
        const outsideWith = key === '_next' && ownBranchOnly;
        if (outsideWith) leaveScope(walk, declared);
        visitNode(walk, child);
        if (outsideWith) enterScope(walk, declared);
    }
    leaveScope(walk, declared);
}

/**
 * Visits the bodies of one WITH list, whose CTE names are `declared`. Body `i` sees the CTEs
 * before it, itself too on SQL Server, and every CTE of a RECURSIVE list. Each CTE comes into
 * scope once, at its place in the list, and all of them are in scope afterwards.
 */
function visitCTEBodies(walk: StatementWalk, ctes: readonly unknown[], declared: readonly (string | null)[]): void {
    const recursive = ctes.some((cte) => isRecursiveCTE(cte));
    let entered = 0;
    ctes.forEach((cte, i) => {
        const visible = recursive ? ctes.length : walk.Names.BodySeesItself ? i + 1 : i;
        for (; entered < visible; entered++) countName(walk, declared[entered], 1);
        visitNode(walk, cte);
    });
    for (; entered < ctes.length; entered++) countName(walk, declared[entered], 1);
}

/** Adds the relation each FROM item names, marking an unqualified reference to a CTE in scope. */
function addFromItems(walk: StatementWalk, from: unknown): void {
    const items: unknown[] = Array.isArray(from) ? from : from ? [from] : [];
    for (const item of items) {
        if (!item || typeof item !== 'object' || item === walk.Skip) continue;
        const relation = relationOf(item as Record<string, unknown>, walk.Aliases);
        if (!relation) continue;
        const name = relation.TableName && !relation.SchemaName ? walk.Names.ReferenceName(relation.TableName) : null;
        relation.IsCTEReference = name !== null && (walk.InScope.get(name) ?? 0) > 0;
        walk.Reads.Relations.push(relation);
    }
}

/** Brings each readable name among `names` into scope once more. */
function enterScope(walk: StatementWalk, names: readonly (string | null)[]): void {
    for (const name of names) countName(walk, name, 1);
}

/** Takes each readable name among `names` out of scope once. */
function leaveScope(walk: StatementWalk, names: readonly (string | null)[]): void {
    for (const name of names) countName(walk, name, -1);
}

/**
 * Adds `delta` to the in-scope count of `name` when it is readable. A count that drops to zero
 * stays in the map: in V8, each delete of a key leaves an entry that later lookups of that key
 * step over until the map is rebuilt.
 */
function countName(walk: StatementWalk, name: string | null, delta: 1 | -1): void {
    if (name) walk.InScope.set(name, (walk.InScope.get(name) ?? 0) + delta);
}

/** The name node of one item of a `with` list. */
function cteNameNode(cte: unknown): unknown {
    return cte && typeof cte === 'object' ? (cte as { name?: unknown }).name : undefined;
}

/** True for the item of a `with` list that carries RECURSIVE (the parser marks the first). */
function isRecursiveCTE(cte: unknown): boolean {
    return !!cte && typeof cte === 'object' && (cte as { recursive?: unknown }).recursive === true;
}

/**
 * How the parser's dialect matches a FROM item to a CTE. SQL Server ignores case, and a CTE
 * body reads its own CTE. PostgreSQL folds an unquoted name to lower case and matches a quoted
 * one exactly ({@link postgresNameRules}). A dialect that quotes identifiers any other way
 * matches no CTE.
 */
function cteNameRules(parser: ReadableParse, aliases: ReadonlyMap<string, string> | null): CTENameRules {
    const quote = parser.Dialect.QuoteIdentifier('x');
    if (quote.startsWith('[')) {
        return {
            DeclaredName: (node) => asciiLower(identifierText(node, aliases)) || null,
            ReferenceName: (text) => asciiLower(text) || null,
            BodySeesItself: true,
        };
    }
    if (quote.startsWith('"')) return postgresNameRules(parser, aliases);
    return { DeclaredName: () => null, ReferenceName: () => null, BodySeesItself: false };
}

/**
 * PostgreSQL's CTE name rules. A CTE name node says whether it was quoted. A FROM item's name
 * does not, so its quoting comes from the SQL's tokens: a name with upper-case letters that the
 * SQL writes only quoted is exact, one it writes only unquoted folds to lower case, and one it
 * writes both ways, or not as a token at all, matches no CTE.
 */
function postgresNameRules(parser: ReadableParse, aliases: ReadonlyMap<string, string> | null): CTENameRules {
    const quoted = new Set<string>();
    const bare = new Set<string>();
    for (const token of LexSQL(parser.SQL, parser.Dialect)) {
        if (token.Kind === 'word') bare.add(token.Text);
        else if (token.Kind === 'identifier' && token.Text.startsWith('"')) quoted.add(token.Text.slice(1, -1).split('""').join('"'));
    }
    const referenceName = (text: string): string | null => {
        const folded = asciiLower(text);
        if (folded === text) return text || null;
        if (quoted.has(text) && !bare.has(text)) return text;
        if (bare.has(text) && !quoted.has(text)) return folded;
        return null;
    };
    const declaredName = (node: unknown): string | null => {
        const name = node && typeof node === 'object' ? (node as { type?: unknown; value?: unknown }) : null;
        if (typeof name?.value === 'string' && name.type === 'double_quote_string') return name.value || null;
        if (typeof name?.value === 'string' && name.type === 'default') return asciiLower(name.value) || null;
        return referenceName(identifierText(node, aliases));
    };
    return { DeclaredName: declaredName, ReferenceName: referenceName, BodySeesItself: false };
}

/** `text` with ASCII upper-case letters in lower case: PostgreSQL's folding of an unquoted name. */
function asciiLower(text: string): string {
    return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * The relation one FROM item names. A derived table and a VALUES list name none; the walk
 * reaches any subquery inside them.
 */
function relationOf(item: Record<string, unknown>, aliases: ReadonlyMap<string, string> | null): StrictRelation | null {
    const table = identifierText(item.table, aliases);
    if (table) {
        const database = identifierText(item.db, aliases);
        const schema = identifierText(item.schema, aliases);
        return { SchemaName: schema ? `${database}.${schema}` : database, TableName: table, FunctionName: '', IsCTEReference: false };
    }
    const expr = item.expr && typeof item.expr === 'object' ? (item.expr as { type?: unknown; ast?: unknown; name?: unknown }) : null;
    if (expr?.ast || expr?.type === 'values') return null;
    if (expr?.type === 'function') return functionRelation(expr.name, aliases);
    return { SchemaName: '', TableName: '', FunctionName: '', IsCTEReference: false };
}

/** The relation a table function names. Leading name parts join the schema, so a qualified name never matches a built-in. */
function functionRelation(name: unknown, aliases: ReadonlyMap<string, string> | null): StrictRelation {
    if (typeof name === 'string') return { SchemaName: '', TableName: '', FunctionName: name, IsCTEReference: false };
    const record = name && typeof name === 'object' ? (name as { name?: unknown; schema?: unknown }) : {};
    const parts = Array.isArray(record.name) ? record.name.map((part) => identifierText(part, aliases)) : [];
    const qualifiers = [identifierText(record.schema, aliases), ...parts.slice(0, -1)].filter(Boolean);
    return { SchemaName: qualifiers.join('.'), TableName: '', FunctionName: parts[parts.length - 1] ?? '', IsCTEReference: false };
}

/**
 * The text of an identifier node (a string, or the PostgreSQL grammar's `{ value }` node), with
 * a name the fallback parse renamed read back from `aliases`; empty when unreadable.
 */
function identifierText(value: unknown, aliases: ReadonlyMap<string, string> | null): string {
    let text = '';
    if (typeof value === 'string') {
        text = value;
    } else if (value && typeof value === 'object') {
        const node = value as { value?: unknown; expr?: unknown };
        if (typeof node.value === 'string') text = node.value;
        else if (node.expr) return identifierText(node.expr, aliases);
    }
    return StripIdentifierQuoting(aliases?.get(text) ?? text);
}
