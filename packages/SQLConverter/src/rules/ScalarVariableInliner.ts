/**
 * Inlines batch-scoped T-SQL scalar variables whose value is a single SELECT, so the statements
 * that use them survive sub-splitting.
 *
 * A T-SQL variable lives for the whole GO batch. The converter sub-splits a batch into statements
 * and converts each one on its own, so a mid-batch
 *
 *     DECLARE @EntityID UNIQUEIDENTIFIER = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'X');
 *
 * was classified on its own and dropped, while every later statement still read `@EntityID` and came
 * out as `@"EntityID"` — not valid PostgreSQL (issue #5364 item 4). Here the declaration is removed
 * and each later reference becomes the subquery itself, which every statement can evaluate alone.
 *
 * The rewrite applies only when it keeps the batch's meaning:
 * - the initializer is one parenthesized SELECT;
 * - the variable is never reassigned;
 * - the SELECT reads no temp table (`#T`) or table variable (`@T`) — batch-local SQL Server objects
 *   the converter does not carry over;
 * - no later statement inserts into, deletes from, merges into, truncates or drops a table the
 *   SELECT reads, or updates a column the SELECT reads — the conditions under which re-evaluating
 *   it could return a different value than the declaration saw.
 * A batch that STARTS with its DECLARE is left alone: it is not sub-split, and the DECLARE-block
 * rules convert it whole.
 *
 * `IF @X IS [NOT] NULL` guards are rewritten to `IF NOT EXISTS (SELECT 1 WHERE (<subquery>) IS
 * [NOT] NULL)`, the guard form ConditionalDDLRule converts, so the guarded block keeps its guard.
 */

/** Position of the `)` matching the `(` at `openPos`, skipping string literals; -1 if unbalanced. */
function matchParen(sql: string, openPos: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openPos; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'" && sql[i + 1] === "'") i++;
      else if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Remove `--` and block comments (string-literal aware) so statement analysis sees code only. */
function stripComments(sql: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'" && sql[i + 1] === "'") out += sql[++i];
      else if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") { inString = true; out += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl < 0 ? sql.length : nl - 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Replace `@name` references (whole word, outside string literals) with `replacement`. */
function replaceVariable(sql: string, name: string, replacement: string): string {
  const ref = new RegExp(`@${name}\\b`, 'gi');
  let out = '';
  let last = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] !== "'") continue;
    if (inString && sql[i + 1] === "'") { i++; continue; }
    if (!inString) {
      out += sql.slice(last, i).replace(ref, () => replacement);
      last = i;
    } else {
      out += sql.slice(last, i + 1);
      last = i + 1;
    }
    inString = !inString;
  }
  const tail = sql.slice(last);
  return out + (inString ? tail : tail.replace(ref, () => replacement));
}

/** Last part of a possibly qualified, possibly bracketed/quoted name, lower-cased. */
function bareName(qualified: string): string {
  const parts = qualified.split('.');
  return parts[parts.length - 1].replace(/^[[\"]|[\]"]$/g, '').toLowerCase();
}

/** Tables a SELECT reads (FROM / JOIN targets), as bare lower-cased names. */
function tablesRead(select: string): Set<string> {
  const tables = new Set<string>();
  for (const m of select.matchAll(/\b(?:FROM|JOIN)\s+((?:[[\]"\w${}:]+\.)*[[\]"\w]+)/gi)) {
    tables.add(bareName(m[1]));
  }
  return tables;
}

/** Identifiers a SELECT mentions, as lower-cased names (bracketed or bare). */
function identifiersIn(select: string): Set<string> {
  const ids = new Set<string>();
  for (const m of select.matchAll(/\[?([A-Za-z_]\w*)\]?/g)) ids.add(m[1].toLowerCase());
  return ids;
}

/** True when `later` may change what `select` returns (see the module comment). */
function laterWritesAffect(select: string, later: string): boolean {
  const tables = tablesRead(select);
  const columns = identifiersIn(select);
  const code = stripComments(later);
  for (const m of code.matchAll(/\b(?:INSERT\s+INTO|DELETE\s+FROM|MERGE(?:\s+INTO)?|TRUNCATE\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+((?:[[\]"\w${}:]+\.)*[[\]"\w]+)/gi)) {
    if (tables.has(bareName(m[1]))) return true;
  }
  for (const m of code.matchAll(/\bUPDATE\s+((?:[[\]"\w${}:]+\.)*[[\]"\w]+)\s+SET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b|;|$)/gi)) {
    if (!tables.has(bareName(m[1]))) continue;
    for (const a of m[2].matchAll(/\[?([A-Za-z_]\w*)\]?\s*=/g)) {
      if (columns.has(a[1].toLowerCase())) return true;
    }
  }
  return false;
}

/** True when the first statement of the batch (ignoring comments and session SETs) is a DECLARE. */
function startsWithDeclare(batch: string): boolean {
  const code = stripComments(batch).replace(/^\s*(?:SET\s+(?:NOCOUNT|XACT_ABORT|ANSI_NULLS|QUOTED_IDENTIFIER)\s+(?:ON|OFF)\s*;?\s*)*/i, '');
  return /^\s*DECLARE\s+@/i.test(code);
}

/** Rewrite `IF @name IS [NOT] NULL` guards to NOT EXISTS probes over the inlined SELECT. */
function rewriteNullGuards(sql: string, name: string, select: string): string {
  const raiseGuard = new RegExp(
    `\\bIF\\s+@${name}\\s+IS\\s+NULL\\s+(RAISERROR\\s*\\((?:'(?:''|[^'])*'|[^()'])*\\))\\s*;?`, 'gi'
  );
  let out = sql.replace(raiseGuard, (_m, raise: string) =>
    `IF NOT EXISTS (SELECT 1 WHERE (${select}) IS NOT NULL)\nBEGIN\n    ${raise};\nEND`);
  out = out.replace(new RegExp(`\\bIF\\s+@${name}\\s+IS\\s+NOT\\s+NULL\\b`, 'gi'),
    () => `IF NOT EXISTS (SELECT 1 WHERE (${select}) IS NULL)`);
  out = out.replace(new RegExp(`\\bIF\\s+@${name}\\s+IS\\s+NULL\\b`, 'gi'),
    () => `IF NOT EXISTS (SELECT 1 WHERE (${select}) IS NOT NULL)`);
  return out;
}

/**
 * Inline every eligible mid-batch `DECLARE @X <type> = (SELECT ...)` in one GO batch.
 * Returns the batch unchanged when nothing qualifies.
 */
export function InlineScalarSelectVariables(batch: string): string {
  if (startsWithDeclare(batch)) return batch;
  const declare = /^[ \t]*DECLARE\s+@(\w+)\s+\w+(?:\s*\(\s*(?:\d+|MAX)\s*(?:,\s*\d+\s*)?\))?\s*=\s*\(/gim;
  let result = batch;
  let searchFrom = 0;
  for (;;) {
    declare.lastIndex = searchFrom;
    const m = declare.exec(result);
    if (!m) break;
    const name = m[1];
    const open = m.index + m[0].length - 1;
    const close = matchParen(result, open);
    if (close < 0) break;
    const select = result.slice(open + 1, close).trim();
    let end = close + 1;
    const semi = result.slice(end).match(/^\s*;/);
    if (semi) end += semi[0].length;
    const later = result.slice(end);

    const reassigned = new RegExp(`\\b(?:SET|SELECT)\\s+@${name}\\s*=`, 'i').test(stripComments(later));
    const readsBatchLocal = /\b(?:FROM|JOIN)\s+[#@]/i.test(select);
    if (!/^SELECT\b/i.test(select) || readsBatchLocal || reassigned || laterWritesAffect(select, later)) {
      searchFrom = end;
      continue;
    }

    const rewritten = replaceVariable(rewriteNullGuards(later, name, select), name, `(${select})`);
    const note = `-- @${name} (T-SQL batch variable) is inlined below as its SELECT`;
    result = result.slice(0, m.index) + note + rewritten;
    searchFrom = m.index + note.length;
  }
  return result;
}
