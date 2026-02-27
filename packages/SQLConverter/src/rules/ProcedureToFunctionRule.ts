/**
 * CREATE PROCEDURE → CREATE OR REPLACE FUNCTION conversion rule.
 * Ported from Python convert_procedure(), convert_proc_params(),
 * convert_proc_body(), determine_return_type(), convert_cursor_loops(),
 * convert_exec_calls(), convert_begin_try_catch(), convert_if_blocks(),
 * fix_crud_if_else_pattern(), and convert_rowcount_if_block().
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import {
  convertIdentifiers, convertDateFunctions, convertCharIndex,
  convertStringConcat, convertTopToLimit, convertCastTypes,
  convertIIF, convertConvertFunction, removeNPrefix, removeCollate,
  convertCommonFunctions, convertStuff,
} from './ExpressionHelpers.js';
import { resolveType } from './TypeResolver.js';

export class ProcedureToFunctionRule implements IConversionRule {
  Name = 'ProcedureToFunctionRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_PROCEDURE'];
  Priority = 30;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    // Extract proc name via regex
    let procMatch = sql.match(
      /CREATE\s+PROC(?:EDURE)?\s+\[?__mj\]?\.\[?(\w+)\]?\s*(.*?)(?:\bAS\b)/is
    );

    if (!procMatch) {
      // Try alternate format with multiline ^AS$
      procMatch = sql.match(
        /CREATE\s+PROC(?:EDURE)?\s+\[?__mj\]?\.\[?(\w+)\]?\s*\n(.*?)(?:^AS$)/ims
      );
    }

    if (!procMatch) {
      return `-- TODO: Manual conversion needed for procedure\n-- ${sql.slice(0, 200).replace(/\n/g, '\n-- ')}...\n`;
    }

    const procName = procMatch[1];
    const paramsBlock = procMatch[2].trim();
    const bodyStart = procMatch.index! + procMatch[0].length;
    const body = sql.slice(bodyStart).trim();

    const pgParams = this.convertProcParams(paramsBlock);
    const booleanParams = this.extractBooleanParams(paramsBlock);
    const pgBody = this.convertProcBody(body, procName, context, booleanParams);
    const returnsClause = this.determineReturnType(body, procName, context);

    // If the return type references a view that doesn't exist, skip this procedure
    if (returnsClause.startsWith('-- SKIPPED')) {
      return returnsClause;
    }

    let result = `CREATE OR REPLACE FUNCTION __mj."${procName}"(${pgParams})\n`;
    result += `${returnsClause}\n$$\n`;
    result += pgBody;
    result += '\n$$ LANGUAGE plpgsql;\n';

    return result;
  }

  // ---------------------------------------------------------------------------
  // Parameter conversion
  // ---------------------------------------------------------------------------

  private convertProcParams(paramsBlock: string): string {
    if (!paramsBlock.trim()) {
      return '';
    }

    const paramList = splitParams(paramsBlock);
    let hasDefaultStarted = false;

    interface ParsedParam {
      Name: string;
      Type: string;
      Default: string | null;
      IsOutput: boolean;
    }

    const parsedParams: ParsedParam[] = [];

    // First pass: parse all params
    for (const rawParam of paramList) {
      const param = rawParam.trim();
      if (!param) continue;

      const m = param.match(
        /@(\w+)\s+([\w(),\s]+?)(?:\s*=\s*(.+?))?(?:\s+OUTPUT|\s+OUT)?\s*$/i
      );
      if (m) {
        // Only match OUTPUT/OUT as a trailing keyword, not as part of the param name
        const isOutput = /\s+(?:OUTPUT|OUT)\s*$/i.test(param);
        parsedParams.push({
          Name: m[1],
          Type: m[2].trim(),
          Default: m[3] ?? null,
          IsOutput: isOutput,
        });
      }
    }

    // Second pass: ensure all params after a default have defaults too
    for (const pp of parsedParams) {
      if (pp.Default !== null) {
        hasDefaultStarted = true;
      } else if (hasDefaultStarted && !pp.IsOutput) {
        pp.Default = 'NULL';
      }
    }

    // Third pass: build param strings
    const params: string[] = [];
    for (const pp of parsedParams) {
      const pgType = this.mapType(pp.Type);
      const direction = 'IN';
      let paramStr = `    ${direction} p_${pp.Name} ${pgType}`;
      if (pp.Default !== null) {
        let pgDefault = convertDefault(pp.Default);
        if (pgType === 'BOOLEAN' && (pgDefault === '0' || pgDefault === '1')) {
          pgDefault = pgDefault === '0' ? 'FALSE' : 'TRUE';
        }
        paramStr += ` DEFAULT ${pgDefault}`;
      }
      params.push(paramStr);
    }

    return params.length > 0
      ? '\n' + params.join(',\n') + '\n'
      : '';
  }

  // ---------------------------------------------------------------------------
  // Type mapping
  // ---------------------------------------------------------------------------

  /**
   * Map a T-SQL type to its PostgreSQL equivalent.
   * Delegates to the centralized TypeResolver, with local COLLATE stripping.
   */
  private mapType(typeStr: string): string {
    // Strip COLLATE clause before resolving
    const cleaned = typeStr.trim().replace(/\s+COLLATE\s+\S+/gi, '');
    return resolveType(cleaned);
  }

  // ---------------------------------------------------------------------------
  // Boolean parameter extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract parameter names that map to BOOLEAN (from BIT in T-SQL).
   * Used to fix COALESCE(p_BoolParam, 0) → COALESCE(p_BoolParam, FALSE).
   */
  private extractBooleanParams(paramsBlock: string): Set<string> {
    const boolParams = new Set<string>();
    if (!paramsBlock.trim()) return boolParams;

    const paramList = splitParams(paramsBlock);
    for (const rawParam of paramList) {
      const param = rawParam.trim();
      if (!param) continue;
      const m = param.match(/@(\w+)\s+([\w(),\s]+)/i);
      if (m) {
        const typeName = m[2].trim().toUpperCase();
        if (typeName === 'BIT') {
          boolParams.add(`p_${m[1]}`);
        }
      }
    }
    return boolParams;
  }

  // ---------------------------------------------------------------------------
  // Body conversion
  // ---------------------------------------------------------------------------

  private convertProcBody(body: string, _procName: string, context?: ConversionContext, booleanParams?: Set<string>): string {
    let sql = body;

    // Remove SET NOCOUNT ON
    sql = sql.replace(/\bSET\s+NOCOUNT\s+ON\s*;?/gi, '');

    // Remove outer BEGIN/END if present
    sql = sql.trim();
    if (
      sql.toUpperCase().startsWith('BEGIN') &&
      sql.toUpperCase().trimEnd().replace(/;$/, '').endsWith('END')
    ) {
      sql = sql.replace(/^\s*BEGIN\s*/i, '');
      sql = sql.replace(/\s*END\s*;?\s*$/i, '');
    }

    // Convert identifiers
    sql = convertIdentifiers(sql);

    // NEWID()/NEWSEQUENTIALID() → gen_random_uuid()
    sql = sql.replace(/\bNEWID\s*\(\s*\)/gi, 'gen_random_uuid()');
    sql = sql.replace(/\bNEWSEQUENTIALID\s*\(\s*\)/gi, 'gen_random_uuid()');

    // Convert @@ROWCOUNT and @@ERROR BEFORE @variable conversion
    const hasRowcount = /@@ROWCOUNT/i.test(body);
    sql = sql.replace(/@@ROWCOUNT/gi, '_v_row_count');
    sql = sql.replace(/@@ERROR/gi, '0');

    // Convert @variable → p_variable
    sql = sql.replace(/@(\w+)/g, 'p_$1');

    // DECLARE @var type → plpgsql DECLARE block
    const declares: string[] = [];

    // Pattern 1: DECLARE with semicolons
    sql = sql.replace(
      /DECLARE\s+p_(\w+)\s+([\w(),\s]+?)(?:\s*=\s*(.+?))?\s*;/gi,
      (_match: string, varName: string, varType: string, defaultVal: string | undefined) => {
        const pgType = this.mapType(varType.trim());
        let decl = `    p_${varName} ${pgType}`;
        if (defaultVal) {
          decl += ` := ${convertDefault(defaultVal)}`;
        }
        decl += ';';
        declares.push(decl);
        return '';
      }
    );

    // Pattern 2: DECLARE without semicolons (at end of line)
    sql = sql.replace(
      /^(\s*)DECLARE\s+p_(\w+)\s+([\w]+(?:\s*\(\s*(?:\d+|MAX)\s*(?:,\s*\d+\s*)?\))?)\s*$/gim,
      (_match: string, _indent: string, varName: string, varType: string) => {
        declares.push(`    p_${varName} ${this.mapType(varType.trim())};`);
        return '';
      }
    );

    // Pattern 3: DECLARE with function call defaults, no semicolon
    sql = sql.replace(
      /^\s*DECLARE\s+p_(\w+)\s+([\w]+(?:\s*\(\s*(?:\d+|MAX)\s*(?:,\s*\d+\s*)?\))?)\s*=\s*(.+?)\s*$/gim,
      (_match: string, varName: string, varType: string, defaultVal: string) => {
        const pgType = this.mapType(varType.trim());
        declares.push(`    p_${varName} ${pgType} := ${convertDefault(defaultVal.trim())};`);
        return '';
      }
    );

    // Remove TABLE variable declarations
    sql = sql.replace(
      /DECLARE\s+p_\w+\s+TABLE\s*\([^)]*\)\s*;?/gis,
      ''
    );

    // @@ROWCOUNT → GET DIAGNOSTICS
    if (hasRowcount) {
      declares.unshift('    _v_row_count INTEGER;');
    }

    // SET p_var = value → p_var := value;
    sql = sql.replace(
      /\bSET\s+(p_\w+)\s*=\s*(.+?)(?:;|\s*$)/gim,
      (_match: string, varRef: string, value: string) => {
        const trimmedValue = value.trim();
        if (trimmedValue.endsWith(';')) {
          return `${varRef} := ${trimmedValue}`;
        }
        return `${varRef} := ${trimmedValue};`;
      }
    );

    // Convert identifiers again (for vars that slipped through)
    sql = convertIdentifiers(sql);

    // ISNULL → COALESCE
    sql = sql.replace(/\bISNULL\s*\(/gi, 'COALESCE(');

    // Fix COALESCE for BOOLEAN params: COALESCE(p_BoolParam, 0) → COALESCE(p_BoolParam, FALSE)
    // Also track declared BOOLEAN variables from the DECLARE block
    const allBoolVars = new Set<string>(booleanParams ?? []);
    for (const decl of declares) {
      const declMatch = decl.trim().match(/^(p_\w+)\s+BOOLEAN\b/i);
      if (declMatch) {
        allBoolVars.add(declMatch[1]);
      }
    }
    if (allBoolVars.size > 0) {
      for (const boolVar of allBoolVars) {
        const escaped = boolVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        sql = sql.replace(
          new RegExp(`COALESCE\\(${escaped},\\s*0\\)`, 'gi'),
          `COALESCE(${boolVar}, FALSE)`
        );
        sql = sql.replace(
          new RegExp(`COALESCE\\(${escaped},\\s*1\\)`, 'gi'),
          `COALESCE(${boolVar}, TRUE)`
        );
      }
    }

    // N'string' → 'string'
    sql = sql.replace(/N'/g, "'");

    // String concat + → ||
    sql = convertStringConcat(sql, context?.TableColumns);

    // Common function replacements
    sql = convertCommonFunctions(sql);

    // DATEADD/DATEDIFF/DATEPART
    sql = convertDateFunctions(sql);

    // LEN → LENGTH
    sql = sql.replace(/\bLEN\s*\(/gi, 'LENGTH(');

    // SCOPE_IDENTITY()
    sql = sql.replace(/\bSCOPE_IDENTITY\s*\(\s*\)/gi, 'lastval()');

    // CHARINDEX
    sql = convertCharIndex(sql);

    // Type conversions in CAST
    sql = convertCastTypes(sql);

    // Remove COLLATE
    sql = removeCollate(sql);

    // PRINT → RAISE NOTICE
    sql = sql.replace(/\bPRINT\s+'([^']*)'/gi, "RAISE NOTICE '$1'");
    sql = sql.replace(/\bPRINT\s+N'([^']*)'/gi, "RAISE NOTICE '$1'");
    sql = sql.replace(/\bPRINT\s+(\w+)/gi, "RAISE NOTICE '%', $1");

    // RAISERROR → RAISE EXCEPTION
    sql = sql.replace(
      /\bRAISERROR\s*\(\s*'([^']*)'[^)]*\)\s*;?/gi,
      "RAISE EXCEPTION '$1';"
    );

    // ERROR_MESSAGE, ERROR_STATE, etc.
    sql = sql.replace(/\bERROR_MESSAGE\s*\(\s*\)/gi, 'SQLERRM');
    sql = sql.replace(/\bERROR_STATE\s*\(\s*\)/gi, '0');
    sql = sql.replace(/\bERROR_PROCEDURE\s*\(\s*\)/gi, "''");
    sql = sql.replace(/\bERROR_NUMBER\s*\(\s*\)/gi, '0');
    sql = sql.replace(/\bERROR_LINE\s*\(\s*\)/gi, '0');

    // Remove OUTPUT INSERTED patterns
    sql = sql.replace(/\s*OUTPUT\s+INSERTED\.\*\s+INTO\s+p_\w+/gi, '');
    sql = sql.replace(/\s*OUTPUT\s+INSERTED\."?\w+"?\s+INTO\s+p_\w+/gi, '');
    sql = sql.replace(/\s*OUTPUT\s+INSERTED\.\*/gi, '');

    // Remove table variable INSERT INTO
    sql = sql.replace(/\s*INSERT\s+INTO\s+p_\w+\s*\([^)]*\)\s*/gi, '');

    // Replace SELECT FROM p_InsertedRow with p_ID
    sql = sql.replace(/SELECT\s+\*\s+FROM\s+p_\w+Row\b/gi, '');
    sql = sql.replace(/\(\s*SELECT\s+"?\w+"?\s+FROM\s+p_\w+Row\b\s*\)/gi, 'p_ID');
    sql = sql.replace(/SELECT\s+"?\w+"?\s+FROM\s+p_\w+Row\b/gi, 'p_ID');

    // Add semicolons after WHERE "ID" = p_ID
    sql = sql.replace(
      /(WHERE\s+"ID"\s*=\s*p_\w+)\s*\n(\s*\n\s*(?:--|GET|IF))/gi,
      '$1;\n$2'
    );
    sql = sql.replace(
      /(DELETE\s+FROM\s+__mj\."\w+"\s+WHERE\s+"ID"\s*=\s*p_\w+)\s*\n(\s*\n\s*(?:--|GET|IF))/gi,
      '$1;\n$2'
    );

    // Convert rowcount IF block pattern
    if (hasRowcount) {
      sql = convertRowcountIfBlock(sql);
    }

    // Convert standalone SELECT * FROM → RETURN QUERY SELECT * FROM
    sql = sql.replace(
      /^(\s+)(SELECT\s+(?:DISTINCT\s+)?\*\s+FROM\s+)/gim,
      '$1RETURN QUERY $2'
    );

    // Convert SELECT NULL/p_var AS "ID" → RETURN QUERY SELECT
    sql = sql.replace(
      /^(\s+)(SELECT\s+(?:NULL|p_\w+)\s+AS\s+"?\w+"?)/gim,
      '$1RETURN QUERY $2'
    );

    // TOP N → LIMIT N
    sql = convertTopToLimit(sql);

    // Convert T-SQL cursor loops → PG FOR...LOOP
    sql = convertCursorLoops(sql);

    // Convert EXEC proc → PERFORM proc()
    sql = convertExecCalls(sql);

    // Convert BEGIN TRY/CATCH → EXCEPTION blocks
    sql = convertBeginTryCatch(sql);

    // IIF → CASE WHEN
    sql = convertIIF(sql);

    // suser_name() / user_name() → current_user
    sql = sql.replace(/\bsuser_s?name\s*\(\s*\)/gi, 'current_user');
    sql = sql.replace(/\buser_name\s*\(\s*\)/gi, 'current_user');

    // TRY_CONVERT(type, expr) → CAST(expr AS type)
    sql = sql.replace(
      /\bTRY_CONVERT\s*\(\s*([\w()\s]+?)\s*,\s*([^,)]+)\s*\)/gi,
      (_match: string, typeRef: string, expr: string) => {
        return `CAST(${expr.trim()} AS ${this.mapType(typeRef.trim())})`;
      }
    );

    // CONVERT(type, expr) → CAST(expr AS type)
    sql = sql.replace(
      /\bCONVERT\s*\(\s*([\w()\s]+?)\s*,\s*([^,)]+)\s*\)/gi,
      (_match: string, typeRef: string, expr: string) => {
        return `CAST(${expr.trim()} AS ${this.mapType(typeRef.trim())})`;
      }
    );

    // IF ... BEGIN ... END → IF ... THEN ... END IF
    sql = convertIfBlocks(sql);

    // Fix multi-line RETURN QUERY SELECT
    sql = fixCrudIfElsePattern(sql);

    // Add semicolons to standalone DELETE FROM statements
    sql = sql.replace(
      /^(\s*DELETE\s+FROM\s+__mj\."?\w+"?\s+WHERE\s+[^\n;]+?)\s*$/gim,
      '$1;'
    );
    // DELETE FROM with subquery (IN clause)
    sql = sql.replace(
      /^(\s*DELETE\s+FROM\s+__mj\."?\w+"?\s+WHERE\s+.*\))\s*$/gim,
      '$1;'
    );

    // Add semicolons to standalone WHERE lines ending with variable ref
    // But NOT if next line starts with AND/OR
    sql = sql.replace(
      /^(\s*WHERE\s+[^\n;]*p_\w+)\s*$(?!\n\s*AND\b|\n\s*OR\b)/gim,
      '$1;'
    );

    // Add semicolons to standalone UPDATE...SET...WHERE on single line
    sql = sql.replace(
      /^(\s*UPDATE\s+__mj\."?\w+"?\s+SET\s+.*WHERE\s+[^\n;]+?)\s*$/gim,
      '$1;'
    );

    // Add semicolons before ELSE/END IF/comment/RETURN
    sql = sql.replace(
      /(\)\s*)\n(\s*(?:ELSE|END IF|--|RETURN|GET))/gi,
      ');\n$2'
    );

    // Add semicolons to lines immediately before END;
    sql = sql.replace(
      /^([^\n;]+?)\s*\n(\s*END;)/gm,
      '$1;\n$2'
    );

    // Add semicolons to RETURN QUERY SELECT lines
    sql = sql.replace(
      /(RETURN QUERY\s+SELECT\s+\*\s+FROM\s+__mj\."[\w]+"\s+WHERE\s+[^\n;]+?)\s*$/gim,
      '$1;'
    );

    // If cursor loops generated FOR _rec IN, add _rec RECORD to declares
    if (sql.includes('FOR _rec IN')) {
      declares.unshift('    _rec RECORD;');
    }

    // Build DECLARE block
    let declareBlock = '';
    if (declares.length > 0) {
      // Truncate long variable names to 63 chars (PostgreSQL identifier limit)
      const truncatedDeclares: string[] = [];
      for (let d of declares) {
        const parts = d.trim().split(/\s+/);
        if (parts.length >= 1 && parts[0].length > 63) {
          const oldName = parts[0];
          const h = simpleHash(oldName);
          const newName = oldName.slice(0, 57) + '_' + h;
          sql = sql.split(oldName).join(newName);
          d = d.split(oldName).join(newName);
        }
        truncatedDeclares.push(d);
      }

      // Remove duplicate declarations
      const seen = new Set<string>();
      const uniqueDeclares: string[] = [];
      for (const d of truncatedDeclares) {
        const key = d.trim().split(/\s+/)[0]; // first word (variable name)
        if (!seen.has(key)) {
          seen.add(key);
          uniqueDeclares.push(d);
        }
      }
      declareBlock = 'DECLARE\n' + uniqueDeclares.join('\n') + '\n';
    }

    return declareBlock + 'BEGIN\n' + sql.trim() + '\nEND';
  }

  // ---------------------------------------------------------------------------
  // Return type detection
  // ---------------------------------------------------------------------------

  private determineReturnType(body: string, _procName: string, context: ConversionContext): string {
    // Check for SELECT * FROM __mj.vwViewName → RETURNS SETOF
    const viewMatch = body.match(
      /SELECT\s+(?:\*|[\w\s,.*]+)\s+FROM\s+\[?__mj\]?\.\[?(vw\w+)\]?/i
    );
    if (viewMatch) {
      const viewName = viewMatch[1];
      return `RETURNS SETOF __mj."${viewName}" AS`;
    }

    // Delete procs return SELECT @ID AS [ID] or SELECT NULL AS [ID]
    if (/SELECT\s+.*\s+AS\s+\[?ID\]?/i.test(body)) {
      return 'RETURNS TABLE("_result_id" UUID) AS';
    }

    // If there's any SELECT that returns rows
    const upperBody = body.toUpperCase();
    if (/\bSELECT\b/.test(upperBody) && !/SELECT\s+@/.test(upperBody)) {
      return 'RETURNS SETOF RECORD AS';
    }

    return 'RETURNS VOID AS';
  }
}

// =============================================================================
// Standalone helper functions
// =============================================================================

/** Split parameter list on commas respecting parentheses depth */
function splitParams(str: string): string[] {
  const params: string[] = [];
  let depth = 0;
  const current: string[] = [];

  for (const char of str) {
    if (char === '(') {
      depth++;
      current.push(char);
    } else if (char === ')') {
      depth--;
      current.push(char);
    } else if (char === ',' && depth === 0) {
      params.push(current.join(''));
      current.length = 0;
    } else {
      current.push(char);
    }
  }

  if (current.length > 0) {
    params.push(current.join(''));
  }

  return params;
}

/** Convert default value expressions from T-SQL to PostgreSQL */
function convertDefault(defaultStr: string): string {
  let d = defaultStr.trim();

  // Remove outer parens: DEFAULT ((0)) → DEFAULT 0
  while (d.startsWith('(') && d.endsWith(')')) {
    const inner = d.slice(1, -1);
    let depth = 0;
    let balanced = true;
    for (const c of inner) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth < 0) {
        balanced = false;
        break;
      }
    }
    if (balanced && depth === 0) {
      d = inner;
    } else {
      break;
    }
  }

  const upper = d.toUpperCase().trim();

  if (upper === 'NEWSEQUENTIALID()' || upper === 'NEWID()') return 'gen_random_uuid()';
  if (['GETDATE()', 'GETUTCDATE()', 'SYSDATETIMEOFFSET()', 'SYSUTCDATETIME()'].includes(upper)) return 'NOW()';
  if (['SUSER_SNAME()', 'SUSER_NAME()', 'SYSTEM_USER', 'CURRENT_USER'].includes(upper)) return 'current_user';
  if (upper === '0') return 'FALSE';
  if (upper === '1') return 'TRUE';

  // N'string' → 'string'
  d = d.replace(/N'/g, "'");

  return d;
}

/**
 * Simple hash producing the first 6 hex characters.
 * Used for truncating long PostgreSQL identifiers (>63 chars).
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to unsigned hex and take first 6 chars
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return hex.slice(0, 6);
}

// =============================================================================
// Block / statement converters
// =============================================================================

/**
 * Convert IF...BEGIN...END blocks to IF...THEN...END IF.
 * Ported from Python convert_if_blocks().
 */
function convertIfBlocks(sql: string): string {
  // Handle IF ... BEGIN → IF ... THEN
  sql = sql.replace(/\bIF\s+(.*?)\s+BEGIN\b/gi, 'IF $1 THEN');
  sql = sql.replace(/\bELSE\s+IF\b/gi, 'ELSIF');
  sql = sql.replace(/\bELSE\s+BEGIN\b/gi, 'ELSE');

  // Handle single-line IF without BEGIN: IF condition\n    statement
  sql = sql.replace(
    /\bIF\s+(.+?)(?<!\bTHEN)\s*\n(\s+)(RETURN QUERY\s+SELECT|SELECT)/gi,
    'IF $1 THEN\n$2$3'
  );

  // END that's followed by ELSE or ELSIF → just remove the END
  sql = sql.replace(/\bEND\s*\n\s*(ELSE|ELSIF)\b/gi, '$1');

  // Lines with just END → END IF;
  sql = sql.replace(/^(\s+)END\s*$/gim, '$1END IF;');

  return sql;
}

/**
 * Convert T-SQL cursor pattern to PostgreSQL FOR...LOOP pattern.
 * Ported from Python convert_cursor_loops().
 */
function convertCursorLoops(sql: string): string {
  const lines = sql.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const stripped = lines[i].trim();

    // Detect: DECLARE cursor_name CURSOR FOR ...
    let cursorMatch = stripped.match(
      /^DECLARE\s+(\w+)\s+CURSOR\s+FOR\s*$/i
    );
    if (!cursorMatch) {
      cursorMatch = stripped.match(
        /^DECLARE\s+(\w+)\s+CURSOR\s+FOR\s+(SELECT\s+.+)/i
      );
    }

    if (cursorMatch) {
      const cursorName = cursorMatch[1];
      const cursorNameEscaped = cursorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Collect the SELECT query (may be multi-line)
      const selectLines: string[] = [];
      if (cursorMatch.length >= 3 && cursorMatch[2]) {
        selectLines.push(cursorMatch[2]);
      }

      i++;
      // Collect remaining SELECT lines until OPEN cursor_name
      while (i < lines.length) {
        const s = lines[i].trim();
        if (new RegExp(`^OPEN\\s+${cursorNameEscaped}`, 'i').test(s)) {
          break;
        }
        if (s && !s.startsWith('--')) {
          selectLines.push(s);
        }
        i++;
      }

      const selectQuery = selectLines.join(' ').trim().replace(/;$/, '');

      // Extract column names from the SELECT query for variable mapping
      const colMatch = selectQuery.match(/^SELECT\s+(.*?)\s+FROM\s+/is);
      const selectCols: string[] = [];
      if (colMatch) {
        const colsStr = colMatch[1];
        for (let c of colsStr.split(',')) {
          c = c.trim().replace(/"/g, '');
          if (c.includes('.')) {
            c = c.split('.').pop()!.replace(/"/g, '');
          }
          selectCols.push(c);
        }
      }

      // Skip OPEN cursor_name line
      i++;

      // Find FETCH NEXT FROM cursor_name INTO @var1, @var2, ...
      const fetchVars: string[] = [];
      while (i < lines.length) {
        const s = lines[i].trim();
        const fetchMatch = s.match(
          new RegExp(`^FETCH\\s+NEXT\\s+FROM\\s+${cursorNameEscaped}\\s+INTO\\s+(.*)`, 'i')
        );
        if (fetchMatch) {
          const varsStr = fetchMatch[1].replace(/;$/, '');
          for (const v of varsStr.split(',')) {
            fetchVars.push(v.trim());
          }
          i++;
          break;
        }
        i++;
      }

      // Find WHILE @@FETCH_STATUS = 0 / BEGIN
      while (i < lines.length) {
        const s = lines[i].trim();
        if (/^WHILE\s+.*FETCH_STATUS/i.test(s) || /^WHILE\s+p_p_FETCH_STATUS/i.test(s)) {
          i++;
          break;
        }
        i++;
      }

      // Skip BEGIN
      while (i < lines.length) {
        const s = lines[i].trim();
        if (s.toUpperCase() === 'BEGIN' || s.toUpperCase() === 'THEN') {
          i++;
          break;
        }
        if (s) break;
        i++;
      }

      // Collect body lines until we hit END + CLOSE/DEALLOCATE
      const bodyLines: string[] = [];
      let depth = 0;
      while (i < lines.length) {
        const s = lines[i].trim();
        // Skip FETCH NEXT inside body
        if (new RegExp(`^FETCH\\s+NEXT\\s+FROM\\s+${cursorNameEscaped}`, 'i').test(s)) {
          i++;
          continue;
        }
        // Detect END of the WHILE block
        if (['END', 'END IF;', 'END;'].includes(s.toUpperCase()) && depth === 0) {
          i++;
          break;
        }
        if (/BEGIN/i.test(s)) depth++;
        if (['END', 'END IF;', 'END;'].includes(s.toUpperCase()) && depth > 0) depth--;
        bodyLines.push(lines[i]);
        i++;
      }

      // Skip CLOSE and DEALLOCATE
      while (i < lines.length) {
        const s = lines[i].trim();
        if (new RegExp(`^(CLOSE|DEALLOCATE)\\s+${cursorNameEscaped}`, 'i').test(s)) {
          i++;
          continue;
        }
        break;
      }

      // Build variable assignments from cursor record
      const assignments: string[] = [];
      for (let vi = 0; vi < fetchVars.length; vi++) {
        if (vi < selectCols.length) {
          assignments.push(`        ${fetchVars[vi]} := _rec."${selectCols[vi]}";`);
        }
      }

      // Emit the PostgreSQL FOR LOOP
      const indent = '    ';
      result.push(`${indent}FOR _rec IN ${selectQuery}`);
      result.push(`${indent}LOOP`);
      for (const a of assignments) {
        result.push(a);
      }
      for (const bl of bodyLines) {
        result.push(bl);
      }
      result.push(`${indent}END LOOP;`);
    } else {
      // Remove standalone CLOSE/DEALLOCATE lines for any cursor
      if (/^(CLOSE|DEALLOCATE)\s+\w+/i.test(stripped)) {
        i++;
        continue;
      }
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * Convert T-SQL EXEC/sp_executesql to PostgreSQL EXECUTE/PERFORM.
 * Ported from Python convert_exec_calls().
 */
function convertExecCalls(sql: string): string {
  // EXEC sp_executesql @sql → EXECUTE p_sql
  sql = sql.replace(/\bEXEC\s+sp_executesql\s+/gi, 'EXECUTE ');

  // EXEC @sql → EXECUTE p_sql
  sql = sql.replace(/\bEXEC\s+(p_\w+)\s*;/gi, 'EXECUTE $1;');

  // EXEC __mj."spProc" @param = value → PERFORM __mj."spProc"(value1, value2...)
  sql = sql.replace(
    /\bEXEC\s+(__mj\."sp\w+")\s*(.*?)(?:;|$)/gim,
    (_match: string, procRef: string, paramsStr: string) => {
      const trimmedParams = paramsStr.trim().replace(/;$/, '');
      if (!trimmedParams) {
        return `PERFORM ${procRef}();`;
      }
      const paramParts = trimmedParams.split(/,\s*/);
      const values: string[] = [];
      for (const p of paramParts) {
        const eqMatch = p.trim().match(/^p_\w+\s*=\s*(.+)/);
        if (eqMatch) {
          values.push(eqMatch[1].trim());
        } else {
          values.push(p.trim());
        }
      }
      return `PERFORM ${procRef}(${values.join(', ')});`;
    }
  );

  return sql;
}

/**
 * Convert BEGIN TRY/CATCH to PostgreSQL EXCEPTION blocks.
 * Ported from Python convert_begin_try_catch().
 */
function convertBeginTryCatch(sql: string): string {
  sql = sql.replace(/\bBEGIN\s+TRY\b/gi, 'BEGIN');
  sql = sql.replace(/\bEND\s+TRY\s*\n?\s*BEGIN\s+CATCH\b/gi, 'EXCEPTION WHEN OTHERS THEN');
  sql = sql.replace(/\bEND\s+CATCH\b/gi, 'END');
  return sql;
}

/**
 * Convert the MJ CRUD rowcount check pattern to proper plpgsql.
 * Uses a line-based parser to handle varied whitespace/formatting.
 * Ported from Python convert_rowcount_if_block().
 */
function convertRowcountIfBlock(sql: string): string {
  const lines = sql.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const stripped = lines[i].trim();

    // Detect: -- Check if the update/delete/insert was successful
    const checkMatch = stripped.match(
      /^--\s*Check if the (update|delete|insert|create) was successful/i
    );
    if (checkMatch) {
      const opType = checkMatch[1].toLowerCase();

      // Collect the entire IF/ELSE block
      const blockLines: string[] = [];
      let j = i + 1;

      while (j < lines.length) {
        const s = lines[j].trim();
        blockLines.push(lines[j]);
        if (s.toUpperCase() === 'END' || s.toUpperCase().startsWith('END IF')) {
          break;
        }
        j++;
      }

      // Parse the block to find view reference
      const blockText = blockLines.join('\n');
      const viewMatch = blockText.match(/FROM\s+(__mj\."(vw\w+)")/i);
      const viewRef = viewMatch ? viewMatch[1] : null;

      if (opType === 'delete') {
        // Delete pattern: SELECT NULL/p_ID AS "ID"
        const idMatch = blockText.match(/SELECT\s+(p_\w+)\s+AS/i);
        const idVar = idMatch ? idMatch[1] : 'p_ID';

        result.push('    GET DIAGNOSTICS _v_row_count = ROW_COUNT;');
        result.push('');
        result.push('    IF _v_row_count = 0 THEN');
        result.push('        RETURN QUERY SELECT NULL::UUID AS "_result_id";');
        result.push('    ELSE');
        result.push(`        RETURN QUERY SELECT ${idVar}::UUID AS "_result_id";`);
        result.push('    END IF;');
      } else if (viewRef) {
        // Update/Create pattern with view reference
        result.push('    GET DIAGNOSTICS _v_row_count = ROW_COUNT;');
        result.push('');
        result.push('    IF _v_row_count = 0 THEN');
        result.push(`        RETURN QUERY SELECT * FROM ${viewRef} WHERE 1=0;`);
        result.push('    ELSE');
        result.push(`        RETURN QUERY SELECT * FROM ${viewRef} WHERE "ID" = p_ID;`);
        result.push('    END IF;');
      } else {
        // Unknown pattern, keep as-is with GET DIAGNOSTICS
        result.push('    GET DIAGNOSTICS _v_row_count = ROW_COUNT;');
        result.push(lines[i]); // the comment
        for (const bl of blockLines) {
          result.push(bl);
        }
      }

      i = j + 1;
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * Fix multi-line RETURN QUERY SELECT that got split across lines.
 * Ported from Python fix_crud_if_else_pattern().
 */
function fixCrudIfElsePattern(sql: string): string {
  const lines = sql.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    // If we see RETURN QUERY SELECT * on its own line (no FROM on same line),
    // join with the following lines until we find a complete statement
    if (/^\s*RETURN QUERY\s+SELECT\s+\*\s*;?\s*$/i.test(line)) {
      // Remove any trailing semicolons that were prematurely added
      let combined = line.trimEnd().replace(/;\s*$/, '');
      i++;
      // Absorb subsequent lines that are part of the SELECT statement
      while (i < lines.length) {
        const nextStripped = lines[i].trim();
        if (/^(FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ORDER|GROUP|HAVING|LIMIT|AND|OR)\b/i.test(nextStripped)) {
          combined += '\n' + lines[i];
          i++;
        } else if (/^"[^"]+"\s*=\s*p_\w+/i.test(nextStripped)) {
          // "ID" = p_ID continuation of WHERE clause
          combined += '\n' + lines[i];
          i++;
        } else {
          break;
        }
      }
      // Add semicolon to the end of the complete RETURN QUERY statement
      combined = combined.trimEnd();
      if (!combined.endsWith(';')) {
        combined += ';';
      }
      result.push(combined);
    } else if (
      // Standalone SELECT * that should be RETURN QUERY SELECT *
      /^\s+SELECT\s+\*\s+FROM\s+__mj\."\w+"/i.test(stripped) &&
      !stripped.includes('RETURN QUERY')
    ) {
      // Check context: are we inside an IF block? (preceded by IF or ELSE)
      let inIf = false;
      for (let j = result.length - 1; j >= Math.max(result.length - 5, 0); j--) {
        const prev = result[j].trim();
        if (prev.startsWith('IF ') || prev === 'ELSE' || prev.startsWith('--')) {
          inIf = true;
          break;
        }
        if (prev) break;
      }
      let modifiedLine = line;
      if (inIf) {
        const indentMatch = line.match(/^(\s+)/);
        const indent = indentMatch ? indentMatch[1] : '    ';
        modifiedLine = indent + 'RETURN QUERY ' + line.trim();
        if (!modifiedLine.trimEnd().endsWith(';')) {
          modifiedLine = modifiedLine.trimEnd() + ';';
        }
      }
      result.push(modifiedLine);
      i++;
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}
