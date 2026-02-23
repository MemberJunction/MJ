import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeCollate, convertCommonFunctions } from './ExpressionHelpers.js';

export class AlterTableRule implements IConversionRule {
  Name = 'AlterTableRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['FK_CONSTRAINT', 'PK_CONSTRAINT', 'CHECK_CONSTRAINT', 'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT', 'ALTER_TABLE'];
  Priority = 60;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeCollate(result);

    // Convert SQL Server types to PG types (for ALTER TABLE ADD COLUMN)
    result = this.convertTypes(result);

    // Convert default functions (for ALTER TABLE ADD COLUMN)
    result = this.convertDefaults(result);

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
    if (/\bCHECK\b/i.test(result) && !/FOREIGN\s+KEY/i.test(result)) {
      result = result.trimEnd().replace(/;?\s*$/, '');
      result += ' NOT VALID';
    }

    // Remove N prefix from strings
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

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
   *  and already-quoted identifiers */
  private quoteCheckColumns(sql: string): string {
    return sql.replace(
      /(CHECK\s*\()([^;]+)(NOT\s+VALID)?/gi,
      (_match, prefix: string, body: string, notValid: string | undefined) => {
        // Quote unquoted PascalCase identifiers — skip those already inside quotes
        const quotedBody = body.replace(
          /(?<!['"])\b([A-Z][a-zA-Z_]\w*)\b(?!['"])/g,
          (m: string, name: string) => {
            if (AlterTableRule.CHECK_KEYWORDS.has(name.toUpperCase())) return m;
            return `"${name}"`;
          }
        );
        return `${prefix}${quotedBody}${notValid || ''}`;
      }
    );
  }

  /** Convert SQL Server types to PostgreSQL equivalents */
  private convertTypes(sql: string): string {
    sql = sql.replace(/\bNVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bNVARCHAR\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    sql = sql.replace(/\bVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bUNIQUEIDENTIFIER\b/gi, 'UUID');
    sql = sql.replace(/(?<![\w"])BIT(?![\w"])/gi, 'BOOLEAN');
    sql = sql.replace(/\bDATETIMEOFFSET\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bDATETIME2?\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bSMALLDATETIME\b/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bTINYINT\b/gi, 'SMALLINT');
    sql = sql.replace(/\bIMAGE\b/gi, 'BYTEA');
    sql = sql.replace(/\bVARBINARY\s*\(\s*MAX\s*\)/gi, 'BYTEA');
    sql = sql.replace(/\bMONEY\b/gi, 'NUMERIC(19,4)');
    return sql;
  }

  /** Convert SQL Server default functions to PostgreSQL equivalents */
  private convertDefaults(sql: string): string {
    sql = sql.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bSYSDATETIMEOFFSET\s*\(\s*\)/gi, 'NOW()');
    sql = sql.replace(/\bNEWSEQUENTIALID\s*\(\s*\)/gi, 'gen_random_uuid()');
    sql = sql.replace(/\bNEWID\s*\(\s*\)/gi, 'gen_random_uuid()');
    return sql;
  }
}
