import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  ConvertIdentifiers, RemoveNPrefix, RemoveCollate, ConvertCastTypes,
  QuotePascalCaseIdentifiers, ConvertCommonFunctions, ConvertStringConcat,
  ConvertCharIndex, ConvertStuff, ConvertConvertFunction, ConvertIIF, ConvertTopToLimit,
  TransformCodeOnly, CastBooleanInsertValues, ConvertJsonFunctions,
  ConvertBooleanLiteralComparisons,
  EscapeRegExp, NeedsHandAuthoring, StripComments,
  AddRecursiveToSelfReferencingCtes, HasTryConvert,
} from './ExpressionHelpers.js';

/**
 * A table reference in a FROM / JOIN: `schema."Table"`, `"Table"` or a bare word. The schema may be
 * an unresolved Flyway placeholder (`${mjSchema}`, `${flyway:defaultSchema}`), which Open App
 * migrations use for core tables; without it the UPDATE-alias rewrite gave up and left T-SQL's
 * `UPDATE ta SET … FROM t ta JOIN …` in the output (issue #5799).
 */
const TABLE_REF = String.raw`(?:(?:\$\{[\w:]+\}|\w+)\.)?"[^"]+"|\w+`;
const QUALIFIED_TABLE_REF = String.raw`(?:\$\{[\w:]+\}|\w+)\."[^"]+"`;

/** Strip trailing comments (both line -- and block /* *‌/) from a SQL string.
 *  Returns the bare SQL and the stripped comment text separately. */
function stripTrailingComments(input: string): { sql: string; comments: string } {
  let s = input.trimEnd();
  const commentParts: string[] = [];

  // Iteratively strip trailing block comments then line comments
  let changed = true;
  while (changed) {
    changed = false;
    // Block comment at the end: /* ... */
    const blockMatch = s.match(/(\s*\/\*[\s\S]*?\*\/\s*)$/);
    if (blockMatch) {
      commentParts.unshift(blockMatch[1].trim());
      s = s.slice(0, -blockMatch[1].length).trimEnd();
      changed = true;
    }
    // Line comment(s) at the end: lines starting with --
    while (/\n--[^\n]*$/.test(s) || /^--[^\n]*$/.test(s)) {
      const lineMatch = s.match(/((?:\n--[^\n]*)+)$/);
      if (lineMatch) {
        commentParts.unshift(lineMatch[1].trim());
        s = s.slice(0, -lineMatch[1].length).trimEnd();
        changed = true;
      } else {
        break;
      }
    }
  }

  return { sql: s, comments: commentParts.join('\n') };
}

/** Words that can follow a FROM table where an alias would otherwise stand. */
const NOT_AN_ALIAS = new Set(['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'ON', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'WITH']);

/** Offset of the `)` closing the `(` at `open`, skipping string literals; -1 when unbalanced. */
function matchingParen(sql: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inString && sql[i + 1] === "'") { i++; continue; }
      inString = !inString;
    } else if (!inString) {
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return i;
    }
  }
  return -1;
}

/** `text` with every parenthesised group and string literal blanked, so a scan sees only depth 0. */
function topLevelOnly(text: string): string {
  let out = '';
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      if (inString && text[i + 1] === "'") { out += '  '; i++; continue; }
      inString = !inString;
      out += ' ';
    } else if (inString) {
      out += ' ';
    } else if (ch === '(') {
      depth++;
      out += ' ';
    } else if (ch === ')') {
      depth--;
      out += ' ';
    } else {
      out += depth > 0 ? ' ' : ch;
    }
  }
  return out;
}

/**
 * T-SQL deletes base-table rows through a CTE (`WITH c AS (… ROW_NUMBER() …) DELETE FROM c WHERE
 * rn > 1`, the dedup idiom); PostgreSQL cannot DELETE FROM a CTE (issue #3166). When the CTE reads
 * one table, carry each row's `ctid` out of it and delete from that table by it:
 *   WITH c AS (SELECT ctid AS mj_ctid, … FROM t …) DELETE FROM t WHERE ctid IN (SELECT mj_ctid FROM c WHERE p)
 * A CTE whose rows do not map one-to-one onto one table (a join, several FROM tables, DISTINCT,
 * GROUP BY, a set operation, several CTEs) becomes a counted gap. Any other statement — including
 * a DELETE that only reads a CTE — is returned unchanged. Runs on T-SQL, before identifier
 * conversion.
 */
export function RewriteDeleteFromCte(sql: string): string {
  const head = sql.match(/^((?:[ \t]*(?:--[^\n]*)?\n)*\s*);?\s*WITH\s+(\w+)\s+AS\s*\(/i);
  if (!head) return sql;
  const cteName = head[2];
  const open = head[0].length - 1;
  const close = matchingParen(sql, open);
  if (close < 0) return sql;
  // The DELETE runs to the first top-level `;` (or the end of the batch); anything after it is
  // a later statement of the same batch and is kept as is.
  const afterCte = sql.slice(close + 1);
  const semicolon = topLevelOnly(afterCte).indexOf(';');
  const statementEnd = semicolon < 0 ? afterCte.length : semicolon + 1;
  const rest = afterCte.slice(statementEnd);
  const tail = afterCte.slice(0, statementEnd).match(/^\s*DELETE\s+(?:FROM\s+)?(\[?\w+\]?)\s*([\s\S]*?)\s*;?\s*$/i);
  if (!tail || tail[1].replace(/^\[|\]$/g, '').toLowerCase() !== cteName.toLowerCase()) return sql;

  const statement = sql.slice(0, close + 1 + statementEnd);
  const gap = (reason: string) => NeedsHandAuthoring('DELETE FROM CTE', reason, statement).trimEnd() + rest;
  const body = sql.slice(open + 1, close);
  const flat = topLevelOnly(body);
  if (/^\s*SELECT\s+(?:DISTINCT|TOP)\b/i.test(flat) || /\b(?:JOIN|GROUP\s+BY|UNION|INTERSECT|EXCEPT)\b/i.test(flat)) {
    return gap('the CTE does not read exactly one table row for row');
  }
  if (!/^\s*SELECT\s/i.test(flat)) return gap('the CTE is not a single SELECT');
  const from = flat.match(/\bFROM\s+((?:\[[^\]]+\]|"[^"]+"|[\w${}:]+)(?:\s*\.\s*(?:\[[^\]]+\]|"[^"]+"|[\w$]+))*)(?:\s+(?:AS\s+)?(\w+))?\s*(,)?/i);
  if (!from || from[3]) return gap('the CTE does not read exactly one table');
  const alias = from[2] && !NOT_AN_ALIAS.has(from[2].toUpperCase()) ? from[2] : null;

  const selectAt = body.search(/SELECT\s/i) + 'SELECT'.length;
  const newBody = `${body.slice(0, selectAt)} ${alias ? `${alias}.` : ''}ctid AS mj_ctid,${body.slice(selectAt)}`;
  const where = tail[2].replace(/^WHERE\s+/i, '').trim();
  const predicate = where ? ` WHERE ${where}` : '';
  return `${head[1]}WITH ${cteName} AS (${newBody}) DELETE FROM ${from[1]} WHERE ctid IN (SELECT mj_ctid FROM ${cteName}${predicate});${rest}`;
}

export class InsertRule implements IConversionRule {
  Name = 'InsertRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['INSERT', 'UPDATE', 'DELETE'];
  Priority = 50;
  BypassSqlglot = true;
  BypassJustification = 'INSERT INTO with N\'string\' literals, GETUTCDATE() defaults, IDENTITY_INSERT, [bracket] identifiers, and SQL Server BIT (0/1) for BOOLEAN columns. The rule strips N prefixes, converts date functions, and quotes identifiers — work sqlglot does partially but with quirks for MJ\'s CodeGen-emitted INSERTs.';

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    // A CTE-targeted DELETE that cannot be rewritten comes back commented out under a gap
    // marker; when nothing else is left in the batch, there is no code to convert.
    const deleteSql = RewriteDeleteFromCte(sql);
    if (StripComments(deleteSql).trim() === '') return deleteSql + '\n';
    let result = ConvertIdentifiers(deleteSql);
    result = RemoveNPrefix(result);
    result = RemoveCollate(result);
    // Function conversions BEFORE quoting (prevents "LEN", "SUBSTRING" etc. from being quoted).
    // Code only: a stored query or description that mentions ISNULL / LEN / GETDATE() is data
    // and must reach PostgreSQL byte for byte (issue #5838).
    result = TransformCodeOnly(result, ConvertCommonFunctions);
    result = ConvertStringConcat(result, context.TableColumns);
    result = ConvertCharIndex(result);
    result = ConvertStuff(result);
    result = ConvertConvertFunction(result);
    // TRY_CONVERT to a type without a guarded-cast form has no PostgreSQL spelling: report it.
    if (HasTryConvert(result)) {
      return NeedsHandAuthoring('TRY_CONVERT', 'only uniqueidentifier and integer targets convert', sql);
    }
    result = ConvertIIF(result);
    // Convert SS JSON functions (JSON_VALUE / ISJSON) BEFORE PascalCase quoting,
    // so the function names aren't quoted as identifiers.
    result = ConvertJsonFunctions(result);
    result = ConvertCastTypes(result);
    // Convert SELECT TOP N subqueries to SELECT ... LIMIT N
    result = ConvertTopToLimit(result);
    // Quote bare schema.Name references (e.g. __mj.vwFoo → __mj."vwFoo")
    const schema = context.Schema;
    if (schema) {
      // Both sides treat `schema` as DATA. Escaped on the search side so a `$`
      // in it cannot act as an end-anchor (which would make the pattern match
      // nothing), and carried through a replacement function on the other so a
      // `$` cannot be expanded. The capture group stays intentional, passed as a
      // named callback parameter instead of `$1`. The sibling ViewRule was
      // converted by the #3171 sweep; this twin was missed. See issue #3171.
      const bareSchemaRef = new RegExp(`\\b${EscapeRegExp(schema)}\\.(?!")((?:vw)?[A-Za-z]\\w+)\\b`, 'g');
      // Code only: `__mj.User` in a description literal is text, not a reference (issue #5838).
      result = TransformCodeOnly(result, (code) =>
        code.replace(bareSchemaRef, (_match, table: string) => `${schema}."${table}"`));
    }
    // Quote column names in INSERT INTO table (col1, col2, ...) — these are always column
    // names even if they collide with SQL keywords (e.g. Language, Condition, Action)
    result = this.quoteInsertColumnList(result);
    // Quote __mj_ prefixed columns (e.g. __mj_UpdatedAt, __mj_CreatedAt) — these start
    // with underscores so quotePascalCaseIdentifiers (which requires [A-Z] start) misses them.
    // Uses transformCodeOnly to skip string literals — otherwise values like '__mj_CreatedAt'
    // inside INSERT VALUES would get incorrectly quoted to '"__mj_CreatedAt"'.
    // A name followed by `.` is a schema qualifier, not a column: Open App schemas follow the
    // same `__mj_<App>` convention, and quoting `__mj_BizAppsAccounting.` preserved its case,
    // naming a schema that does not exist (the real one folded to lowercase when it was
    // created unquoted) — issue #5364.
    result = TransformCodeOnly(result, (code) =>
      code.replace(/(?<!")\b(__mj_[A-Za-z]\w*)\b(?!")(?!\s*\.)/g, '"$1"')
    );
    // Quote bare PascalCase identifiers (column names in INSERT/UPDATE/DELETE)
    result = QuotePascalCaseIdentifiers(result);
    // PostgreSQL needs RECURSIVE for a CTE that reads itself; T-SQL has no keyword (issue #5799).
    // After quoting, which would otherwise quote the keyword as an identifier.
    result = AddRecursiveToSelfReferencingCtes(result);
    // Cast SS BIT literals (0/1) → PG boolean (FALSE/TRUE) at boolean-column
    // positions in INSERT VALUES. PG rejects integer literals for boolean columns.
    result = CastBooleanInsertValues(result, context.TableColumns);
    // Convert `"BoolCol" = 0/1` comparisons/assignments (UPDATE SET, WHERE) to
    // FALSE/TRUE. INSERT VALUES is positional (handled above); this covers the
    // `"col" = N` form that appears in UPDATE/DELETE statements.
    result = ConvertBooleanLiteralComparisons(result, context.TableColumns);
    // Convert T-SQL UPDATE alias FROM pattern to PG syntax
    result = this.convertUpdateFromAlias(result);
    // Ensure semicolon after the actual SQL statement (not after trailing comments).
    // T-SQL batches may include trailing block comments and/or line comments that
    // contain semicolons (e.g. -- ${flyway:timestamp};). Strip ALL trailing comments
    // to find the real end of the SQL statement, add semicolon there, then re-append.
    result = result.trimEnd();
    const { sql: sqlPart, comments: trailingComments } = stripTrailingComments(result);
    if (!sqlPart.endsWith(';')) {
      result = sqlPart + ';';
      if (trailingComments) result += '\n' + trailingComments;
    }
    return result + '\n';
  }

  /** Quote all bare PascalCase column names in the INSERT INTO ... (...) column list.
   *  Column names in this position are always identifiers, never SQL keywords. */
  private quoteInsertColumnList(sql: string): string {
    return sql.replace(
      /(INSERT\s+INTO\s+\S+\s*\()([^)]+)(\))/gi,
      (_match, prefix: string, cols: string, suffix: string) => {
        const quoted = cols.split(',').map(col => {
          const trimmed = col.trim();
          // Already quoted
          if (trimmed.startsWith('"')) return col;
          // Has uppercase and is a valid identifier — quote it
          if (/^[A-Za-z_]\w*$/.test(trimmed) && /[A-Z]/.test(trimmed)) {
            return col.replace(trimmed, `"${trimmed}"`);
          }
          return col;
        }).join(',');
        return `${prefix}${quoted}${suffix}`;
      }
    );
  }

  /** Convert T-SQL UPDATE alias FROM pattern to PostgreSQL syntax.
   *  T-SQL: UPDATE alias SET alias.Col = val FROM schema.table alias JOIN ... WHERE ...
   *  PG:    UPDATE schema.table AS alias SET Col = val FROM other_tables WHERE ... */
  private convertUpdateFromAlias(fullSql: string): string {
    // Detect UPDATE <bareWord> SET (bareWord with no dots/quotes = alias, not table)
    const aliasMatch = fullSql.match(/\bUPDATE\s+(\w+)\s+SET\b/i);
    if (!aliasMatch || aliasMatch.index === undefined) return fullSql;
    const alias = aliasMatch[1];

    // Isolate any leading comment block from the statement itself. Comments can
    // contain the word "from" (e.g. "...backfill X from the legacy Y..."), which
    // would otherwise be matched by the \bFROM\b searches below and corrupt the
    // rewrite. We process only the SQL from UPDATE onward, then re-prepend the head.
    const head = fullSql.slice(0, aliasMatch.index);
    const sql = fullSql.slice(aliasMatch.index);
    return head + this.rewriteUpdateFromAlias(sql, alias);
  }

  /** Core UPDATE-alias-FROM rewrite, operating on the statement text (no leading comments). */
  private rewriteUpdateFromAlias(sql: string, alias: string): string {

    // Verify the alias appears in a FROM clause as: <schema>."<table>" [AS] <alias>
    const tableMatch = sql.match(
      new RegExp(`\\bFROM\\b[\\s\\S]*?(${QUALIFIED_TABLE_REF})\\s+(?:AS\\s+)?${alias}\\b`, 'i')
    );
    if (!tableMatch) return sql;
    const tableName = tableMatch[1];

    let result = sql;

    // (1) UPDATE <alias> → UPDATE <table> AS <alias>
    result = result.replace(
      new RegExp(`(\\bUPDATE\\s+)${alias}(?=\\s+SET\\b)`, 'i'),
      (_m, update: string) => `${update}${tableName} AS ${alias}`
    );

    // (2) Strip alias. prefix from SET columns (between SET and FROM only)
    result = result.replace(
      /(\bSET\b)([\s\S]*?)(\bFROM\b)/i,
      (_m, s: string, body: string, f: string) =>
        s + body.replace(new RegExp(`\\b${alias}\\.`, 'g'), '') + f
    );

    // (3) Parse FROM block and optional WHERE clause
    const hasWhere = /\bWHERE\b/i.test(result.substring(result.search(/\bFROM\b/i)));
    let fromBlock: string;
    let origWhere: string;

    if (hasWhere) {
      const m = result.match(/\bFROM\b([\s\S]*?)\bWHERE\b\s*([\s\S]*)$/i);
      if (!m) return result;
      fromBlock = m[1];
      origWhere = m[2].replace(/^\s+/, '');
    } else {
      const m = result.match(/\bFROM\b([\s\S]*)$/i);
      if (!m) return result;
      fromBlock = m[1];
      origWhere = '';
    }

    // Split FROM block by JOIN keywords to extract individual table entries
    const joinRe = /\b(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\b/gi;
    const fragments: string[] = [];
    let lastIdx = 0;
    let jm: RegExpExecArray | null;
    while ((jm = joinRe.exec(fromBlock)) !== null) {
      fragments.push(fromBlock.substring(lastIdx, jm.index));
      lastIdx = jm.index + jm[0].length;
    }
    fragments.push(fromBlock.substring(lastIdx));
    // fragments[0] = target table entry (to be removed)
    // fragments[1..n] = table + ON condition after each JOIN keyword

    const otherTables: string[] = [];
    const onConditions: string[] = [];
    for (let i = 1; i < fragments.length; i++) {
      const body = fragments[i].trim();
      // A join target is either a schema-qualified quoted table (__mj."Table"), a bare
      // quoted table ("Table"), or a bare word (a CTE name or unqualified table, e.g.
      // `JOIN numbered ON ...`). The alias is optional — CTE joins commonly omit it —
      // so a negative lookahead keeps ON from being swallowed as an alias.
      const parsed = body.match(
        new RegExp(`^(${TABLE_REF})(?:\\s+(?:AS\\s+)?(?!ON\\b)(\\w+))?\\s+ON\\s+([\\s\\S]+)$`, 'i')
      );
      if (parsed) {
        const aliasPart = parsed[2] ? ` ${parsed[2]}` : '';
        otherTables.push(`${parsed[1]}${aliasPart}`.trim());
        onConditions.push(parsed[3].trim());
      } else {
        // Unparseable join fragment: rewriting anyway would silently drop it and corrupt
        // the statement's semantics (it would strip the FROM clause but leave references
        // to the dropped table dangling). Emit the statement unchanged so the failure is
        // loud at apply time instead of a silent data bug.
        return sql;
      }
    }

    // Build new FROM and WHERE
    const condParts = [...onConditions];
    if (origWhere) condParts.push(origWhere);

    if (otherTables.length === 0) {
      // No JOINs — remove FROM clause (target table is already in UPDATE)
      if (origWhere) {
        result = result.replace(/\bFROM\b[\s\S]*?\bWHERE\b/i, 'WHERE');
      } else {
        result = result.replace(/\bFROM\b[\s\S]*$/i, '');
      }
    } else {
      const newFrom = `FROM\n\t${otherTables.join(',\n\t')}`;
      const allConds = condParts.join('\n\tAND ');
      // A replacement function, not a string: the conditions are SQL and may hold `$'` (the end
      // of a regex literal such as TRY_CONVERT's UUID pattern), which a replacement string expands.
      result = result.replace(/\bFROM\b[\s\S]*$/i, () => `${newFrom}\nWHERE\n\t${allConds}`);
    }

    return result;
  }
}
