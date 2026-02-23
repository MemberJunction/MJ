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
import { convertIdentifiers, removeCollate } from './ExpressionHelpers.js';

export class ConditionalDDLRule implements IConversionRule {
  Name = 'ConditionalDDLRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CONDITIONAL_DDL'];
  Priority = 55;
  BypassSqlglot = true;

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
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

    // Try CREATE INDEX IF NOT EXISTS pattern first (no BEGIN/END wrapper)
    const indexResult = this.tryConvertConditionalIndex(result);
    if (indexResult) return indexResult + '\n';

    // Try CREATE ROLE conditional pattern (sys.database_principals → pg_roles)
    const roleResult = this.tryConvertConditionalRole(result);
    if (roleResult) return roleResult + '\n';

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
    const rest = sql.slice(closePos + 1);
    const createMatch = rest.match(
      /^\s*(CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX)\s+(\S+)\s+ON\s+(\S+)\s*\(([^)]+)\)\s*;?/i
    );
    if (!createMatch) return null;

    const keyword = createMatch[1].replace(/\bNONCLUSTERED\s+/i, '');
    const indexName = createMatch[2].replace(/^\[|\]$/g, '').replace(/^"|"$/g, '');
    const tableName = createMatch[3];
    const columns = createMatch[4];

    return `${keyword} IF NOT EXISTS "${indexName}" ON ${tableName} (${columns});`;
  }

  /** Find matching close paren at depth 0 */
  private static findCloseParen(sql: string, openPos: number): number {
    let depth = 0;
    for (let i = openPos; i < sql.length; i++) {
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
    const roleMatch = sql.match(/CREATE\s+ROLE\s+(\w+)/i);
    if (!roleMatch) return null;
    const roleName = roleMatch[1];
    return [
      'DO $$',
      'BEGIN',
      `    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${roleName}') THEN`,
      `        CREATE ROLE ${roleName};`,
      '    END IF;',
      'END $$;',
    ].join('\n');
  }

  private convertToDoBlock(sql: string): string {
    // Match: IF NOT EXISTS (...) BEGIN ... END
    const match = sql.match(
      /IF\s+NOT\s+EXISTS\s*\(([\s\S]*?)\)\s*\n\s*BEGIN\s*\n([\s\S]*?)\bEND\b/i
    );

    if (!match) {
      // Fallback: comment out entire block to prevent syntax errors
      const commented = sql.split('\n').map(l => `-- ${l}`).join('\n');
      return `-- TODO: Review conditional DDL\n${commented}\n`;
    }

    let condition = match[1].trim();
    let body = match[2].trim().replace(/;\s*$/, '');

    // Quote PascalCase column names that aren't already quoted
    // These reference baseline tables with quoted PascalCase columns
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
    sql = sql.replace(/(?<!")BIT\b(?!")/gi, 'BOOLEAN');
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
