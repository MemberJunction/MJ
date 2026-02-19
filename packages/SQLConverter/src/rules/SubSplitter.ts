/**
 * Sub-splits compound GO-separated batches into individual statements.
 * Ported from Python sub_split_compound_batch() function.
 *
 * Many GO-separated batches contain multiple statements like:
 * PRINT + ALTER TABLE NOCHECK + INSERT INTO x N.
 * We split these so each is classified and converted separately.
 */

/** Track single-quoted string literal state across a line */
function isInsideString(line: string, inString: boolean): boolean {
  let i = 0;
  while (i < line.length) {
    if (line[i] === "'") {
      if (i + 1 < line.length && line[i + 1] === "'") {
        i += 2; // Doubled quote — no state change
        continue;
      }
      inString = !inString;
    }
    i++;
  }
  return inString;
}

/** Statement keywords that indicate a new statement boundary */
const STMT_KEYWORDS = /^(INSERT\s+INTO|UPDATE\s|DELETE\s|PRINT\s|PRINT\(|ALTER\s+TABLE|GRANT\s|DENY\s|REVOKE\s|SET\s|IF\s+@@|CREATE\s)/i;

/**
 * Sub-split a compound batch into individual statements.
 *
 * IMPORTANT: Tracks single-quoted string literal state so that keyword
 * patterns inside string data (e.g., embedded SQL examples in template
 * text) are NOT treated as statement boundaries.
 */
export function subSplitCompoundBatch(batch: string): string[] {
  const lines = batch.split('\n');
  const upper = batch.trimStart().toUpperCase();

  // Don't sub-split CREATE TABLE/VIEW/PROCEDURE/FUNCTION/TRIGGER blocks
  if (/^CREATE\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\s/i.test(upper)) return [batch];
  if (/^CREATE\s+PROC\s/i.test(upper)) return [batch];
  // Don't split ALTER TABLE with column definitions
  if (/^ALTER\s+TABLE\s/i.test(upper)) return [batch];
  // Don't split BEGIN TRY blocks
  if (upper.startsWith('BEGIN TRY')) return [batch];
  // Don't split DECLARE blocks
  if (upper.startsWith('DECLARE')) return [batch];

  // Check if the batch contains multiple top-level statements
  let keywordCount = 0;
  let hasMultiple = false;
  let inString = false;

  for (const line of lines) {
    if (!inString && STMT_KEYWORDS.test(line.trim())) {
      keywordCount++;
    }
    if (keywordCount > 1) {
      hasMultiple = true;
      break;
    }
    inString = isInsideString(line, inString);
  }

  if (!hasMultiple) return [batch];

  // Split into individual statements, respecting string literal boundaries
  const statements: string[] = [];
  let current: string[] = [];
  inString = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (!inString && STMT_KEYWORDS.test(stripped) && current.length > 0) {
      const stmt = current.join('\n').trim();
      if (stmt) statements.push(stmt);
      current = [line];
    } else {
      current.push(line);
    }
    inString = isInsideString(line, inString);
  }

  if (current.length > 0) {
    const stmt = current.join('\n').trim();
    if (stmt) statements.push(stmt);
  }

  return statements.length > 0 ? statements : [batch];
}
