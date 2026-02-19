import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeNPrefix, removeCollate, convertCastTypes } from './ExpressionHelpers.js';

export class InsertRule implements IConversionRule {
  Name = 'InsertRule';
  AppliesTo: StatementType[] = ['INSERT', 'UPDATE', 'DELETE'];
  Priority = 50;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeNPrefix(result);
    result = removeCollate(result);
    // Common function replacements
    result = result.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
    result = result.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()');
    result = result.replace(/\bNEWID\s*\(\s*\)/gi, 'gen_random_uuid()');
    result = result.replace(/\bNEWSEQUENTIALID\s*\(\s*\)/gi, 'gen_random_uuid()');
    // CAST type conversions
    result = convertCastTypes(result);
    // Ensure semicolon
    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
