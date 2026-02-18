/**
 * Splits a SQL file into individual statements, handling:
 * - T-SQL GO batch separators
 * - Semicolon-delimited statements
 * - Multi-line string literals (single quotes)
 * - Dollar-quoted strings ($$...$$ in PostgreSQL)
 * - Block comments
 * - Line comments (-- ...)
 * - BEGIN...END blocks (don't split inside them)
 * - CREATE FUNCTION/PROCEDURE bodies
 * - Empty statements and whitespace-only segments
 */
export class SQLFileSplitter {
  /**
   * Split SQL text into individual statements.
   * @param sql The full SQL file content
   * @param dialect 'tsql' uses GO as batch separator, others use semicolons
   * @returns Array of non-empty SQL statements
   */
  Split(sql: string, dialect: 'tsql' | 'postgres' | string = 'tsql'): string[] {
    if (dialect === 'tsql') {
      return this.splitByGo(sql);
    }
    return this.splitBySemicolon(sql);
  }

  /**
   * Split by T-SQL GO batch separator.
   * GO must appear on its own line (case-insensitive), optionally preceded/followed by whitespace.
   */
  private splitByGo(sql: string): string[] {
    const batches: string[] = [];
    const lines = sql.split('\n');
    let currentBatch: string[] = [];

    for (const line of lines) {
      if (/^\s*GO\s*$/i.test(line)) {
        const batch = currentBatch.join('\n').trim();
        if (batch.length > 0) {
          batches.push(batch);
        }
        currentBatch = [];
      } else {
        currentBatch.push(line);
      }
    }

    // Handle last batch (no trailing GO)
    const lastBatch = currentBatch.join('\n').trim();
    if (lastBatch.length > 0) {
      batches.push(lastBatch);
    }

    // Each GO-delimited batch may contain multiple semicolon-separated statements
    // But for T-SQL, we treat each GO batch as a single unit
    return batches;
  }

  /**
   * Split by semicolons, respecting:
   * - String literals (single quotes)
   * - Dollar-quoted strings ($tag$...$tag$)
   * - Block comments
   * - Line comments
   * - BEGIN...END blocks
   * - CREATE FUNCTION/PROCEDURE bodies
   */
  private splitBySemicolon(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let i = 0;
    let beginDepth = 0;

    while (i < sql.length) {
      // Line comment
      if (sql[i] === '-' && sql[i + 1] === '-') {
        const end = sql.indexOf('\n', i);
        if (end === -1) {
          current += sql.slice(i);
          break;
        }
        current += sql.slice(i, end + 1);
        i = end + 1;
        continue;
      }

      // Block comment
      if (sql[i] === '/' && sql[i + 1] === '*') {
        const end = this.findBlockCommentEnd(sql, i);
        current += sql.slice(i, end);
        i = end;
        continue;
      }

      // Dollar-quoted string (PostgreSQL)
      if (sql[i] === '$') {
        const { content, endPos } = this.consumeDollarQuote(sql, i);
        current += content;
        i = endPos;
        continue;
      }

      // Single-quoted string
      if (sql[i] === '\'') {
        const { content, endPos } = this.consumeStringLiteral(sql, i);
        current += content;
        i = endPos;
        continue;
      }

      // Track BEGIN...END depth
      if (this.matchesKeyword(sql, i, 'BEGIN')) {
        beginDepth++;
        current += sql.slice(i, i + 5);
        i += 5;
        continue;
      }

      if (this.matchesKeyword(sql, i, 'END')) {
        beginDepth = Math.max(0, beginDepth - 1);
        current += sql.slice(i, i + 3);
        i += 3;
        continue;
      }

      // Semicolon — only split if we're not inside a BEGIN...END block
      if (sql[i] === ';' && beginDepth === 0) {
        const stmt = current.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        current = '';
        i++;
        continue;
      }

      current += sql[i];
      i++;
    }

    // Handle trailing content
    const lastStmt = current.trim();
    if (lastStmt.length > 0) {
      statements.push(lastStmt);
    }

    return statements;
  }

  /** Find the end of a block comment, handling nested comments */
  private findBlockCommentEnd(sql: string, start: number): number {
    let depth = 1;
    let i = start + 2;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '/' && sql[i + 1] === '*') {
        depth++;
        i += 2;
      } else if (sql[i] === '*' && sql[i + 1] === '/') {
        depth--;
        i += 2;
      } else {
        i++;
      }
    }
    return i;
  }

  /** Consume a dollar-quoted string ($tag$...$tag$) */
  private consumeDollarQuote(sql: string, start: number): { content: string; endPos: number } {
    // Find the opening tag: $tag$ or $$
    const tagMatch = sql.slice(start).match(/^\$([a-zA-Z0-9_]*)\$/);
    if (!tagMatch) {
      // Not a dollar-quote, just a regular $ character
      return { content: '$', endPos: start + 1 };
    }

    const tag = tagMatch[0]; // e.g. $$ or $body$
    const searchFrom = start + tag.length;
    const endIdx = sql.indexOf(tag, searchFrom);
    if (endIdx === -1) {
      // Unterminated dollar-quote — consume rest of input
      return { content: sql.slice(start), endPos: sql.length };
    }

    const endPos = endIdx + tag.length;
    return { content: sql.slice(start, endPos), endPos };
  }

  /** Consume a single-quoted string literal, handling escaped quotes ('') */
  private consumeStringLiteral(sql: string, start: number): { content: string; endPos: number } {
    let i = start + 1;
    let content = "'";
    while (i < sql.length) {
      if (sql[i] === "'" && sql[i + 1] === "'") {
        // Escaped single quote
        content += "''";
        i += 2;
      } else if (sql[i] === "'") {
        content += "'";
        i++;
        break;
      } else {
        content += sql[i];
        i++;
      }
    }
    return { content, endPos: i };
  }

  /**
   * Check if a keyword appears at position i, bounded by non-word chars.
   * Case-insensitive.
   */
  private matchesKeyword(sql: string, i: number, keyword: string): boolean {
    // Check preceding character is non-word or start of string
    if (i > 0 && /\w/.test(sql[i - 1])) return false;

    const slice = sql.slice(i, i + keyword.length);
    if (slice.toUpperCase() !== keyword.toUpperCase()) return false;

    // Check following character is non-word or end of string
    const afterIdx = i + keyword.length;
    if (afterIdx < sql.length && /\w/.test(sql[afterIdx])) return false;

    return true;
  }
}
