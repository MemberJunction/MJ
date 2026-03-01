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
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_TABLE'];
  Priority = 10;
  BypassSqlglot = true;

  /** SQL keywords and PG types that should NOT be quoted as column names */
  private static readonly RESERVED_WORDS = new Set([
    'NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
    'CONSTRAINT', 'CHECK', 'UNIQUE', 'INDEX', 'ON', 'CASCADE', 'SET',
    'IN', 'AND', 'OR', 'AS', 'IF', 'THEN', 'ELSE', 'BEGIN', 'END',
    'TABLE', 'CREATE', 'ALTER', 'DROP', 'INSERT', 'INTO', 'VALUES',
    'UUID', 'BOOLEAN', 'TIMESTAMPTZ', 'TEXT', 'INTEGER', 'BIGINT',
    'SMALLINT', 'VARCHAR', 'CHAR', 'DOUBLE', 'PRECISION', 'REAL',
    'NUMERIC', 'BYTEA', 'XML', 'SERIAL', 'GENERATED', 'BY', 'IDENTITY',
    'TRUE', 'FALSE', 'DEFERRABLE', 'INITIALLY', 'DEFERRED', 'NOW',
    'LIKE', 'SIMILAR', 'TO', 'RESTRICT', 'NO', 'ACTION', 'DELETE',
    'UPDATE', 'ADD', 'COLUMN', 'WITH', 'NOCHECK', 'VALID',
  ]);

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    let result = sql;

    // Phase 1: Bracketed type conversions (before identifier conversion)
    result = this.convertBracketedTypes(result);

    // Phase 2: Identifier conversion (brackets → quotes)
    result = convertIdentifiers(result);

    // Phase 3: Unbracketed type conversions (broad word-boundary patterns)
    result = this.convertUnbracketedTypes(result);

    // Phase 4: Constraint and default handling
    result = this.convertConstraintsAndDefaults(result);

    // Phase 5: Remove SQL Server keywords (BEFORE column quoting so
    // CLUSTERED/NONCLUSTERED don't block the PK/UNIQUE constraint regex)
    result = result.replace(/\bCLUSTERED\b/gi, '');
    result = result.replace(/\bNONCLUSTERED\b/gi, '');

    // Phase 5a: Quote unquoted PascalCase column names (AFTER type conversion
    // and AFTER CLUSTERED removal so the PK regex matches correctly)
    result = this.quoteColumnDefinitions(result);

    // Remove ON [PRIMARY] / ON "PRIMARY" filegroup clause
    result = result.replace(/\)\s*ON\s+\[?PRIMARY\]?\s*;?/gi, ');');
    result = result.replace(/\bON\s+"PRIMARY"/g, '');
    // Remove ASC/DESC in PRIMARY KEY definitions
    result = result.replace(/(PRIMARY\s+KEY\s*\([^)]*)\b(ASC|DESC)\b/gi, '$1');
    // Remove TEXTIMAGE_ON filegroup
    result = result.replace(/\bTEXTIMAGE_ON\s+\[?\w+\]?/gi, '');
    // Remove WITH (PAD_INDEX = ...) etc.
    result = result.replace(/\bWITH\s*\(\s*PAD_INDEX\s*=\s*\w+[^)]*\)/gi, '');
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
    // BIT → BOOLEAN: must be a standalone word (not inside 'Debit' etc.)
    sql = sql.replace(/(?<![\w"])BIT(?![\w"])/gi, 'BOOLEAN');
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

  /** Keywords that should NOT be quoted inside CHECK constraint bodies */
  private static readonly CHECK_BODY_KEYWORDS = new Set([
    'IN', 'IS', 'NULL', 'NOT', 'OR', 'AND', 'LIKE', 'BETWEEN',
    'TRUE', 'FALSE', 'CHECK', 'CONSTRAINT', 'SIMILAR', 'TO',
  ]);

  /**
   * Quote unquoted PascalCase column names in CREATE TABLE column definitions,
   * constraint column references, and CHECK constraint bodies.
   */
  private quoteColumnDefinitions(sql: string): string {
    const lines = sql.split('\n');
    const result: string[] = [];
    let insideCreateTable = false;
    let parenDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      if (/^CREATE\s+(?:TEMP\s+)?TABLE\b/i.test(trimmed)) {
        insideCreateTable = true;
        parenDepth = 0;
      }

      if (insideCreateTable) {
        for (const ch of trimmed) {
          if (ch === '(') parenDepth++;
          if (ch === ')') parenDepth--;
        }

        // Column definitions: ColName TYPE ... (includes both PG and SQL Server type
        // names since type conversion may not have run yet at this phase)
        if (parenDepth >= 1) {
          const colMatch = trimmed.match(/^([A-Za-z_]\w*)\s+(UUID|BOOLEAN|TIMESTAMPTZ|TEXT|VARCHAR|NVARCHAR|CHAR|NCHAR|INTEGER|INT|BIGINT|SMALLINT|TINYINT|DOUBLE|FLOAT|REAL|NUMERIC|DECIMAL|MONEY|BYTEA|IMAGE|VARBINARY|XML|BIT|UNIQUEIDENTIFIER|DATETIMEOFFSET|DATETIME2|DATETIME|DATE|TIME|SERIAL|JSON|JSONB|GENERATED)\b/i);
          if (colMatch && !trimmed.startsWith('"') && !trimmed.startsWith('CONSTRAINT')) {
            const colName = colMatch[1];
            if (/[A-Z]/.test(colName)) {
              result.push(line.replace(colName, `"${colName}"`));
              continue;
            }
          }
        }

        if (parenDepth <= 0 && trimmed.includes(')')) {
          insideCreateTable = false;
        }
      }

      result.push(line);
    }

    let joined = result.join('\n');

    // Quote column references inside PK/UNIQUE/FK constraint parentheses
    joined = joined.replace(
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

    // REFERENCES [schema.]table(Column) — handle arbitrary schema-qualified table names
    joined = joined.replace(
      /(REFERENCES\s+(?:\w+\.)?(?:"[^"]+"|\w+)\s*\()([A-Za-z_]\w*)(\))/gi,
      (_match, prefix: string, colName: string, suffix: string) => {
        if (/[A-Z]/.test(colName)) return `${prefix}"${colName}"${suffix}`;
        return _match;
      }
    );

    // Quote ALL bare PascalCase identifiers in CHECK constraint bodies
    joined = this.quoteCheckIdentifiers(joined);

    return joined;
  }

  /** Quote all unquoted PascalCase column identifiers inside CHECK (...) blocks.
   *  String-literal-aware: preserves values inside single quotes. */
  private quoteCheckIdentifiers(sql: string): string {
    const checkRegex = /CHECK\s*\(/gi;
    let match: RegExpExecArray | null;
    const replacements: Array<{ start: number; end: number; body: string }> = [];

    while ((match = checkRegex.exec(sql)) !== null) {
      const parenStart = sql.indexOf('(', match.index + 5);
      if (parenStart < 0) continue;
      const parenEnd = CreateTableRule.findMatchingParen(sql, parenStart);
      if (parenEnd < 0) continue;

      const body = sql.slice(parenStart + 1, parenEnd);
      replacements.push({ start: parenStart + 1, end: parenEnd, body });
    }

    let result = sql;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { start, end, body } = replacements[i];
      // Split into string/non-string segments to preserve string literal values
      const quotedBody = CreateTableRule.quoteCheckBody(body);
      result = result.slice(0, start) + quotedBody + result.slice(end);
    }

    return result;
  }

  /** Quote PascalCase identifiers in CHECK body, preserving string literals */
  private static quoteCheckBody(body: string): string {
    const segments: string[] = [];
    let current = '';
    let inString = false;

    for (let i = 0; i < body.length; i++) {
      if (body[i] === "'") {
        if (inString) {
          if (i + 1 < body.length && body[i + 1] === "'") {
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
        current += body[i];
      }
    }
    if (current) segments.push(current);

    return segments.map(seg => {
      if (seg.startsWith("'")) return seg; // String literal — don't touch
      return seg.replace(
        /(?<!")\b([A-Z][a-zA-Z_]\w*)\b(?!")/g,
        (m, name: string) => {
          if (CreateTableRule.CHECK_BODY_KEYWORDS.has(name.toUpperCase())) return m;
          return `"${name}"`;
        }
      );
    }).join('');
  }

  /** Find matching closing paren, respecting nesting and string literals */
  private static findMatchingParen(sql: string, openPos: number): number {
    let depth = 0;
    let inString = false;
    for (let i = openPos; i < sql.length; i++) {
      const ch = sql[i];
      if (inString) {
        if (ch === "'" && i + 1 < sql.length && sql[i + 1] === "'") { i++; }
        else if (ch === "'") { inString = false; }
        continue;
      }
      if (ch === "'") { inString = true; }
      else if (ch === '(') { depth++; }
      else if (ch === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
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

    // Context-aware DEFAULT (0)/(1) conversion.
    // BOOLEAN columns: DEFAULT (0) / DEFAULT 0 → DEFAULT FALSE, (1) / 1 → DEFAULT TRUE
    // Other types: DEFAULT (0) → DEFAULT 0, (1) → DEFAULT 1
    sql = sql.split('\n').map(line => {
      const isBool = /\bBOOLEAN\b/i.test(line);
      if (isBool) {
        line = line.replace(/DEFAULT\s+\(+0\)+/gi, 'DEFAULT FALSE');
        line = line.replace(/DEFAULT\s+\(+1\)+/gi, 'DEFAULT TRUE');
        line = line.replace(/DEFAULT\s+\(+N?'0'\)+/gi, 'DEFAULT FALSE');
        line = line.replace(/DEFAULT\s+\(+N?'1'\)+/gi, 'DEFAULT TRUE');
        // Handle bare DEFAULT 0 / DEFAULT 1 (no parens, common in newer migrations)
        line = line.replace(/DEFAULT\s+0(?=\s|,|$)/gi, 'DEFAULT FALSE');
        line = line.replace(/DEFAULT\s+1(?=\s|,|$)/gi, 'DEFAULT TRUE');
      } else {
        line = line.replace(/DEFAULT\s+\(+0\)+/gi, 'DEFAULT 0');
        line = line.replace(/DEFAULT\s+\(+1\)+/gi, 'DEFAULT 1');
        line = line.replace(/DEFAULT\s+\(+N?'0'\)+/gi, "DEFAULT '0'");
        line = line.replace(/DEFAULT\s+\(+N?'1'\)+/gi, "DEFAULT '1'");
      }
      return line;
    }).join('\n');

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
    // Extract table name from CREATE TABLE schema."TableName"
    const tableMatch = sql.match(/CREATE\s+(?:TEMP\s+)?TABLE\s+(?:\w+\.)?"?(\w+)"?\s*\(/i);
    if (!tableMatch) return;

    const tableName = tableMatch[1].toLowerCase();
    const columns = new Map<string, string>();

    // Parse column definitions (simple line-by-line approach)
    const lines = sql.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Match: "ColumnName" TYPE ... or ColumnName TYPE ...
      const colMatch = trimmed.match(/^"?(\w+)"?\s+(UUID|BOOLEAN|TIMESTAMPTZ|TEXT|VARCHAR\(\d+\)|CHAR\(\d+\)|INTEGER|BIGINT|SMALLINT|DOUBLE PRECISION|REAL|NUMERIC\([^)]+\)|BYTEA|XML|TIME)(?=[\s,)]|$)/i);
      if (colMatch) {
        columns.set(colMatch[1].toLowerCase(), colMatch[2].toUpperCase());
      }
    }

    if (columns.size > 0) {
      context.TableColumns.set(tableName, columns);
    }
  }
}
