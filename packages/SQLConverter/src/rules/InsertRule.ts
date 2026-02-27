import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  convertIdentifiers, removeNPrefix, removeCollate, convertCastTypes,
  quotePascalCaseIdentifiers, convertCommonFunctions, convertStringConcat,
  convertCharIndex, convertStuff, convertConvertFunction, convertIIF, convertTopToLimit,
} from './ExpressionHelpers.js';

/** Strip trailing comments (both line -- and block /* *‌/) from a SQL string.
 *  Returns the bare SQL and the stripped comment text separately. */
function stripTrailingComments(input: string): { sql: string; comments: string } {
  let s = input.trimEnd();
  const commentParts: string[] = [];

  // Iteratively strip trailing block comments then line comments
  let changed = true;
  while (changed) {
    changed = false;
    // Block comment at the end: /* ... */
    const blockMatch = s.match(/(\s*\/\*[\s\S]*?\*\/\s*)$/);
    if (blockMatch) {
      commentParts.unshift(blockMatch[1].trim());
      s = s.slice(0, -blockMatch[1].length).trimEnd();
      changed = true;
    }
    // Line comment(s) at the end: lines starting with --
    while (/\n--[^\n]*$/.test(s) || /^--[^\n]*$/.test(s)) {
      const lineMatch = s.match(/((?:\n--[^\n]*)+)$/);
      if (lineMatch) {
        commentParts.unshift(lineMatch[1].trim());
        s = s.slice(0, -lineMatch[1].length).trimEnd();
        changed = true;
      } else {
        break;
      }
    }
  }

  return { sql: s, comments: commentParts.join('\n') };
}

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
    // Quote bare schema.Name references (e.g. __mj.vwFoo → __mj."vwFoo")
    const schema = context.Schema;
    if (schema) {
      const bareSchemaRef = new RegExp(`\\b${schema}\\.(?!")((?:vw)?[A-Za-z]\\w+)\\b`, 'g');
      result = result.replace(bareSchemaRef, `${schema}."$1"`);
    }
    // Quote column names in INSERT INTO table (col1, col2, ...) — these are always column
    // names even if they collide with SQL keywords (e.g. Language, Condition, Action)
    result = this.quoteInsertColumnList(result);
    // Quote __mj_ prefixed columns (e.g. __mj_UpdatedAt, __mj_CreatedAt) — these start
    // with underscores so quotePascalCaseIdentifiers (which requires [A-Z] start) misses them
    result = result.replace(/(?<!")\b(__mj_[A-Za-z]\w*)\b(?!")/g, '"$1"');
    // Quote bare PascalCase identifiers (column names in INSERT/UPDATE/DELETE)
    result = quotePascalCaseIdentifiers(result);
    // Ensure semicolon after the actual SQL statement (not after trailing comments).
    // T-SQL batches may include trailing block comments and/or line comments that
    // contain semicolons (e.g. -- ${flyway:timestamp};). Strip ALL trailing comments
    // to find the real end of the SQL statement, add semicolon there, then re-append.
    result = result.trimEnd();
    const { sql: sqlPart, comments: trailingComments } = stripTrailingComments(result);
    if (!sqlPart.endsWith(';')) {
      result = sqlPart + ';';
      if (trailingComments) result += '\n' + trailingComments;
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
