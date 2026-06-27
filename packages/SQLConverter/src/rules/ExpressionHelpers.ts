/**
 * Expression-level conversion helpers shared across multiple rules.
 * Ported from Python functions: convert_identifiers, convert_date_functions,
 * convert_charindex, convert_stuff, convert_string_concat, convert_iif,
 * convert_top_to_limit, etc.
 */
import { resolveInlineType } from './TypeResolver.js';

/**
 * Split SQL into segments of code, string literals, and comments.
 * String literals (single-quoted, with '' escaping) and comments (-- and block)
 * are returned as separate segments so transformations can skip them.
 */
function segmentSQL(sql: string): Array<{ text: string; type: 'code' | 'string' | 'comment' }> {
  const segments: Array<{ text: string; type: 'code' | 'string' | 'comment' }> = [];
  let current = '';
  let inString = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    if (inBlockComment) {
      current += sql[i];
      if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
        current += '/';
        i++;
        segments.push({ text: current, type: 'comment' });
        current = '';
        inBlockComment = false;
      }
      continue;
    }

    if (inString) {
      current += sql[i];
      if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
        current += "'";
        i++;
      } else if (sql[i] === "'") {
        segments.push({ text: current, type: 'string' });
        current = '';
        inString = false;
      }
      continue;
    }

    if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      segments.push({ text: current, type: 'code' });
      const lineEnd = sql.indexOf('\n', i);
      if (lineEnd === -1) {
        segments.push({ text: sql.slice(i), type: 'comment' });
        current = '';
        i = sql.length - 1;
      } else {
        segments.push({ text: sql.slice(i, lineEnd), type: 'comment' });
        current = '\n';
        i = lineEnd;
      }
      continue;
    }

    if (sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
      segments.push({ text: current, type: 'code' });
      current = '/*';
      i++;
      inBlockComment = true;
      continue;
    }

    if (sql[i] === "'") {
      segments.push({ text: current, type: 'code' });
      current = "'";
      inString = true;
      continue;
    }

    current += sql[i];
  }
  if (current) segments.push({ text: current, type: inString ? 'string' : inBlockComment ? 'comment' : 'code' });
  return segments;
}

/**
 * Apply a transformation function only to SQL code segments,
 * preserving string literals and comments unchanged.
 */
export function transformCodeOnly(sql: string, transform: (code: string) => string): string {
  return segmentSQL(sql).map(seg => {
    if (seg.type !== 'code') return seg.text;
    return transform(seg.text);
  }).join('');
}

/**
 * Emit a DO-block that drops every overload of a function in a given schema.
 *
 * PG dispatches functions by `(name, ordered-arg-type-list)`. `CREATE OR
 * REPLACE FUNCTION` only replaces the body when the new signature exactly
 * matches the prior signature; adding (or renaming, or retyping) any
 * parameter creates a NEW overload alongside the old one. The result —
 * silent duplicate overloads that pile up across migrations until a caller
 * hits "function ... is not unique" at runtime.
 *
 * Emit this block immediately before any `CREATE OR REPLACE FUNCTION` in
 * generated migrations so the next CREATE always either replaces (matching
 * sig) or creates fresh (no prior overload). The block is idempotent — when
 * no overload exists the FOR loop iterates zero times.
 *
 * Used by ProcedureToFunctionRule and FunctionRule. Keeps the wording
 * identical across both so reviewers reading converter output recognize
 * the pattern at a glance.
 */
export function emitDropOverloadsBlock(funcName: string, schema: string = '__mj'): string {
  return (
    `DO $$ DECLARE r record;\n` +
    `BEGIN\n` +
    `  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc\n` +
    `           WHERE proname = '${funcName}'\n` +
    `             AND pronamespace = '${schema}'::regnamespace\n` +
    `  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';\n` +
    `  END LOOP;\n` +
    `END $$;\n`
  );
}

/** Convert [schema].[name] bracket identifiers to schema."name" double-quote format.
 *  Also converts T-SQL temp table #name references to PostgreSQL equivalents.
 *  Skips content inside SQL string literals and comments. */
export function convertIdentifiers(sql: string): string {
  return transformCodeOnly(sql, (code) => {
    // Temp table: CREATE TABLE #name → CREATE TEMP TABLE "name"
    code = code.replace(/\bCREATE\s+TABLE\s+#(\w+)/gi, 'CREATE TEMP TABLE "$1"');
    // Strip # from remaining temp object references: #name → "name"
    code = code.replace(/(?<!["\w])#(\w+)/g, '"$1"');
    // Replace [Schema].[Name] with Schema."Name" (any schema, not just __mj)
    code = code.replace(/\[(\w+)\]\.\[([^\]]+)\]/g, '$1."$2"');
    // Replace remaining [Name] with "Name"
    code = code.replace(/\[([^\]]+)\]/g, '"$1"');
    return code;
  });
}

/**
 * Convert DATEADD(unit, num, date) → (date + num * INTERVAL '1 unit')
 * Convert DATEDIFF(unit, start, end) → EXTRACT/age patterns
 * Convert DATEPART(unit, date) → EXTRACT(field FROM date)
 */
export function convertDateFunctions(sql: string): string {
  sql = convertDateAdd(sql);
  sql = convertDateDiff(sql);
  sql = convertDatePart(sql);
  sql = convertSimpleDateFunctions(sql);
  return sql;
}

/**
 * Convert T-SQL shorthand date functions to PostgreSQL EXTRACT.
 * YEAR(expr) → EXTRACT(YEAR FROM expr)
 * MONTH(expr) → EXTRACT(MONTH FROM expr)
 * DAY(expr) → EXTRACT(DAY FROM expr)
 */
function convertSimpleDateFunctions(sql: string): string {
  return sql.replace(
    /\b(YEAR|MONTH|DAY)\s*\(([^)]+)\)/gi,
    (_match, func: string, expr: string) => {
      return `EXTRACT(${func.toUpperCase()} FROM ${expr.trim()})`;
    }
  );
}

/** DATEADD unit → PG interval unit mapping */
const DATEADD_UNIT_MAP: Record<string, string> = {
  'year': 'year', 'yy': 'year', 'yyyy': 'year',
  'quarter': 'month', 'qq': 'month', 'q': 'month', // multiply by 3
  'month': 'month', 'mm': 'month', 'm': 'month',
  'day': 'day', 'dd': 'day', 'd': 'day',
  'week': 'week', 'wk': 'week', 'ww': 'week',
  'hour': 'hour', 'hh': 'hour',
  'minute': 'minute', 'mi': 'minute', 'n': 'minute',
  'second': 'second', 'ss': 'second', 's': 'second',
  'millisecond': 'milliseconds', 'ms': 'milliseconds',
};

const QUARTER_UNITS = new Set(['quarter', 'qq', 'q']);

function convertDateAdd(sql: string): string {
  return sql.replace(
    /\bDATEADD\s*\(\s*(\w+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)/gi,
    (_match, unit: string, num: string, dateExpr: string) => {
      const unitLower = unit.toLowerCase();
      const pgUnit = DATEADD_UNIT_MAP[unitLower] ?? 'day';
      const numTrimmed = num.trim();
      const dateTrimmed = dateExpr.trim();

      if (QUARTER_UNITS.has(unitLower)) {
        return `(${dateTrimmed} + (${numTrimmed} * 3) * INTERVAL '1 month')`;
      }
      return `(${dateTrimmed} + ${numTrimmed} * INTERVAL '1 ${pgUnit}')`;
    }
  );
}

/** DATEPART unit → EXTRACT field mapping */
const DATEPART_UNIT_MAP: Record<string, string> = {
  'year': 'YEAR', 'yy': 'YEAR', 'yyyy': 'YEAR',
  'quarter': 'QUARTER', 'qq': 'QUARTER', 'q': 'QUARTER',
  'month': 'MONTH', 'mm': 'MONTH', 'm': 'MONTH',
  'day': 'DAY', 'dd': 'DAY', 'd': 'DAY',
  'dayofyear': 'DOY', 'dy': 'DOY', 'y': 'DOY',
  'week': 'WEEK', 'wk': 'WEEK', 'ww': 'WEEK',
  'weekday': 'DOW', 'dw': 'DOW',
  'hour': 'HOUR', 'hh': 'HOUR',
  'minute': 'MINUTE', 'mi': 'MINUTE', 'n': 'MINUTE',
  'second': 'SECOND', 'ss': 'SECOND', 's': 'SECOND',
};

/**
 * Parse a balanced-paren argument list starting at the open-paren position.
 * Returns an array of trimmed argument strings, handling nested parentheses.
 */
function parseBalancedArgs(sql: string, openIdx: number): { args: string[]; endIdx: number } | null {
  if (sql[openIdx] !== '(') return null;
  const args: string[] = [];
  let depth = 1;
  let current = '';
  let i = openIdx + 1;
  while (i < sql.length && depth > 0) {
    const ch = sql[i];
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; if (depth > 0) current += ch; }
    else if (ch === ',' && depth === 1) { args.push(current.trim()); current = ''; }
    else { current += ch; }
    i++;
  }
  if (depth !== 0) return null;
  args.push(current.trim());
  return { args, endIdx: i };
}

function isTimeExpression(expr: string): boolean {
  const upper = expr.toUpperCase().trim();
  return /\bAS\s+TIME\s*\)/i.test(upper) || /::TIME\b/i.test(upper);
}

function buildDateDiffExpr(e: string, s: string, extractExpr: string, useTimestamp: boolean): string {
  if (useTimestamp) {
    return extractExpr
      .replace(/\$E/g, `${e}::TIMESTAMPTZ`)
      .replace(/\$S/g, `${s}::TIMESTAMPTZ`);
  }
  // TIME expressions: subtract directly without TIMESTAMPTZ cast
  return extractExpr
    .replace(/\$E/g, e)
    .replace(/\$S/g, s);
}

function convertDateDiff(sql: string): string {
  const pattern = /\bDATEDIFF\s*\(/gi;
  let result = '';
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const openIdx = match.index + match[0].length - 1; // position of '('
    const parsed = parseBalancedArgs(sql, openIdx);
    if (!parsed || parsed.args.length !== 3) {
      result += sql.slice(lastIdx, match.index + match[0].length);
      lastIdx = match.index + match[0].length;
      continue;
    }
    const [unit, startExpr, endExpr] = parsed.args;
    const unitLower = unit.toLowerCase();
    const s = startExpr;
    const e = endExpr;
    // Detect TIME-typed expressions to avoid invalid ::TIMESTAMPTZ casts
    const useTimestamp = !isTimeExpression(s) && !isTimeExpression(e);
    let replacement: string;
    switch (unitLower) {
      case 'day': case 'dd': case 'd':
        replacement = buildDateDiffExpr(e, s, `EXTRACT(DAY FROM ($E - $S))`, useTimestamp); break;
      case 'hour': case 'hh':
        replacement = buildDateDiffExpr(e, s, `EXTRACT(EPOCH FROM ($E - $S)) / 3600`, useTimestamp); break;
      case 'minute': case 'mi': case 'n':
        replacement = buildDateDiffExpr(e, s, `EXTRACT(EPOCH FROM ($E - $S)) / 60`, useTimestamp); break;
      case 'second': case 'ss': case 's':
        replacement = buildDateDiffExpr(e, s, `EXTRACT(EPOCH FROM ($E - $S))`, useTimestamp); break;
      case 'year': case 'yy': case 'yyyy':
        replacement = buildDateDiffExpr(e, s, `EXTRACT(YEAR FROM AGE($E, $S))`, useTimestamp); break;
      case 'month': case 'mm': case 'm':
        replacement = buildDateDiffExpr(e, s, `(EXTRACT(YEAR FROM AGE($E, $S)) * 12 + EXTRACT(MONTH FROM AGE($E, $S)))`, useTimestamp); break;
      default:
        replacement = buildDateDiffExpr(e, s, `EXTRACT(DAY FROM ($E - $S))`, useTimestamp); break;
    }
    result += sql.slice(lastIdx, match.index) + replacement;
    lastIdx = parsed.endIdx;
    pattern.lastIndex = lastIdx;
  }
  result += sql.slice(lastIdx);
  return result;
}

function convertDatePart(sql: string): string {
  return sql.replace(
    /\bDATEPART\s*\(\s*(\w+)\s*,\s*([^)]+)\)/gi,
    (_match, unit: string, dateExpr: string) => {
      const field = DATEPART_UNIT_MAP[unit.toLowerCase()] ?? 'DAY';
      return `EXTRACT(${field} FROM ${dateExpr.trim()})`;
    }
  );
}

/**
 * Convert CHARINDEX(substr, str[, start]) → POSITION(substr IN str)
 * 3-arg form: → (POSITION(substr IN SUBSTRING(str FROM start)) + start - 1)
 */
export function convertCharIndex(sql: string): string {
  return sql.replace(
    /\bCHARINDEX\s*\(\s*([^,]+)\s*,\s*([^,)]+)(?:\s*,\s*([^)]+))?\s*\)/gi,
    (_match, substr: string, str: string, start?: string) => {
      const subTrimmed = substr.trim();
      const strTrimmed = str.trim();
      if (start) {
        const startTrimmed = start.trim();
        return `(POSITION(${subTrimmed} IN SUBSTRING(${strTrimmed} FROM ${startTrimmed})) + ${startTrimmed} - 1)`;
      }
      return `POSITION(${subTrimmed} IN ${strTrimmed})`;
    }
  );
}

/**
 * Convert STUFF(string, start, length, replacement) →
 * OVERLAY(string PLACING replacement FROM start FOR length)
 */
export function convertStuff(sql: string): string {
  return sql.replace(
    /\bSTUFF\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    (_match, str: string, start: string, length: string, replacement: string) => {
      return `OVERLAY(${str.trim()} PLACING ${replacement.trim()} FROM ${start.trim()} FOR ${length.trim()})`;
    }
  );
}

/** PG type strings that represent textual/string data */
const PG_STRING_TYPES = new Set(['TEXT', 'VARCHAR', 'CHAR', 'UUID', 'XML']);

/**
 * Check if a PG type string (e.g., "VARCHAR(500)", "TEXT", "INTEGER") is a string type.
 */
function isStringType(pgType: string): boolean {
  const baseType = pgType.replace(/\(.*\)/, '').trim().toUpperCase();
  return PG_STRING_TYPES.has(baseType);
}

/**
 * Look up a quoted identifier like "ColName" or alias."ColName" in TableColumns
 * and return true if it resolves to a string type.
 */
function isStringColumn(
  ident: string,
  tableColumns: Map<string, Map<string, string>> | undefined
): boolean {
  if (!tableColumns || tableColumns.size === 0) return false;

  // Extract column name from patterns like: "Col", alias."Col", schema."Table"."Col"
  const colMatch = ident.match(/"(\w+)"(?:\s*$)/);
  if (!colMatch) return false;
  const colName = colMatch[1].toLowerCase();

  // Search all tables for this column name
  for (const [, cols] of tableColumns) {
    const colType = cols.get(colName);
    if (colType && isStringType(colType)) return true;
  }
  return false;
}

/**
 * Convert T-SQL string concatenation with + to PostgreSQL || operator.
 * Must not affect numeric + operations.
 * Uses SQL segmentation to avoid corrupting string literal content
 * (e.g. TypeScript code stored in database text columns).
 *
 * When tableColumns is provided (from ConversionContext.TableColumns),
 * uses column type information to disambiguate "ColA" + "ColB" —
 * converting to || only when at least one side is a known string type.
 */
export function convertStringConcat(
  sql: string,
  tableColumns?: Map<string, Map<string, string>>
): string {
  const segments = segmentSQL(sql);

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type !== 'code') continue;

    const code = segments[i].text;
    const prevIsString = i > 0 && segments[i - 1].type === 'string';
    const nextIsString = i + 1 < segments.length && segments[i + 1].type === 'string';

    let newCode = code;

    if (prevIsString && nextIsString) {
      // Between two string literals: 'a' + 'b' → replace all + with ||
      // But only when the code actually connects the strings with +.
      // Skip when strings are separated by commas (VALUES list), subqueries, etc.
      const startsWithPlus = /^\s*\+/.test(newCode);
      const endsWithPlus = /\+\s*$/.test(newCode);
      if (startsWithPlus || endsWithPlus) {
        newCode = newCode.replace(/\+/g, '||');
      }
    } else if (prevIsString) {
      // After a string literal: 'text' + expr
      // Replace leading + (but not when followed by pure numeric arithmetic)
      newCode = newCode.replace(/^(\s*)\+(\s*)(?![\d\s]*[+\-*/])/, '$1||$2');
      // 'text' + CAST → 'text' || CAST
      newCode = newCode.replace(/^(\s*)\+(\s*CAST\b)/i, '$1||$2');
    } else if (nextIsString) {
      // Before a string literal: expr + 'text'
      // Replace trailing + when preceded by ) or a quoted identifier
      newCode = newCode.replace(/(\))\s*\+(\s*)$/, '$1 ||$2');
      newCode = newCode.replace(/("(?:\w+)")\s*\+(\s*)$/, '$1 ||$2');
    }

    // Structural string-concat patterns: apply to ALL code segments (regardless of
    // adjacent strings). These are unambiguously string concat, not numeric addition.
    // ) + CAST(  — CAST typically produces string results for concatenation
    newCode = newCode.replace(/\)\s*\+\s*(CAST\s*\()/gi, ') || $1');

    // ) + function_call(  — when preceded by closing paren, likely string concat
    // Covers patterns like: COALESCE(...) + LTRIM(...), TRIM(...) + REPLACE(...)
    newCode = newCode.replace(/\)\s*\+\s*((?:COALESCE|LTRIM|RTRIM|TRIM|UPPER|LOWER|SUBSTRING|REPLACE|LEFT|RIGHT|REVERSE|CONCAT)\s*\()/gi, ') || $1');

    // ) + "QuotedCol" — when closing paren is followed by + and a quoted identifier
    newCode = newCode.replace(/\)\s*\+\s*(\w+\.")/g, ') || $1');

    // "QuotedCol" + func() or "QuotedCol" + COALESCE(
    newCode = newCode.replace(/("[\w]+")\s*\+\s*((?:COALESCE|LTRIM|RTRIM|TRIM|UPPER|LOWER|SUBSTRING|REPLACE|LEFT|RIGHT|REVERSE|CONCAT|CAST)\s*\()/gi, '$1 || $2');

    // Within code segments (no adjacent strings) — type-aware column checks
    if (!prevIsString && !nextIsString) {
      // ) + colname.qualified
      newCode = newCode.replace(/\)\s*\+\s*(\w+\.)/g, ') || $1');

      // Type-aware: "ColA" + "ColB" → "ColA" || "ColB" when either is a string column
      // Handles: "Col", "Table"."Col", alias."Col" (unquoted alias prefix)
      if (tableColumns && tableColumns.size > 0) {
        newCode = newCode.replace(
          /((?:\w+\.)?(?:"[\w]+"\.)?"[\w]+")\s*\+\s*((?:\w+\.)?(?:"[\w]+"\.)?"[\w]+")/g,
          (match, left: string, right: string) => {
            if (isStringColumn(left, tableColumns) || isStringColumn(right, tableColumns)) {
              return `${left} || ${right}`;
            }
            return match;
          }
        );
      }
    }

    segments[i].text = newCode;
  }

  return segments.map(s => s.text).join('');
}

/**
 * Convert IIF(condition, true_val, false_val) → CASE WHEN condition THEN true_val ELSE false_val END
 * Uses paren-aware argument splitting to handle nested function calls.
 */
export function convertIIF(sql: string): string {
  let iterations = 0;
  const maxIterations = 50;

  while (/\bIIF\s*\(/i.test(sql) && iterations < maxIterations) {
    const iifMatch = sql.match(/\bIIF\s*\(/i);
    if (!iifMatch || iifMatch.index === undefined) break;

    const startPos = iifMatch.index;
    const parenStart = sql.indexOf('(', startPos);
    if (parenStart < 0) break;

    const parenEnd = findMatchingParen(sql, parenStart);
    if (parenEnd < 0) break;

    const argsStr = sql.slice(parenStart + 1, parenEnd);
    const args = splitTopLevelCommas(argsStr);

    if (args.length >= 3) {
      const cond = args[0].trim();
      const trueVal = args[1].trim();
      const falseVal = args.slice(2).join(',').trim();

      const before = sql.slice(0, startPos);
      const after = sql.slice(parenEnd + 1);
      sql = `${before}CASE WHEN ${cond} THEN ${trueVal} ELSE ${falseVal} END${after}`;
    } else {
      break;
    }
    iterations++;
  }
  return sql;
}

/** Find the position of the matching closing parenthesis, respecting nesting and string literals */
function findMatchingParen(sql: string, openPos: number): number {
  let depth = 0;
  let inSingleQuote = false;

  for (let i = openPos; i < sql.length; i++) {
    const ch = sql[i];

    if (inSingleQuote) {
      if (ch === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
        i++; // Skip escaped quote
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split a string on commas at parenthesis depth 0, respecting string literals */
function splitTopLevelCommas(str: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && i + 1 < str.length && str[i + 1] === "'") {
        current += str[i + 1];
        i++;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  args.push(current);
  return args;
}

/**
 * Convert SELECT TOP N ... to SELECT ... LIMIT N.
 * Moves TOP N from after SELECT to LIMIT N at end of statement.
 * Skips matches inside string literals and comments.
 */
export function convertTopToLimit(sql: string): string {
  // Build protected ranges from string literals and comments
  const segments = segmentSQL(sql);
  const protectedRanges: Array<{ start: number; end: number }> = [];
  let pos = 0;
  for (const seg of segments) {
    if (seg.type !== 'code') {
      protectedRanges.push({ start: pos, end: pos + seg.text.length });
    }
    pos += seg.text.length;
  }

  // Find all SELECT TOP N patterns
  const topPattern = /\bSELECT\s+(DISTINCT\s+)?TOP\s+(\d+)\s/gi;
  let match: RegExpExecArray | null;
  const replacements: Array<{ start: number; end: number; selectPrefix: string; distinct: string; n: string }> = [];

  while ((match = topPattern.exec(sql)) !== null) {
    // Skip matches inside string literals or comments
    if (protectedRanges.some(r => match!.index >= r.start && match!.index < r.end)) continue;

    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      selectPrefix: 'SELECT ',
      distinct: match[1] ?? '',
      n: match[2],
    });
  }

  // Process in reverse to preserve positions
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    // Remove TOP N from SELECT clause
    const before = sql.slice(0, r.start);
    const after = sql.slice(r.end);

    // Find end of this SELECT statement (semicolon, closing paren at depth 0, or end)
    let depth = 0;
    let endPos = after.length;
    for (let j = 0; j < after.length; j++) {
      if (after[j] === '(') depth++;
      else if (after[j] === ')') {
        if (depth === 0) { endPos = j; break; }
        depth--;
      } else if (after[j] === ';' && depth === 0) { endPos = j; break; }
    }

    const selectBody = after.slice(0, endPos);
    const rest = after.slice(endPos);
    sql = `${before}${r.selectPrefix}${r.distinct}${selectBody}\nLIMIT ${r.n}${rest}`;
  }
  return sql;
}

/**
 * Convert common T-SQL CAST patterns to PostgreSQL types.
 * Used in views, procedures, and expressions.
 *
 * Note on quoted type names: when input T-SQL uses bracket-wrapped types
 * like `CAST(x AS [INT])`, the upstream `convertIdentifiers` pass turns
 * `[INT]` into `"INT"`. PG then parses `"INT"` as a quoted identifier
 * (column reference), not a type, and rejects with `type "INT" does not
 * exist`. We strip quotes from known T-SQL type names first so the
 * existing patterns below match.
 */
export function convertCastTypes(sql: string): string {
  // Strip quotes from quoted T-SQL type tokens produced by convertIdentifiers
  // when the source SQL had bracket-wrapped types (e.g. CAST(x AS [INT])).
  const quotedTypes = [
    'UNIQUEIDENTIFIER', 'NVARCHAR', 'VARCHAR', 'BIT',
    'DATETIMEOFFSET', 'DATETIME2', 'DATETIME', 'FLOAT',
    'TINYINT', 'IMAGE', 'MONEY', 'INT', 'INTEGER',
  ];
  for (const t of quotedTypes) {
    sql = sql.replace(new RegExp(`\\bAS\\s+"${t}"`, 'gi'), `AS ${t}`);
  }

  sql = sql.replace(/\bAS\s+UNIQUEIDENTIFIER\b/gi, 'AS UUID');
  sql = sql.replace(/\bAS\s+NVARCHAR\s*\(\s*MAX\s*\)/gi, 'AS TEXT');
  sql = sql.replace(/\bAS\s+NVARCHAR\s*\(\s*(\d+)\s*\)/gi, 'AS VARCHAR($1)');
  sql = sql.replace(/\bAS\s+NVARCHAR\b/gi, 'AS TEXT');
  sql = sql.replace(/\bAS\s+VARCHAR\s*\(\s*MAX\s*\)/gi, 'AS TEXT');
  sql = sql.replace(/\bAS\s+BIT\b/gi, 'AS BOOLEAN');
  sql = sql.replace(/\bAS\s+DATETIMEOFFSET(?:\s*\(\s*\d+\s*\))?\b/gi, 'AS TIMESTAMPTZ');
  sql = sql.replace(/\bAS\s+DATETIME2?(?:\s*\(\s*\d+\s*\))?\b/gi, 'AS TIMESTAMPTZ');
  sql = sql.replace(/\bAS\s+FLOAT(?:\s*\(\s*\d+\s*\))?\b/gi, 'AS DOUBLE PRECISION');
  sql = sql.replace(/\bAS\s+TINYINT\b/gi, 'AS SMALLINT');
  sql = sql.replace(/\bAS\s+IMAGE\b/gi, 'AS BYTEA');
  sql = sql.replace(/\bAS\s+MONEY\b/gi, 'AS NUMERIC(19,4)');
  sql = sql.replace(/\bAS\s+INT\b/gi, 'AS INTEGER');
  return sql;
}

/**
 * Convert T-SQL CONVERT(type, expr[, style]) → CAST(expr AS mapped_type).
 * Drops the optional style parameter.
 */
export function convertConvertFunction(sql: string): string {
  // 3-arg: CONVERT(type, expr, style)
  sql = sql.replace(
    /\bCONVERT\s*\(\s*(\w+(?:\s*\([^)]*\))?)\s*,\s*([^,)]+)\s*,\s*[^)]+\)/gi,
    (_match, type: string, expr: string) => {
      return `CAST(${expr.trim()} AS ${mapInlineType(type.trim())})`;
    }
  );
  // 2-arg: CONVERT(type, expr)
  sql = sql.replace(
    /\bCONVERT\s*\(\s*(\w+(?:\s*\([^)]*\))?)\s*,\s*([^)]+)\)/gi,
    (_match, type: string, expr: string) => {
      return `CAST(${expr.trim()} AS ${mapInlineType(type.trim())})`;
    }
  );
  return sql;
}

/**
 * Map a T-SQL type name to PostgreSQL for inline CAST/CONVERT usage.
 * Delegates to the centralized TypeResolver for consistent mapping.
 */
function mapInlineType(tsqlType: string): string {
  return resolveInlineType(tsqlType);
}

/**
 * Remove T-SQL's N' unicode-string prefix.
 *
 * Tricky case: the original pattern `(?<![a-zA-Z])N'` strips any N'
 * where N isn't preceded by a letter. That's correct for a leading
 * unicode prefix (`... = N'text' ...`) but WRONG for trailing N inside
 * a string ending with a digit, like `N'BD-3N'`:
 *   1st match: prefix  N' → '       →  `'BD-3N'`
 *   2nd match: string  N' → '       →  `'BD-3'`  (bug: stripped the trailing N!)
 * That bug silently corrupted ISO codes in v5.25 Metadata_Sync and
 * caused spCreateStateProvince to hit UQ_StateProvince_ISO3166_2.
 *
 * Fix: only strip N' in contexts where a string literal *starts* — i.e.
 * after a non-quote boundary character (whitespace, punctuation, paren,
 * operator, comma, equals, start of line). This leaves N' inside a
 * string alone.
 */
export function removeNPrefix(sql: string): string {
  // Anchors: start of string, or after one of the "string-start" context chars.
  // Whitespace, comma, paren, comparison operators, brackets, semicolon.
  return sql.replace(/(^|[\s(,=<>!+\-*\/[;])N'/g, "$1'");
}

/** Remove COLLATE clauses */
export function removeCollate(sql: string): string {
  return sql.replace(/\s+COLLATE\s+SQL_Latin1_General_CP1_CI_AS/gi, '')
    .replace(/\s+COLLATE\s+\S+/gi, '');
}

/** SQL keywords that should NOT be quoted by quotePascalCaseIdentifiers */
const PASCAL_QUOTE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IN', 'IS',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'ALTER', 'TABLE',
  'ADD', 'COLUMN', 'DEFAULT', 'CONSTRAINT', 'CHECK', 'PRIMARY', 'KEY',
  'FOREIGN', 'REFERENCES', 'UNIQUE', 'INDEX', 'ON', 'AS', 'BEGIN', 'END',
  'IF', 'THEN', 'ELSE', 'EXISTS', 'CREATE', 'DROP', 'TRUE', 'FALSE',
  'VARCHAR', 'TEXT', 'UUID', 'BOOLEAN', 'INTEGER', 'BIGINT', 'SMALLINT',
  'TIMESTAMPTZ', 'BYTEA', 'REAL', 'NUMERIC', 'DECIMAL', 'DOUBLE', 'PRECISION', 'XML',
  'JSON', 'JSONB',
  'CHAR', 'LIKE', 'SIMILAR', 'TO', 'WITH', 'NOCHECK', 'DEFERRABLE',
  'INITIALLY', 'DEFERRED', 'CASCADE', 'RESTRICT', 'VALID', 'GRANT',
  'EXECUTE', 'FUNCTION', 'PROCEDURE', 'VIEW', 'TRIGGER', 'SCHEMA',
  'DO', 'DECLARE', 'RETURN', 'RETURNS', 'LANGUAGE', 'PLPGSQL',
  'COMMENT', 'RAISE', 'NOTICE', 'EXCEPTION', 'PERFORM', 'NEW', 'OLD',
  'FOR', 'EACH', 'ROW', 'AFTER', 'BEFORE', 'INSTEAD', 'OF',
  'GENERATED', 'BY', 'IDENTITY', 'SERIAL', 'REPLACE', 'ACTION',
  'ASC', 'DESC', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'TOP',
  'INNER', 'LEFT', 'RIGHT', 'OUTER', 'JOIN', 'CROSS', 'FULL',
  'UNION', 'ALL', 'DISTINCT', 'BETWEEN', 'CASE', 'WHEN', 'COALESCE',
  'CAST', 'MAX', 'MIN', 'COUNT', 'SUM', 'AVG', 'NOW', 'CURRENT_USER',
  'INFORMATION_SCHEMA', 'NONCLUSTERED', 'CLUSTERED', 'NO',
  // SQL functions that should not be quoted
  'LENGTH', 'SUBSTRING', 'REPLACE', 'LTRIM', 'RTRIM', 'TRIM', 'UPPER', 'LOWER',
  'POSITION', 'OVERLAY', 'EXTRACT', 'FLOOR', 'CEIL', 'ROUND', 'ABS',
  'CONVERT', 'CHARINDEX', 'STUFF', 'PATINDEX', 'REVERSE',
  'ROW_NUMBER', 'RANK', 'OVER', 'PARTITION',
]);

/**
 * Quote bare PascalCase identifiers in SQL while preserving string literals
 * and block comments. Splits SQL into segments: code / string / comment,
 * and only quotes identifiers in code segments.
 * Used by InsertRule to quote column names in INSERT/UPDATE/DELETE statements.
 */
export function quotePascalCaseIdentifiers(sql: string): string {
  return transformCodeOnly(sql, (code) => {
    return code.replace(/(?<!")(?<!\w)([A-Z]\w*)(?!")(?!\w)/g, (match, word: string) => {
      if (PASCAL_QUOTE_KEYWORDS.has(word.toUpperCase())) return match;
      return `"${word}"`;
    });
  });
}

/** Common function replacements */
export function convertCommonFunctions(sql: string): string {
  sql = sql.replace(/\bISNULL\s*\(/gi, 'COALESCE(');
  sql = sql.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/\bSYSDATETIMEOFFSET\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/\bSYSUTCDATETIME\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/\bNEWID\s*\(\s*\)/gi, 'gen_random_uuid()');
  sql = sql.replace(/\bNEWSEQUENTIALID\s*\(\s*\)/gi, 'gen_random_uuid()');
  sql = sql.replace(/\bLEN\s*\(/gi, 'LENGTH(');
  sql = sql.replace(/\bSCOPE_IDENTITY\s*\(\s*\)/gi, 'lastval()');
  sql = sql.replace(/\bSUSER_SNAME\s*\(\s*\)/gi, 'current_user');
  sql = sql.replace(/\bSUSER_NAME\s*\(\s*\)/gi, 'current_user');
  sql = sql.replace(/\bUSER_NAME\s*\(\s*\)/gi, 'current_user');
  return sql;
}

/**
 * Convert SQL Server BIT comparisons (`"Col" = 1` / `= 0`) to PostgreSQL boolean
 * literals (`"Col" = TRUE` / `= FALSE`) for columns known to be BOOLEAN.
 *
 * PG has no implicit boolean↔integer cast, so `bool_col = 1` raises
 * "operator does not exist: boolean = integer" — and for VIEWs that error fires
 * at CREATE time, blocking the migration.
 *
 * Boolean columns are identified by name from the accumulated CREATE TABLE type
 * map. A name is treated as boolean only if it is BOOLEAN in at least one table
 * AND never a non-boolean type in any other table, so an integer column that
 * merely shares a name with a boolean column elsewhere is left untouched.
 */
export function collectBooleanColumnNames(
  tableColumns: Map<string, Map<string, string>>,
): Set<string> {
  const boolNames = new Set<string>();
  const nonBoolNames = new Set<string>();
  for (const cols of tableColumns.values()) {
    for (const [name, type] of cols) {
      const lower = name.toLowerCase();
      if (type.toUpperCase() === 'BOOLEAN') boolNames.add(lower);
      else nonBoolNames.add(lower);
    }
  }
  for (const n of nonBoolNames) boolNames.delete(n);
  return boolNames;
}

export function convertBooleanLiteralComparisons(
  sql: string,
  tableColumns: Map<string, Map<string, string>>,
): string {
  const boolNames = collectBooleanColumnNames(tableColumns);
  if (boolNames.size === 0) return sql;

  // `(?![\w.])` guards against matching inside a larger number/identifier
  // (e.g. `= 10`, `= 1.5`).
  return sql.replace(
    /"(\w+)"\s*(=|<>|!=)\s*([01])(?![\w.])/g,
    (match, col: string, op: string, val: string) =>
      boolNames.has(col.toLowerCase())
        ? `"${col}" ${op} ${val === '1' ? 'TRUE' : 'FALSE'}`
        : match,
  );
}

/**
 * Find the index just past the matching close paren for the `(` at `openPos`.
 * String-literal aware (single quotes, with '' escapes). Returns -1 if unbalanced.
 */
function matchParen(text: string, openPos: number): number {
  let depth = 0, inStr = false;
  for (let i = openPos; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "'") { if (text[i + 1] === "'") i++; else inStr = false; }
    } else if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Split a paren-body string on top-level commas, respecting quotes and nested parens. */
function splitArgs(body: string): string[] {
  const out: string[] = [];
  let cur = '', depth = 0, inStr = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) { cur += c; if (c === "'") { if (body[i + 1] === "'") cur += body[++i]; else inStr = false; } }
    else if (c === "'") { inStr = true; cur += c; }
    else if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

/**
 * Convert SQL Server JSON functions to PostgreSQL equivalents:
 *   JSON_VALUE(expr, '$.a.b')  →  (expr)::jsonb #>> '{a,b}'   (->> for a single segment)
 *   ISJSON(expr) = 1           →  (expr) IS JSON
 *   ISJSON(expr) = 0           →  (expr) IS NOT JSON
 *   ISJSON(expr)               →  (expr) IS JSON
 * Accepts both bare (`JSON_VALUE(...)`) and already-quoted (`"JSON_VALUE"(...)`) forms,
 * so it is order-independent relative to identifier quoting. PG 16+ provides the IS JSON
 * predicate; JSON_VALUE's `$.`-rooted path is rewritten to jsonb path-extraction operators.
 */
export function convertJsonFunctions(sql: string): string {
  sql = convertNamedJsonCall(sql, 'JSON_VALUE', (args, after) => {
    if (args.length < 2) return null;
    const expr = args[0];
    const pathLit = args[1].trim();
    const pm = pathLit.match(/^'(.*)'$/s);
    if (!pm) return null;
    // Strip leading '$.' / '$' and split into segments.
    const segs = pm[1].replace(/^\$\.?/, '').split('.').filter(s => s.length > 0);
    if (segs.length === 0) return null;
    const replacement = segs.length === 1
      ? `(${expr})::jsonb ->> '${segs[0]}'`
      : `(${expr})::jsonb #>> '{${segs.join(',')}}'`;
    return { replacement, consume: 0, after };
  });

  sql = convertNamedJsonCall(sql, 'ISJSON', (args, after) => {
    if (args.length < 1) return null;
    const expr = args[0];
    // Look for a trailing `= 1` / `= 0` comparison to fold into IS [NOT] JSON.
    const cmp = after.match(/^\s*=\s*([01])(?![\w.])/);
    if (cmp) {
      const isNot = cmp[1] === '0' ? ' NOT' : '';
      return { replacement: `(${expr}) IS${isNot} JSON`, consume: cmp[0].length, after };
    }
    return { replacement: `(${expr}) IS JSON`, consume: 0, after };
  });

  return sql;
}

/**
 * Locate every call to `name(` (bare or double-quoted), extract its balanced
 * argument list, and let `build` produce the replacement text plus how many
 * characters of the trailing context to also consume (for folding `= 1` etc.).
 */
function convertNamedJsonCall(
  sql: string,
  name: string,
  build: (args: string[], after: string) => { replacement: string; consume: number; after: string } | null,
): string {
  const callRe = new RegExp(`"?${name}"?\\s*\\(`, 'gi');
  let result = sql;
  let searchFrom = 0;
  while (true) {
    callRe.lastIndex = searchFrom;
    const m = callRe.exec(result);
    if (!m) break;
    const openParen = result.indexOf('(', m.index);
    const close = matchParen(result, openParen);
    if (close < 0) { searchFrom = m.index + m[0].length; continue; }
    const args = splitArgs(result.slice(openParen + 1, close - 1));
    const built = build(args, result.slice(close));
    if (!built) { searchFrom = close; continue; }
    result = result.slice(0, m.index) + built.replacement + result.slice(close + built.consume);
    searchFrom = m.index + built.replacement.length;
  }
  return result;
}

/**
 * Cast SQL Server BIT literals (0/1) to PG boolean (FALSE/TRUE) in `INSERT INTO
 * table (...) VALUES (...)` for columns known to be BOOLEAN. PG has no implicit
 * integer→boolean cast, so a literal `0`/`1` for a boolean column fails at apply
 * time. Column types come from the accumulated CREATE TABLE map (plus the seeded
 * core-metadata catalog); tuple values are tokenized string-aware so commas inside
 * quoted JSON/text never split a value. Handles multi-row VALUES and INSERTs that
 * appear inside a wrapping DO/IF block (only the INSERT...VALUES segment is rewritten).
 */
export function castBooleanInsertValues(
  sql: string,
  tableColumns: Map<string, Map<string, string>>,
): string {
  const m = sql.match(/INSERT\s+INTO\s+(?:\w+\.)?"?(\w+)"?\s*\(([^)]*)\)\s*VALUES/i);
  if (!m) return sql;
  const cols = tableColumns.get(m[1].toLowerCase());
  if (!cols) return sql;

  const colNames = m[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const boolPos = new Set<number>();
  colNames.forEach((c, i) => {
    if ((cols.get(c.toLowerCase()) ?? '').toUpperCase() === 'BOOLEAN') boolPos.add(i);
  });
  if (boolPos.size === 0) return sql;

  const headEnd = m.index! + m[0].length;
  return sql.slice(0, headEnd) + rewriteValuesTuples(sql.slice(headEnd), boolPos);
}

/** Walk the post-VALUES text, rewriting boolean-position literals in each top-level tuple. */
function rewriteValuesTuples(text: string, boolPos: Set<number>): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '(') { out += text[i++]; continue; }
    // Capture a balanced, string-aware tuple starting at i.
    let depth = 0, inStr = false, j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (c === "'") { if (text[j + 1] === "'") j++; else inStr = false; }
      } else if (c === "'") inStr = true;
      else if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { j++; break; } }
    }
    out += rewriteTuple(text.slice(i, j), boolPos);
    i = j;
  }
  return out;
}

/** Rewrite `0`/`1` → `FALSE`/`TRUE` at boolean positions within one `(...)` tuple. */
function rewriteTuple(tuple: string, boolPos: Set<number>): string {
  const vals = splitTopLevelValues(tuple.slice(1, -1));
  for (let k = 0; k < vals.length; k++) {
    if (!boolPos.has(k)) continue;
    vals[k] = vals[k].replace(/^(\s*)0(\s*)$/, '$1FALSE$2').replace(/^(\s*)1(\s*)$/, '$1TRUE$2');
  }
  return '(' + vals.join(',') + ')';
}

/** Split a tuple body on top-level commas, respecting single-quoted strings and nested parens. */
function splitTopLevelValues(s: string): string[] {
  const out: string[] = [];
  let cur = '', depth = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === "'") { if (s[i + 1] === "'") cur += s[++i]; else inStr = false; }
    } else if (c === "'") { inStr = true; cur += c; }
    else if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur.length) out.push(cur);
  return out;
}
