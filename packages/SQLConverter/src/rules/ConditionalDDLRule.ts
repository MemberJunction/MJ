/**
 * Converts T-SQL conditional DDL patterns to PostgreSQL DO blocks.
 *
 * Handles:
 *   IF NOT EXISTS (SELECT ... FROM INFORMATION_SCHEMA.COLUMNS ...)
 *   BEGIN
 *       ALTER TABLE schema.[Table] ADD ColumnName TYPE ...;
 *   END
 *
 * Converts to PG anonymous DO block:
 *   DO $$
 *   BEGIN
 *       IF NOT EXISTS (SELECT ... FROM information_schema.columns ...) THEN
 *           ALTER TABLE schema."Table" ADD COLUMN "ColumnName" TYPE ...;
 *       END IF;
 *   END $$;
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeCollate, convertCommonFunctions, removeNPrefix } from './ExpressionHelpers.js';

export class ConditionalDDLRule implements IConversionRule {
  Name = 'ConditionalDDLRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CONDITIONAL_DDL'];
  Priority = 55;
  BypassSqlglot = true;
  BypassJustification = 'T-SQL IF NOT EXISTS / IF OBJECT_ID guards around DDL (CREATE INDEX, CREATE TABLE, etc.) need conversion to PG IF NOT EXISTS clauses or DO $ BEGIN ... EXCEPTION blocks. sqlglot does not perform this structural transformation.';

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = sql;

    // Convert identifiers: [schema].[table] → schema."table"
    result = convertIdentifiers(result);

    // Convert SQL Server types to PG types
    result = this.convertTypes(result);

    // Remove COLLATE clauses
    result = removeCollate(result);

    // Fix INFORMATION_SCHEMA casing (PG requires lowercase)
    result = this.fixInformationSchema(result);

    // Remove N prefix from string literals
    result = removeNPrefix(result);

    // Convert common SQL Server functions BEFORE PascalCase quoting
    // (prevents GETUTCDATE from being quoted as "GETUTCDATE" before conversion to NOW())
    result = convertCommonFunctions(result);

    // Try CREATE INDEX IF NOT EXISTS pattern first (no BEGIN/END wrapper)
    const indexResult = this.tryConvertConditionalIndex(result);
    if (indexResult) return indexResult + '\n';

    // Try CREATE ROLE conditional pattern (sys.database_principals → pg_roles)
    const roleResult = this.tryConvertConditionalRole(result);
    if (roleResult) return roleResult + '\n';

    // Try CREATE SCHEMA conditional pattern (sys.schemas + EXEC('CREATE SCHEMA ...')) →
    // PG-native CREATE SCHEMA IF NOT EXISTS "X"
    const schemaResult = this.tryConvertConditionalSchema(result);
    if (schemaResult) return schemaResult + '\n';

    // Try schema-level extended property pattern (sys.extended_properties + sp_addextendedproperty
    // with @level0type = SCHEMA, no level1) → PG-native COMMENT ON SCHEMA
    const extPropResult = this.tryConvertConditionalSchemaExtendedProperty(result);
    if (extPropResult) return extPropResult + '\n';

    // Convert IF NOT EXISTS (...) BEGIN ... END → DO $$ BEGIN IF NOT EXISTS (...) THEN ... END IF; END $$;
    result = this.convertToDoBlock(result);

    return result + '\n';
  }

  /** Convert IF NOT EXISTS (sys.indexes...) CREATE INDEX → CREATE INDEX IF NOT EXISTS */
  private tryConvertConditionalIndex(sql: string): string | null {
    if (!/sys\.indexes/i.test(sql)) return null;

    // Find the outer closing paren of IF NOT EXISTS (...) using depth counting
    const ifMatch = sql.match(/IF\s+NOT\s+EXISTS\s*\(/i);
    if (!ifMatch || ifMatch.index === undefined) return null;
    const openPos = sql.indexOf('(', ifMatch.index);
    const closePos = ConditionalDDLRule.findCloseParen(sql, openPos);
    if (closePos < 0) return null;

    // The text after the condition should contain CREATE INDEX
    // (with optional BEGIN...END wrapper)
    let rest = sql.slice(closePos + 1);
    rest = rest.replace(/^\s*\n\s*BEGIN\s*\n/i, '\n').replace(/\s*\bEND\b\s*;?\s*$/i, '');
    const createMatch = rest.match(
      /^\s*(CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX)\s+(\S+)\s+ON\s+(\S+)\s*\(([^)]+)\)(\s+WHERE\s+[^;]+)?\s*;?/i
    );
    if (!createMatch) return null;

    const keyword = createMatch[1].replace(/\bNONCLUSTERED\s+/i, '');
    const indexName = createMatch[2].replace(/^\[|\]$/g, '').replace(/^"|"$/g, '');
    const tableName = createMatch[3];
    // Quote PascalCase column names in the column list
    const columns = createMatch[4].split(',').map(c => {
      const t = c.trim();
      if (t.startsWith('"') || !t) return c;
      if (/[A-Z]/.test(t) && /^[A-Za-z_]\w*$/.test(t)) return c.replace(t, `"${t}"`);
      return c;
    }).join(',');
    // Quote PascalCase identifiers in the WHERE clause
    const whereClause = createMatch[5]
      ? this.quotePascalCaseIdentifiers(createMatch[5].trim())
      : '';

    return `${keyword} IF NOT EXISTS "${indexName}" ON ${tableName} (${columns})${whereClause ? ' ' + whereClause : ''};`;
  }

  /** Find matching close paren at depth 0, respecting string literals and comments */
  private static findCloseParen(sql: string, openPos: number): number {
    let depth = 0;
    let inString = false;
    for (let i = openPos; i < sql.length; i++) {
      // Skip -- line comments (they may contain apostrophes like "we're")
      if (!inString && sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
        const lineEnd = sql.indexOf('\n', i);
        if (lineEnd < 0) return -1; // comment runs to end of text
        i = lineEnd; // will be incremented by the loop
        continue;
      }
      // Skip /* block comments */
      if (!inString && sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
        const blockEnd = sql.indexOf('*/', i + 2);
        if (blockEnd < 0) return -1;
        i = blockEnd + 1; // skip past */
        continue;
      }
      if (sql[i] === "'") {
        if (inString) {
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            i++; // skip escaped quote
            continue;
          }
          inString = false;
        } else {
          inString = true;
        }
        continue;
      }
      if (inString) continue;
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /** Convert CREATE ROLE (with or without IF NOT EXISTS wrapper) to PG-compatible DO block.
   *  Handles both:
   *   - Bare: CREATE ROLE role_name;
   *   - Wrapped: IF NOT EXISTS (... sys.database_principals ...) CREATE ROLE role_name; */
  private tryConvertConditionalRole(sql: string): string | null {
    // Strip comments before matching to avoid matching role keywords inside comments
    // (e.g., "Create Role and Grant Permissions" in a comment would match "and" as role name)
    const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    // Accept [bracket], "quoted", or bare role names. SS emits the AUTHORIZATION
    // clause (e.g. CREATE ROLE [cdp_BI] AUTHORIZATION [db_securityadmin]) which PG
    // has no equivalent for — we capture only the name and drop the rest.
    const roleMatch = stripped.match(/CREATE\s+ROLE\s+(?:\[([^\]]+)\]|"([^"]+)"|(\w+))/i);
    if (!roleMatch) return null;
    const bareRoleName = roleMatch[1] || roleMatch[2] || roleMatch[3];
    const roleName = `"${bareRoleName}"`;
    return [
      'DO $$',
      'BEGIN',
      `    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${bareRoleName}') THEN`,
      `        CREATE ROLE ${roleName};`,
      '    END IF;',
      'END $$;',
    ].join('\n');
  }

  /** Convert IF NOT EXISTS (sys.schemas WHERE name = 'X') ... EXEC('CREATE SCHEMA [X]')
   *  to PG-native CREATE SCHEMA IF NOT EXISTS "X".
   *
   *  Source pattern (T-SQL):
   *      IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj_UDT')
   *      BEGIN
   *          EXEC('CREATE SCHEMA [__mj_UDT]')
   *      END
   *
   *  Target output (PG):
   *      CREATE SCHEMA IF NOT EXISTS "__mj_UDT";
   *
   *  Notes: ConditionalDDLRule's PostProcess runs convertIdentifiers() before this method,
   *  so by the time we see the SQL the [brackets] have already become double-quotes —
   *  we still strip both to be defensive against pattern variants.
   */
  private tryConvertConditionalSchema(sql: string): string | null {
    // Must reference sys.schemas in the IF NOT EXISTS condition AND have a CREATE SCHEMA inside
    if (!/sys\.schemas/i.test(sql)) return null;
    if (!/CREATE\s+SCHEMA\b/i.test(sql)) return null;

    // Extract the schema name from CREATE SCHEMA — handles both [X], "X", and bare X.
    // EXEC('CREATE SCHEMA [X]') after PostProcess identifier conversion may already be
    // EXEC('CREATE SCHEMA "X"'), so accept either bracket or quote forms.
    const schemaMatch = sql.match(/CREATE\s+SCHEMA\s+(?:\[([^\]]+)\]|"([^"]+)"|(\w+))/i);
    if (!schemaMatch) return null;
    const schemaName = schemaMatch[1] || schemaMatch[2] || schemaMatch[3];
    if (!schemaName) return null;

    return `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`;
  }

  /** Convert IF NOT EXISTS (sys.extended_properties ...) ... EXEC sp_addextendedproperty
   *  with @level0type = 'SCHEMA' (no level1) to PG-native COMMENT ON SCHEMA.
   *
   *  Source pattern (T-SQL):
   *      IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 3 AND ...)
   *      BEGIN
   *          EXEC sp_addextendedproperty
   *              @name = N'MS_Description',
   *              @value = N'description text',
   *              @level0type = N'SCHEMA',
   *              @level0name = N'__mj_UDT'
   *      END
   *
   *  Target output (PG):
   *      COMMENT ON SCHEMA "__mj_UDT" IS 'description text';
   *
   *  Note: the existing ExtendedPropertyRule handles TABLE/VIEW/COLUMN-level properties
   *  but assumes a non-empty @level1type. Schema-level properties (level0 only) need
   *  their own conversion. We emit COMMENT ON SCHEMA which is idempotent in PG, so the
   *  IF NOT EXISTS guard is unnecessary on the target side.
   */
  private tryConvertConditionalSchemaExtendedProperty(sql: string): string | null {
    // Must reference sys.extended_properties AND sp_addextendedproperty
    if (!/sys\.extended_properties/i.test(sql)) return null;
    if (!/sp_addextendedproperty/i.test(sql)) return null;
    // Must be a schema-level property (level0 = SCHEMA, no level1)
    if (!/@level0type\s*=\s*N?'SCHEMA'/i.test(sql)) return null;
    if (/@level1type\s*=/i.test(sql)) return null; // not schema-level if level1 is set

    // Extract @value (handles N'...' and '...', with '' for escaped single-quote inside).
    // Use a greedy alternation so that '' pairs are consumed as escapes rather than
    // treated as the terminator. Lazy * here would stop at the first ' of an escape.
    const valueMatch = sql.match(/@value\s*=\s*N?'((?:''|[^'])*)'/i);
    if (!valueMatch) return null;
    const rawValue = valueMatch[1];

    // Extract @level0name — the schema name
    const schemaMatch = sql.match(/@level0name\s*=\s*N?'([^']+)'/i);
    if (!schemaMatch) return null;
    const schemaName = schemaMatch[1];

    // Convert SS-style escaped quotes ('') to single quotes, then re-escape for PG
    const value = rawValue.replace(/''/g, "'");
    const pgValue = value.replace(/'/g, "''");

    return `COMMENT ON SCHEMA "${schemaName}" IS '${pgValue}';`;
  }

  private convertToDoBlock(sql: string): string {
    // Find the IF NOT EXISTS opening paren using depth-counting
    const ifMatch = sql.match(/IF\s+NOT\s+EXISTS\s*\(/i);
    if (!ifMatch || ifMatch.index === undefined) {
      const commented = sql.split('\n').map(l => `-- ${l}`).join('\n');
      return `-- SKIPPED: conditional DDL (auto-conversion not supported)\n${commented}\n`;
    }

    const openPos = sql.indexOf('(', ifMatch.index);
    const closePos = ConditionalDDLRule.findCloseParen(sql, openPos);
    if (closePos < 0) {
      const commented = sql.split('\n').map(l => `-- ${l}`).join('\n');
      return `-- SKIPPED: conditional DDL (auto-conversion not supported)\n${commented}\n`;
    }

    // Extract condition (inside the outer parens)
    let condition = sql.substring(openPos + 1, closePos).trim();

    // Get text after the closing paren — look for BEGIN...END or single statement
    const rest = sql.slice(closePos + 1);

    // Find BEGIN (may be on same line or next line)
    const beginMatch = rest.match(/^\s*BEGIN\b/i);
    let body: string;

    if (beginMatch) {
      // Block form: IF NOT EXISTS (...) BEGIN ... END
      // Strip all trailing comments and whitespace before matching END
      const afterBegin = rest.slice(beginMatch[0].length);
      const stripped = ConditionalDDLRule.stripTrailingComments(afterBegin);
      const endMatch = stripped.match(/\bEND\b\s*;?\s*$/i);
      if (!endMatch || endMatch.index === undefined) {
        const commented = sql.split('\n').map(l => `-- ${l}`).join('\n');
        return `-- SKIPPED: conditional DDL (auto-conversion not supported)\n${commented}\n`;
      }
      body = stripped.slice(0, endMatch.index).trim().replace(/;\s*$/, '');
    } else {
      // Single-statement form: IF NOT EXISTS (...) <statement>;
      // Strip all trailing comments and whitespace before extracting body
      const stripped = ConditionalDDLRule.stripTrailingComments(rest);
      body = stripped.trim().replace(/;\s*$/, '');
      if (!body) {
        const commented = sql.split('\n').map(l => `-- ${l}`).join('\n');
        return `-- SKIPPED: conditional DDL (auto-conversion not supported)\n${commented}\n`;
      }
    }

    // Quote PascalCase column names that aren't already quoted
    condition = this.quoteColumnNames(condition);
    body = this.quoteColumnNames(body);

    // Indent the condition lines
    const condLines = condition.split('\n').map(l => '        ' + l.trim()).join('\n');
    // Indent the body lines
    const bodyLines = body.split('\n').map(l => '        ' + l.trim()).join('\n');

    return [
      'DO $$',
      'BEGIN',
      '    IF NOT EXISTS (',
      condLines,
      '    ) THEN',
      bodyLines + ';',
      '    END IF;',
      'END $$;',
    ].join('\n');
  }

  /**
   * Repeatedly strip trailing block comments, line comments, and dashed
   * separator lines from the end of a SQL string until only code remains.
   */
  private static stripTrailingComments(sql: string): string {
    let s = sql;
    let prev = '';
    while (s !== prev) {
      prev = s;
      s = s.trimEnd();
      // Strip trailing line comments (-- ...)
      s = s.replace(/--[^\n]*$/g, '').trimEnd();
      // Strip trailing block comments (/* ... */)
      s = s.replace(/\/\*[\s\S]*?\*\/\s*$/g, '').trimEnd();
      // Strip trailing dashed separator lines (--------...)
      s = s.replace(/-{3,}\s*$/g, '').trimEnd();
    }
    return s;
  }

  /** SQL keywords that should NOT be quoted by quoteColumnNames */
  private static readonly SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IN', 'IS',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'ALTER', 'TABLE',
    'ADD', 'COLUMN', 'DEFAULT', 'CONSTRAINT', 'CHECK', 'PRIMARY', 'KEY',
    'FOREIGN', 'REFERENCES', 'UNIQUE', 'INDEX', 'ON', 'AS', 'BEGIN', 'END',
    'IF', 'THEN', 'ELSE', 'EXISTS', 'CREATE', 'DROP', 'TRUE', 'FALSE',
    'VARCHAR', 'TEXT', 'UUID', 'BOOLEAN', 'INTEGER', 'BIGINT', 'SMALLINT',
    'TIMESTAMPTZ', 'BYTEA', 'REAL', 'NUMERIC', 'DOUBLE', 'XML',
    'CHAR', 'LIKE', 'SIMILAR', 'TO', 'WITH', 'NOCHECK', 'DEFERRABLE',
    'INITIALLY', 'DEFERRED', 'CASCADE', 'RESTRICT', 'VALID', 'GRANT',
    'EXECUTE', 'FUNCTION', 'PROCEDURE', 'VIEW', 'TRIGGER', 'SCHEMA',
    'DO', 'DECLARE', 'RETURN', 'RETURNS', 'LANGUAGE', 'PLPGSQL',
    'COMMENT', 'RAISE', 'NOTICE', 'EXCEPTION', 'PERFORM', 'NEW', 'OLD',
    'FOR', 'EACH', 'ROW', 'AFTER', 'BEFORE', 'INSTEAD', 'OF',
    'GENERATED', 'BY', 'IDENTITY', 'SERIAL', 'REPLACE',
    'ASC', 'DESC', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'INNER', 'LEFT', 'RIGHT', 'OUTER', 'JOIN', 'CROSS', 'FULL',
    'UNION', 'ALL', 'DISTINCT', 'BETWEEN', 'CASE', 'WHEN', 'COALESCE',
    'CAST', 'MAX', 'MIN', 'COUNT', 'SUM', 'AVG', 'NOW', 'CURRENT_USER',
    'INFORMATION_SCHEMA', 'NONCLUSTERED', 'CLUSTERED',
  ]);

  /**
   * Quote PascalCase identifiers that aren't SQL keywords or already quoted.
   * CRITICAL: Skips content inside single-quoted string literals to avoid
   * corrupting UUID hex segments (e.g. 'AF4C' in '...-AF4C-...').
   */
  private quoteColumnNames(sql: string): string {
    // Split SQL into alternating non-string / string-literal segments
    const segments: string[] = [];
    let current = '';
    let inString = false;

    for (let i = 0; i < sql.length; i++) {
      if (sql[i] === "'") {
        if (inString) {
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            current += "''";
            i++;
            continue;
          }
          current += "'";
          segments.push(current);
          current = '';
          inString = false;
        } else {
          segments.push(current);
          current = "'";
          inString = true;
        }
      } else {
        current += sql[i];
      }
    }
    if (current) segments.push(current);

    // Apply quoting only to non-string segments
    return segments.map(seg => {
      if (seg.startsWith("'")) return seg; // String literal — don't touch
      return this.quotePascalCaseIdentifiers(seg);
    }).join('');
  }

  /** Quote standalone PascalCase words that aren't SQL keywords and aren't already quoted */
  private quotePascalCaseIdentifiers(sql: string): string {
    return sql.replace(/(?<!")(?<!\w)([A-Z]\w*)(?!")(?!\w)/g, (match, word: string) => {
      if (ConditionalDDLRule.SQL_KEYWORDS.has(word.toUpperCase())) return match;
      return `"${word}"`;
    });
  }

  private convertTypes(sql: string): string {
    sql = sql.replace(/\bNVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bNVARCHAR\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    sql = sql.replace(/\bVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bUNIQUEIDENTIFIER\b/gi, 'UUID');
    sql = sql.replace(/(?<![\w"])BIT(?![\w"])/gi, 'BOOLEAN');
    sql = sql.replace(/\bDATETIMEOFFSET\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bDATETIME2?\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bTINYINT\b/gi, 'SMALLINT');
    sql = sql.replace(/\bIMAGE\b/gi, 'BYTEA');
    return sql;
  }

  private fixInformationSchema(sql: string): string {
    sql = sql.replace(/"?INFORMATION_SCHEMA"?\./gi, 'information_schema.');
    sql = sql.replace(/information_schema\."COLUMNS"/gi, 'information_schema.columns');
    sql = sql.replace(/information_schema\."TABLES"/gi, 'information_schema.tables');
    sql = sql.replace(/"TABLE_SCHEMA"/g, 'table_schema');
    sql = sql.replace(/"TABLE_NAME"/g, 'table_name');
    sql = sql.replace(/"COLUMN_NAME"/g, 'column_name');
    sql = sql.replace(/"TABLE_CATALOG"/g, 'table_catalog');
    sql = sql.replace(/"DATA_TYPE"/g, 'data_type');
    return sql;
  }
}
