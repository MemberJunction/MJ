/**
 * Run-wide registry of boolean (T-SQL `BIT`) columns for the legacy rule pipeline (#5016).
 *
 * The rules learn a column is boolean from `ConversionContext.TableColumns`, which used to hold only
 * MJ's core metadata columns and the `CREATE TABLE`s of the file being converted. A view in a later
 * migration that compares a boolean column of a table created by an EARLIER migration kept `= 1`, and
 * PostgreSQL rejects `boolean = integer` when the view is created. `mj migrate convert` now carries
 * one registry across the run: seeded from the latest baseline, and extended with each converted
 * file's columns.
 *
 * Keys are lower-cased table name → (lower-cased column name → PostgreSQL type), the shape
 * `TableColumns` uses.
 */
import { StripComments } from './ExpressionHelpers.js';

export type TableColumnRegistry = Map<string, Map<string, string>>;

/** The bare, lower-cased table name of a T-SQL object reference (`[sch].[Tbl]`, `sch.Tbl`, `"Tbl"`). */
function bareTableName(ref: string): string {
  const last = ref.trim().split('.').pop() ?? '';
  return last.replace(/^[\["]|[\]"]$/g, '').toLowerCase();
}

/** Splits `text` at commas outside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Index of the parenthesis that closes the one at `open`, or -1. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** A column definition whose type is BIT: `[Col] [bit]`, `Col BIT NOT NULL`, … */
const BIT_COLUMN_DEFINITION = /^\s*(?:ADD\s+)?[\["]?(\w+)[\]"]?\s+[\["]?BIT[\]"]?(?![\w])/i;

function addColumn(into: TableColumnRegistry, table: string, column: string): void {
  if (!table || !column) return;
  let cols = into.get(table);
  if (!cols) {
    cols = new Map<string, string>();
    into.set(table, cols);
  }
  cols.set(column.toLowerCase(), 'BOOLEAN');
}

/**
 * Collects the BIT columns a T-SQL script declares — `CREATE TABLE` columns and `ALTER TABLE … ADD`
 * columns — into `into` (created when omitted) and returns it.
 */
export function CollectTSQLBitColumns(sql: string, into: TableColumnRegistry = new Map()): TableColumnRegistry {
  const text = StripComments(sql);
  const createTable = /\bCREATE\s+TABLE\s+([^\s(]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = createTable.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(text, open);
    if (close < 0) continue;
    const table = bareTableName(m[1]);
    for (const item of splitTopLevel(text.slice(open + 1, close))) {
      const col = item.match(BIT_COLUMN_DEFINITION);
      if (col) addColumn(into, table, col[1]);
    }
  }
  const alterAdd = /\bALTER\s+TABLE\s+(\S+)\s+ADD\s+(?!CONSTRAINT\b)([^;]*?)(?=;|\bGO\b|\bALTER\s+TABLE\b|\bCREATE\b|\bEXEC\b|$)/gi;
  while ((m = alterAdd.exec(text)) !== null) {
    const table = bareTableName(m[1]);
    for (const item of splitTopLevel(m[2])) {
      const col = item.match(BIT_COLUMN_DEFINITION);
      if (col) addColumn(into, table, col[1]);
    }
  }
  return into;
}

/** Copies every column of `from` into `into`; an existing entry for a column is replaced. */
export function MergeTableColumns(into: TableColumnRegistry, from: TableColumnRegistry): void {
  for (const [table, cols] of from) {
    let target = into.get(table);
    if (!target) {
      target = new Map<string, string>();
      into.set(table, target);
    }
    for (const [col, type] of cols) target.set(col, type);
  }
}
