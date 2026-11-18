/**
 * Finds the PostgreSQL extensions a set of migration scripts will `CREATE`.
 *
 * @module lib/pg-preflight/extension-scan
 */

/**
 * `CREATE EXTENSION [IF NOT EXISTS] name`, where the name is a quoted identifier or a bare one.
 * Group 1 is a quoted name (with `""` escapes), group 2 a bare name.
 */
const CREATE_EXTENSION_PATTERN = /\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$-]*))/gi;

/** Line comments and block comments, removed before scanning so commented-out statements don't count. */
const LINE_COMMENT_PATTERN = /--[^\n]*/g;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;

/**
 * Returns the extension names the scripts create, de-duplicated, in first-seen order.
 * Quoted names keep their case; bare names fold to lower case, as PostgreSQL does.
 *
 * @param scripts - Migration SQL texts (placeholder substitution is not needed).
 */
export function ExtractCreatedExtensions(scripts: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const script of scripts) {
    for (const name of extensionsInScript(script)) {
      found.add(name);
    }
  }
  return [...found];
}

/** The extension names one script creates, in order of appearance. */
function extensionsInScript(script: string): string[] {
  const code = script.replace(BLOCK_COMMENT_PATTERN, ' ').replace(LINE_COMMENT_PATTERN, ' ');
  const names: string[] = [];
  for (const match of code.matchAll(CREATE_EXTENSION_PATTERN)) {
    const quoted = match[1];
    names.push(quoted !== undefined ? quoted.replace(/""/g, '"') : match[2].toLowerCase());
  }
  return names;
}
