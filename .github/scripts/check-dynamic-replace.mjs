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
 * To accept a site (e.g. the replacement was already `$`-escaped, or an
 * identifier holds a function reference), put `safe-replace:` followed by a
 * reason inside the call, or in the contiguous comment block immediately above
 * it.
 *
 * The hatch is COARSE, deliberately, and it is worth knowing how coarse: the
 * marker suppresses every `.replace(` whose span it falls in, not one specific
 * call, so on a chained or multi-line expression it silences the neighbours too.
 * The scan also reads raw lines rather than the masked buffer, so the text
 * `safe-replace:` inside a string literal suppresses just as a comment would.
 * Both were traded for a marker that is easy to place correctly; a marker that
 * silently fails to apply is worse than one that applies too widely, because
 * only the first looks like it worked. Prefer putting the marker on the call it
 * is about, and keep chains short enough that the span means something.
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
 * KNOWN LIMITS. This is a masking scanner, not a parser, and `/` is ambiguous in
 * JS/TS. Three shapes are still mis-read as regex-vs-division, each costing a
 * FALSE NEGATIVE confined to the remainder of that ONE line:
 *   - JSX text containing a slash            `<div>{a}/{b} {s.replace(p, v)}</div>`
 *   - a TS non-null assertion before `/`     `count! / 2`   (`!` also precedes a real regex)
 *   - a regex opening after `)`              `if (x) /re/.test(y)`  (vs `(a+b) / 2`)
 * Resolving these needs real parsing; guessing differently just moves the false
 * negative somewhere more common. What is NOT tolerated is unbounded damage: if
 * the scan ends mid-frame the file is reported as unscannable and the run fails,
 * rather than being counted as clean.
 *
 * Usage:
 *   node check-dynamic-replace.mjs                # lines changed vs origin/next
 *   node check-dynamic-replace.mjs --base <ref>   # changed vs <ref>
 *   node check-dynamic-replace.mjs --all          # audit every file under packages/
 *   node check-dynamic-replace.mjs --file <path>  # a single file, all lines
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from 'node:fs';
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
 * Ceiling on what we'll buffer from a single git invocation.
 *
 * `execFileSync` buffers the child's whole stdout and defaults to just 1 MiB —
 * far under what this gate asks for. `git diff --unified=0` over a real PR runs
 * to megabytes (the materialization PR, #3735, produced 897 KB on its own), and
 * once the default was exceeded the gate died with a raw `spawnSync git ENOBUFS`
 * stack and exit 1: an unrelated PR turned red, pointing at Node internals
 * rather than at anything its author wrote. 256 MiB is far above any plausible
 * diff while still being a bound rather than "however much RAM there is".
 *
 * Overridable only so the exceeded-the-cap path stays testable without
 * generating a quarter-gigabyte of diff.
 */
const GIT_MAX_BUFFER = Number(process.env.MJ_GIT_MAX_BUFFER) || 256 * 1024 * 1024;

/**
 * Runs git with `core.quotePath=false` and `-C REPO_ROOT`, matching
 * `check-changeset-bump.mjs`. Without quotePath, git C-quotes any path holding
 * non-ASCII bytes (`"metadata/caf\303\251.json"`), and that file is then
 * silently skipped — a bug that sibling script already shipped once.
 */
function git(args) {
  return execFileSync('git', ['-C', REPO_ROOT, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
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
const REGEX_PRECEDING_KEYWORDS = [
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await',
];

/**
 * `masked` is the in-progress output buffer, NOT the raw source. Everything
 * before `index` has already been blanked, so looking back over it skips
 * comments and literal bodies as whitespace and lands on the last real code
 * character.
 *
 * Looking back over the RAW source instead is what let a trailing `//` comment
 * masquerade as code: the scan landed on the comment's last word, judged the
 * next line's `/` to be division, left the regex unmasked, and a backtick inside
 * it opened a template frame that never closed — blanking the rest of the FILE
 * and making the gate print "clean" over code it never parsed. Two real files
 * did exactly this.
 */
function isRegexPosition(masked, index) {
  let k = index - 1;
  while (k >= 0 && /\s/.test(masked[k])) k--;
  if (k < 0) return true;
  const prev = masked[k];

  // `</` with nothing between is a JSX closing tag, never a regex: no real JS or
  // TS writes `a</re/`, but every `.tsx` file writes `</div>`.
  if (prev === '<' && k === index - 1) return false;
  // `/>` closes a self-closing JSX tag — `<Foo x={1} />`, the commonest JSX
  // shape, whose `}` would otherwise be read below as "an operand is expected"
  // and claim the `/` as a regex opener.
  //
  // Restricted to `}` deliberately. Testing `/>` alone was far too broad: it
  // also swallowed every regex literal that simply STARTS with `>`, so
  // `html.replace(/>/g, userValue)` left `/>/` unmasked, the closing `/` opened
  // a second "regex", and the rest of the line vanished. 53 files here contain
  // `replace(/>`, and HTML-escape chains are exactly where a dynamic
  // replacement gets appended. Every other self-closing form already resolves
  // correctly: `<Foo />` and `<Foo x="1" />` end in an identifier or a quote,
  // which fall through to the keyword test below and are read as division.
  if (prev === '}' && masked[index + 1] === '>') return false;
  // `i++ / 2` and `i-- / 2` are division. The bare `+`/`-` in the operator set
  // below would otherwise read the `/` as opening a regex.
  if ((prev === '+' || prev === '-') && masked[k - 1] === prev) return false;

  if ('(,=:[!&|?{};+-*%^~<>'.includes(prev)) return true;

  // Walk back over an identifier rather than slicing the whole buffer — this
  // runs once per '/' in the file, so the slice was quadratic on large sources.
  let end = k;
  while (k >= 0 && /[A-Za-z_$]/.test(masked[k])) k--;
  return REGEX_PRECEDING_KEYWORDS.includes(masked.slice(k + 1, end + 1).join(''));
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
function maskSource(source) {
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
    if (c === '/' && isRegexPosition(out, i)) {
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
  // A leftover frame means the scan lost sync. From there on the mask is
  // fiction and every `.replace(` past it is invisible, so the caller has to
  // fail loudly rather than report a clean file. Across all 5,079 source files
  // in this repo it never fires; it exists so that a shape the scanner cannot
  // follow surfaces as an error instead of as a pass.
  return { masked: out.join(''), desynced: stack.length > 1 };
}

/**
 * Public face of the masker: the masked text alone. `findViolations` uses
 * `maskSource` directly so it can also see the desync flag.
 */
export function maskLiteralsAndComments(source) {
  return maskSource(source).masked;
}

/** Thrown when the scan cannot be trusted; never swallowed into a clean result. */
export class UnparseableSourceError extends Error {
  constructor() {
    super(
      'scanner lost sync (unterminated string, template or regex) — the mask is ' +
      'unreliable from that point, so this file cannot be checked',
    );
    this.name = 'UnparseableSourceError';
  }
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

/** A line that is entirely comment — `//`, or a `/* … *\/` body or delimiter. */
function isCommentLine(line) {
  const t = (line ?? '').trim();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
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
  const { masked, desynced } = maskSource(source);
  if (desynced) throw new UnparseableSourceError();
  const rawLines = source.split('\n');
  // Offsets of every line start, built once, then binary-searched. The obvious
  // `masked.slice(0, index).split('\n').length` copies and splits the whole
  // prefix on EVERY lookup, and there are three lookups per violation — O(V·N).
  // On a 20k-violation file that measured 8.3s, and 212s at 100k.
  const lineStarts = [0];
  for (let i = 0; i < masked.length; i++) if (masked[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (index) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-based
  };
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

    // Suppression may sit anywhere inside the call, or in the contiguous comment
    // block immediately above it. The block, not just one line: the hatch exists
    // to force a written reason, and a reason worth writing rarely fits on the
    // line above — put it on two and the marker silently fell out of range.
    // Walking only over comment lines keeps it anchored: a blank line or any code
    // ends the block, so a marker cannot drift onto an unrelated call below.
    let scanFrom = startLine - 1; // 0-based index of the line above the call
    while (scanFrom > 0 && isCommentLine(rawLines[scanFrom - 1])) scanFrom--;
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
    // Dot-directories are build and tool caches, never source we own:
    // `.angular/cache` holds Vite-processed copies of marked.js / xlsx.js /
    // mermaid.js, and on a checkout that has run the Explorer build those
    // vendored bundles supplied roughly two thirds of every finding — the same
    // third-party code `bundled-libs`/`vendor` are listed to exclude. That made
    // `check:dynamic-replace:all` unusable as an audit.
    //
    // Skipped HERE rather than in `isSkippedPath`, which diff mode also uses:
    // `.github/**` is ours and must stay scannable. Diff mode is driven by git
    // and already excludes ignored files, so it never had this problem.
    if (entry.isDirectory() && entry.name.startsWith('.')) continue;
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
  } catch (err) {
    // Don't blame the ref for a buffer failure — the message would send the
    // reader off fetching a ref that resolves perfectly well.
    if (err.code === 'ENOBUFS') {
      console.error(
        `✗ check-dynamic-replace: could not read the merge base (output exceeded\n` +
        `  ${GIT_MAX_BUFFER} bytes; raise MJ_GIT_MAX_BUFFER).`,
      );
      process.exit(2);
    }
    // Hard failure, not a warning. A gate that silently downgrades its scope and
    // then prints "clean" is worse than one that stops and asks to be fixed.
    console.error(
      `✗ check-dynamic-replace: cannot resolve '${baseRef}'.\n` +
      `  Fetch it (git fetch origin) or pass --base <ref>. Refusing to report a\n` +
      `  pass against an unknown scope.`,
    );
    process.exit(2);
  }

  // Every git read that can outgrow the buffer goes through here. `ls-files`
  // needs it as much as `diff` does: left unguarded it threw the raw ENOBUFS
  // stack and exited 1 — the "violations found" code — so a tooling failure was
  // reported as a content failure.
  const readOrFail = (args, what) => {
    try {
      return git(args);
    } catch (err) {
      // Same doctrine as an unresolvable base: a gate that can't read its own
      // scope must say so, not print "clean" over something it never saw.
      if (err.code === 'ENOBUFS') {
        console.error(
          `✗ check-dynamic-replace: ${what} is too large to buffer (cap ${GIT_MAX_BUFFER}\n` +
          `  bytes; raise it with MJ_GIT_MAX_BUFFER). Refusing to report a pass over a\n` +
          `  scope that was never read.`,
        );
        process.exit(2);
      }
      throw err;
    }
  };

  const touched = new Map();
  const diff = readOrFail(
    ['diff', '--unified=0', '--diff-filter=ACMR', mergeBase],
    `the diff against '${mergeBase}'`,
  );
  let current = null;
  let previousLine = '';
  for (const line of diff.split('\n')) {
    // A file header is only ever the SECOND half of a `--- a/…` / `+++ b/…`
    // pair. Matching `+++ b/` on its own is not safe: under `--unified=0` an
    // added line carries a `+` prefix, so file CONTENT beginning `++ b/x`
    // renders as `+++ b/x`. That silently re-pointed every following hunk at a
    // path which does not exist, the existsSync filter then dropped it, and a
    // real violation was reported as "clean" — the gate failing open. Content
    // cannot forge the pair: a body line `--- a/x` renders as `+--- a/x`.
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch && previousLine.startsWith('--- ')) {
      current = join(REPO_ROOT, fileMatch[1]);
      if (!touched.has(current)) touched.set(current, new Set());
      previousLine = line;
      continue;
    }
    previousLine = line;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let l = start; l < start + count; l++) touched.get(current).add(l);
    }
  }

  // Untracked files are entirely new — every line counts.
  const untracked = readOrFail(['ls-files', '--others', '--exclude-standard'], 'the untracked-file list');
  for (const f of untracked.split('\n').filter(Boolean)) {
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

  const USAGE = 'Usage: check-dynamic-replace.mjs [--all | --file <path> | --base <ref>]';
  // Every bad-argument path exits 2, never 0. Reporting "0 file(s) clean" for a
  // mistyped invocation is a pass over nothing at all, which is precisely the
  // outcome this gate refuses everywhere else.
  const reject = (msg) => {
    console.error(`✗ check-dynamic-replace: ${msg}\n  ${USAGE}`);
    return 2;
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') mode = 'all';
    else if (argv[i] === '--base') {
      baseRef = argv[++i];
      if (!baseRef) return reject('--base requires a value, e.g. --base origin/next');
    } else if (argv[i] === '--file') {
      mode = 'single';
      singleFile = argv[++i];
      if (!singleFile) return reject('--file requires a path');
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(USAGE);
      return 0;
    } else return reject(`unknown argument '${argv[i]}'`);
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

  // In --file mode the caller named ONE file; if the filter above dropped it,
  // say why rather than reporting a vacuous pass over zero files.
  if (mode === 'single' && files.length === 0) {
    return reject(
      `--file '${singleFile}' is not a scannable source file ` +
      `(missing, not a file, unsupported extension, or in a skipped directory)`,
    );
  }

  let total = 0;
  const unparseable = [];
  for (const file of files) {
    const touchedLines = lineFilter.get(file);
    let found;
    try {
      found = findViolations(readFileSync(file, 'utf8'));
    } catch (err) {
      // Collect rather than abort, so one unreadable file still lets the rest be
      // reported — but never treat it as clean.
      if (err instanceof UnparseableSourceError) {
        unparseable.push(relative(REPO_ROOT, file));
        continue;
      }
      throw err;
    }
    const violations = found.filter((v) => {
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

  // Reported before violations, and fatal on its own: an unparseable file is not
  // a clean file, and saying nothing about it is the silent pass this gate exists
  // to prevent.
  if (unparseable.length > 0) {
    console.error(
      `✗ check-dynamic-replace: ${unparseable.length} file(s) could not be scanned:\n` +
      unparseable.map((f) => `    ${f}`).join('\n') +
      `\n  The scanner lost sync on an unterminated string, template or regex, so\n` +
      `  anything after that point was invisible. Refusing to report these clean.`,
    );
    return 2;
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

/**
 * Was this file run as the entry point, or merely imported (by its own tests)?
 *
 * Both sides are resolved through `realpathSync` first. Node follows symlinks
 * when it loads an ES module, so `import.meta.url` is the PHYSICAL path while
 * `process.argv[1]` keeps whatever the caller typed. Comparing them as raw
 * strings therefore answers "imported" for any invocation through a symlink —
 * on macOS a path under `os.tmpdir()` is enough (`/var/…` vs `/private/var/…`),
 * and a repo checked out beneath a symlinked directory does it on every run.
 * The gate then printed nothing, exited 0, and read as a pass: the one outcome
 * this script must never produce.
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  // A path that cannot be resolved is not this file; compare what we were given.
  const resolved = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  return resolved(fileURLToPath(import.meta.url)) === resolved(process.argv[1]);
}

if (isEntryPoint()) process.exit(main(process.argv.slice(2)));
