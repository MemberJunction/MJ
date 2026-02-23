import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers } from './ExpressionHelpers.js';

export class CreateIndexRule implements IConversionRule {
  Name = 'CreateIndexRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_INDEX'];
  Priority = 70;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);

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
    // Matches: table("Col1", Col2) or table(Col1) — quote unquoted PascalCase identifiers
    result = result.replace(
      /(ON\s+\S+\s*\()([^)]+)(\))/gi,
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

    // Quote PascalCase identifiers in WHERE clause of filtered indexes
    result = result.replace(
      /(\bWHERE\s+)([\s\S]+)$/i,
      (_match, whereKw: string, clause: string) => {
        // Quote bare PascalCase identifiers that aren't already quoted
        const quotedClause = clause.replace(/(?<!")(?<!\w)([A-Z][a-zA-Z_]\w*)(?!")(?!\w)/g, (m, word: string) => {
          const upper = word.toUpperCase();
          if (['IS', 'NOT', 'NULL', 'AND', 'OR', 'TRUE', 'FALSE', 'IN', 'BETWEEN', 'LIKE'].includes(upper)) return m;
          return `"${word}"`;
        });
        return `${whereKw}${quotedClause}`;
      }
    );

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
