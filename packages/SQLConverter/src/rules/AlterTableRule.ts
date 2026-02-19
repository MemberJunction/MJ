import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeCollate } from './ExpressionHelpers.js';

export class AlterTableRule implements IConversionRule {
  Name = 'AlterTableRule';
  AppliesTo: StatementType[] = ['FK_CONSTRAINT', 'PK_CONSTRAINT', 'CHECK_CONSTRAINT', 'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT', 'ALTER_TABLE'];
  Priority = 60;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeCollate(result);

    // Remove CLUSTERED/NONCLUSTERED
    result = result.replace(/\bCLUSTERED\b/gi, '');
    result = result.replace(/\bNONCLUSTERED\b/gi, '');

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

    // Remove N prefix from strings
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
