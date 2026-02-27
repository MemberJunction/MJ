/**
 * Sub-splits compound GO-separated batches into individual statements.
 * Ported from Python sub_split_compound_batch() function.
 *
 * Many GO-separated batches contain multiple statements like:
 * PRINT + ALTER TABLE NOCHECK + INSERT INTO x N.
 * We split these so each is classified and converted separately.
 */

/** SQL parse state tracked across lines */
interface ParseState {
  inString: boolean;
  inBlockComment: boolean;
}

/**
 * Track SQL parse state (string literal + block comment) across a single line.
 * Handles:
 *   - Line comments (--): rest of line ignored
 *   - Block comments (/* ... * /): may span multiple lines
 *   - String literals ('...'): doubled '' is an escape, not a boundary
 */
function trackLineState(line: string, state: ParseState): ParseState {
  let inString = state.inString;
  let inBlockComment = state.inBlockComment;
  let i = 0;

  while (i < line.length) {
    if (inBlockComment) {
      // Inside block comment — only look for closing */
      if (line[i] === '*' && i + 1 < line.length && line[i + 1] === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inString) {
      // Inside string literal — only look for closing '
      if (line[i] === "'") {
        if (i + 1 < line.length && line[i + 1] === "'") {
          i += 2; // Doubled quote — escape, not boundary
          continue;
        }
        inString = false;
      }
      i++;
      continue;
    }

    // Normal code context
    // Line comment — rest of line is comment, skip entirely
    if (line[i] === '-' && i + 1 < line.length && line[i + 1] === '-') {
      return { inString, inBlockComment };
    }

    // Block comment start
    if (line[i] === '/' && i + 1 < line.length && line[i + 1] === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    // String literal start
    if (line[i] === "'") {
      if (i + 1 < line.length && line[i + 1] === "'") {
        i += 2; // Doubled quote outside string — skip
        continue;
      }
      inString = true;
    }

    i++;
  }

  return { inString, inBlockComment };
}

/** Statement keywords that indicate a new statement boundary.
 * NOTE: SET is intentionally excluded — it would split UPDATE...SET into two
 * statements. Standalone SET commands (SET NOEXEC, SET ANSI_NULLS, etc.) are
 * already handled by preprocessor/postprocessor removal rules. */
const STMT_KEYWORDS = /^(INSERT\s+INTO|UPDATE\s|DELETE\s|PRINT\s|PRINT\(|ALTER\s+TABLE|GRANT\s|DENY\s|REVOKE\s|IF\s+@@|IF\s+NOT\s+EXISTS|IF\s+OBJECT_ID|EXEC\s|CREATE\s)/i;

/** IF conditionals whose next top-level keyword is the single-statement body.
 * T-SQL allows IF without BEGIN/END for single-statement bodies:
 *   IF NOT EXISTS (...) CREATE INDEX ...
 * The sub-splitter must keep these as one batch. */
const IF_CONDITION_PATTERN = /^IF\s+(NOT\s+EXISTS|OBJECT_ID|@@)/i;

/**
 * Sub-split a compound batch into individual statements.
 *
 * IMPORTANT: Tracks single-quoted string literal state AND block comment
 * state so that keyword patterns inside string data or comments (e.g.,
 * apostrophes in `-- we're checking` comments) are NOT treated as
 * statement boundaries.
 */
export function subSplitCompoundBatch(batch: string): string[] {
  const lines = batch.split('\n');
  const upper = batch.trimStart().toUpperCase();

  // Strip leading single-line comments to get the first real SQL keyword
  const upperNoComments = stripLeadingComments(batch).trimStart().toUpperCase();

  // Don't sub-split CREATE TABLE/VIEW/PROCEDURE/FUNCTION/TRIGGER blocks
  if (/^CREATE\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\s/i.test(upperNoComments)) return [batch];
  if (/^CREATE\s+PROC\s/i.test(upperNoComments)) return [batch];
  // Don't split ALTER TABLE with column definitions
  if (/^ALTER\s+TABLE\s/i.test(upperNoComments)) return [batch];
  // Don't split BEGIN TRY blocks
  if (upperNoComments.startsWith('BEGIN TRY') || upper.startsWith('BEGIN TRY')) return [batch];
  // Don't split DECLARE blocks
  if (upperNoComments.startsWith('DECLARE') || upper.startsWith('DECLARE')) return [batch];

  // Check if the batch contains multiple top-level statements
  // Track BEGIN/END depth so we don't count keywords inside IF...BEGIN...END blocks
  let keywordCount = 0;
  let hasMultiple = false;
  let state: ParseState = { inString: false, inBlockComment: false };
  let beginDepth = 0;
  // Track IF conditionals: the next keyword after IF NOT EXISTS / IF OBJECT_ID / IF @@
  // is the IF body (single-statement form without BEGIN/END), not a new statement
  let ifBodyPending = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (!state.inString && !state.inBlockComment) {
      if (/^\bBEGIN\b/i.test(stripped)) {
        beginDepth++;
        ifBodyPending = false; // body uses BEGIN/END, handled by depth tracking
      }
      if (/^\bEND\b/i.test(stripped)) beginDepth = Math.max(0, beginDepth - 1);
      if (beginDepth === 0 && STMT_KEYWORDS.test(stripped)) {
        if (ifBodyPending) {
          // This keyword is the single-statement body of the IF — don't count
          ifBodyPending = false;
        } else {
          keywordCount++;
          ifBodyPending = IF_CONDITION_PATTERN.test(stripped);
        }
      }
    }
    if (keywordCount > 1) {
      hasMultiple = true;
      break;
    }
    state = trackLineState(line, state);
  }

  if (!hasMultiple) return [batch];

  // Split into individual statements, respecting string literal, block comment,
  // and BEGIN/END boundaries
  const statements: string[] = [];
  let current: string[] = [];
  state = { inString: false, inBlockComment: false };
  beginDepth = 0;
  ifBodyPending = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (!state.inString && !state.inBlockComment) {
      // Track BEGIN/END depth BEFORE deciding whether to split
      if (/^\bBEGIN\b/i.test(stripped)) {
        beginDepth++;
        ifBodyPending = false; // body uses BEGIN/END, handled by depth tracking
      }

      // Only split at top level (outside BEGIN/END blocks)
      if (beginDepth === 0 && STMT_KEYWORDS.test(stripped) && current.length > 0) {
        if (ifBodyPending) {
          // This keyword is the single-statement body of the IF — keep together
          current.push(line);
          ifBodyPending = false;
        } else {
          const stmt = current.join('\n').trim();
          if (stmt) statements.push(stmt);
          current = [line];
          ifBodyPending = IF_CONDITION_PATTERN.test(stripped);
        }
      } else {
        current.push(line);
        // Track IF conditions even for the first keyword (when current was empty)
        if (beginDepth === 0 && IF_CONDITION_PATTERN.test(stripped)) {
          ifBodyPending = true;
        }
      }

      if (/^\bEND\b/i.test(stripped)) beginDepth = Math.max(0, beginDepth - 1);
    } else {
      current.push(line);
    }
    state = trackLineState(line, state);
  }

  if (current.length > 0) {
    const stmt = current.join('\n').trim();
    if (stmt) statements.push(stmt);
  }

  return statements.length > 0 ? statements : [batch];
}

/** Strip leading single-line (--) and block comments from SQL text */
function stripLeadingComments(sql: string): string {
  let s = sql.trimStart();
  while (s.length > 0) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl < 0 ? '' : s.slice(nl + 1).trimStart();
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end < 0 ? '' : s.slice(end + 2).trimStart();
    } else {
      break;
    }
  }
  return s;
}
