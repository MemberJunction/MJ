#!/usr/bin/env node
/**
 * CI gate: dynamic `String.prototype.replace` replacements
 *
 * `replace(search, replacement)` treats `$$`, `$&`, `` $` ``, `$'` and `$1`-`$99`
 * as metacharacters when `replacement` is a STRING. Passing runtime data there —
 * a password, a user property, a search term, a prompt fragment — silently
 * corrupts it, and in the `$&`/`` $` ``/`$'` cases splices surrounding text into
 * the value. Issue #3171 found this in ~13 places, including one that wrote
 * corrupted DB passwords into `.env`.
 *
 * The fix is always a replacement FUNCTION: `.replace(pattern, () => value)`.
 * A function's return value is used literally, with no `$` expansion.
 *
 * This gate flags any `.replace(`/`.replaceAll(` whose second argument is
 * neither a plain string literal nor a function. A *static* string literal is
 * deliberately allowed: an author writing `'$1'` means the back-reference. The
 * bug class is runtime data reaching the replacement slot.
 *
 * To accept a specific site (e.g. the replacement was already `$`-escaped, or an
 * identifier holds a function reference), put `safe-replace:` followed by a
 * reason in a comment anywhere within the call, or on the line above it.
 *
 * The existing `string-replace-all-occurrences` React lint rule does NOT cover
 * this: it only ever inspects the *search* argument.
 *
 * SCOPE: line-aware by default. The repo carries pre-existing dynamic
 * replacements, some benign (a bare identifier holding a function reference is
 * indistinguishable from one holding a string), so the gate reports a violation
 * only when the change touched some line of that call. `--all` reports
 * everything under `packages/` and is for auditing, not for CI.
 *
 * Usage:
 *   node check-dynamic-replace.mjs                # lines changed vs origin/next
 *   node check-dynamic-replace.mjs --base <ref>   # changed vs <ref>
 *   node check-dynamic-replace.mjs --all          # audit every file under packages/
 *   node check-dynamic-replace.mjs --file <path>  # a single file, all lines
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx']);
const SUPPRESSION = 'safe-replace:';

/**
 * Directories we do not own or that never ship runtime code. `bundled-libs`
 * and `vendor` hold vendored third-party source (date-fns, lodash, mathjs, …) —
 * their `replace` calls are upstream's problem, not ours.
 */
const SKIP_DIR_SEGMENTS = [
  'node_modules', 'dist', 'build', 'coverage', 'generated',
  '__tests__', '__mocks__', '.git', 'docs', 'guides', 'plans',
  'bundled-libs', 'vendor',
];

/**
 * Runs git with `core.quotePath=false` and `-C REPO_ROOT`, matching
 * `check-changeset-bump.mjs`. Without quotePath, git C-quotes any path holding
 * non-ASCII bytes (`"metadata/caf\303\251.json"`), and that file is then
 * silently skipped — a bug that sibling script already shipped once.
 */
function git(args) {
  return execFileSync('git', ['-C', REPO_ROOT, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
  });
}

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/**
 * Decide whether the `/` at `index` opens a regex literal rather than being a
 * division operator, using the standard preceding-token heuristic. Getting this
 * right matters: `.replace(/'/g, x)` contains a quote INSIDE a regex, and
 * treating it as a string opener desynchronises the whole scan.
 */
function isRegexPosition(source, index) {
  let k = index - 1;
  while (k >= 0 && /\s/.test(source[k])) k--;
  if (k < 0) return true;
  const prev = source[k];
  if ('(,=:[!&|?{};+-*%^~<>'.includes(prev)) return true;
  const word = /([A-Za-z_$]+)$/.exec(source.slice(0, k + 1));
  return word
    ? ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await']
        .includes(word[1])
    : false;
}

/**
 * Blank out comments and the *contents* of string, template and regex literals
 * so that a `.replace(` inside a string, or a comma or brace inside a regex,
 * can't be mistaken for real syntax.
 *
 * Implemented as a mode stack rather than a flat loop, because template
 * interpolations nest: the code inside `${…}` may itself contain strings,
 * regexes and further templates. A flat scan left those inner strings unmasked,
 * so a `.replace(` mentioned inside one was scanned as if it were real code.
 *
 * Delimiters and the `${` / `}` interpolation markers survive masking, so
 * `classifyReplacementArg` can still tell a static template from an
 * interpolated one. Newlines survive so line numbers stay accurate.
 */
export function maskLiteralsAndComments(source) {
  const out = source.split('');
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };

  // 'code' frames track brace depth so a `}` closing an object literal isn't
  // mistaken for the `}` that ends an interpolation.
  const stack = [{ kind: 'code', braceDepth: 0 }];
  let i = 0;

  while (i < n) {
    const frame = stack[stack.length - 1];
    const c = source[i];
    const next = source[i + 1];

    if (frame.kind === 'template') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && next === '{') { stack.push({ kind: 'code', braceDepth: 0 }); i += 2; continue; }
      if (c !== '\n') out[i] = ' ';
      i++;
      continue;
    }

    if (c === '/' && next === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j++;
      blank(i, j + 2);
      i = j + 2;
      continue;
    }
    if (c === '/' && isRegexPosition(source, i)) {
      let j = i + 1;
      let inCharClass = false;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '\n') break;
        if (source[j] === '[') inCharClass = true;
        else if (source[j] === ']') inCharClass = false;
        else if (source[j] === '/' && !inCharClass) break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === c || source[j] === '\n') break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '`') { stack.push({ kind: 'template', braceDepth: 0 }); i++; continue; }
    if (c === '{') { frame.braceDepth++; i++; continue; }
    if (c === '}') {
      if (frame.braceDepth === 0 && stack.length > 1) stack.pop(); // ends an interpolation
      else frame.braceDepth--;
      i++;
      continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * Given the index of the '(' that opens a call, return the top-level arguments
 * as {text, start} records plus the index of the closing paren, or null if the
 * call is unterminated.
 */
export function splitCallArguments(masked, openParenIndex) {
  const n = masked.length;
  let depth = 0;
  const args = [];
  let argStart = openParenIndex + 1;

  for (let i = openParenIndex; i < n; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        args.push({ text: masked.slice(argStart, i), start: argStart });
        return { args, end: i };
      }
    } else if (c === ',' && depth === 1) {
      args.push({ text: masked.slice(argStart, i), start: argStart });
      argStart = i + 1;
    }
  }
  return null;
}

/** True when the argument contains a `=>` outside any nested bracket group. */
export function hasTopLevelArrow(arg) {
  let depth = 0;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '=' && arg[i + 1] === '>' && depth === 0) return true;
  }
  return false;
}

/**
 * Is this second argument safe? Safe means: a function (its return value is
 * used literally), or a static string literal with no interpolation.
 */
export function classifyReplacementArg(argText) {
  const arg = argText.trim();
  if (arg.length === 0) return { safe: true, reason: 'empty' };

  if (/^(async\s+)?function\b/.test(arg)) return { safe: true, reason: 'function' };

  // An arrow only counts when its `=>` is at the TOP level of this argument.
  // A leading `(` is NOT sufficient: `(a ?? '').replace(...)` also starts with
  // one, and `list.map(x => x).join('')` has a `=>` nested inside a call — both
  // produce strings, not functions.
  if (hasTopLevelArrow(arg)) return { safe: true, reason: 'function' };

  // Masking blanked literal bodies, so a static literal is just its delimiters.
  if (/^'[^']*'$/.test(arg) || /^"[^"]*"$/.test(arg)) {
    return { safe: true, reason: 'string-literal' };
  }
  if (/^`[^`]*`$/.test(arg)) {
    return arg.includes('${')
      ? { safe: false, reason: 'interpolated-template' }
      : { safe: true, reason: 'string-literal' };
  }

  return { safe: false, reason: 'dynamic-expression' };
}

/**
 * Find every unsafe `.replace(`/`.replaceAll(` in one file's source.
 *
 * Each violation carries the full line SPAN of the call, not just the line the
 * `.replace(` sits on. A multi-line call whose replacement argument is three
 * lines below would otherwise be attributed to a line the change never touched,
 * and the line-aware filter would wave it through.
 */
export function findViolations(source) {
  const masked = maskLiteralsAndComments(source);
  const rawLines = source.split('\n');
  const lineAt = (index) => masked.slice(0, index).split('\n').length;
  const violations = [];
  const callRe = /\.(replace|replaceAll)\s*\(/g;

  let match;
  while ((match = callRe.exec(masked)) !== null) {
    const openParen = masked.indexOf('(', match.index + 1);
    const parsed = splitCallArguments(masked, openParen);
    if (!parsed || parsed.args.length < 2) continue;

    const verdict = classifyReplacementArg(parsed.args[1].text);
    if (verdict.safe) continue;

    const startLine = lineAt(match.index);
    const endLine = lineAt(parsed.end);
    // Anchor to the argument's first non-whitespace character: `args[1].start`
    // sits immediately after the comma, which on a wrapped call is still the
    // previous line.
    const leadingWs = /^\s*/.exec(parsed.args[1].text)[0].length;
    const argLine = lineAt(parsed.args[1].start + leadingWs);

    // Suppression may sit anywhere inside the call, or on the line above it.
    const scanFrom = Math.max(0, startLine - 2);
    if (rawLines.slice(scanFrom, endLine).some((l) => l.includes(SUPPRESSION))) continue;

    violations.push({
      line: argLine,
      startLine,
      endLine,
      method: match[1],
      reason: verdict.reason,
      text: (rawLines[argLine - 1] ?? '').trim(),
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------

function isSkippedPath(p) {
  const parts = p.split(/[\\/]/);
  return SKIP_DIR_SEGMENTS.some((seg) => parts.includes(seg));
}

function walk(dir, acc) {
  // Deliberately NOT wrapped in try/catch: an unreadable directory means the
  // audit is incomplete, and a gate must not quietly under-report.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (isSkippedPath(relative(REPO_ROOT, full))) continue;
    if (entry.isDirectory()) walk(full, acc);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) acc.push(full);
  }
  return acc;
}

/**
 * Map of absolute file path -> Set of line numbers the change touched, in
 * WORKING-TREE coordinates.
 *
 * One diff, not three. `git diff <mergeBase>` compares the merge base directly
 * against the working tree, so committed, staged and unstaged edits all land in
 * a single coordinate system. Merging a `mergeBase...HEAD` diff (line numbers in
 * HEAD) with a `git diff HEAD` diff (line numbers in the working tree) produced
 * offsets that disagreed whenever a branch had both commits and uncommitted
 * edits.
 */
function changedLines(baseRef) {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', baseRef, 'HEAD']).trim();
  } catch {
    // Hard failure, not a warning. A gate that silently downgrades its scope and
    // then prints "clean" is worse than one that stops and asks to be fixed.
    console.error(
      `✗ check-dynamic-replace: cannot resolve '${baseRef}'.\n` +
      `  Fetch it (git fetch origin) or pass --base <ref>. Refusing to report a\n` +
      `  pass against an unknown scope.`,
    );
    process.exit(2);
  }

  const touched = new Map();
  const diff = git(['diff', '--unified=0', '--diff-filter=ACMR', mergeBase]);
  let current = null;
  for (const line of diff.split('\n')) {
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) {
      current = join(REPO_ROOT, fileMatch[1]);
      if (!touched.has(current)) touched.set(current, new Set());
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let l = start; l < start + count; l++) touched.get(current).add(l);
    }
  }

  // Untracked files are entirely new — every line counts.
  for (const f of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
    touched.set(join(REPO_ROOT, f), null); // null = all lines
  }
  return touched;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  let mode = 'diff';
  let baseRef = process.env.BASE_REF || 'origin/next';
  let singleFile = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') mode = 'all';
    else if (argv[i] === '--base') baseRef = argv[++i];
    else if (argv[i] === '--file') { mode = 'single'; singleFile = argv[++i]; }
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('Usage: check-dynamic-replace.mjs [--all | --file <path> | --base <ref>]');
      return 0;
    }
  }

  // file -> Set of changed lines, or null meaning "report every line".
  let lineFilter;
  if (mode === 'single') lineFilter = new Map([[singleFile, null]]);
  else if (mode === 'all') {
    lineFilter = new Map(walk(join(REPO_ROOT, 'packages'), []).map((f) => [f, null]));
  } else lineFilter = changedLines(baseRef);

  const files = [...lineFilter.keys()].filter(
    (f) =>
      f &&
      SOURCE_EXTENSIONS.has(extname(f)) &&
      !isSkippedPath(relative(REPO_ROOT, f)) &&
      existsSync(f) &&
      statSync(f).isFile(),
  );

  let total = 0;
  for (const file of files) {
    const touchedLines = lineFilter.get(file);
    const violations = findViolations(readFileSync(file, 'utf8')).filter((v) => {
      if (touchedLines === null) return true;
      // Any line of the call being touched is enough — the replacement argument
      // often sits several lines below the `.replace(`.
      for (let l = v.startLine; l <= v.endLine; l++) if (touchedLines.has(l)) return true;
      return false;
    });
    if (violations.length === 0) continue;
    const rel = relative(REPO_ROOT, file);
    for (const v of violations) {
      console.error(`${rel}:${v.line}  .${v.method}() replacement is a ${v.reason}`);
      console.error(`    ${v.text}`);
      total++;
    }
  }

  if (total > 0) {
    console.error(`
✗ ${total} dynamic replace${total === 1 ? '' : 's'} found.

  A STRING replacement expands $$, $&, $\` , $' and $1-$99 — so any '$' in the
  replacement data is silently executed instead of inserted (issue #3171).

  Fix:   .replace(pattern, () => value)
         .replace(pattern, (_m, p1) => \`\${p1}\${value}\`)   // keeps capture groups

  If a site is genuinely safe (already $-escaped, or the identifier holds a
  function), add a comment containing "${SUPPRESSION} <reason>" inside the call
  or on the line above.`);
    return 1;
  }

  console.log(`✓ check-dynamic-replace: ${files.length} file(s) clean`);
  return 0;
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
