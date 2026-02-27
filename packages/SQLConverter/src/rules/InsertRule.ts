import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  convertIdentifiers, removeNPrefix, removeCollate, convertCastTypes,
  quotePascalCaseIdentifiers, convertCommonFunctions, convertStringConcat,
  convertCharIndex, convertStuff, convertConvertFunction, convertIIF, convertTopToLimit,
} from './ExpressionHelpers.js';

export class InsertRule implements IConversionRule {
  Name = 'InsertRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['INSERT', 'UPDATE', 'DELETE'];
  Priority = 50;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeNPrefix(result);
    result = removeCollate(result);
    // Function conversions BEFORE quoting (prevents "LEN", "SUBSTRING" etc. from being quoted)
    result = convertCommonFunctions(result);
    result = convertStringConcat(result, context.TableColumns);
    result = convertCharIndex(result);
    result = convertStuff(result);
    result = convertConvertFunction(result);
    result = convertIIF(result);
    result = convertCastTypes(result);
    // Convert SELECT TOP N subqueries to SELECT ... LIMIT N
    result = convertTopToLimit(result);
    // Quote column names in INSERT INTO table (col1, col2, ...) — these are always column
    // names even if they collide with SQL keywords (e.g. Language, Condition, Action)
    result = this.quoteInsertColumnList(result);
    // Quote bare PascalCase identifiers (column names in INSERT/UPDATE/DELETE)
    result = quotePascalCaseIdentifiers(result);
    // Ensure semicolon after the actual SQL statement (not after trailing comments).
    // T-SQL batches may include trailing block comments like /* Set field properties */
    // that belong to the next batch.  A semicolon placed after the comment leaves the
    // UPDATE/INSERT/DELETE unterminated.
    result = result.trimEnd();
    const trailingComment = result.match(/(\s*\/\*[\s\S]*?\*\/\s*)$/);
    if (trailingComment) {
      const comment = trailingComment[1];
      const sqlPart = result.slice(0, -comment.length).trimEnd();
      if (!sqlPart.endsWith(';')) {
        result = sqlPart + ';\n' + comment.trim();
      }
    } else {
      if (!result.endsWith(';')) result += ';';
    }
    return result + '\n';
  }

  /** Quote all bare PascalCase column names in the INSERT INTO ... (...) column list.
   *  Column names in this position are always identifiers, never SQL keywords. */
  private quoteInsertColumnList(sql: string): string {
    return sql.replace(
      /(INSERT\s+INTO\s+\S+\s*\()([^)]+)(\))/gi,
      (_match, prefix: string, cols: string, suffix: string) => {
        const quoted = cols.split(',').map(col => {
          const trimmed = col.trim();
          // Already quoted
          if (trimmed.startsWith('"')) return col;
          // Has uppercase and is a valid identifier — quote it
          if (/^[A-Za-z_]\w*$/.test(trimmed) && /[A-Z]/.test(trimmed)) {
            return col.replace(trimmed, `"${trimmed}"`);
          }
          return col;
        }).join(',');
        return `${prefix}${quoted}${suffix}`;
      }
    );
  }
}
