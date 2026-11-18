import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { ConvertIdentifiers } from './ExpressionHelpers.js';

/**
 * Quote one entry of an index column list when it is an unquoted PascalCase identifier, keeping any
 * sort modifier that follows it (`ASC`/`DESC`, optionally `NULLS FIRST|LAST`).
 *
 * The modifier is why this is not a bare-identifier test: `StartedAt DESC` is one list entry, and a
 * test for `^[A-Za-z_]\w*$` against the whole entry left it unquoted, so PostgreSQL folded it to
 * `startedat` and the CREATE INDEX failed with `column "startedat" does not exist`.
 *
 * @param entry - One comma-separated entry, with its surrounding whitespace.
 * @returns The entry with its identifier quoted, or unchanged when it needs no quoting.
 */
export function QuoteIndexColumn(entry: string): string {
  const match = entry.match(/^(\s*)([A-Za-z_]\w*)((?:\s+(?:ASC|DESC))?(?:\s+NULLS\s+(?:FIRST|LAST))?\s*)$/i);
  if (!match) return entry;
  const [, lead, ident, modifier] = match;
  if (!/[A-Z]/.test(ident)) return entry;
  return `${lead}"${ident}"${modifier}`;
}

export class CreateIndexRule implements IConversionRule {
  Name = 'CreateIndexRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_INDEX'];
  Priority = 70;
  BypassSqlglot = true;
  BypassJustification = 'Custom output adds CREATE INDEX IF NOT EXISTS for idempotency, strips T-SQL filegroup syntax (ON [PRIMARY]), removes WITH NOCHECK, truncates index names to PG\'s 63-char limit (with hash suffix), and quotes column names with PascalCase. sqlglot does not apply MJ\'s naming conventions or idempotency wrappers.';

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = ConvertIdentifiers(sql);

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

    // Quote PascalCase column names inside index column lists
    // Matches: table("Col1", Col2) or table(Col1, Col2 DESC) — quote unquoted PascalCase identifiers
    result = result.replace(
      /(ON\s+\S+\s*\()([^)]+)(\))/gi,
      (_match, prefix: string, cols: string, suffix: string) => {
        const quotedCols = cols.split(',').map(QuoteIndexColumn).join(',');
        return `${prefix}${quotedCols}${suffix}`;
      }
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
