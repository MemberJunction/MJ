/**
 * CREATE TABLE conversion rule: T-SQL → PostgreSQL.
 * Ported from Python convert_create_table() function.
 *
 * Handles: column types, constraints, defaults, IDENTITY, COLLATE removal, etc.
 * Also tracks column types in ConversionContext for downstream INSERT boolean casting.
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeCollate } from './ExpressionHelpers.js';

export class CreateTableRule implements IConversionRule {
  Name = 'CreateTableRule';
  AppliesTo: StatementType[] = ['CREATE_TABLE'];
  Priority = 10;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    let result = sql;

    // Phase 1: Bracketed type conversions (before identifier conversion)
    result = this.convertBracketedTypes(result);

    // Phase 2: Identifier conversion
    result = convertIdentifiers(result);

    // Phase 3: Unbracketed type conversions (broad word-boundary patterns)
    result = this.convertUnbracketedTypes(result);

    // Phase 4: Constraint and default handling
    result = this.convertConstraintsAndDefaults(result);

    // Phase 5: Remove SQL Server keywords
    result = result.replace(/\bCLUSTERED\b/gi, '');
    result = result.replace(/\bNONCLUSTERED\b/gi, '');
    result = removeCollate(result);

    // Phase 6: Cleanup
    result = result.replace(/ {2,}/g, ' ');

    // Track column types for INSERT boolean casting
    this.trackColumnTypes(result, context);

    // Ensure ends with semicolon
    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';

    return result + '\n';
  }

  /** Phase 1: Convert types in bracketed syntax [type](size) */
  private convertBracketedTypes(sql: string): string {
    // String types
    sql = sql.replace(/\[nvarchar\]\s*\(\s*max\s*\)/gi, 'TEXT');
    sql = sql.replace(/\[varchar\]\s*\(\s*max\s*\)/gi, 'TEXT');
    sql = sql.replace(/\[nvarchar\]\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    sql = sql.replace(/\[varchar\]\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    sql = sql.replace(/\[nchar\]\s*\(\s*(\d+)\s*\)/gi, 'CHAR($1)');
    sql = sql.replace(/\[char\]\s*\(\s*(\d+)\s*\)/gi, 'CHAR($1)');
    sql = sql.replace(/\[ntext\]/gi, 'TEXT');

    // UUID
    sql = sql.replace(/\[uniqueidentifier\]/gi, 'UUID');

    // Date/time types
    sql = sql.replace(/\[datetimeoffset\]\s*\(\s*\d+\s*\)/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\[datetimeoffset\]/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\[datetime2\]\s*\(\s*\d+\s*\)/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\[datetime2\]/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\[datetime\]/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\[smalldatetime\]/gi, 'TIMESTAMPTZ');

    // Boolean/integer types
    sql = sql.replace(/\[bit\]/gi, 'BOOLEAN');
    sql = sql.replace(/\[tinyint\]/gi, 'SMALLINT');
    sql = sql.replace(/\[int\]/gi, 'INTEGER');
    sql = sql.replace(/\[bigint\]/gi, 'BIGINT');
    sql = sql.replace(/\[smallint\]/gi, 'SMALLINT');

    // Float/decimal types
    sql = sql.replace(/\[float\]\s*\(\s*\d+\s*\)/gi, 'DOUBLE PRECISION');
    sql = sql.replace(/\[float\]/gi, 'DOUBLE PRECISION');
    sql = sql.replace(/\[real\]/gi, 'REAL');
    sql = sql.replace(/\[money\]/gi, 'NUMERIC(19,4)');
    sql = sql.replace(/\[decimal\]\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/gi, 'NUMERIC($1,$2)');
    sql = sql.replace(/\[numeric\]\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/gi, 'NUMERIC($1,$2)');

    // Binary types
    sql = sql.replace(/\[image\]/gi, 'BYTEA');
    sql = sql.replace(/\[varbinary\]\s*\(\s*max\s*\)/gi, 'BYTEA');
    sql = sql.replace(/\[varbinary\]\s*\(\s*\d+\s*\)/gi, 'BYTEA');

    // XML/variant
    sql = sql.replace(/\[xml\]/gi, 'XML');
    sql = sql.replace(/\[sql_variant\]/gi, 'TEXT');
    sql = sql.replace(/\[hierarchyid\]/gi, 'TEXT');

    return sql;
  }

  /** Phase 3: Convert remaining unbracketed type names */
  private convertUnbracketedTypes(sql: string): string {
    sql = sql.replace(/\buniqueid(?:entifier)?\b/gi, 'UUID');
    sql = sql.replace(/\bnvarchar\s*\(\s*max\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bvarchar\s*\(\s*max\s*\)/gi, 'TEXT');
    sql = sql.replace(/\bnvarchar\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    // BIT → BOOLEAN with lookbehind/lookahead to avoid re-quoting "BIT"
    sql = sql.replace(/(?<!")BIT\b(?!")/gi, 'BOOLEAN');
    sql = sql.replace(/\bdatetimeoffset\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bdatetime2\b(?:\s*\(\s*\d+\s*\))?/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bdatetime\b/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\bsmalldatetime\b/gi, 'TIMESTAMPTZ');
    sql = sql.replace(/\btinyint\b/gi, 'SMALLINT');
    sql = sql.replace(/\bfloat\b(?:\s*\(\s*\d+\s*\))?/gi, 'DOUBLE PRECISION');
    sql = sql.replace(/\bmoney\b/gi, 'NUMERIC(19,4)');
    sql = sql.replace(/\bsmallmoney\b/gi, 'NUMERIC(10,4)');
    sql = sql.replace(/\bimage\b/gi, 'BYTEA');
    sql = sql.replace(/\bvarbinary\s*\(\s*max\s*\)/gi, 'BYTEA');
    sql = sql.replace(/\bsql_variant\b/gi, 'TEXT');
    sql = sql.replace(/\bhierarchyid\b/gi, 'TEXT');
    return sql;
  }

  /** Phase 4: Convert constraints and defaults */
  private convertConstraintsAndDefaults(sql: string): string {
    // Remove inline constraint names for defaults
    sql = sql.replace(/\s+CONSTRAINT\s+"[^"]+"\s+DEFAULT/gi, ' DEFAULT');

    // IDENTITY → GENERATED BY DEFAULT AS IDENTITY
    sql = sql.replace(
      /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/gi,
      'GENERATED BY DEFAULT AS IDENTITY'
    );

    // Default function conversions
    sql = sql.replace(/DEFAULT\s+\(?newsequentialid\(\)\)?/gi, 'DEFAULT gen_random_uuid()');
    sql = sql.replace(/DEFAULT\s+\(?newid\(\)\)?/gi, 'DEFAULT gen_random_uuid()');
    sql = sql.replace(/DEFAULT\s+\(?\s*getutcdate\(\)\s*\)?/gi, 'DEFAULT NOW()');
    sql = sql.replace(/DEFAULT\s+\(?\s*getdate\(\)\s*\)?/gi, 'DEFAULT NOW()');
    sql = sql.replace(/DEFAULT\s+\(?\s*sysdatetimeoffset\(\)\s*\)?/gi, 'DEFAULT NOW()');
    sql = sql.replace(/DEFAULT\s+\(?\s*sysutcdatetime\(\)\s*\)?/gi, 'DEFAULT NOW()');
    sql = sql.replace(/DEFAULT\s+\(?\s*suser_s?name\(\)\s*\)?/gi, 'DEFAULT current_user');
    sql = sql.replace(/DEFAULT\s+\(?\s*user_name\(\)\s*\)?/gi, 'DEFAULT current_user');

    // BIT/BOOLEAN column defaults: 0→FALSE, 1→TRUE
    // Handle nested parens like DEFAULT ((0)) or DEFAULT (((0)))
    sql = sql.replace(/DEFAULT\s+\(+0\)+/gi, 'DEFAULT FALSE');
    sql = sql.replace(/DEFAULT\s+\(+1\)+/gi, 'DEFAULT TRUE');
    // With N-prefix strings: DEFAULT ((N'0')) → FALSE, ((N'1')) → TRUE
    sql = sql.replace(/DEFAULT\s+\(+N?'0'\)+/gi, 'DEFAULT FALSE');
    sql = sql.replace(/DEFAULT\s+\(+N?'1'\)+/gi, 'DEFAULT TRUE');

    // String defaults with nested parens: DEFAULT ((N'value')) → DEFAULT 'value'
    sql = sql.replace(/DEFAULT\s+\(+N?'([^']*)'\)+/gi, "DEFAULT '$1'");

    // Numeric defaults with nested parens: DEFAULT ((42)) → DEFAULT 42
    sql = sql.replace(/DEFAULT\s+\(+(-?\d+(?:\.\d+)?)\)+/g, 'DEFAULT $1');

    // Remove N prefix from remaining string literals
    sql = sql.replace(/(?<![a-zA-Z])N'/g, "'");

    return sql;
  }

  /** Track column names and their PG types for INSERT boolean casting */
  private trackColumnTypes(sql: string, context: ConversionContext): void {
    // Extract table name from CREATE TABLE __mj."TableName"
    const tableMatch = sql.match(/CREATE\s+TABLE\s+(?:__mj\.)?"?(\w+)"?\s*\(/i);
    if (!tableMatch) return;

    const tableName = tableMatch[1].toLowerCase();
    const columns = new Map<string, string>();

    // Parse column definitions (simple line-by-line approach)
    const lines = sql.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Match: "ColumnName" TYPE ... or ColumnName TYPE ...
      const colMatch = trimmed.match(/^"?(\w+)"?\s+(UUID|BOOLEAN|TIMESTAMPTZ|TEXT|VARCHAR\(\d+\)|CHAR\(\d+\)|INTEGER|BIGINT|SMALLINT|DOUBLE PRECISION|REAL|NUMERIC\([^)]+\)|BYTEA|XML)\b/i);
      if (colMatch) {
        columns.set(colMatch[1].toLowerCase(), colMatch[2].toUpperCase());
      }
    }

    if (columns.size > 0) {
      context.TableColumns.set(tableName, columns);
    }
  }
}
