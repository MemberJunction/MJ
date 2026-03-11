/**
 * Converts T-SQL DECLARE/DML blocks (without EXEC) to PostgreSQL DO $$ blocks.
 *
 * Handles patterns like:
 *   DECLARE @VarName TYPE;
 *   SELECT @VarName = col FROM table WHERE ...;
 *   IF @VarName IS NULL BEGIN RAISERROR(...) RETURN; END
 *   UPDATE t SET ... FROM ... WHERE col = @VarName;
 *
 * Converts to PL/pgSQL DO $$ block with proper syntax transformations:
 *   - DECLARE @var TYPE → DECLARE var TYPE (PG types)
 *   - SELECT @var = expr FROM → SELECT expr INTO var FROM
 *   - IF cond BEGIN ... END → IF cond THEN ... END IF;
 *   - RAISERROR → RAISE EXCEPTION
 *   - UPDATE ... FROM with bracket identifiers → quoted identifiers
 *   - @var references → local variable references
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeNPrefix, convertCommonFunctions, quotePascalCaseIdentifiers } from './ExpressionHelpers.js';
import { resolveType } from './TypeResolver.js';

export class DeclareDmlBlockRule implements IConversionRule {
  Name = 'DeclareDmlBlockRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['DECLARE_DML_BLOCK'];
  Priority = 53;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = sql;

    // Strip SET NOCOUNT ON (may still be present if it wasn't the first line)
    result = result.replace(/^\s*SET\s+NOCOUNT\s+ON\s*;?\s*\n?/gim, '');

    // Convert bracket identifiers: [schema].[table] → schema."table"
    result = convertIdentifiers(result);

    // Remove N prefix from string literals
    result = removeNPrefix(result);

    // Convert common functions (ISNULL → COALESCE, etc.)
    result = convertCommonFunctions(result);

    // Extract DECLARE variables and convert types
    result = this.convertDeclare(result);

    // Convert SELECT @var = expr FROM → SELECT expr INTO var FROM
    result = this.convertSelectInto(result);

    // Convert @variable references to local variable names (without @)
    result = this.convertVariableRefs(result);

    // Convert RAISERROR BEFORE PascalCase quoting (prevents "RAISERROR" → "Raiserror" quoting)
    result = result.replace(
      /\bRAISERROR\s*\(\s*N?'([^']*)'\s*,\s*\d+\s*,\s*\d+\s*\)\s*;?/gi,
      "RAISE EXCEPTION '$1';"
    );

    // Quote PascalCase identifiers (ID, Name, etc.) outside string literals
    result = quotePascalCaseIdentifiers(result);

    // Convert IF condition BEGIN ... END → IF condition THEN ... END IF;
    result = this.convertIfBlocks(result);

    // Convert UPDATE alias SET alias.col FROM table alias JOIN → PG UPDATE FROM
    result = this.convertUpdateFrom(result);

    // Convert RETURN; to RETURN; (same in PL/pgSQL)
    // (already valid syntax)

    // Convert T-SQL types in remaining positions
    result = result.replace(/\bUNIQUEIDENTIFIER\b/gi, 'UUID');
    result = result.replace(/\bNVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
    result = result.replace(/\bNVARCHAR\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
    result = result.replace(/(?<![\w"])BIT(?![\w"])/gi, 'BOOLEAN');

    // Wrap in DO $$ block
    result = this.wrapInDoBlock(result);

    return result + '\n';
  }

  /** Convert DECLARE @var TYPE[, @var2 TYPE2] to PG DECLARE section lines */
  private convertDeclare(sql: string): string {
    return sql.replace(
      /^(\s*)DECLARE\s+(.+?);\s*$/gim,
      (_match, indent: string, varList: string) => {
        const vars = this.splitTopLevel(varList, ',');
        const converted = vars.map(v => {
          const m = v.trim().match(/^@(\w+)\s+([\w\s(),]+)$/i);
          if (!m) return `${indent}  -- Could not parse: ${v.trim()}`;
          const pgType = resolveType(m[2].trim());
          return `${indent}v_${m[1]} ${pgType};`;
        });
        return `${indent}DECLARE\n${converted.join('\n')}`;
      }
    );
  }

  /** Convert SELECT @var = expr FROM table → SELECT expr INTO v_var FROM table */
  private convertSelectInto(sql: string): string {
    return sql.replace(
      /\bSELECT\s+@(\w+)\s*=\s*(.+?)\s+FROM\b/gi,
      (_match, varName: string, expr: string) => {
        return `SELECT ${expr} INTO v_${varName} FROM`;
      }
    );
  }

  /** Convert @variable references to v_variable */
  private convertVariableRefs(sql: string): string {
    // Match @VarName that isn't inside a string literal
    // Simple approach: replace all @VarName outside of quotes
    const segments = this.segmentSQL(sql);
    return segments.map(seg => {
      if (seg.type !== 'code') return seg.text;
      return seg.text.replace(/@(\w+)/g, 'v_$1');
    }).join('');
  }

  /** Convert IF cond BEGIN ... END to IF cond THEN ... END IF; */
  private convertIfBlocks(sql: string): string {
    // Convert IF ... BEGIN → IF ... THEN
    let result = sql.replace(/\bIF\b\s+([\s\S]*?)\bBEGIN\b/gi, (_match, cond: string) => {
      return `IF ${cond.trim()} THEN`;
    });
    // Convert standalone END (that closes IF) → END IF;
    // This is tricky — need to be careful not to break nested blocks
    result = result.replace(/\bEND\b\s*(?=\s*\n\s*(?:--|UPDATE|DELETE|INSERT|$))/gi, 'END IF;');
    return result;
  }

  /** Wrap the converted SQL in a DO $$ block */
  private wrapInDoBlock(sql: string): string {
    const lines = sql.split('\n');
    const declareLines: string[] = [];
    const bodyLines: string[] = [];
    let inDeclare = false;
    let pastDeclare = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!pastDeclare && /^DECLARE\b/i.test(trimmed)) {
        inDeclare = true;
        // Don't add the DECLARE keyword, it's part of the DO $$ structure
        continue;
      }
      if (inDeclare && !pastDeclare) {
        if (trimmed.match(/^\s*v_\w+\s+/i) || trimmed.startsWith('--')) {
          declareLines.push('  ' + trimmed);
          continue;
        }
        // End of DECLARE section
        pastDeclare = true;
      }
      if (trimmed) {
        bodyLines.push('  ' + trimmed);
      }
    }

    const out: string[] = [];
    out.push('DO $$');
    if (declareLines.length > 0) {
      out.push('DECLARE');
      out.push(...declareLines);
    }
    out.push('BEGIN');
    out.push(...bodyLines);
    out.push('END $$;');
    return out.join('\n');
  }

  /**
   * Convert T-SQL UPDATE alias SET alias.col FROM table alias JOIN ...
   * to PG UPDATE table SET "col" = ... FROM joinedTable WHERE ...
   */
  private convertUpdateFrom(sql: string): string {
    return sql.replace(
      /UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)(?=\s*;|\s*$)/gi,
      (_match, alias: string, setCols: string, fromClause: string) => {
        // Find the table name for this alias in the FROM clause
        const tablePattern = new RegExp(
          `((?:\\w+\\.)?(?:"[^"]+"|\\.\\w+))\\s+${alias}\\b`, 'i'
        );
        const tableMatch = fromClause.match(tablePattern);
        if (!tableMatch) return _match;
        const fullTable = tableMatch[1];

        // Remove alias prefix from SET columns
        const cleanedSet = setCols.replace(
          new RegExp(`${alias}\\.("?\\w+"?)`, 'gi'),
          (_m: string, col: string) => col.startsWith('"') ? col : `"${col}"`
        );

        // Remove target table+alias from FROM
        let remaining = fromClause.replace(tablePattern, '').trim();
        remaining = remaining.replace(/^\s*,\s*/, '').replace(/^\s*INNER\s+/i, '');

        // Convert JOIN...ON to FROM...WHERE
        const joinMatch = remaining.match(
          /^JOIN\s+([\s\S]+?)\s+ON\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i
        );
        if (joinMatch) {
          const joinTable = joinMatch[1];
          let joinCond = joinMatch[2];
          const whereCond = joinMatch[3];
          const aliasRe = new RegExp(`\\b${alias}\\.`, 'gi');
          joinCond = joinCond.replace(aliasRe, `${fullTable}.`);
          let where = `WHERE ${joinCond}`;
          if (whereCond) {
            where += `\n  AND ${whereCond.replace(aliasRe, `${fullTable}.`)}`;
          }
          return `UPDATE ${fullTable} SET ${cleanedSet}\nFROM ${joinTable}\n${where}`;
        }
        return _match;
      }
    );
  }

  /** Split string on delimiter at top level (respecting parens and strings) */
  private splitTopLevel(str: string, delimiter: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inStr = false;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inStr) {
        current += ch;
        if (ch === "'" && i + 1 < str.length && str[i + 1] === "'") {
          current += str[++i];
        } else if (ch === "'") {
          inStr = false;
        }
      } else if (ch === "'") {
        inStr = true;
        current += ch;
      } else if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if (ch === delimiter && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);
    return parts;
  }

  /** Segment SQL into code and string literal parts */
  private segmentSQL(sql: string): Array<{ text: string; type: 'code' | 'string' }> {
    const segments: Array<{ text: string; type: 'code' | 'string' }> = [];
    let current = '';
    let inStr = false;

    for (let i = 0; i < sql.length; i++) {
      if (inStr) {
        current += sql[i];
        if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
          current += "'";
          i++;
        } else if (sql[i] === "'") {
          segments.push({ text: current, type: 'string' });
          current = '';
          inStr = false;
        }
      } else {
        if (sql[i] === "'") {
          if (current) segments.push({ text: current, type: 'code' });
          current = "'";
          inStr = true;
        } else {
          current += sql[i];
        }
      }
    }
    if (current) segments.push({ text: current, type: inStr ? 'string' : 'code' });
    return segments;
  }
}
