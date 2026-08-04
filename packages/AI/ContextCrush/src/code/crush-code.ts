/**
 * AST-aware code reduction — independent TypeScript re-implementation of the
 * "CodeCompressor" concept from Headroom (https://github.com/chopratejas/headroom,
 * Apache-2.0). Written from the published description; not a copy of Headroom source.
 * See plans/agent-token-optimization.md §0 for attribution.
 *
 * Reduces source the agent isn't actively focused on while preserving structure:
 * signatures, declarations, and contract comments stay; non-focal function/method bodies
 * collapse to a one-line summary. Implemented with a dependency-free, string/comment-aware
 * scanner (no parser dependency) so this subpath stays as light as the base package and
 * carries zero framework coupling. Conservative by design — when a construct can't be
 * confidently reduced, it is emitted verbatim rather than risk corrupting the code.
 */
import type { CrushResult, CrushLegend } from '../crush-json';

/** Supported source languages. SQL + TypeScript are the highest-volume code-in-context cases. */
export type CodeLang = 'typescript' | 'sql';

/** A 1-based, inclusive line range the caller is actively focused on (kept verbatim). */
export interface FocalRange {
  StartLine: number;
  EndLine: number;
}

/** Options controlling {@link CrushCode}. */
export interface CrushCodeOptions {
  /** Line range kept verbatim; constructs overlapping it are never reduced. */
  Focal?: FocalRange;
  /** Drop non-docstring comments (line comments and non-JSDoc block comments). Default: false. */
  DropComments?: boolean;
  /** Minimum body line count before a function/method body is collapsed. Default: 4. */
  MinBodyLines?: number;
}

interface ResolvedCodeOptions {
  Focal: FocalRange | undefined;
  DropComments: boolean;
  MinBodyLines: number;
}

const DEFAULT_MIN_BODY_LINES = 4;

function resolveCodeOptions(opts?: CrushCodeOptions): ResolvedCodeOptions {
  return {
    Focal: opts?.Focal,
    DropComments: opts?.DropComments === true,
    MinBodyLines: opts?.MinBodyLines ?? DEFAULT_MIN_BODY_LINES,
  };
}

/**
 * Per-character classification used to count braces and strip comments without being fooled
 * by braces inside strings or comments. `code[i]` is true when char i is ordinary code.
 */
interface ScanMask {
  code: boolean[];
  lineComment: boolean[];
  blockComment: boolean[];
  docComment: boolean[];
}

/**
 * Build a string/comment-aware mask over the source (single pass). The line-comment token
 * differs by language ('//' for TypeScript, '--' for SQL); SQL also escapes quotes by
 * doubling them ('') rather than with a backslash.
 */
function buildScanMask(source: string, lineCommentToken: '//' | '--' = '//'): ScanMask {
  const n = source.length;
  const code = new Array<boolean>(n).fill(false);
  const lineComment = new Array<boolean>(n).fill(false);
  const blockComment = new Array<boolean>(n).fill(false);
  const docComment = new Array<boolean>(n).fill(false);
  const sqlMode = lineCommentToken === '--';
  const lc0 = lineCommentToken[0];
  const lc1 = lineCommentToken[1];

  let state: 'code' | 'line' | 'block' | 'squote' | 'dquote' | 'backtick' = 'code';
  let blockIsDoc = false;

  for (let i = 0; i < n; i++) {
    const c = source[i];
    const next = i + 1 < n ? source[i + 1] : '';
    switch (state) {
      case 'code':
        if (c === lc0 && next === lc1) { state = 'line'; lineComment[i] = true; }
        else if (c === '/' && next === '*') { state = 'block'; blockIsDoc = source[i + 2] === '*'; blockComment[i] = true; if (blockIsDoc) docComment[i] = true; }
        else if (c === "'") { state = 'squote'; }
        else if (c === '"') { state = 'dquote'; }
        else if (c === '`' && !sqlMode) { state = 'backtick'; }
        else { code[i] = true; }
        break;
      case 'line':
        lineComment[i] = true;
        if (c === '\n') { state = 'code'; }
        break;
      case 'block':
        blockComment[i] = true;
        if (blockIsDoc) { docComment[i] = true; }
        if (c === '*' && next === '/') { blockComment[i + 1] = true; if (blockIsDoc) { docComment[i + 1] = true; } i++; state = 'code'; }
        break;
      case 'squote':
        if (sqlMode) { if (c === "'" && next === "'") { i++; } else if (c === "'") { state = 'code'; } }
        else if (c === '\\') { i++; } else if (c === "'") { state = 'code'; }
        break;
      case 'dquote':
        if (sqlMode) { if (c === '"' && next === '"') { i++; } else if (c === '"') { state = 'code'; } }
        else if (c === '\\') { i++; } else if (c === '"') { state = 'code'; }
        break;
      case 'backtick':
        if (c === '\\') { i++; } else if (c === '`') { state = 'code'; }
        break;
    }
  }
  return { code, lineComment, blockComment, docComment };
}

/** Heuristic: does this line open a function/method body (ends with `{` after a signature)? */
function isFunctionSignatureLine(lineCode: string): boolean {
  const trimmed = lineCode.trimEnd();
  if (!trimmed.endsWith('{')) {
    return false;
  }
  // Never treat control-flow blocks (or else-branches) as function bodies.
  if (/\b(if|for|while|switch|catch|do|with|else)\b/.test(trimmed)) {
    return false;
  }
  // Arrow-function body: `... => {` (e.g. `const h = (a, b) => {`).
  if (/=>\s*\{$/.test(trimmed)) {
    return true;
  }
  // Function/method declaration: a parameter list immediately precedes the brace
  // (optionally a return-type annotation). Excludes object-literal openers (no `)...{`).
  if (!/\)\s*(:[^={]+)?\{$/.test(trimmed)) {
    return false;
  }
  return /\bfunction\b/.test(trimmed) || /[\w$]\s*\([^)]*\)\s*(:[^={]+)?\{$/.test(trimmed);
}

interface LineSpan {
  startChar: number;
  endChar: number; // index of the trailing newline or end-of-source (exclusive content end)
}

/** Compute char offsets for each line so we can index the scan mask by line. */
function computeLineSpans(source: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i === source.length || source[i] === '\n') {
      spans.push({ startChar: start, endChar: i });
      start = i + 1;
    }
  }
  return spans;
}

function lineOverlapsFocal(lineNumber1Based: number, focal: FocalRange | undefined): boolean {
  if (!focal) {
    return false;
  }
  return lineNumber1Based >= focal.StartLine && lineNumber1Based <= focal.EndLine;
}

/** Net brace delta contributed by code (mask-aware) characters on a line. */
function codeBraceDelta(source: string, span: LineSpan, mask: ScanMask): number {
  let delta = 0;
  for (let i = span.startChar; i < span.endChar; i++) {
    if (!mask.code[i]) {
      continue;
    }
    if (source[i] === '{') { delta++; }
    else if (source[i] === '}') { delta--; }
  }
  return delta;
}

/** Extract the code-only text of a line (comments blanked) for signature heuristics. */
function codeOnlyLine(source: string, span: LineSpan, mask: ScanMask): string {
  let out = '';
  for (let i = span.startChar; i < span.endChar; i++) {
    out += mask.code[i] || source[i] === '\n' ? source[i] : ' ';
  }
  return out;
}

/** Collapse non-focal TypeScript function/method bodies to a one-line summary. */
function crushTypeScript(source: string, options: ResolvedCodeOptions, legend: CrushLegend): string {
  const mask = buildScanMask(source);
  const spans = computeLineSpans(source);
  const rawLines = source.split('\n');
  const out: string[] = [];
  let collapsedBodies = 0;

  for (let i = 0; i < spans.length; i++) {
    const lineNumber = i + 1;
    const codeLine = codeOnlyLine(source, spans[i], mask);

    if (isFunctionSignatureLine(codeLine) && !lineOverlapsFocal(lineNumber, options.Focal)) {
      const closeLine = findMatchingCloseLine(source, spans, mask, i);
      const bodyLines = closeLine - i - 1;
      if (closeLine > i && bodyLines >= options.MinBodyLines && !focalOverlapsRange(lineNumber, closeLine + 1, options.Focal)) {
        out.push(`${rawLines[i].trimEnd()} /* … ${bodyLines} lines elided */ }`);
        collapsedBodies++;
        i = closeLine; // skip the original body and its closing brace line
        continue;
      }
    }
    out.push(rawLines[i] ?? '');
  }

  if (collapsedBodies > 0) {
    legend.Notes.push(`${collapsedBodies} non-focal function/method body(ies) collapsed to '{ … }'.`);
  }
  return out.join('\n');
}

function focalOverlapsRange(start1Based: number, end1Based: number, focal: FocalRange | undefined): boolean {
  if (!focal) {
    return false;
  }
  return focal.StartLine <= end1Based && focal.EndLine >= start1Based;
}

/** Find the line index whose code-only braces close the block opened on `openLine`. */
function findMatchingCloseLine(source: string, spans: LineSpan[], mask: ScanMask, openLine: number): number {
  let depth = 0;
  for (let i = openLine; i < spans.length; i++) {
    depth += codeBraceDelta(source, spans[i], mask);
    if (i > openLine && depth <= 0) {
      return i;
    }
    if (i === openLine && depth <= 0) {
      return i; // single-line body — nothing to collapse
    }
  }
  return -1;
}

/** Strip comments from the source using the scan mask (preserving docstrings unless dropping all). */
function stripComments(source: string, mask: ScanMask, dropDocstrings: boolean): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const isComment = mask.lineComment[i] || mask.blockComment[i];
    const isDoc = mask.docComment[i];
    if (isComment && (dropDocstrings || !isDoc)) {
      if (source[i] === '\n') { out += '\n'; }
      continue;
    }
    out += source[i];
  }
  // Collapse runs of blank lines left behind.
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/** Conservative SQL reduction: optional comment strip + whitespace + long value-list collapse. */
function crushSql(source: string, options: ResolvedCodeOptions, legend: CrushLegend): string {
  let text = source;
  if (options.DropComments) {
    const mask = buildScanMask(text, '--');
    text = stripComments(text, mask, true);
    legend.Notes.push('SQL comments stripped.');
  }

  // Collapse long parenthesized value lists: VALUES (..),(..),(..)… and IN (a,b,c,…).
  let collapsedLists = 0;
  text = text.replace(/\b(VALUES)\b\s*((?:\([^()]*\)\s*,\s*){3,}\([^()]*\))/gi, (_m, kw: string, body: string) => {
    const tuples = body.split(/\)\s*,\s*\(/).length;
    collapsedLists++;
    const first = body.slice(0, body.indexOf(')') + 1);
    return `${kw} ${first} /* … ${tuples} value tuples elided */`;
  });
  if (collapsedLists > 0) {
    legend.Notes.push(`${collapsedLists} long SQL VALUES list(s) collapsed.`);
  }

  // Normalize trailing whitespace and excessive blank lines.
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Reduce source code for cheaper inclusion in a model prompt while preserving structure.
 * Pure and deterministic. The {@link CrushResult.Legend} notes describe every reduction
 * applied so the recipient understands what was elided.
 *
 * @param source The source code.
 * @param lang   The language ('typescript' or 'sql').
 * @param opts   Reduction options (focal range, comment dropping, body threshold).
 */
export function CrushCode(source: string, lang: CodeLang, opts?: CrushCodeOptions): CrushResult {
  const options = resolveCodeOptions(opts);
  const legend: CrushLegend = { Notes: [] };
  const originalChars = source.length;

  let text: string;
  if (lang === 'sql') {
    text = crushSql(source, options, legend);
  } else {
    if (options.DropComments) {
      const mask = buildScanMask(source);
      source = stripComments(source, mask, false); // preserve docstrings for TS
      legend.Notes.push('Non-docstring comments stripped.');
    }
    text = crushTypeScript(source, options, legend);
  }

  return {
    Text: text,
    OriginalChars: originalChars,
    CrushedChars: text.length,
    Legend: legend,
  };
}
