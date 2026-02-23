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

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
