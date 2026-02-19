import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers } from './ExpressionHelpers.js';

export class GrantRule implements IConversionRule {
  Name = 'GrantRule';
  AppliesTo: StatementType[] = ['GRANT', 'REVOKE'];
  Priority = 80;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    // Remove N prefix from strings
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

    // Check if this is a GRANT/REVOKE EXECUTE (function/procedure)
    const isExecuteGrant = /\b(?:GRANT|REVOKE)\s+EXECUTE\b/i.test(result);

    if (isExecuteGrant) {
      // Extract the target object name to check if it was created
      const nameMatch = result.match(/EXECUTE\s+ON\s+(?:FUNCTION\s+)?(?:\w+\.)?"?(\w+)"?\s+TO/i);
      if (nameMatch) {
        const objName = nameMatch[1];
        if (!context.CreatedFunctions.has(objName)) {
          // Function was skipped/not created — comment out the grant
          return `-- SKIPPED (function not created): ${result.trim()}\n`;
        }
      }

      // PostgreSQL requires FUNCTION keyword for GRANT/REVOKE EXECUTE
      result = result.replace(
        /\b(GRANT\s+EXECUTE\s+ON)\s+(?!FUNCTION\b)/i,
        '$1 FUNCTION '
      );
      result = result.replace(
        /\b(REVOKE\s+EXECUTE\s+ON)\s+(?!FUNCTION\b)/i,
        '$1 FUNCTION '
      );
    } else {
      // GRANT SELECT/INSERT/etc. — check if the target view/table exists
      const nameMatch = result.match(/(?:GRANT|REVOKE)\s+\w+\s+ON\s+(?:\w+\.)?"?(\w+)"?\s+TO/i);
      if (nameMatch) {
        const objName = nameMatch[1];
        // If it starts with vw and isn't in CreatedViews, skip it
        if (objName.startsWith('vw') && !context.CreatedViews.has(objName)) {
          return `-- SKIPPED (view not created): ${result.trim()}\n`;
        }
      }
    }

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
