import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeCollate, convertCommonFunctions, transformCodeOnly, removeNPrefix, convertBooleanLiteralComparisons, collectBooleanColumnNames } from './ExpressionHelpers.js';

export class AlterTableRule implements IConversionRule {
  Name = 'AlterTableRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['FK_CONSTRAINT', 'PK_CONSTRAINT', 'CHECK_CONSTRAINT', 'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT', 'ALTER_TABLE'];
  Priority = 60;
  BypassSqlglot = true;
  BypassJustification = 'sqlglot does not handle T-SQL ALTER TABLE patterns: multi-column ADD with inline CONSTRAINT clauses, ADD CONSTRAINT name DEFAULT val FOR col syntax (T-SQL named defaults), inline FOREIGN KEY in ADD COLUMN, ALTER COLUMN type NOT NULL (must become SET NOT NULL in PG), or DEFERRABLE INITIALLY DEFERRED FK behavior we add. Custom rule produces idiomatic PG output and applies PG case-sensitive identifier quoting.';

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeCollate(result);

    // Convert SQL Server types to PG types (for ALTER TABLE ADD COLUMN)
    result = this.convertTypes(result);

    // Remove CLUSTERED/NONCLUSTERED
    result = result.replace(/\bCLUSTERED\b/gi, '');
    result = result.replace(/\bNONCLUSTERED\b/gi, '');
    // Remove ASC/DESC inside constraint column lists
    result = result.replace(/(\([^)]*)\b(ASC|DESC)\b/gi, '$1');
    // Remove ON [PRIMARY] filegroup
    result = result.replace(/\bON\s+\[?PRIMARY\]?/gi, '');
    result = result.replace(/\bON\s+"PRIMARY"/g, '');

    // ENABLE_CONSTRAINT: WITH CHECK CHECK CONSTRAINT → skip or just comment
    if (/WITH\s+CHECK\s+CHECK\s+CONSTRAINT/i.test(result)) {
      // PG constraints are always enforced, so this is a no-op
      return `-- Constraint enable (no-op in PostgreSQL)\n-- ${result.slice(0, 200)}\n`;
    }

    // Convert ALTER COLUMN ... TYPE NOT NULL → ALTER COLUMN ... SET NOT NULL
    result = this.convertAlterColumnNotNull(result);

    // Convert ALTER COLUMN ... TYPE NULL → ALTER COLUMN ... DROP NOT NULL
    // (mirror of convertAlterColumnNotNull above for the SQL-Server-allows-NULL-again form)
    result = this.convertAlterColumnDropNotNull(result);

    // Convert DEFAULT (val) FOR col → ALTER COLUMN col SET DEFAULT val
    result = this.convertDefaultFor(result);

    // Convert default functions (GETUTCDATE/NEWID/USER_NAME/...) — runs AFTER
    // convertDefaultFor so it also covers the `SET DEFAULT <fn>()` forms that
    // step produces, not just inline ADD COLUMN defaults.
    result = this.convertDefaults(result);

    // SS BIT literals → PG boolean for known boolean columns. Runs AFTER the
    // SET DEFAULT form is produced above. Handles both `"col" = 0/1` (CHECK
    // constraints) and `ALTER COLUMN "col" SET DEFAULT 0/1` — neither is caught
    // by the type-adjacent rules in convertDefaults (no BOOLEAN keyword present).
    result = convertBooleanLiteralComparisons(result, context.TableColumns);
    result = this.convertBooleanColumnDefaults(result, context.TableColumns);

    // Convert multi-column ADD to PG ADD COLUMN syntax (must run BEFORE removeInlineForeignKey
    // so synthesized ADD COLUMN entries on trailing columns are also subject to FK removal —
    // SQL Server allows trailing columns in a multi-column ALTER TABLE to omit the leading ADD).
    result = this.convertMultiColumnAdd(result);

    // Remove inline FOREIGN KEY keyword in column-level FK constraints (keep just REFERENCES).
    result = this.removeInlineForeignKey(result);

    // Make FK constraints DEFERRABLE INITIALLY DEFERRED
    if (/FOREIGN\s+KEY/i.test(result)) {
      // Remove WITH NOCHECK (PG doesn't support it)
      result = result.replace(/\bWITH\s+NOCHECK\b/gi, '');
      // Add DEFERRABLE INITIALLY DEFERRED before the semicolon
      result = result.trimEnd().replace(/;?\s*$/, '');
      result += ' DEFERRABLE INITIALLY DEFERRED';
    }

    // CHECK constraints: add NOT VALID to skip validation of existing rows.
    // SQL Server's case-insensitive collation and CHAR padding can produce data
    // that violates PG's case-sensitive CHECK constraints.
    //
    // Apply NOT VALID inline at the end of each ADD CONSTRAINT ... CHECK (...)
    // pattern, not at the end of the whole batch. Multi-statement batches that
    // happen to contain a CHECK shouldn't get NOT VALID appended to the LAST
    // statement, which may be a different ALTER TABLE entirely.
    //
    // Paren-balanced matching needed because CHECK expressions often contain
    // nested parens like `CHECK (col IN ('A', 'B'))` — a regex with `[^)]` would
    // close at the inner `)` and inject NOT VALID inside the IN list.
    if (!/FOREIGN\s+KEY/i.test(result)) {
      result = this.addNotValidToCheckConstraints(result);
    }

    // Remove N prefix from strings
    result = removeNPrefix(result);

    // Quote mixed-case constraint names in ADD / DROP CONSTRAINT clauses.
    // T-SQL is case-insensitive, so CodeGen often emits `DROP CONSTRAINT CK_EntityField_ExtendedType`
    // without quotes. PG folds unquoted identifiers to lowercase at lookup time,
    // then can't find the real mixed-case constraint. Quote any constraint name
    // that contains uppercase and isn't already quoted.
    result = result.replace(
      /\b(ADD|DROP)\s+CONSTRAINT\s+([A-Za-z_]\w*)\b/gi,
      (_m, verb, name: string) => {
        if (/[A-Z]/.test(name) && !name.startsWith('"')) {
          return `${verb} CONSTRAINT "${name}"`;
        }
        return _m;
      }
    );

    // Quote PascalCase column names inside FK/PK/UNIQUE column lists and REFERENCES(col)
    result = this.quoteConstraintColumns(result);

    // Convert common functions (LEN→LENGTH, etc.) before quoting PascalCase identifiers
    if (/\bCHECK\b/i.test(result)) {
      result = convertCommonFunctions(result);
    }

    // Quote PascalCase column names inside CHECK constraint bodies (preserve string literals)
    result = this.quoteCheckColumns(result);

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }

  /** Quote PascalCase column names inside FOREIGN KEY(...), PRIMARY KEY(...),
   *  UNIQUE(...), and REFERENCES table(col) parenthesized column lists */
  private quoteConstraintColumns(sql: string): string {
    // FK/PK/UNIQUE column lists
    sql = sql.replace(
      /((?:PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY)\s*\()([^)]+)(\))/gi,
      (_match, prefix: string, cols: string, suffix: string) => {
        const quotedCols = cols.split(',').map(c => {
          const t = c.trim();
          if (t.startsWith('"') || !t) return c;
          if (/[A-Z]/.test(t) && /^[A-Za-z_]\w*$/.test(t)) return c.replace(t, `"${t}"`);
          return c;
        }).join(',');
        return `${prefix}${quotedCols}${suffix}`;
      }
    );

    // REFERENCES table(Column)
    sql = sql.replace(
      /(REFERENCES\s+(?:\w+\.)?(?:"[^"]+"|\w+)\s*\()([A-Za-z_]\w*)(\))/gi,
      (_match, prefix: string, colName: string, suffix: string) => {
        if (/[A-Z]/.test(colName)) return `${prefix}"${colName}"${suffix}`;
        return _match;
      }
    );

    return sql;
  }

  /** Keywords that should NOT be quoted inside CHECK constraint bodies */
  private static readonly CHECK_KEYWORDS = new Set([
    'IN', 'IS', 'NULL', 'NOT', 'OR', 'AND', 'LIKE', 'BETWEEN',
    'TRUE', 'FALSE', 'CHECK', 'CONSTRAINT', 'SIMILAR', 'TO',
    'VALID', 'LENGTH', 'COALESCE', 'CAST', 'TRIM', 'UPPER', 'LOWER',
    'REPLACE', 'SUBSTRING', 'POSITION', 'ABS', 'ROUND', 'FLOOR', 'CEILING',
    'NOW', 'EXTRACT', 'DATE', 'TIME', 'TIMESTAMP', 'INTERVAL',
  ]);

  /** Quote PascalCase column names inside CHECK(...) bodies, preserving string literals
   *  and already-quoted identifiers.
   *  Body extraction is paren-balanced — stops at the matching `)` of CHECK so it
   *  doesn't consume subsequent statements. */
  private quoteCheckColumns(sql: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < sql.length) {
      const match = sql.slice(i).match(/CHECK\s*\(/i);
      if (!match || match.index === undefined) {
        result.push(sql.slice(i));
        break;
      }
      const matchStart = i + match.index;
      const openParen = matchStart + match[0].length - 1; // position of `(`

      // Find the matching `)` at depth 0
      let depth = 1;
      let inString = false;
      let closeParen = -1;
      for (let j = openParen + 1; j < sql.length; j++) {
        const ch = sql[j];
        if (inString) {
          if (ch === "'" && sql[j + 1] === "'") { j++; continue; }
          if (ch === "'") inString = false;
          continue;
        }
        if (ch === "'") { inString = true; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { closeParen = j; break; } }
      }
      if (closeParen === -1) { result.push(sql.slice(i)); break; }

      // Check for trailing NOT VALID
      let tail = '';
      const afterClose = sql.slice(closeParen + 1);
      const notValidMatch = afterClose.match(/^(\s*NOT\s+VALID)/i);
      if (notValidMatch) tail = notValidMatch[1];

      const prefix = sql.slice(matchStart, openParen + 1);
      const body = sql.slice(openParen + 1, closeParen);
      const quotedBody = transformCodeOnly(body, (code) =>
        code.replace(
          /(?<!['"])\b([A-Z][a-zA-Z_]\w*)\b(?!['"])/g,
          (m: string, name: string) => {
            if (AlterTableRule.CHECK_KEYWORDS.has(name.toUpperCase())) return m;
            return `"${name}"`;
          }
        )
      );

      result.push(sql.slice(i, matchStart));
      result.push(`${prefix}${quotedBody})${tail}`);
      i = closeParen + 1 + tail.length;
    }
    return result.join('');
  }

  /** Convert SQL Server types to PostgreSQL equivalents */
  private convertTypes(sql: string): string {
    sql = sql.replace(/\bNVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bNVARCHAR\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    sql = sql.replace(/\bVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bUNIQUEIDENTIFIER\b/gi, 'UUID');
    sql = sql.replace(/(?<![\w"])BIT(?![\w"])/gi, 'BOOLEAN');
    sql = sql.replace(/"BIT"/gi, 'BOOLEAN'); // Also handle bracket-quoted [BIT] → "BIT" from convertIdentifiers
    sql = sql.replace(/\bDATETIMEOFFSET\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bDATETIME2?\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bSMALLDATETIME\b/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bTINYINT\b/gi, 'SMALLINT');
    sql = sql.replace(/\bIMAGE\b/gi, 'BYTEA');
    sql = sql.replace(/\bVARBINARY\s*\(\s*MAX\s*\)/gi, 'BYTEA');
    sql = sql.replace(/\bMONEY\b/gi, 'NUMERIC(19,4)');
    return sql;
  }

  /** Convert SQL Server default functions and boolean literals to PostgreSQL equivalents */
  private convertDefaults(sql: string): string {
    sql = sql.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bSYSDATETIMEOFFSET\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bSYSUTCDATETIME\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bNEWSEQUENTIALID\s*\(\s*\)/gi, 'gen_random_uuid()');
    sql = sql.replace(/\bNEWID\s*\(\s*\)/gi, 'gen_random_uuid()');
    // SQL Server auth/user functions used as column defaults → PG current_user.
    // (No-arg form only; PG has no user_name(id) equivalent.)
    sql = sql.replace(/\bSUSER_SNAME\s*\(\s*\)/gi, 'current_user');
    sql = sql.replace(/\bSUSER_NAME\s*\(\s*\)/gi, 'current_user');
    sql = sql.replace(/\bUSER_NAME\s*\(\s*\)/gi, 'current_user');
    // After BIT → BOOLEAN type conversion, DEFAULT 0/1 must become DEFAULT FALSE/TRUE.
    // PG's BOOLEAN type does not accept integer literals as defaults.
    sql = sql.replace(/\bBOOLEAN\b(.*?)\bDEFAULT\s+0\b/gi, 'BOOLEAN$1DEFAULT FALSE');
    sql = sql.replace(/\bBOOLEAN\b(.*?)\bDEFAULT\s+1\b/gi, 'BOOLEAN$1DEFAULT TRUE');
    return sql;
  }

  /**
   * Convert `ALTER COLUMN "col" SET DEFAULT 0/1` to a PG boolean literal when
   * `col` is a known BOOLEAN column. This form carries no type keyword (the
   * column type lives in the CREATE TABLE, captured in context.TableColumns), so
   * the BOOLEAN-adjacent rules in convertDefaults can't catch it. PG rejects an
   * integer default on a boolean column at ALTER time.
   */
  private convertBooleanColumnDefaults(sql: string, tableColumns: Map<string, Map<string, string>>): string {
    const boolCols = collectBooleanColumnNames(tableColumns);
    if (boolCols.size === 0) return sql;
    return sql.replace(
      /ALTER\s+COLUMN\s+"(\w+)"\s+SET\s+DEFAULT\s+\(*\s*([01])\s*\)*/gi,
      (match, col: string, val: string) =>
        boolCols.has(col.toLowerCase())
          ? `ALTER COLUMN "${col}" SET DEFAULT ${val === '1' ? 'TRUE' : 'FALSE'}`
          : match,
    );
  }

  /**
   * Convert ALTER COLUMN col TYPE NOT NULL → ALTER COLUMN "col" SET NOT NULL
   * SQL Server: ALTER TABLE t ALTER COLUMN col TYPE NOT NULL
   * PostgreSQL: ALTER TABLE t ALTER COLUMN "col" SET NOT NULL
   */
  private convertAlterColumnNotNull(sql: string): string {
    // After convertIdentifiers, types may be quoted: "nvarchar"(100), "UUID", etc.
    // Match both quoted and unquoted type names.
    const typePattern = '"?\\w+"?(?:\\s*\\([^)]*\\))?';

    // T-SQL: ALTER COLUMN col TYPE NOT NULL → PG: ALTER COLUMN "col" SET NOT NULL
    let result = sql.replace(
      new RegExp(`ALTER\\s+COLUMN\\s+("?\\w+"?)\\s+${typePattern}\\s+NOT\\s+NULL`, 'gi'),
      (_match, col: string) => {
        const quotedCol = col.startsWith('"') ? col : `"${col}"`;
        return `ALTER COLUMN ${quotedCol} SET NOT NULL`;
      }
    );

    // T-SQL: ALTER COLUMN col TYPE NULL → PG: ALTER COLUMN "col" DROP NOT NULL
    // (T-SQL requires repeating the type when changing nullability; PG just uses DROP NOT NULL)
    result = result.replace(
      new RegExp(`ALTER\\s+COLUMN\\s+("?\\w+"?)\\s+${typePattern}\\s+NULL\\b(?!\\s*,)`, 'gi'),
      (_match, col: string) => {
        const quotedCol = col.startsWith('"') ? col : `"${col}"`;
        return `ALTER COLUMN ${quotedCol} DROP NOT NULL`;
      }
    );

    return result;
  }

  /**
   * Convert ADD CONSTRAINT name DEFAULT (val) FOR col
   *      OR ADD DEFAULT val FOR col
   * → ALTER COLUMN "col" SET DEFAULT val
   * SQL Server uses DEFAULT...FOR to set a default. PostgreSQL uses ALTER COLUMN...SET DEFAULT.
   *
   * The value capture is greedy-lazy to handle function calls with parens
   * (e.g. `DEFAULT NOW() FOR col` or `DEFAULT ((0)) FOR col`).
   */
  private convertDefaultFor(sql: string): string {
    // Form 1: ALTER TABLE X ADD CONSTRAINT name DEFAULT val FOR col
    let m = sql.match(
      /(ALTER\s+TABLE\s+\S+)\s+ADD\s+CONSTRAINT\s+\S+\s+DEFAULT\s+(.+?)\s+FOR\s+("?\w+"?)\s*;?\s*$/i
    );
    if (!m) {
      // Form 2: ALTER TABLE X ADD DEFAULT val FOR col (no CONSTRAINT name)
      m = sql.match(
        /(ALTER\s+TABLE\s+\S+)\s+ADD\s+DEFAULT\s+(.+?)\s*FOR\s+("?\w+"?)\s*;?\s*$/i
      );
    }
    if (!m) return sql;
    const tableClause = m[1];
    let defaultVal = m[2].trim();
    // Strip surrounding parens like `((0))` → `0`
    while (/^\(.*\)$/.test(defaultVal)) {
      const inner = defaultVal.slice(1, -1).trim();
      // Only strip if parens are truly balanced and wrap the whole thing
      if (this.parensBalanced(inner)) defaultVal = inner;
      else break;
    }
    const col = m[3].startsWith('"') ? m[3] : `"${m[3]}"`;
    return `${tableClause}\n  ALTER COLUMN ${col} SET DEFAULT ${defaultVal};`;
  }

  /**
   * Find each `ADD CONSTRAINT name CHECK (...)` pattern and append ` NOT VALID`
   * after the matching closing paren. Uses paren-balanced extraction so nested
   * parens inside the CHECK body don't cause early termination.
   */
  private addNotValidToCheckConstraints(sql: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < sql.length) {
      const remaining = sql.slice(i);
      const m = remaining.match(/ADD\s+CONSTRAINT\s+"?\w+"?\s+CHECK\s*\(/i);
      if (!m || m.index === undefined) {
        result.push(remaining);
        break;
      }
      const matchAbsStart = i + m.index;
      const openParen = matchAbsStart + m[0].length - 1;
      // Walk paren-balanced to find the matching close
      let depth = 1;
      let inStr = false;
      let closeParen = -1;
      for (let j = openParen + 1; j < sql.length; j++) {
        const ch = sql[j];
        if (inStr) {
          if (ch === "'" && sql[j + 1] === "'") { j++; continue; }
          if (ch === "'") inStr = false;
          continue;
        }
        if (ch === "'") { inStr = true; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { closeParen = j; break; } }
      }
      if (closeParen === -1) {
        result.push(remaining);
        break;
      }
      // Check if NOT VALID already follows
      const after = sql.slice(closeParen + 1);
      const hasNotValid = /^\s*NOT\s+VALID\b/i.test(after);
      result.push(sql.slice(i, closeParen + 1));
      if (!hasNotValid) result.push(' NOT VALID');
      i = closeParen + 1;
    }
    return result.join('');
  }

  /** Check whether a string has balanced parens (not escaped in a string literal) */
  private parensBalanced(s: string): boolean {
    let depth = 0;
    let inString = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (ch === "'" && s[i + 1] === "'") { i++; continue; }
        if (ch === "'") inString = false;
        continue;
      }
      if (ch === "'") { inString = true; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth < 0) return false; }
    }
    return depth === 0;
  }

  /**
   * Remove inline FOREIGN KEY keyword in ADD COLUMN with constraint.
   * SQL Server: ADD col TYPE CONSTRAINT name FOREIGN KEY REFERENCES t(c)
   * PostgreSQL: ADD col TYPE CONSTRAINT name REFERENCES t(c)
   * The FOREIGN KEY keyword is only valid in table-level constraints, not inline.
   *
   * When FOREIGN KEY appears between CONSTRAINT <name> and REFERENCES, it's
   * always inline (table-level would be `CONSTRAINT name FOREIGN KEY (col)
   * REFERENCES`, with a column list in parens between FOREIGN KEY and REFERENCES).
   */
  private removeInlineForeignKey(sql: string): string {
    return sql.replace(
      /(CONSTRAINT\s+"?\w+"?\s+)FOREIGN\s+KEY\s+(REFERENCES\b)/gi,
      '$1$2'
    );
  }

  /**
   * Convert ALTER COLUMN col TYPE NULL → ALTER COLUMN "col" DROP NOT NULL.
   * SQL Server: `ALTER TABLE t ALTER COLUMN col TYPE NULL` (re-allows NULLs)
   * PostgreSQL: `ALTER TABLE t ALTER COLUMN "col" DROP NOT NULL`
   *
   * Mirror of convertAlterColumnNotNull above which handles the NOT NULL form.
   * Without this rule, the literal `ALTER COLUMN col TYPE NULL` reaches PG and
   * raises a syntax error (PG has no `TYPE NULL` form — nullability is a
   * separate clause).
   */
  private convertAlterColumnDropNotNull(sql: string): string {
    return sql.replace(
      /ALTER\s+COLUMN\s+("?\w+"?)\s+\w+(?:\s*\([^)]*\))?\s+NULL\b/gi,
      (_match, col: string) => {
        const quotedCol = col.startsWith('"') ? col : `"${col}"`;
        return `ALTER COLUMN ${quotedCol} DROP NOT NULL`;
      }
    );
  }

  /**
   * Convert multi-column ADD to PostgreSQL ADD COLUMN syntax.
   * SQL Server: ALTER TABLE t ADD col1 TYPE, col2 TYPE
   * PostgreSQL: ALTER TABLE t ADD COLUMN "col1" TYPE, ADD COLUMN "col2" TYPE
   *
   * Processes each ALTER TABLE statement in the batch independently, so a
   * batch containing both `ALTER TABLE t ADD col TYPE` and
   * `ALTER TABLE t ADD CONSTRAINT ...` converts the first but leaves the
   * second alone.
   */
  private convertMultiColumnAdd(sql: string): string {
    // Split the batch into top-level statements (separated by ;)
    const statements = this.splitTopLevelStatements(sql);
    if (statements.length <= 1) {
      return this.convertSingleAlterTableAdd(sql);
    }
    return statements.map(s => this.convertSingleAlterTableAdd(s)).join('');
  }

  /**
   * Converts a single ALTER TABLE ADD statement (not ADD CONSTRAINT) to PG syntax
   * with quoted column names. Returns the input unchanged if it's not a simple ADD.
   */
  private convertSingleAlterTableAdd(sql: string): string {
    // Match ALTER TABLE ... ADD (non-anchored to handle leading comments)
    const addMatch = sql.match(/(ALTER\s+TABLE\s+\S+)\s+ADD\s+/i);
    if (!addMatch || addMatch.index === undefined) return sql;
    // Skip if already has ADD COLUMN
    if (/\bADD\s+COLUMN\b/i.test(sql)) return sql;
    // NOTE: ADD CONSTRAINT statements used to short-circuit here, which meant
    // a multi-constraint ALTER like `ADD CONSTRAINT c1 ..., CONSTRAINT c2 ...`
    // would not pick up `ADD` on the second clause. PG requires `ADD` before
    // every constraint in a multi-constraint ALTER; the comma-split loop below
    // correctly emits `ADD CONSTRAINT` for each clause, so we no longer skip.

    const prefix = sql.slice(0, addMatch.index);
    const tableClause = addMatch[1];
    const afterAdd = sql.slice(addMatch.index + addMatch[0].length);

    // Split by comma at top level (respecting parentheses for DEFAULT (...) etc)
    const columns = this.splitTopLevelCommas(afterAdd);
    if (columns.length === 0) return sql;

    // Check that each part looks like a column definition (starts with an identifier + type)
    let trailingSemi = '';
    const colDefs = columns.map((c, idx) => {
      let trimmed = c.trim();
      // Preserve trailing semicolon on the last column
      if (idx === columns.length - 1 && /;\s*$/.test(trimmed)) {
        trimmed = trimmed.replace(/;\s*$/, '');
        trailingSemi = ';';
      }
      if (!trimmed) return null;
      // Recognize CONSTRAINT clause — emit `ADD CONSTRAINT ...` instead of `ADD COLUMN`
      if (/^CONSTRAINT\b/i.test(trimmed)) {
        return `ADD ${trimmed}`;
      }
      // Quote the column name if it's a bare identifier
      const colMatch = trimmed.match(/^("?\w+"?)(\s+.*)$/s);
      if (!colMatch) return null;
      let colName = colMatch[1];
      const rest = colMatch[2];
      // Quote any unquoted identifier — PG case-sensitivity requires all mixed-case
      // identifiers to be quoted, and quoting a simple lowercase name is harmless.
      if (!colName.startsWith('"')) {
        colName = `"${colName}"`;
      }
      // IF NOT EXISTS — idempotency by default: if the column already exists, no-op
      // instead of erroring. This is the safe default for PG migrations because
      // (a) Skyway/Flyway does not auto-wrap multi-statement scripts in transactions,
      // so a partial-commit failure can leave the column already added on retry; and
      // (b) CI's idempotency gate (Step 5b) re-applies each migration on top of the
      // already-migrated DB and will fail without it. The original T-SQL ADD COLUMN
      // also fails on duplicate, so IF NOT EXISTS is strictly more permissive.
      return `ADD COLUMN IF NOT EXISTS ${colName}${rest}`;
    });

    if (colDefs.some(d => d === null)) return sql;

    return `${prefix}${tableClause}\n ${colDefs.join(',\n ')}${trailingSemi}`;
  }

  /**
   * Split a SQL batch into top-level statements, preserving the trailing
   * semicolon on each statement. Respects parens and string literals.
   */
  private splitTopLevelStatements(sql: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      if (inString) {
        current += ch;
        if (ch === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
          current += sql[++i];
        } else if (ch === "'") {
          inString = false;
        }
        continue;
      }
      if (ch === "'") { inString = true; current += ch; continue; }
      if (ch === '(') { depth++; current += ch; continue; }
      if (ch === ')') { depth--; current += ch; continue; }
      current += ch;
      if (ch === ';' && depth === 0) {
        parts.push(current);
        current = '';
      }
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  /** Split on commas at depth 0, respecting parens and string literals */
  private splitTopLevelCommas(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        current += ch;
        if (ch === "'" && i + 1 < str.length && str[i + 1] === "'") {
          current += str[++i];
        } else if (ch === "'") {
          inString = false;
        }
        continue;
      }
      if (ch === "'") { inString = true; current += ch; continue; }
      if (ch === '(') { depth++; current += ch; continue; }
      if (ch === ')') { depth--; current += ch; continue; }
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }
}
