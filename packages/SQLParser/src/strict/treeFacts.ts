import type { SQLStatementKind } from '../sql-parser.js';

/**
 * Parse-tree node `type` values that mark a write, DDL or DCL statement, wherever they appear.
 */
const WRITE_NODE_TYPES = new Set<string>([
    'insert', 'update', 'delete', 'merge', 'replace', 'drop', 'create', 'alter', 'truncate',
    'rename', 'call', 'exec', 'execute', 'grant', 'revoke', 'use', 'load', 'copy', 'do',
]);

/**
 * True when a parse tree holds a write, DDL or DCL node at any depth. A top-level check misses a
 * write inside a CTE body (`WITH x AS (INSERT … RETURNING *) SELECT * FROM x` parses as a
 * top-level SELECT); this walk does not. It matches node `type` values only, so a column or table
 * named `update` (an identifier node) never matches.
 */
export function TreeContainsWriteNode(node: unknown): boolean {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some((child) => TreeContainsWriteNode(child));
    const record = node as Record<string, unknown>;
    const type = record.type;
    if (typeof type === 'string' && WRITE_NODE_TYPES.has(type.toLowerCase())) return true;
    return Object.values(record).some((child) => TreeContainsWriteNode(child));
}

/**
 * True only when the parse is a single statement with a recognised (string) `type`. The grammar
 * reads some write forms (T-SQL `WITH … INSERT`) as an array of untyped nodes that slip past
 * type-based checks, so anything else is not one well-formed statement.
 */
export function IsSingleTypedStatement(ast: unknown): boolean {
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) return false;
    const statement: unknown = statements[0];
    return !!statement && typeof statement === 'object' && typeof (statement as Record<string, unknown>).type === 'string';
}

/**
 * The column references in the WHERE clause of each statement of a parse, in the order first
 * met, each once (`table.column` when qualified).
 */
export function WhereColumnReferences(ast: unknown): string[] {
    const found = new Set<string>();
    const statements: unknown[] = Array.isArray(ast) ? ast : [ast];
    for (const statement of statements) {
        if (statement && typeof statement === 'object' && 'where' in statement && statement.where) {
            collectColumnReferences(statement.where, found);
        }
    }
    return [...found];
}

/** The value of `key` on `value` when it is an object; `undefined` otherwise. */
function member(value: unknown, key: string): unknown {
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * Adds the column references below one expression node. A function's name is not a reference;
 * its arguments are walked. Binary operands, list items, CASE branches and nested expressions
 * are walked too.
 */
function collectColumnReferences(expr: unknown, found: Set<string>): void {
    if (!expr || typeof expr !== 'object') return;
    const type = member(expr, 'type');
    if (type === 'column_ref') {
        addColumnReference(expr, found);
        return;
    }
    if (type === 'function') {
        collectFunctionArguments(member(expr, 'args'), found);
        return;
    }
    walkIfPresent(member(expr, 'left'), found);
    walkIfPresent(member(expr, 'right'), found);
    const value = member(expr, 'value');
    if (value && Array.isArray(value)) {
        for (const item of value) collectColumnReferences(item, found);
    }
    walkIfPresent(member(expr, 'result'), found);
    walkIfPresent(member(expr, 'expr'), found);
    collectArgumentList(member(expr, 'args'), found);
}

/** Walks `node` when it is truthy. */
function walkIfPresent(node: unknown, found: Set<string>): void {
    if (node) collectColumnReferences(node, found);
}

/** Adds the reference a `column_ref` node names, when it names one as text. */
function addColumnReference(expr: unknown, found: Set<string>): void {
    const table = member(expr, 'table');
    const column = member(expr, 'column');
    const name: unknown = table ? `${String(table)}.${String(column)}` : column;
    if (typeof name === 'string') found.add(name);
}

/** Walks the arguments of a function node: its `args.value` list, or `args` itself. */
function collectFunctionArguments(args: unknown, found: Set<string>): void {
    if (!args) return;
    const list = member(args, 'value') || args;
    const items: unknown[] = Array.isArray(list) ? list : [list];
    for (const arg of items) {
        if (arg) collectColumnReferences(arg, found);
    }
}

/** Walks the `args` of a node that is not a function: each argument's `value` when it has one, else the argument. */
function collectArgumentList(args: unknown, found: Set<string>): void {
    if (!args) return;
    const items: unknown[] = Array.isArray(args) ? args : [args];
    for (const arg of items) {
        if (!arg || typeof arg !== 'object') continue;
        const value = member(arg, 'value');
        collectColumnReferences(value ? value : arg, found);
    }
}

/** Top-level statement `type` values that write or modify rather than read. */
const TOP_LEVEL_WRITE_TYPES = new Set<string>([
    'insert', 'update', 'delete', 'merge', 'replace',
    'drop', 'create', 'alter', 'truncate', 'rename',
    'call', 'exec', 'execute', 'grant', 'revoke', 'use',
]);

/** The parse's first statement node, or null. */
function rootStatement(ast: unknown): Record<string, unknown> | null {
    if (!ast) return null;
    const root: unknown = Array.isArray(ast) ? ast[0] : ast;
    return root && typeof root === 'object' ? (root as Record<string, unknown>) : null;
}

/**
 * The kind of a parse's top-level statement, read the way `SQLParser.StatementKind` reads it:
 * `'mutation'` for INSERT, UPDATE, DELETE or MERGE, `'select-into'`, `'set-op'`, `'select'`, and
 * `'other'` for anything else.
 */
export function TopLevelStatementKind(ast: unknown): SQLStatementKind {
    const root = rootStatement(ast);
    if (!root) return 'other';
    const type = root.type;
    if (type !== 'select') {
        return type === 'insert' || type === 'update' || type === 'delete' || type === 'merge' ? 'mutation' : 'other';
    }
    const into = root.into;
    if (into && typeof into === 'object' && (into as { position?: unknown }).position) return 'select-into';
    if (root.set_op) return 'set-op';
    return 'select';
}

/** Whether any top-level statement of a parse writes, read the way `SQLParser.HasWriteStatement` reads it. */
export function TopLevelHasWriteStatement(ast: unknown): boolean {
    if (!ast) return false;
    const statements: unknown[] = Array.isArray(ast) ? ast : [ast];
    return statements.some((statement) => {
        const type = statement && typeof statement === 'object' ? (statement as Record<string, unknown>).type : undefined;
        return typeof type === 'string' && TOP_LEVEL_WRITE_TYPES.has(type.toLowerCase());
    });
}
