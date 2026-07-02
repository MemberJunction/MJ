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
  BypassJustification = 'T-SQL DECLARE @var blocks with DML or dynamic EXEC are control-flow constructs that need wrapping in PG DO $ DECLARE ... BEGIN ... END $ blocks with @var → v_var renaming, IF/BEGIN/END → IF/THEN/END IF, and EXEC(\'...\' + @var) → EXECUTE format(\'...\', v_var). sqlglot does not perform this structural transformation.';

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = sql;

    // Early pattern simplification: T-SQL "drop default constraint + add default" block
    // uses sys.default_constraints which doesn't exist on PG. Replace the entire block
    // with a direct ALTER COLUMN SET DEFAULT (PG doesn't use named default constraints).
    const simplified = this.simplifyDefaultConstraintBlock(result);
    if (simplified) return simplified + '\n';

    // Rewrite the T-SQL "look up a system-named CHECK constraint by table (+ column),
    // then DROP it" catalog query. sys.check_constraints / sys.columns / OBJECT_ID /
    // COL_NAME have no PG equivalent; map the lookup onto pg_constraint + pg_attribute.
    // Runs on the raw T-SQL (before identifier quoting) so it can parse the bracketed
    // OBJECT_ID('[schema].[Table]') argument directly. The surrounding
    // `IF @x IS NOT NULL ... EXEC('... DROP CONSTRAINT ' + @x)` block is handled by the
    // generic transforms below (convertSelectInto / convertVariableRefs / convertDynamicExec).
    result = this.convertCheckConstraintLookup(result);

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

    // Convert EXEC('str' + v_var + 'str') → EXECUTE format('str %I str', v_var).
    // Must run BEFORE quotePascalCaseIdentifiers (so EXEC isn't already quoted to "EXEC").
    result = this.convertDynamicExec(result);

    // Quote PascalCase identifiers (ID, Name, etc.) outside string literals
    result = quotePascalCaseIdentifiers(result);

    // Convert IF condition BEGIN ... END → IF condition THEN ... END IF;
    result = this.convertIfBlocks(result);

    // Convert single-statement IF bodies (IF cond STMT without BEGIN/END) to IF...THEN...END IF;
    result = this.convertSingleStatementIf(result);

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

  /**
   * Convert dynamic T-SQL EXEC('str' + @var + 'str') to PG EXECUTE format('str %I str', v_var).
   *
   * T-SQL uses string concatenation with `+`. PG uses `format()` with `%I` for identifiers
   * (for names like constraint names) or `%L` for literals. We default to `%I` since that's
   * the common pattern for drop-constraint-by-name.
   */
  private convertDynamicExec(sql: string): string {
    return sql.replace(
      /\bEXEC\s*\(\s*((?:'[^']*'|v_\w+|\s|\+)+)\s*\)/gi,
      (_match, expr: string) => {
        // Split expr on + operators, preserve tokens
        const parts = expr.split(/\s*\+\s*/).map(p => p.trim()).filter(Boolean);
        const fmtParts: string[] = [];
        const args: string[] = [];
        for (const part of parts) {
          if (/^'.*'$/.test(part)) {
            // String literal — strip quotes, escape % for format()
            fmtParts.push(part.slice(1, -1).replace(/%/g, '%%'));
          } else if (/^v_\w+$/.test(part)) {
            // Variable reference — use %I (identifier quoting).
            // %I already wraps the value in double quotes, so the surrounding
            // string literals shouldn't include their own quotes around %I.
            fmtParts.push('%I');
            args.push(part);
          } else {
            // Unknown — use %s
            fmtParts.push('%s');
            args.push(part);
          }
        }
        // Strip redundant double quotes immediately before/after %I — these came
        // from T-SQL SQL-string concatenation patterns like '"... DROP CONSTRAINT "' + @name + '"'
        // where the quotes are meant to quote the identifier. %I does that job.
        let fmt = fmtParts.join('');
        // Strip redundant quoting around %I — T-SQL sources often have `"' + @var + '"`
        // or `[' + @var + ']` meaning "quote the identifier", which %I already does.
        fmt = fmt.replace(/"%I"/g, '%I');
        fmt = fmt.replace(/\[%I\]/g, '%I');
        const argList = args.length ? ', ' + args.join(', ') : '';
        return `EXECUTE format('${fmt}'${argList})`;
      }
    );
  }

  /**
   * Convert single-statement IF bodies to IF...THEN...END IF; form.
   *   IF cond EXECUTE ...;     →  IF cond THEN EXECUTE ...; END IF;
   *   IF cond UPDATE ...;      →  IF cond THEN UPDATE ...; END IF;
   *
   * Only converts IF statements that don't already have THEN (to avoid double-conversion).
   */
  private convertSingleStatementIf(sql: string): string {
    return sql.replace(
      /^(\s*)IF\s+([\s\S]+?)\n\s+((?:EXECUTE|UPDATE|INSERT|DELETE|SELECT|RAISE)\s[^;]*;)/gmi,
      (match, indent: string, cond: string, stmt: string) => {
        // Skip if already converted (has THEN)
        if (/\bTHEN\b/i.test(cond)) return match;
        return `${indent}IF ${cond.trim()} THEN\n${indent}  ${stmt}\n${indent}END IF;`;
      }
    );
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

    // Use a tagged dollar-quote ($mj$) instead of the bare $$ delimiter.
    // T-SQL Metadata_Sync output regularly stores raw JS source code (React
    // component bodies, JS template literals) in NVARCHAR(MAX) variables. That
    // source frequently contains literal `$$` (e.g. `**Total Revenue:** $${X}`
    // — JS template-literal escape for a literal `$` followed by interpolation).
    // With a bare $$ DO block, PG's parser sees the inner `$$` and prematurely
    // terminates the dollar-quote, producing `syntax error at or near "{"` (or
    // similar) at whatever follows. A tagged delimiter `$mj$` is unique enough
    // that user-data collision is implausible and matches PG's documented
    // recommendation for nested-dollar-quote scenarios. The body executes
    // identically — only the parser sees the difference.
    const out: string[] = [];
    out.push('DO $mj$');
    if (declareLines.length > 0) {
      out.push('DECLARE');
      out.push(...declareLines);
    }
    out.push('BEGIN');
    out.push(...bodyLines);
    out.push('END $mj$;');
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

  /**
   * Detects the T-SQL "lookup default constraint in sys.default_constraints, drop it,
   * then ADD DEFAULT val FOR col" pattern and replaces the entire block with PG's
   * direct `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT val`.
   *
   * PG doesn't use named default constraints — SET DEFAULT replaces any existing default.
   * Returns null if the pattern isn't detected (caller should continue with generic transforms).
   */
  private simplifyDefaultConstraintBlock(sql: string): string | null {
    // Must reference sys.default_constraints somewhere
    if (!/sys\.default_constraints/i.test(sql)) return null;

    // Extract all ADD DEFAULT ... FOR ... lines
    const defaultMatches = [...sql.matchAll(
      /ALTER\s+TABLE\s+(\S+)\s+ADD\s+DEFAULT\s+(.+?)\s+FOR\s+(\w+)\s*;?/gi
    )];
    if (defaultMatches.length === 0) return null;

    // Convert bracket/schema identifiers in the table reference
    const lines: string[] = [];
    for (const m of defaultMatches) {
      let table = m[1];
      const value = m[2].replace(/^\(+|\)+$/g, '').trim(); // strip wrapping parens
      const col = m[3];

      // Convert [schema].[table] or ${flyway:defaultSchema}.table → __mj."table"
      table = convertIdentifiers(table);

      const quotedCol = col.startsWith('"') ? col : `"${col}"`;
      lines.push(`ALTER TABLE ${table} ALTER COLUMN ${quotedCol} SET DEFAULT ${value};`);
    }

    // Preserve any standalone DML (UPDATE/INSERT) that follows the default changes
    const dmlMatch = sql.match(/\b(UPDATE|INSERT)\b[\s\S]*$/im);
    if (dmlMatch) {
      let dml = convertIdentifiers(dmlMatch[0]);
      dml = removeNPrefix(dml);
      dml = convertCommonFunctions(dml);
      dml = quotePascalCaseIdentifiers(dml);
      lines.push('');
      lines.push(dml.trim());
    }

    return lines.join('\n');
  }

  /**
   * Rewrite the T-SQL dynamic CHECK-constraint lookup query to PostgreSQL.
   *
   * SQL Server discovers a system-generated CHECK constraint's name via
   * sys.check_constraints (+ optionally sys.columns) keyed on OBJECT_ID / column,
   * so it can DROP it before re-adding a widened constraint. Two source shapes appear:
   *
   *   Form A (COL_NAME):
   *     SELECT @c = name FROM sys.check_constraints
   *     WHERE parent_object_id = OBJECT_ID('[schema].[Tbl]')
   *       AND COL_NAME(parent_object_id, parent_column_id) = 'Col';
   *
   *   Form B (aliased JOIN sys.columns):
   *     SELECT @c = cc.name FROM sys.check_constraints cc
   *     JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
   *     WHERE c.name = 'Col' AND cc.parent_object_id = OBJECT_ID('schema.Tbl');
   *
   * Both map to pg_constraint (contype='c') joined to pg_attribute on conkey:
   *
   *     SELECT @c = con.conname FROM pg_constraint con
   *     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
   *     WHERE con.conrelid = 'schema."Tbl"'::regclass AND a.attname = 'Col' AND con.contype = 'c';
   *
   * The `@var =` assignment is preserved so the generic convertSelectInto /
   * convertVariableRefs passes rename it to `SELECT ... INTO v_var`. If no column
   * filter is present the pg_attribute join is omitted (any CHECK on the table).
   * Returns the SQL unchanged when the pattern isn't present or can't be parsed.
   */
  private convertCheckConstraintLookup(sql: string): string {
    if (!/sys\.check_constraints/i.test(sql)) return sql;

    // Capture the whole `SELECT @var = [alias.]name ... FROM sys.check_constraints ... ;` statement.
    const stmtRe = /SELECT\s+(?:TOP\s+\d+\s+)?(@\w+)\s*=\s*[\w.]*\bname\b[\s\S]*?FROM\s+sys\.check_constraints\b[\s\S]*?;/i;
    const m = sql.match(stmtRe);
    if (!m) return sql;
    const stmt = m[0];
    const varName = m[1];

    // Target table from OBJECT_ID('<tableref>').
    const objIdM = stmt.match(/OBJECT_ID\s*\(\s*'([^']+)'\s*\)/i);
    if (!objIdM) return sql;
    const regclass = this.tableRefToRegclassLiteral(objIdM[1]);

    // Target column: Form A uses COL_NAME(...) = '<col>'; Form B compares the
    // sys.columns alias's `name` to '<col>'.
    let col: string | null = null;
    const colNameM = stmt.match(/COL_NAME\s*\([^)]*\)\s*=\s*'([^']+)'/i);
    if (colNameM) {
      col = colNameM[1];
    } else {
      const joinAliasM = stmt.match(/JOIN\s+sys\.columns\s+(\w+)\b/i);
      if (joinAliasM) {
        const alias = joinAliasM[1];
        const cM =
          stmt.match(new RegExp(`\\b${alias}\\.name\\s*=\\s*'([^']+)'`, 'i')) ||
          stmt.match(new RegExp(`'([^']+)'\\s*=\\s*\\b${alias}\\.name`, 'i'));
        if (cM) col = cM[1];
      }
    }

    const lines = [`SELECT ${varName} = con.conname`, `FROM pg_constraint con`];
    if (col) {
      // lowercase `any` so the later PascalCase-identifier quoting pass doesn't turn
      // `= ANY(...)` into a `"ANY"(...)` function call (which has no such function in PG).
      lines.push(`JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = any(con.conkey)`);
      lines.push(`WHERE con.conrelid = ${regclass}::regclass`);
      lines.push(`  AND a.attname = '${col}'`);
      lines.push(`  AND con.contype = 'c';`);
    } else {
      lines.push(`WHERE con.conrelid = ${regclass}::regclass`);
      lines.push(`  AND con.contype = 'c';`);
    }
    return sql.replace(stmt, lines.join('\n'));
  }

  /**
   * Convert an OBJECT_ID table argument (`[schema].[Table]`, `schema.Table`, or bare
   * `Table`) to a PG regclass string literal: `'schema."Table"'`. The table is double-
   * quoted to preserve PascalCase; the schema is left as-is (already lowercase `__mj`).
   */
  private tableRefToRegclassLiteral(ref: string): string {
    const cleaned = ref.replace(/[[\]]/g, '').trim();
    const parts = cleaned.split('.').map(p => p.trim()).filter(Boolean);
    const schema = parts.length >= 2 ? parts[0] : '__mj';
    const table = parts.length >= 2 ? parts[1] : parts[0];
    return `'${schema}."${table}"'`;
  }
}
