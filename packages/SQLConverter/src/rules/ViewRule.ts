/**
 * CREATE VIEW conversion rule: T-SQL → PostgreSQL.
 * Ported from Python convert_create_view() function.
 *
 * Handles: OUTER APPLY → LEFT JOIN LATERAL, ISNULL → COALESCE,
 * TOP → LIMIT, PascalCase column quoting, schema normalization, etc.
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  convertIdentifiers, convertDateFunctions, convertCharIndex, convertStuff,
  convertStringConcat, convertTopToLimit, convertCastTypes, convertIIF,
  convertConvertFunction, removeNPrefix, removeCollate, convertCommonFunctions,
} from './ExpressionHelpers.js';

/** SQL keywords that should NOT be quoted as column references */
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'IS', 'NULL', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'CROSS', 'FULL', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'ORDER', 'BY', 'GROUP',
  'HAVING', 'LIMIT', 'OFFSET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST',
  'COALESCE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'TOP', 'INTO',
  'VALUES', 'SET', 'UPDATE', 'DELETE', 'INSERT', 'CREATE', 'ALTER', 'DROP',
  'TABLE', 'VIEW', 'INDEX', 'TRIGGER', 'FUNCTION', 'PROCEDURE', 'IF', 'BEGIN',
  'DECLARE', 'RETURN', 'WITH', 'RECURSIVE', 'TRUE', 'FALSE', 'BOOLEAN',
  'INTEGER', 'TEXT', 'VARCHAR', 'UUID', 'TIMESTAMPTZ', 'DATE', 'TIME',
  'TIMESTAMP', 'NUMERIC', 'FLOAT', 'DOUBLE', 'PRECISION', 'SMALLINT', 'BIGINT',
  'SERIAL', 'BYTEA', 'CHAR', 'NVARCHAR', 'LATERAL', 'OVER', 'PARTITION',
  'ROW', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT',
  'EXTRACT', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'NOW',
  'LENGTH', 'POSITION', 'SUBSTRING', 'TRIM', 'LOWER', 'UPPER', 'REPLACE',
  'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'FOR', 'EACH', 'AFTER', 'BEFORE',
  'INSTEAD', 'OF', 'EXECUTE', 'PERFORM', 'RAISE', 'NOTICE', 'EXCEPTION',
  'SCHEMA', 'CONSTRAINT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CHECK',
  'UNIQUE', 'DEFAULT', 'IDENTITY', 'GENERATED', 'ALWAYS', 'INTERVAL',
  'ENUM', 'ARRAY', 'RECORD', 'SETOF', 'RETURNS',
]);

export class ViewRule implements IConversionRule {
  Name = 'ViewRule';
  AppliesTo: StatementType[] = ['CREATE_VIEW'];
  Priority = 20;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = sql;

    // Skip views that reference sys.* (SQL Server system views)
    if (/\bsys\.\w+/i.test(result)) {
      return `-- SKIPPED: View references SQL Server system tables\n-- ${result.slice(0, 200).replace(/\n/g, '\n-- ')}...\n`;
    }

    // Skip views referencing flyway
    if (/flyway/i.test(result)) {
      return `-- SKIPPED: View references Flyway\n-- ${result.slice(0, 200).replace(/\n/g, '\n-- ')}...\n`;
    }

    // Identifier conversion
    result = convertIdentifiers(result);

    // Schema normalization: "__mj".Name → __mj."Name"
    result = result.replace(/"__mj"\.(?!")/g, '__mj.');
    // Quote unquoted table references after __mj.
    result = result.replace(/\b__mj\.(?!")((?:vw)?[A-Za-z]\w+)\b/g, '__mj."$1"');
    // Add schema to bare view references: FROM vwXxx → FROM __mj."vwXxx"
    result = result.replace(/(\bFROM\s+)(vw\w+)\b/gi, '$1__mj."$2"');
    result = result.replace(/(\bJOIN\s+)(vw\w+)\b/gi, '$1__mj."$2"');

    // PascalCase column and alias quoting
    result = this.quoteColumnRefs(result);
    result = this.quoteBareColumnAliases(result);
    result = this.quoteAsAliases(result);
    result = this.quoteBareIdentifiers(result);

    // Expression conversions
    result = removeNPrefix(result);
    result = convertCommonFunctions(result);
    result = convertCastTypes(result);
    result = convertStringConcat(result);
    result = convertTopToLimit(result);
    result = removeCollate(result);
    result = convertDateFunctions(result);
    result = convertCharIndex(result);
    result = convertStuff(result);
    result = convertIIF(result);
    result = convertConvertFunction(result);

    // STRING_AGG WITHIN GROUP rewriting
    result = result.replace(
      /STRING_AGG\s*\(([^)]+)\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY\s+([^)]+)\)/gi,
      'STRING_AGG($1 ORDER BY $2)'
    );

    // CROSS APPLY → CROSS JOIN LATERAL
    result = result.replace(/\bCROSS\s+APPLY\b/gi, 'CROSS JOIN LATERAL');
    // OUTER APPLY → LEFT JOIN LATERAL
    result = result.replace(/\bOUTER\s+APPLY\b/gi, 'LEFT JOIN LATERAL');

    // Wrap LATERAL function calls: func(args) AS alias → (SELECT * FROM func(args)) AS alias
    result = result.replace(
      /(LATERAL)\s+(__mj\."?\w+"?\s*\([^)]*\))\s+(AS\s+"?\w+"?)/gi,
      '$1 (SELECT * FROM $2) $3'
    );

    // Add ON TRUE for LEFT JOIN LATERAL that lacks ON clause
    result = this.addLateralOnTrue(result);

    // Quote LATERAL alias references: root_xxx."Col" → "root_xxx"."Col"
    result = result.replace(/\bAS\s+(root_\w+)\s+ON\s+TRUE/gi, 'AS "$1" ON TRUE');
    result = result.replace(/\b(root_\w+)\."(\w+)"/g, '"$1"."$2"');

    // CREATE OR ALTER VIEW → CREATE OR REPLACE VIEW
    result = result.replace(/\bCREATE\s+OR\s+ALTER\s+VIEW\b/gi, 'CREATE OR REPLACE VIEW');

    // Strip interior semicolons (only final semicolon should remain)
    const viewBodyMatch = result.match(/(CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+.+?\s+AS\s+)([\s\S]+)/i);
    if (viewBodyMatch) {
      const header = viewBodyMatch[1];
      const body = viewBodyMatch[2].replace(/;(?![\s]*$)/g, '');
      result = header + body;
    }

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }

  /** Quote PascalCase column references: alias.PascalCol → alias."PascalCol" */
  private quoteColumnRefs(sql: string): string {
    // alias.PascalColumn (unquoted alias)
    // If alias starts with uppercase and isn't a keyword, quote it too
    // so it matches the AS "Alias" definition from quoteAsAliases.
    sql = sql.replace(/\b(\w+)\.(?!")([A-Z]\w*)\b/g, (match, alias: string, col: string) => {
      if (SQL_KEYWORDS.has(col.toUpperCase()) || SQL_KEYWORDS.has(alias.toUpperCase())) return match;
      const needsQuote = /^[A-Z]/.test(alias) && !SQL_KEYWORDS.has(alias.toUpperCase());
      const quotedAlias = needsQuote ? `"${alias}"` : alias;
      return `${quotedAlias}."${col}"`;
    });
    // "alias".PascalColumn (quoted alias, unquoted column)
    sql = sql.replace(/"(\w+)"\.(?!")([A-Z]\w*)\b/g, (_match, alias: string, col: string) => {
      if (SQL_KEYWORDS.has(col.toUpperCase())) return `"${alias}".${col}`;
      return `"${alias}"."${col}"`;
    });
    // UnquotedPascalAlias."QuotedColumn" (unquoted alias, already-quoted column)
    // Handles cases where convertIdentifiers already quoted [Col] → "Col"
    sql = sql.replace(/\b([A-Z]\w*)\."(\w+)"/g, (match, alias: string, col: string) => {
      if (SQL_KEYWORDS.has(alias.toUpperCase())) return match;
      return `"${alias}"."${col}"`;
    });
    return sql;
  }

  /** Quote bare column aliases: ) PascalAlias, → ) "PascalAlias", */
  private quoteBareColumnAliases(sql: string): string {
    const lines = sql.split('\n');
    const result = lines.map(line => {
      // After close paren: ) PascalAlias,
      line = line.replace(/(\))\s+([A-Z][a-zA-Z]\w*)\s*(,?)$/, (_m, paren: string, alias: string, comma: string) => {
        if (SQL_KEYWORDS.has(alias.toUpperCase())) return `${paren} ${alias}${comma}`;
        return `${paren} "${alias}"${comma}`;
      });
      return line;
    });
    return result.join('\n');
  }

  /** Quote AS aliases: AS PascalAlias → AS "PascalAlias" */
  private quoteAsAliases(sql: string): string {
    return sql.replace(/\bAS\s+(?!")([A-Z][a-zA-Z]\w*)\b/g, (_match, alias: string) => {
      if (SQL_KEYWORDS.has(alias.toUpperCase())) return `AS ${alias}`;
      return `AS "${alias}"`;
    });
  }

  /** Quote bare PascalCase identifiers that appear as column references without table alias prefix */
  private quoteBareIdentifiers(sql: string): string {
    // Quote PascalCase word after ORDER BY: ORDER BY StartedAt → ORDER BY "StartedAt"
    sql = sql.replace(
      /(\bORDER\s+BY\s+)([A-Z][a-z]\w+)(\s+(?:ASC|DESC)\b)?/gi,
      (match, prefix: string, ident: string, suffix: string) => {
        if (SQL_KEYWORDS.has(ident.toUpperCase())) return match;
        return `${prefix}"${ident}"${suffix || ''}`;
      }
    );
    // Quote PascalCase word after CASE keyword: CASE PascalName WHEN → CASE "PascalName" WHEN
    sql = sql.replace(
      /(\bCASE\s+)([A-Z][a-z]\w+)(\s+WHEN\b)/gi,
      (match, prefix: string, ident: string, suffix: string) => {
        if (SQL_KEYWORDS.has(ident.toUpperCase())) return match;
        return `${prefix}"${ident}"${suffix}`;
      }
    );
    // Quote bare PascalCase at start of expression (after tab/spaces at line start, or after comma):
    // matches patterns like "    AutoRunInterval * (" where PascalCase starts a column expression
    sql = sql.replace(
      /^(\s+)([A-Z][a-z]\w+)(\s*[*+\-/])/gm,
      (match, ws: string, ident: string, op: string) => {
        if (SQL_KEYWORDS.has(ident.toUpperCase())) return match;
        return `${ws}"${ident}"${op}`;
      }
    );
    // Quote bare PascalCase in bare column aliases after a quoted column: "Col" PascalAlias,
    sql = sql.replace(
      /("[\w]+"\s+)([A-Z][a-z]\w+)([\s,])/g,
      (match, prefix: string, alias: string, suffix: string) => {
        if (SQL_KEYWORDS.has(alias.toUpperCase())) return match;
        // Don't quote if it's followed by ( — it's a function call
        if (suffix === '(') return match;
        return `${prefix}"${alias}"${suffix}`;
      }
    );
    return sql;
  }

  /** Add ON TRUE for LEFT JOIN LATERAL that lacks an ON clause */
  private addLateralOnTrue(sql: string): string {
    const lines = sql.split('\n');
    const result: string[] = [];
    let lateralDepth = 0;
    let inLateral = false;

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);

      // Detect LATERAL block start
      if (/\bLATERAL\b/i.test(lines[i]) && !inLateral) {
        const lateralIdx = lines[i].search(/\bLATERAL\b/i);
        const rest = lines[i].slice(lateralIdx);
        let openCount = 0;
        let closeCount = 0;
        for (const ch of rest) {
          if (ch === '(') openCount++;
          else if (ch === ')') closeCount++;
        }

        if (openCount > closeCount) {
          // Multi-line LATERAL: opening paren not closed on this line
          inLateral = true;
          lateralDepth = openCount - closeCount;
        } else if (openCount > 0 && openCount === closeCount) {
          // Single-line LATERAL: fully closed on this line
          const nextLine = i + 1 < lines.length ? lines[i + 1].trim().toUpperCase() : '';
          if (!nextLine.startsWith('ON ')) {
            result.push('    ON TRUE');
          }
        }
        continue;
      }

      // Track multi-line LATERAL depth
      if (inLateral) {
        for (const ch of lines[i]) {
          if (ch === '(') lateralDepth++;
          else if (ch === ')') lateralDepth--;
        }

        if (lateralDepth <= 0) {
          inLateral = false;
          // Check if next line needs ON TRUE
          const nextLine = i + 1 < lines.length ? lines[i + 1].trim().toUpperCase() : '';
          if (!nextLine.startsWith('ON ')) {
            result.push('    ON TRUE');
          }
        }
      }
    }
    return result.join('\n');
  }
}
