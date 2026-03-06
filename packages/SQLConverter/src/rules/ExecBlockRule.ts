/**
 * Converts DECLARE/SET/EXEC blocks (metadata sync patterns) to PostgreSQL DO $$ blocks.
 *
 * Input pattern (T-SQL):
 *   -- Comment
 *   DECLARE @Name NVARCHAR(255), @ID UNIQUEIDENTIFIER
 *   SET @Name = N'value'
 *   SET @ID = 'uuid'
 *   EXEC [schema].[spProcName] @Param1 = @Name, @Param2 = @ID;
 *
 * Output (PostgreSQL):
 *   -- Comment
 *   DO $$
 *   DECLARE
 *     p_Name TEXT;
 *     p_ID UUID;
 *   BEGIN
 *     p_Name := 'value';
 *     p_ID := 'uuid';
 *     PERFORM schema."spProcName"(p_Param1 := p_Name, p_Param2 := p_ID);
 *   END $$;
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { resolveType } from './TypeResolver.js';

interface DeclaredVar {
  name: string;
  pgType: string;
}

interface SetAssignment {
  varName: string;
  rawValue: string;
}

interface ExecCall {
  procRef: string;
  params: Array<{ paramName: string; valueExpr: string }>;
}

export class ExecBlockRule implements IConversionRule {
  Name = 'ExecBlockRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['EXEC_BLOCK'];
  Priority = 52;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    // Split into individual DECLARE/SET/EXEC blocks (a file may contain many)
    const blocks = this.splitIntoBlocks(sql);
    return blocks.map(block => this.convertOneBlock(block)).join('\n');
  }

  // ─── Block splitting ───────────────────────────────────────────────

  /**
   * Split a batch that may contain multiple DECLARE/SET/EXEC blocks.
   * Splits on `DECLARE @` at the start of a line, respecting string literal boundaries.
   * Leading comments are attached to the following block.
   */
  private splitIntoBlocks(sql: string): string[] {
    const lines = sql.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    let inString = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!inString && /^DECLARE\s+@/i.test(trimmed) && current.length > 0) {
        // Move trailing blank/comment lines from current block to new block
        const trailingComments: string[] = [];
        while (current.length > 0) {
          const last = current[current.length - 1].trim();
          if (last === '' || last.startsWith('--')) {
            trailingComments.unshift(current.pop()!);
          } else {
            break;
          }
        }
        const block = current.join('\n').trim();
        if (block) blocks.push(block);
        current = [...trailingComments, line];
      } else {
        current.push(line);
      }

      // Track single-quote string state
      inString = this.updateStringState(line, inString);
    }

    if (current.length > 0) {
      const block = current.join('\n').trim();
      if (block) blocks.push(block);
    }

    return blocks.length > 0 ? blocks : [sql];
  }

  // ─── Single block conversion ──────────────────────────────────────

  /** Convert one DECLARE/SET/EXEC block to a DO $$ block */
  private convertOneBlock(block: string): string {
    const { comments, body } = this.extractLeadingComments(block);
    const declareVars = this.parseDeclare(body);
    const { setSection, execSection } = this.findSetsAndExec(body);
    const assignments = this.parseSets(setSection);
    const exec = this.parseExec(execSection);

    if (!exec || declareVars.length === 0) {
      return `-- TODO: Review EXEC block (could not parse)\n${block.split('\n').map(l => `-- ${l}`).join('\n')}\n`;
    }

    return this.generateDoBlock(comments, declareVars, assignments, exec);
  }

  // ─── Comment extraction ───────────────────────────────────────────

  private extractLeadingComments(sql: string): { comments: string; body: string } {
    const lines = sql.split('\n');
    const commentLines: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('--') || trimmed === '') {
        commentLines.push(lines[i]);
        i++;
      } else {
        break;
      }
    }
    return {
      comments: commentLines.join('\n'),
      body: lines.slice(i).join('\n'),
    };
  }

  // ─── DECLARE parsing ──────────────────────────────────────────────

  /** Parse DECLARE section and extract variable names with PG types */
  private parseDeclare(body: string): DeclaredVar[] {
    // Find the DECLARE block — ends at first SET at start of line
    const declareEnd = this.findDeclareEnd(body);
    const declareText = body.slice(0, declareEnd);

    // Remove DECLARE keyword
    const varList = declareText.replace(/^DECLARE\s+/i, '').trim();
    if (!varList) return [];

    // Split on commas at top level (not inside parentheses)
    const vars: DeclaredVar[] = [];
    let current = '';
    let parenDepth = 0;

    for (const ch of varList) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === ',' && parenDepth === 0) {
        const v = this.parseOneVar(current.trim());
        if (v) vars.push(v);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) {
      const v = this.parseOneVar(current.trim());
      if (v) vars.push(v);
    }

    return vars;
  }

  /** Parse a single @VarName TYPE declaration into {name, pgType} */
  private parseOneVar(decl: string): DeclaredVar | null {
    const m = decl.match(/^@(\w+)\s+([\w\s(),]+)$/i);
    if (!m) return null;
    const tsqlType = m[2].trim();
    return {
      name: `p_${m[1]}`,
      pgType: resolveType(tsqlType),
    };
  }

  /** Find where the DECLARE section ends (first SET at start of line) */
  private findDeclareEnd(body: string): number {
    const lines = body.split('\n');
    let pos = 0;
    for (const line of lines) {
      const nextPos = pos + line.length + 1;
      if (/^SET\b/i.test(line.trim()) && pos > 0) {
        return pos;
      }
      pos = nextPos;
    }
    return body.length;
  }

  // ─── SET + EXEC splitting ─────────────────────────────────────────

  /**
   * Split the body (after DECLARE) into SET section and EXEC section.
   * Uses string-literal-aware scanning to avoid false positives from
   * SET or EXEC keywords inside string data.
   */
  private findSetsAndExec(body: string): { setSection: string; execSection: string } {
    const lines = body.split('\n');
    let inString = false;
    let execStartLine = -1;

    // Skip past the DECLARE section first
    let pastDeclare = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!pastDeclare) {
        if (/^SET\b/i.test(trimmed) && !inString) pastDeclare = true;
        else {
          inString = this.updateStringState(lines[i], inString);
          continue;
        }
      }

      if (!inString && /^EXEC\b/i.test(trimmed)) {
        execStartLine = i;
        break;
      }
      inString = this.updateStringState(lines[i], inString);
    }

    if (execStartLine < 0) {
      // No EXEC found — everything after DECLARE is SET section
      const declareEnd = this.findDeclareEnd(body);
      return { setSection: body.slice(declareEnd), execSection: '' };
    }

    const declareEnd = this.findDeclareEnd(body);
    const setSection = lines.slice(0, execStartLine).join('\n').slice(declareEnd);
    const execSection = lines.slice(execStartLine).join('\n');
    return { setSection, execSection };
  }

  // ─── SET parsing ──────────────────────────────────────────────────

  /**
   * Parse SET blocks from the SET section text.
   * Each SET may span multiple lines (for long string values).
   * Uses string-literal-aware splitting.
   */
  private parseSets(setSection: string): SetAssignment[] {
    if (!setSection.trim()) return [];

    const lines = setSection.split('\n');
    const setBlocks: string[] = [];
    let current: string[] = [];
    let inString = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!inString && /^SET\b/i.test(trimmed)) {
        if (current.length > 0) {
          setBlocks.push(current.join('\n'));
        }
        current = [line];
      } else if (trimmed !== '' || current.length > 0) {
        current.push(line);
      }

      inString = this.updateStringState(line, inString);
    }
    if (current.length > 0) {
      setBlocks.push(current.join('\n'));
    }

    return setBlocks
      .map(block => this.parseOneSet(block))
      .filter((s): s is SetAssignment => s !== null);
  }

  /** Parse a single SET block: SET @VarName = value */
  private parseOneSet(setBlock: string): SetAssignment | null {
    // Pattern: SET\s+@VarName\s*=\s*value  or  SET\n  @VarName = value
    const m = setBlock.match(/SET\s+@(\w+)\s*=\s*([\s\S]*)/i);
    if (!m) return null;

    let value = m[2].trim();
    // Remove trailing semicolon if present
    if (value.endsWith(';')) value = value.slice(0, -1).trimEnd();

    return { varName: `p_${m[1]}`, rawValue: value };
  }

  // ─── EXEC parsing ────────────────────────────────────────────────

  /** Parse EXEC [schema].[proc] @p1 = @v1, @p2 = @v2; */
  private parseExec(execSection: string): ExecCall | null {
    if (!execSection.trim()) return null;

    // Strip trailing comments (e.g., "-- End of SQL Logging Session" after the EXEC)
    const execLines = execSection.split('\n');
    const cleanLines: string[] = [];
    let foundSemicolon = false;
    for (const line of execLines) {
      if (foundSemicolon) break; // Stop after the semicolon-terminated EXEC
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) continue; // Skip comment-only lines within EXEC
      cleanLines.push(line);
      // Check if this line ends the EXEC (has ; outside strings)
      if (this.lineEndsSemicolon(trimmed)) foundSemicolon = true;
    }

    // Normalize the exec section: join into one line and remove trailing ;
    const normalized = cleanLines.join(' ').replace(/;\s*$/, '').trim();

    // Match: EXEC [schema].[proc] paramList
    const m = normalized.match(
      /^EXEC\s+(\[?\w+\]?\s*\.\s*\[?\w+\]?)\s+([\s\S]*)$/i
    );
    if (!m) return null;

    const rawProcRef = m[1];
    const paramsStr = m[2].trim();

    // Convert proc reference: [schema].[name] → schema."name"
    const procRef = this.convertProcRef(rawProcRef);

    // Parse parameters: @Param1 = @Var1, @Param2 = @Var2
    const params = this.parseExecParams(paramsStr);

    return { procRef, params };
  }

  /** Convert [schema].[name] to schema."name" */
  private convertProcRef(ref: string): string {
    // [schema].[name]
    const m = ref.match(/\[?(\w+)\]?\s*\.\s*\[?(\w+)\]?/);
    if (!m) return ref;
    return `${m[1]}."${m[2]}"`;
  }

  /** Parse @Param = @Var, @Param2 = @Var2 parameter list */
  private parseExecParams(paramsStr: string): Array<{ paramName: string; valueExpr: string }> {
    const params: Array<{ paramName: string; valueExpr: string }> = [];
    // Split on comma, but respect parentheses and strings
    const parts = this.splitTopLevel(paramsStr, ',');

    for (const part of parts) {
      const trimmed = part.trim();
      // @ParamName = @VarName  or  @ParamName = expression
      const m = trimmed.match(/^@(\w+)\s*=\s*(.+)$/i);
      if (m) {
        const valueExpr = m[2].trim();
        // If value is a @variable reference, convert to p_ prefix
        const varMatch = valueExpr.match(/^@(\w+)$/);
        params.push({
          paramName: `p_${m[1]}`,
          valueExpr: varMatch ? `p_${varMatch[1]}` : this.convertValue(valueExpr),
        });
      }
    }

    return params;
  }

  // ─── Value conversion ─────────────────────────────────────────────

  /**
   * Convert a SET value expression from T-SQL to PostgreSQL.
   * Handles: N-prefix removal, CAST type conversion, string concatenation.
   * IMPORTANT: Only converts SQL syntax outside string literals — string content
   * (like stored SQL queries) is preserved as-is.
   */
  private convertValue(value: string): string {
    let result = value;

    // Remove N prefix from string literals
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

    // Convert CAST types: CAST(x AS NVARCHAR(MAX)) → CAST(x AS TEXT)
    result = result.replace(/\bAS\s+NVARCHAR\s*\(\s*MAX\s*\)/gi, 'AS TEXT');
    result = result.replace(/\bAS\s+NVARCHAR\s*\(\s*(\d+)\s*\)/gi, 'AS VARCHAR($1)');
    result = result.replace(/\bAS\s+UNIQUEIDENTIFIER\b/gi, 'AS UUID');

    // Convert string concatenation: + → || (between string segments)
    result = this.convertStringConcatInValue(result);

    return result;
  }

  /**
   * Convert T-SQL string concatenation + to PG || in SET values.
   * Operates on the full value expression, handling CAST() + 'string' patterns.
   */
  private convertStringConcatInValue(sql: string): string {
    // Segment into code/string parts
    const segments = this.segmentValue(sql);
    let hasString = false;
    for (const seg of segments) {
      if (seg.type === 'string') { hasString = true; break; }
    }
    if (!hasString) return sql;

    // If strings are present, replace + with || in code segments adjacent to strings
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].type !== 'code') continue;
      const prev = i > 0 && segments[i - 1].type === 'string';
      const next = i + 1 < segments.length && segments[i + 1].type === 'string';
      if (prev || next) {
        segments[i].text = segments[i].text.replace(/\+/g, '||');
      }
    }
    return segments.map(s => s.text).join('');
  }

  /** Segment SQL into code and string literal parts */
  private segmentValue(sql: string): Array<{ text: string; type: 'code' | 'string' }> {
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

  // ─── DO $$ block generation ───────────────────────────────────────

  private generateDoBlock(
    comments: string,
    vars: DeclaredVar[],
    assignments: SetAssignment[],
    exec: ExecCall,
  ): string {
    const out: string[] = [];

    if (comments.trim()) out.push(comments);
    out.push('DO $$');
    out.push('DECLARE');
    for (const v of vars) {
      out.push(`  ${v.name} ${v.pgType};`);
    }
    out.push('BEGIN');

    for (const a of assignments) {
      const convertedValue = this.convertValue(a.rawValue);
      // Indent multi-line values
      const valueLines = convertedValue.split('\n');
      if (valueLines.length === 1) {
        out.push(`  ${a.varName} := ${valueLines[0]};`);
      } else {
        out.push(`  ${a.varName} := ${valueLines[0]}`);
        for (let i = 1; i < valueLines.length; i++) {
          out.push(valueLines[i]);
        }
        // Ensure trailing semicolon
        const lastIdx = out.length - 1;
        if (!out[lastIdx].trimEnd().endsWith(';')) {
          out[lastIdx] = out[lastIdx].trimEnd() + ';';
        }
      }
    }

    // Generate PERFORM call
    const paramList = exec.params.map(p => `${p.paramName} := ${p.valueExpr}`).join(', ');
    out.push(`  PERFORM ${exec.procRef}(${paramList});`);

    out.push('END $$;');
    return out.join('\n') + '\n';
  }

  // ─── Utility methods ──────────────────────────────────────────────

  /** Check if a line ends with a semicolon outside of string literals */
  private lineEndsSemicolon(line: string): boolean {
    let inStr = false;
    let lastNonSpace = '';
    for (let i = 0; i < line.length; i++) {
      if (inStr) {
        if (line[i] === "'" && i + 1 < line.length && line[i + 1] === "'") {
          i++;
          continue;
        }
        if (line[i] === "'") inStr = false;
      } else {
        if (line[i] === "'") inStr = true;
        else if (line[i] !== ' ' && line[i] !== '\t') lastNonSpace = line[i];
      }
    }
    return lastNonSpace === ';';
  }

  /** Track single-quote string literal state across a line */
  private updateStringState(line: string, inString: boolean): boolean {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "'") {
        if (i + 1 < line.length && line[i + 1] === "'") {
          i++;
          continue;
        }
        inString = !inString;
      }
    }
    return inString;
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
}
