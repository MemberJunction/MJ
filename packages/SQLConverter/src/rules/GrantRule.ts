import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers } from './ExpressionHelpers.js';

export class GrantRule implements IConversionRule {
  Name = 'GrantRule';
  AppliesTo: StatementType[] = ['GRANT', 'REVOKE'];
  Priority = 80;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    // Remove N prefix from strings
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");
    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
