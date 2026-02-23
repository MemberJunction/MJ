/**
 * Expression-level conversion helpers shared across multiple rules.
 * Ported from Python functions: convert_identifiers, convert_date_functions,
 * convert_charindex, convert_stuff, convert_string_concat, convert_iif,
 * convert_top_to_limit, etc.
 */

/** Convert [schema].[name] bracket identifiers to schema."name" double-quote format */
export function convertIdentifiers(sql: string): string {
  // Replace [Schema].[Name] with Schema."Name" (any schema, not just __mj)
  sql = sql.replace(/\[(\w+)\]\.\[([^\]]+)\]/g, '$1."$2"');
  // Replace remaining [Name] with "Name"
  sql = sql.replace(/\[([^\]]+)\]/g, '"$1"');
  return sql;
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

/**
 * Convert T-SQL string concatenation with + to PostgreSQL || operator.
 * Must not affect numeric + operations.
 */
export function convertStringConcat(sql: string): string {
  // Adjacent string literals: 'a' + 'b' → 'a' || 'b'
  sql = sql.replace(/'\s*\+\s*'/g, "' || '");
  // String + non-numeric expression: 'text' + expr (but not 'text' + 5)
  sql = sql.replace(/'\s*\+\s*(?![\d\s]*[+\-*/])/g, "' || ");
  // After closing paren: ) + 'text'
  sql = sql.replace(/\)\s*\+\s*'/g, ") || '");
  // Before CAST: 'text' + CAST
  sql = sql.replace(/'\s*\+\s*CAST/gi, "' || CAST");
  // Function result + string: COALESCE/REPLACE/etc.() + 'text'
  sql = sql.replace(
    /\b(COALESCE|REPLACE|CASE|CAST|TRIM|UPPER|LOWER|SUBSTRING|LEFT|RIGHT|LTRIM|RTRIM)\s*\([^)]*\)\s*\+\s*'/gi,
    (m) => m.replace(/\+\s*'/, "|| '")
  );
  // After closing paren + column ref: ) + colname.
  sql = sql.replace(/\)\s*\+\s*(\w+\.)/g, ') || $1');
  // After quoted identifier + string literal: "Col" + 'text'
  sql = sql.replace(/"(\w+)"\s*\+\s*N?'/g, (m) => m.replace('+', '||'));
  return sql;
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
 */
export function convertTopToLimit(sql: string): string {
  // Find all SELECT TOP N patterns
  const topPattern = /\bSELECT\s+(DISTINCT\s+)?TOP\s+(\d+)\s/gi;
  let match: RegExpExecArray | null;
  const replacements: Array<{ start: number; end: number; selectPrefix: string; distinct: string; n: string }> = [];

  while ((match = topPattern.exec(sql)) !== null) {
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
 */
export function convertCastTypes(sql: string): string {
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

/** Map a T-SQL type name to PostgreSQL for inline CAST/CONVERT usage */
function mapInlineType(tsqlType: string): string {
  const upper = tsqlType.toUpperCase().trim();
  if (upper === 'UNIQUEIDENTIFIER') return 'UUID';
  if (upper === 'BIT') return 'BOOLEAN';
  if (/^NVARCHAR\s*\(\s*MAX\s*\)$/i.test(upper)) return 'TEXT';
  if (/^NVARCHAR\s*\(\s*(\d+)\s*\)$/i.test(upper)) return upper.replace(/^NVARCHAR/i, 'VARCHAR');
  if (upper === 'NVARCHAR') return 'TEXT';
  if (/^VARCHAR\s*\(\s*MAX\s*\)$/i.test(upper)) return 'TEXT';
  if (/^DATETIMEOFFSET/i.test(upper)) return 'TIMESTAMPTZ';
  if (/^DATETIME/i.test(upper)) return 'TIMESTAMPTZ';
  if (/^FLOAT/i.test(upper)) return 'DOUBLE PRECISION';
  if (upper === 'INT') return 'INTEGER';
  if (upper === 'TINYINT') return 'SMALLINT';
  if (upper === 'IMAGE') return 'BYTEA';
  if (upper === 'MONEY') return 'NUMERIC(19,4)';
  return tsqlType;
}

/** Remove N' prefix from string literals, but only when preceded by non-alphanumeric */
export function removeNPrefix(sql: string): string {
  // N' at start of string or after non-alpha character → '
  return sql.replace(/(?<![a-zA-Z])N'/g, "'");
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
  'CHAR', 'LIKE', 'SIMILAR', 'TO', 'WITH', 'NOCHECK', 'DEFERRABLE',
  'INITIALLY', 'DEFERRED', 'CASCADE', 'RESTRICT', 'VALID', 'GRANT',
  'EXECUTE', 'FUNCTION', 'PROCEDURE', 'VIEW', 'TRIGGER', 'SCHEMA',
  'DO', 'DECLARE', 'RETURN', 'RETURNS', 'LANGUAGE', 'PLPGSQL',
  'COMMENT', 'RAISE', 'NOTICE', 'EXCEPTION', 'PERFORM', 'NEW', 'OLD',
  'FOR', 'EACH', 'ROW', 'AFTER', 'BEFORE', 'INSTEAD', 'OF',
  'GENERATED', 'BY', 'IDENTITY', 'SERIAL', 'REPLACE', 'ACTION',
  'ASC', 'DESC', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
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
  // segmentType: 'code' | 'string' | 'comment'
  const segments: Array<{ text: string; type: 'code' | 'string' | 'comment' }> = [];
  let current = '';
  let inString = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    // Block comment handling
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

    // String literal handling
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

    // Check for start of single-line comment (--)
    if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      segments.push({ text: current, type: 'code' });
      // Consume everything from -- to end of line (or end of string)
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

    // Check for start of block comment
    if (sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
      segments.push({ text: current, type: 'code' });
      current = '/*';
      i++;
      inBlockComment = true;
      continue;
    }

    // Check for start of string
    if (sql[i] === "'") {
      segments.push({ text: current, type: 'code' });
      current = "'";
      inString = true;
      continue;
    }

    current += sql[i];
  }
  if (current) segments.push({ text: current, type: inString ? 'string' : inBlockComment ? 'comment' : 'code' });

  return segments.map(seg => {
    if (seg.type !== 'code') return seg.text; // String literals and comments — don't touch
    return seg.text.replace(/(?<!")(?<!\w)([A-Z]\w*)(?!")(?!\w)/g, (match, word: string) => {
      if (PASCAL_QUOTE_KEYWORDS.has(word.toUpperCase())) return match;
      return `"${word}"`;
    });
  }).join('');
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
