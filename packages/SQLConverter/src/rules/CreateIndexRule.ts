import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { ConvertIdentifiers, NeedsHandAuthoring } from './ExpressionHelpers.js';

/** `DROP INDEX [IF EXISTS] name ON table`, after identifier conversion. One index per statement. */
const DROP_INDEX_ON_TABLE = /^DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\w+)\s+ON\s+([^\s;(,]+)\s*;?$/i;

/**
 * T-SQL `DROP INDEX name ON [schema].[table]` → PostgreSQL `DROP INDEX IF EXISTS schema."name";`.
 * PostgreSQL has no `ON` clause: an index lives in its table's schema and is dropped by
 * schema-qualified name (issue #5955). Takes SQL whose identifiers are already converted and
 * returns null for any other shape (a comma list of indexes, the `table.index` form).
 */
export function ConvertDropIndex(sql: string): string | null {
  const m = sql.trim().match(DROP_INDEX_ON_TABLE);
  if (!m) return null;
  const name = m[1].replace(/^"|"$/g, '');
  const schema = m[2].match(/^(.+)\.(?:"[^"]+"|\w+)$/)?.[1];
  return `DROP INDEX IF EXISTS ${schema ? `${schema}.` : ''}"${name}";`;
}

/**
 * Quote one entry of an index column list when PostgreSQL would otherwise fold it to lowercase:
 * a name with an upper-case letter, or one of MJ's `__mj_` columns. A trailing `ASC`/`DESC` stays
 * outside the quotes. Before, only an entry that was a bare identifier was quoted, so
 * `Name ASC` and `__mj_CreatedAt DESC` reached PostgreSQL unquoted (issue #5567).
 */
export function QuoteIndexColumn(entry: string): string {
  const m = entry.match(/^(\s*)([A-Za-z_]\w*)(\s+(?:ASC|DESC))?(\s*)$/i);
  if (!m) return entry;
  const [, lead, name, direction = '', trail] = m;
  if (!/[A-Z]/.test(name) && !/^__mj_/i.test(name)) return entry;
  return `${lead}"${name}"${direction}${trail}`;
}

export class CreateIndexRule implements IConversionRule {
  Name = 'CreateIndexRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_INDEX', 'DROP_INDEX'];
  Priority = 70;
  BypassSqlglot = true;
  BypassJustification = 'Custom output adds CREATE INDEX IF NOT EXISTS for idempotency, strips T-SQL filegroup syntax (ON [PRIMARY]), removes WITH NOCHECK, truncates index names to PG\'s 63-char limit (with hash suffix), and quotes column names with PascalCase. sqlglot does not apply MJ\'s naming conventions or idempotency wrappers.';

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = ConvertIdentifiers(sql);
    if (/^\s*DROP\s+INDEX\b/i.test(result)) {
      return (ConvertDropIndex(result) ?? NeedsHandAuthoring('DROP INDEX', 'only `DROP INDEX name ON table` converts', sql).trimEnd()) + '\n';
    }

    // Remove CLUSTERED/NONCLUSTERED
    result = result.replace(/\bCLUSTERED\b/gi, '');
    result = result.replace(/\bNONCLUSTERED\b/gi, '');

    // Remove WITH (PAD_INDEX = ..., ...) option blocks
    result = result.replace(/\s*WITH\s*\([^)]+\)/gi, '');

    // Remove ON [filegroup]
    result = result.replace(/\s+ON\s+"?\w+"?\s*$/gi, '');

    // INCLUDE (cols) → comment (PG supports INCLUDE since v11, but keep it simple)
    result = result.replace(/\s*INCLUDE\s*\([^)]+\)/gi, '');

    // Remove WHERE ... filter for filtered indexes (PG syntax is different)
    // Actually PG supports WHERE, but the SQL Server syntax may need adjustment
    // Keep WHERE clauses as they are, but fix boolean values
    result = result.replace(/=\s*\(1\)/g, '=TRUE');
    result = result.replace(/=\s*\(0\)/g, '=FALSE');

    // Quote an unquoted index name, as the split path does: PostgreSQL folds a bare `IX_Foo_Name`
    // to lowercase, and a later quoted `DROP INDEX … "IX_Foo_Name"` then misses it (issue #5567).
    result = result.replace(
      /^(\s*CREATE\s+(?:UNIQUE\s+)?\s*INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?)([A-Za-z_]\w*)(?=\s+ON\b)/i,
      (_match, head: string, name: string) => `${head}"${name}"`
    );

    // Quote PascalCase column names inside index column lists
    // Matches: table("Col1", Col2 DESC) or table(Col1) — quote unquoted PascalCase identifiers
    result = result.replace(
      /(ON\s+\S+\s*\()([^)]+)(\))/gi,
      (_match, prefix: string, cols: string, suffix: string) =>
        `${prefix}${cols.split(',').map(QuoteIndexColumn).join(',')}${suffix}`
    );

    // Quote PascalCase identifiers in WHERE clause of filtered indexes
    // Must avoid quoting words inside single-quoted string literals
    result = result.replace(
      /(\bWHERE\s+)([\s\S]+)$/i,
      (_match, whereKw: string, clause: string) => {
        // Split clause into string-literal tokens and non-literal tokens
        // to avoid quoting identifiers inside 'string literals'
        const parts = clause.split(/('(?:[^'\\]|\\.)*')/);
        const quotedClause = parts.map((part, i) => {
          // Odd-indexed parts are inside single quotes — leave them alone
          if (i % 2 === 1) return part;
          // Even-indexed parts are outside quotes — quote PascalCase identifiers
          return part.replace(/(?<!")(?<!\w)([A-Z][a-zA-Z_]\w*)(?!")(?!\w)/g, (m, word: string) => {
            const upper = word.toUpperCase();
            if (['IS', 'NOT', 'NULL', 'AND', 'OR', 'TRUE', 'FALSE', 'IN', 'BETWEEN', 'LIKE'].includes(upper)) return m;
            return `"${word}"`;
          });
        }).join('');
        return `${whereKw}${quotedClause}`;
      }
    );

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
