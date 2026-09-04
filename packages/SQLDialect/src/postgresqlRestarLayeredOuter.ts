/**
 * Rebuild a PostgreSQL layered outer view so `g.*` re-expands against the
 * current inner view.
 *
 * PostgreSQL expands `SELECT *` / `g.*` at CREATE VIEW time and freezes the
 * column list. `CREATE OR REPLACE` of the inner view does not touch dependents,
 * so a wrapper written as `SELECT g.*, extras FROM inner g` silently stops
 * picking up new inner columns. `pg_get_viewdef` returns that *expanded* list,
 * not the original `g.*`.
 *
 * This rewrites the deparsed outer definition back to `SELECT <alias>.*, extras`
 * so CREATE VIEW re-expands against the live inner relation. Extra SELECT items
 * (computed columns, joins) are preserved. Inner columns newly added in the
 * *middle* of `g.*` are not in the old deparsed list; putting `g.*` back is
 * what makes them appear.
 *
 * The extras-are-trailing contract is the layered-view one: `g.*` then
 * application columns. We consume leading SELECT items that are simple
 * references to inner-view columns, and treat the rest as extras.
 */

export class LayeredOuterRestarError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LayeredOuterRestarError';
    }
}

export interface RestarLayeredOuterViewArgs {
    /** Body returned by `pg_get_viewdef(oid, true)` — a SELECT, not CREATE VIEW. */
    viewDefinition: string;
    /** Unquoted inner view name, e.g. `vwOrganizationsGenerated`. */
    innerViewName: string;
    /** Inner view column names in ordinal order (unquoted). */
    innerColumns: string[];
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;

export function restarLayeredOuterView(args: RestarLayeredOuterViewArgs): string {
    const innerCols = new Set(args.innerColumns.map((c) => c));
    if (innerCols.size === 0) {
        throw new LayeredOuterRestarError('innerColumns is empty; cannot restar a layered outer view');
    }

    let def = args.viewDefinition.trim();
    if (def.endsWith(';')) {
        def = def.slice(0, -1).trim();
    }
    if (!/^select\b/i.test(def)) {
        throw new LayeredOuterRestarError(`outer view definition does not start with SELECT: ${def.slice(0, 80)}`);
    }

    const fromPos = findTopLevelKeyword(def, 'from');
    if (fromPos < 0) {
        throw new LayeredOuterRestarError('outer view definition has no top-level FROM');
    }

    const selectList = def.slice('select'.length, fromPos).trim();
    const fromAndRest = def.slice(fromPos).trim();
    const alias = detectInnerAlias(fromAndRest, args.innerViewName) ?? 'g';

    const items = splitTopLevelCommaList(selectList);
    if (items.length === 0) {
        throw new LayeredOuterRestarError('outer view SELECT list is empty');
    }

    if (isStarOfAlias(items[0], alias) || isBareStar(items[0])) {
        const extras = items.slice(1);
        return rebuildSelect(alias, extras, fromAndRest);
    }

    let consumed = 0;
    for (const item of items) {
        if (isSimpleInnerColumnRef(item, alias, innerCols)) {
            consumed++;
        } else {
            break;
        }
    }
    if (consumed === 0) {
        throw new LayeredOuterRestarError(
            `outer view SELECT list does not start with inner columns of ${args.innerViewName} (first item: ${items[0].slice(0, 80)})`,
        );
    }

    return rebuildSelect(alias, items.slice(consumed), fromAndRest);
}

export function buildCreateOrReplaceLayeredOuterViewSQL(
    schema: string,
    outerView: string,
    restarredSelect: string,
): string {
    return `CREATE OR REPLACE VIEW ${quoteQualified(schema, outerView)}\nAS\n${restarredSelect}`;
}

function rebuildSelect(alias: string, extras: string[], fromAndRest: string): string {
    const star = `SELECT ${quoteIdent(alias)}.*`;
    if (extras.length === 0) {
        return `${star}\n${fromAndRest}`;
    }
    const extraList = extras.map((e) => e.trim()).join(',\n    ');
    return `${star},\n    ${extraList}\n${fromAndRest}`;
}

function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

function quoteQualified(schema: string, name: string): string {
    return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

/**
 * Index of a top-level SQL keyword (FROM, etc.) in `sql`, ignoring matches
 * inside parentheses or quoted identifiers/strings.
 */
export function findTopLevelKeyword(sql: string, keyword: string): number {
    const target = keyword.toLowerCase();
    let depth = 0;
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        if (ch === "'" || ch === '"') {
            i = skipQuoted(sql, i, ch);
            continue;
        }
        if (ch === '(') {
            depth++;
            i++;
            continue;
        }
        if (ch === ')') {
            depth--;
            i++;
            continue;
        }
        if (
            depth === 0 &&
            isKeywordStart(sql, i) &&
            sql.slice(i, i + target.length).toLowerCase() === target &&
            isKeywordEnd(sql, i + target.length)
        ) {
            return i;
        }
        i++;
    }
    return -1;
}

export function splitTopLevelCommaList(list: string): string[] {
    const items: string[] = [];
    let depth = 0;
    let start = 0;
    let i = 0;
    while (i < list.length) {
        const ch = list[i];
        if (ch === "'" || ch === '"') {
            i = skipQuoted(list, i, ch);
            continue;
        }
        if (ch === '(') {
            depth++;
            i++;
            continue;
        }
        if (ch === ')') {
            depth--;
            i++;
            continue;
        }
        if (ch === ',' && depth === 0) {
            items.push(list.slice(start, i).trim());
            start = i + 1;
        }
        i++;
    }
    const last = list.slice(start).trim();
    if (last) {
        items.push(last);
    }
    return items;
}

function skipQuoted(sql: string, start: number, quote: string): number {
    let i = start + 1;
    while (i < sql.length) {
        if (sql[i] === quote) {
            if (sql[i + 1] === quote) {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i++;
    }
    return sql.length;
}

function isKeywordStart(sql: string, index: number): boolean {
    if (index === 0) {
        return true;
    }
    return !/[A-Za-z0-9_$]/.test(sql[index - 1]);
}

function isKeywordEnd(sql: string, index: number): boolean {
    if (index >= sql.length) {
        return true;
    }
    return !/[A-Za-z0-9_$]/.test(sql[index]);
}

function detectInnerAlias(fromAndRest: string, innerViewName: string): string | null {
    const fromMatch = fromAndRest.match(new RegExp(String.raw`^from\s+(${IDENT}(?:\.${IDENT})?)(?:\s+as)?\s+(${IDENT})\b`, 'i'));
    if (!fromMatch) {
        return null;
    }
    const relation = unquoteIdent(fromMatch[1].includes('.') ? fromMatch[1].slice(fromMatch[1].lastIndexOf('.') + 1) : fromMatch[1]);
    if (relation !== innerViewName) {
        return null;
    }
    return unquoteIdent(fromMatch[2]);
}

function unquoteIdent(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
}

function isBareStar(item: string): boolean {
    return item.trim() === '*';
}

function isStarOfAlias(item: string, alias: string): boolean {
    const t = item.trim();
    const aliasQ = quoteIdent(alias);
    return new RegExp(String.raw`^(?:${escapeRegExp(aliasQ)}|${escapeRegExp(alias)})\.\*$`, 'i').test(t);
}

function isSimpleInnerColumnRef(item: string, alias: string, innerCols: Set<string>): boolean {
    let t = item.trim();
    t = t.replace(/\s*::[\w\s."()]+$/i, '').trim();
    t = stripWrappingParens(t);

    const asMatch = t.match(new RegExp(String.raw`^(.*)\s+as\s+(${IDENT})$`, 'i'));
    let asName: string | null = null;
    if (asMatch) {
        t = asMatch[1].trim();
        asName = unquoteIdent(asMatch[2]);
    }

    const colMatch = t.match(new RegExp(String.raw`^(?:(${IDENT})\.)?(${IDENT})$`));
    if (!colMatch) {
        return false;
    }
    if (colMatch[1] && unquoteIdent(colMatch[1]) !== alias) {
        return false;
    }
    const col = unquoteIdent(colMatch[2]);
    if (asName && asName !== col) {
        return false;
    }
    return innerCols.has(col);
}

function stripWrappingParens(s: string): string {
    let t = s;
    while (t.startsWith('(') && t.endsWith(')')) {
        let depth = 0;
        let wraps = true;
        for (let i = 0; i < t.length; i++) {
            if (t[i] === '(') depth++;
            else if (t[i] === ')') depth--;
            if (depth === 0 && i < t.length - 1) {
                wraps = false;
                break;
            }
        }
        if (!wraps) {
            break;
        }
        t = t.slice(1, -1).trim();
    }
    return t;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
