/**
 * Prebundle-exclude management for `mj dev workspace` (#3875).
 *
 * Angular's Vite dev server pre-bundles dependencies into a cache. A workspace-linked package that
 * `pnpm run watch` rebuilds keeps being served from that cache unless its scope is listed in the
 * shell's `angular.json` `serve.options.prebundle.exclude`. MJExplorer commits `@memberjunction/*`
 * there; the scopes a joined workspace links from OTHER repos (`@mj-biz-apps/*`, ...) differ per
 * developer, so they cannot be committed. The generator adds them on join and records what it
 * added in the sentinel; `clean` removes exactly those entries.
 *
 * Only the exclude array's text is replaced, in the style it was written in, so a join followed by
 * a clean leaves the file byte-identical and `git status` clean. A file that does not parse as
 * plain JSON (Angular also accepts comments) is reported and left alone.
 *
 * SIDE EFFECTS: {@link ApplyPrebundleEdits} and {@link RevertPrebundleExcludes} write `angular.json`
 * files. Everything else here only reads.
 *
 * @module lib/dev-workspace/prebundle
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CollectWorkspaceShells } from './build.js';
import { IsInsideDirectory } from './member-installs.js';
import type { CandidateRepo, PrebundleExcludeRecord, SentinelReadResult } from './types.js';

/** The exclude entry MJExplorer commits; the only one the CI guard allows in a committed file. */
export const COMMITTED_PREBUNDLE_EXCLUDE = '@memberjunction/*';

/** The only file name the generator (or a sentinel record) may point it at. */
export const ANGULAR_JSON_FILE_NAME = 'angular.json';

/** JSON key path from a project to its dev-server exclude list. */
const EXCLUDE_KEY_PATH: readonly string[] = ['architect', 'serve', 'options', 'prebundle', 'exclude'];

/** One planned rewrite of one `angular.json`. */
export interface PrebundleFileEdit {
  /** Path relative to the parent, `/`-separated. */
  File: string;
  /** The file's full new text. */
  Content: string;
}

/** A shell `angular.json` the generator could not manage, and why. */
export interface PrebundleSkip {
  File: string;
  Reason: string;
}

/** What a join will change: file rewrites, the records for the sentinel, and what was left alone. */
export interface PrebundlePlan {
  Edits: PrebundleFileEdit[];
  Records: PrebundleExcludeRecord[];
  Skipped: PrebundleSkip[];
}

/** Entries removed from one project by a revert. */
export interface PrebundleRevert {
  File: string;
  Project: string;
  Removed: string[];
}

/** Outcome of reverting the sentinel's records. */
export interface PrebundleRevertResult {
  Reverted: PrebundleRevert[];
  Skipped: PrebundleSkip[];
}

/** A recorded entry that is no longer in its file (hand-edited or reset by git). */
export interface PrebundleDrift {
  File: string;
  Project: string;
  Missing: string[];
}

/** Half-open character range of one JSON value inside a text. */
interface JsonSpan {
  Start: number;
  End: number;
}

/** The `prebundleExcludes` a sentinel carries, or none. */
export function PrebundleRecordsOf(sentinel: SentinelReadResult): PrebundleExcludeRecord[] {
  if (sentinel.Kind !== 'valid') return [];
  return sentinel.Sentinel.prebundleExcludes ?? [];
}

/**
 * `<scope>/*` for every scoped package a workspace member other than `shellRepo` provides, sorted
 * and unique. The shell's own repo is skipped: its scopes are its committed dev loop
 * (`@memberjunction/*` for MJ), and anything else it ships (test fixtures) is not linked in from
 * outside. Pure.
 */
export function CollectLinkedScopes(members: readonly CandidateRepo[], shellRepo: string): string[] {
  const scopes = new Set<string>();
  for (const member of members) {
    if (member.Name === shellRepo) continue;
    for (const pkg of member.Packages) {
      const name = pkg.PackageJson.name;
      if (name === undefined || !name.startsWith('@') || !name.includes('/')) continue;
      const glob = `${name.slice(0, name.indexOf('/'))}/*`;
      if (glob !== COMMITTED_PREBUNDLE_EXCLUDE) scopes.add(glob);
    }
  }
  return [...scopes].sort();
}

/** Index of the first non-whitespace character at or after `index`. */
function skipWhitespace(text: string, index: number): number {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/** End index (exclusive) of the JSON string starting at `index` (which holds the opening quote). */
function scanString(text: string, index: number): number {
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '"') return i + 1;
    i++;
  }
  throw new Error('unterminated string');
}

/**
 * Scans the JSON value starting at `index` and returns where it ends, plus the span of the value at
 * `keyPath` beneath it when that path exists. The text must already have passed `JSON.parse`.
 */
function scanValue(text: string, index: number, keyPath: readonly string[] | null): { End: number; Found: JsonSpan | null } {
  const start = skipWhitespace(text, index);
  const ch = text[start];
  let found: JsonSpan | null = null;
  let end: number;
  if (ch === '{' || ch === '[') {
    const isObject = ch === '{';
    const close = isObject ? '}' : ']';
    let i = skipWhitespace(text, start + 1);
    while (text[i] !== close) {
      let childPath: readonly string[] | null = null;
      if (isObject) {
        const keyEnd = scanString(text, i);
        const key = JSON.parse(text.slice(i, keyEnd)) as string;
        if (keyPath !== null && keyPath.length > 0 && key === keyPath[0]) childPath = keyPath.slice(1);
        i = skipWhitespace(text, keyEnd) + 1; // past ':'
      }
      const child = scanValue(text, i, childPath);
      if (child.Found !== null) found = child.Found;
      i = skipWhitespace(text, child.End);
      if (text[i] === ',') i = skipWhitespace(text, i + 1);
    }
    end = i + 1;
  } else if (ch === '"') {
    end = scanString(text, start);
  } else {
    let i = start;
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    end = i;
  }
  if (keyPath !== null && keyPath.length === 0) found = { Start: start, End: end };
  return { End: end, Found: found };
}

/** Span of the value at `keyPath` in a JSON text, or null when the path does not exist. */
export function FindJsonValueSpan(text: string, keyPath: readonly string[]): JsonSpan | null {
  return scanValue(text, 0, keyPath).Found;
}

/** Leading whitespace of the line holding `index`. */
function lineIndent(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '';
}

/**
 * Renders a string array the way the original array at `span` was written: on one line when it
 * was on one line, otherwise one entry per line at the original's indentation. Pure.
 */
function renderArrayLike(text: string, span: JsonSpan, entries: readonly string[]): string {
  if (entries.length === 0) return '[]';
  const original = text.slice(span.Start, span.End);
  const items = entries.map((entry) => JSON.stringify(entry));
  if (!original.includes('\n')) return `[${items.join(', ')}]`;
  const closingIndent = lineIndent(text, span.End - 1);
  const firstLineBreak = text.indexOf('\n', span.Start);
  const firstItemIndent = /^[ \t]*/.exec(text.slice(firstLineBreak + 1))?.[0] ?? '';
  const afterIndent = text[firstLineBreak + 1 + firstItemIndent.length];
  const itemIndent = afterIndent === ']' ? `${closingIndent}  ` : firstItemIndent;
  return `[\n${items.map((item) => `${itemIndent}${item}`).join(',\n')}\n${closingIndent}]`;
}

/** Shape of the parts of an `angular.json` this module reads. */
interface AngularJson {
  projects?: Record<string, AngularProject>;
}
interface AngularProject {
  architect?: { serve?: { options?: { prebundle?: { exclude?: unknown } } } };
}

/** The project's exclude list, or null when it has none (or it is not a string list). */
function readExclude(project: AngularProject): string[] | null {
  const exclude = project.architect?.serve?.options?.prebundle?.exclude;
  if (!Array.isArray(exclude) || !exclude.every((item: unknown) => typeof item === 'string')) return null;
  return exclude as string[];
}

/** Parses an `angular.json` text, or returns the parse error message. */
function parseAngularJson(text: string): { Json: AngularJson } | { Error: string } {
  try {
    return { Json: JSON.parse(text) as AngularJson };
  } catch (error) {
    return { Error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Rewrites one project's exclude list in an `angular.json` text, touching nothing else. Throws when
 * the project has no exclude list. Pure.
 */
export function RewritePrebundleExclude(text: string, project: string, entries: readonly string[]): string {
  const span = FindJsonValueSpan(text, ['projects', project, ...EXCLUDE_KEY_PATH]);
  if (span === null) throw new Error(`project ${project} has no serve.options.prebundle.exclude`);
  return `${text.slice(0, span.Start)}${renderArrayLike(text, span, entries)}${text.slice(span.End)}`;
}

/** Parent-relative, `/`-separated form of an absolute path. */
function toRecordPath(parentDir: string, absolutePath: string): string {
  return path.relative(parentDir, absolutePath).split(path.sep).join('/');
}

/**
 * Resolves a recorded file path, refusing anything a sentinel could use to reach outside the
 * parent or at a file other than an `angular.json`. Returns null when refused.
 */
function resolveRecordPath(parentDir: string, recordPath: string): string | null {
  const absolute = path.resolve(parentDir, ...recordPath.split('/'));
  if (path.basename(absolute) !== ANGULAR_JSON_FILE_NAME) return null;
  return IsInsideDirectory(parentDir, absolute) ? absolute : null;
}

/**
 * Reads a file, or returns null when it does not exist. Reading directly instead of checking
 * `existsSync` first leaves no window between the check and the use.
 */
function readFileIfPresent(absolute: string): string | null {
  try {
    return readFileSync(absolute, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Recorded entries for one file + project. */
function recordedEntries(records: readonly PrebundleExcludeRecord[], file: string, project: string): string[] {
  return records.filter((r) => r.file === file && r.project === project).flatMap((r) => r.entries);
}

/**
 * Plans the join's `angular.json` edits. For every app shell the workspace enumerates
 * ({@link CollectWorkspaceShells}) with an `angular.json`, each project that already has a
 * `serve.options.prebundle.exclude` list gets the linked scopes appended (the committed entries,
 * `@memberjunction/*` first, stay where they are). Entries a previous join recorded are taken out
 * first, so a re-join after a member leaves drops that member's scope, and a file a previous join
 * edited but this one no longer reaches is reverted. An entry already in the file that no join
 * recorded is the developer's own: kept, and never recorded. A shell with no exclude list is left
 * alone. Read-only.
 */
export function PlanPrebundleExcludes(
  parentDir: string,
  members: readonly CandidateRepo[],
  previous: readonly PrebundleExcludeRecord[]
): PrebundlePlan {
  const scopesByFile = new Map<string, string[]>();
  const skipped: PrebundleSkip[] = [];
  for (const shell of CollectWorkspaceShells(members)) {
    const member = members.find((m) => m.Name === shell.Repo);
    if (member === undefined) continue;
    const absolute = path.join(member.Path, shell.RelPath, ANGULAR_JSON_FILE_NAME);
    if (!existsSync(absolute) || !IsInsideDirectory(parentDir, absolute)) continue;
    scopesByFile.set(toRecordPath(parentDir, absolute), CollectLinkedScopes(members, shell.Repo));
  }
  for (const record of previous) {
    if (!scopesByFile.has(record.file)) scopesByFile.set(record.file, []);
  }

  const plan: PrebundlePlan = { Edits: [], Records: [], Skipped: skipped };
  for (const [file, scopes] of [...scopesByFile.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    planFile(parentDir, file, scopes, previous, plan);
  }
  return plan;
}

/** Plans one file's edit into `plan`. */
function planFile(
  parentDir: string,
  file: string,
  scopes: readonly string[],
  previous: readonly PrebundleExcludeRecord[],
  plan: PrebundlePlan
): void {
  const absolute = resolveRecordPath(parentDir, file);
  if (absolute === null) {
    plan.Skipped.push({ File: file, Reason: `not an ${ANGULAR_JSON_FILE_NAME} inside the workspace parent` });
    return;
  }
  const original = readFileIfPresent(absolute);
  if (original === null) {
    plan.Skipped.push({ File: file, Reason: 'file no longer exists' });
    return;
  }
  const parsed = parseAngularJson(original);
  if ('Error' in parsed) {
    plan.Skipped.push({ File: file, Reason: `not plain JSON (${parsed.Error}) — edit its prebundle exclude by hand` });
    return;
  }
  let text = original;
  let sawExclude = false;
  for (const [project, config] of Object.entries(parsed.Json.projects ?? {})) {
    const current = readExclude(config);
    if (current === null) continue;
    sawExclude = true;
    const ours = recordedEntries(previous, file, project);
    const base = current.filter((entry) => !ours.includes(entry));
    const added = scopes.filter((scope) => !base.includes(scope));
    const desired = [...base, ...added];
    if (desired.length !== current.length || desired.some((entry, i) => entry !== current[i])) {
      text = RewritePrebundleExclude(text, project, desired);
    }
    if (added.length > 0) plan.Records.push({ file, project, entries: added });
  }
  if (!sawExclude && scopes.length > 0) {
    plan.Skipped.push({ File: file, Reason: 'no project has serve.options.prebundle.exclude — nothing to extend' });
  }
  if (text !== original) plan.Edits.push({ File: file, Content: text });
}

/** Writes a plan's edits. Paths were validated when the plan was made. */
export function ApplyPrebundleEdits(parentDir: string, edits: readonly PrebundleFileEdit[]): void {
  for (const edit of edits) {
    writeFileSync(path.join(parentDir, ...edit.File.split('/')), edit.Content, 'utf8');
  }
}

/**
 * Removes exactly the recorded entries from each recorded file (for `clean`). An entry already gone
 * is not an error; a file that is gone, unparseable, or outside the parent is reported and skipped.
 * With `dryRun`, reports what would be removed and writes nothing.
 */
export function RevertPrebundleExcludes(
  parentDir: string,
  records: readonly PrebundleExcludeRecord[],
  dryRun: boolean
): PrebundleRevertResult {
  const result: PrebundleRevertResult = { Reverted: [], Skipped: [] };
  const files = [...new Set(records.map((r) => r.file))].sort();
  for (const file of files) {
    const absolute = resolveRecordPath(parentDir, file);
    if (absolute === null) {
      result.Skipped.push({ File: file, Reason: `not an ${ANGULAR_JSON_FILE_NAME} inside the workspace parent` });
      continue;
    }
    const original = readFileIfPresent(absolute);
    if (original === null) {
      result.Skipped.push({ File: file, Reason: 'file no longer exists' });
      continue;
    }
    const parsed = parseAngularJson(original);
    if ('Error' in parsed) {
      result.Skipped.push({ File: file, Reason: `not plain JSON (${parsed.Error})` });
      continue;
    }
    let text = original;
    for (const [project, config] of Object.entries(parsed.Json.projects ?? {})) {
      const current = readExclude(config);
      const ours = recordedEntries(records, file, project);
      if (current === null || ours.length === 0) continue;
      const removed = current.filter((entry) => ours.includes(entry));
      if (removed.length === 0) continue;
      text = RewritePrebundleExclude(text, project, current.filter((entry) => !ours.includes(entry)));
      result.Reverted.push({ File: file, Project: project, Removed: removed });
    }
    if (!dryRun && text !== original) writeFileSync(absolute, text, 'utf8');
  }
  return result;
}

/** Recorded entries missing from their files — what `doctor` warns about. Read-only. */
export function FindPrebundleDrift(parentDir: string, records: readonly PrebundleExcludeRecord[]): PrebundleDrift[] {
  const drift: PrebundleDrift[] = [];
  for (const record of records) {
    const absolute = resolveRecordPath(parentDir, record.file);
    const text = absolute !== null ? readFileIfPresent(absolute) : null;
    const parsed = text !== null ? parseAngularJson(text) : null;
    const project = parsed !== null && 'Json' in parsed ? parsed.Json.projects?.[record.project] : undefined;
    const current = project === undefined ? [] : readExclude(project) ?? [];
    const missing = record.entries.filter((entry) => !current.includes(entry));
    if (missing.length > 0) drift.push({ File: record.file, Project: record.project, Missing: missing });
  }
  return drift;
}

/** One line per record: what the join added where. Pure. */
export function DescribePrebundleRecords(records: readonly PrebundleExcludeRecord[]): string[] {
  return records.map((r) => `${r.entries.join(', ')} in ${r.file} (project ${r.project})`);
}
