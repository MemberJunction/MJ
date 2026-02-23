import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  convertIdentifiers, removeNPrefix, removeCollate, convertCastTypes,
  quotePascalCaseIdentifiers, convertCommonFunctions, convertStringConcat,
  convertCharIndex, convertStuff, convertConvertFunction, convertIIF,
} from './ExpressionHelpers.js';

export class InsertRule implements IConversionRule {
  Name = 'InsertRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['INSERT', 'UPDATE', 'DELETE'];
  Priority = 50;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeNPrefix(result);
    result = removeCollate(result);
    // Function conversions BEFORE quoting (prevents "LEN", "SUBSTRING" etc. from being quoted)
    result = convertCommonFunctions(result);
    result = convertStringConcat(result);
    result = convertCharIndex(result);
    result = convertStuff(result);
    result = convertConvertFunction(result);
    result = convertIIF(result);
    result = convertCastTypes(result);
    // Quote bare PascalCase identifiers (column names in INSERT/UPDATE/DELETE)
    result = quotePascalCaseIdentifiers(result);
    // Ensure semicolon
    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
