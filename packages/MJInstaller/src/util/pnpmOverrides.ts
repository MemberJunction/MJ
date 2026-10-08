/**
 * pnpm `overrides` that keep a distribution install on ONE copy of Angular.
 *
 * MJ's Angular packages declare Angular only as a peer range, and some packages in
 * Explorer's dependency graph declare no Angular dependency at all. With nothing
 * pinned at the workspace root, pnpm 10 (`auto-install-peers`) fills those peers
 * with the NEWEST Angular release, while `apps/MJExplorer` pins an exact one. Two
 * copies of `@angular/core` then load and Explorer renders a blank page (NG0203 on
 * `MSAL_INSTANCE`).
 *
 * pnpm applies `overrides` to peer ranges as well as to dependency specs, so pinning
 * the Angular family — plus `rxjs` and `zone.js`, whose second copy breaks the same
 * way — to Explorer's own versions collapses the graph to one copy. The pins are
 * derived from `apps/MJExplorer/package.json` at install time, so they move with
 * Explorer and cannot drift.
 *
 * The workspace file is edited as text: the installer ships no YAML parser. A
 * block-style top-level `overrides:` mapping is merged into line by line, so other
 * entries and comments survive; any other shape is reported as unsupported rather
 * than guessed at. A new block is written with the key spelled literally
 * `overrides:`, which is what other tooling looks for before adding its own.
 *
 * @module util/pnpmOverrides
 * @see DependencyPhase — writes the pins into the distribution's `pnpm-workspace.yaml`.
 */

/** Package scope pinned wholesale: every `@angular/*` package Explorer declares. */
const PINNED_SCOPE = '@angular/';

/** Unscoped packages pinned alongside Angular: a second copy of either breaks Angular too. */
const PINNED_NAMES: ReadonlySet<string> = new Set(['rxjs', 'zone.js']);

/** Indentation for entries of a block that has none yet. */
const DEFAULT_INDENT = '  ';

/**
 * A top-level `overrides` key, unquoted or quoted as YAML allows. Group 2 is
 * everything after the colon — empty (or a comment) for a block mapping.
 */
const OVERRIDES_HEADER_PATTERN = /^(['"]?)overrides\1[ \t]*:(.*)$/;

/** What may follow `overrides:` when a block mapping comes on the next lines. */
const BLOCK_HEADER_REMAINDER_PATTERN = /^[ \t]*(#.*)?$/;

/**
 * One `key: value` entry inside the block. The key may be single-quoted,
 * double-quoted or plain; group 3 is the raw value (optionally with a comment).
 * Space after the colon is optional so a quoted `'a':'b'` is still recognised —
 * missing an existing entry would make the merge append a duplicate key.
 */
const ENTRY_PATTERN = /^([ \t]+)('(?:[^']|'')*'|"[^"]*"|[^\s#'"][^:#]*?)[ \t]*:[ \t]*(.*)$/;

/**
 * Explains the block in the workspace file itself, for whoever opens it next.
 * Written only when the installer creates the block.
 */
const OVERRIDES_COMMENT: readonly string[] = [
  '# Pins the Angular family (plus rxjs and zone.js) to the versions',
  '# apps/MJExplorer/package.json declares. Without it, pnpm fills peer-only Angular',
  '# ranges with the newest release and Explorer loads two copies of Angular',
  '# (blank page, NG0203). mj install refreshes these entries from Explorer on every run.',
];

/** One override: a package and the version spec every resolution of it is forced to. */
export interface PnpmOverridePin {
  /** Package name, e.g. `@angular/core`. */
  Name: string;
  /** Version spec exactly as Explorer declares it, e.g. `21.2.22`. */
  Version: string;
}

/** An existing override whose version the merge replaced. */
export interface PnpmOverrideChange {
  /** Package name. */
  Name: string;
  /** Version the workspace file held before the merge. */
  Previous: string;
  /** Version Explorer declares, now written in its place. */
  Current: string;
}

/**
 * How the merge treated the workspace file:
 * - `appended` — the file had no `overrides` key; a new block was added at the end.
 * - `merged` — missing pins were added to the existing block and/or stale ones updated.
 * - `unchanged` — nothing to pin, or the block already held every pin.
 * - `unsupported` — an `overrides` key exists but is not a block mapping (e.g. `overrides: {}`), so nothing was written.
 */
export type PnpmOverridesOutcome = 'appended' | 'merged' | 'unchanged' | 'unsupported';

/** Result of {@link MergePnpmOverrides}. */
export interface PnpmOverridesMergeResult {
  /** The workspace file after the merge — the input, verbatim, unless the outcome is `appended` or `merged`. */
  Yaml: string;
  /** What the merge did. */
  Outcome: PnpmOverridesOutcome;
  /** Existing entries whose version was replaced by Explorer's (only ever non-empty when `merged`). */
  Changed: PnpmOverrideChange[];
}

/** An existing entry of the `overrides` block. */
interface BlockEntry {
  /** Line the entry sits on. */
  LineIndex: number;
  /** The entry's own indentation, kept when its value is rewritten. */
  Indent: string;
  /** The entry's value, unquoted. */
  Value: string;
}

/** The top-level `overrides` block, located by line. */
interface OverridesBlock {
  /** Line after which new entries go: the block's last content line, or the header itself. */
  InsertAfter: number;
  /** Indentation of the block's first entry (two spaces when it has none). */
  Indent: string;
  /** Existing entries, by package key. */
  Entries: Map<string, BlockEntry>;
}

/** Where the top-level `overrides` key is, and whether a block mapping follows it. */
interface OverridesHeader {
  /** Line of the key. */
  Index: number;
  /** True for `overrides:` with nothing but an optional comment after the colon. */
  BlockStyle: boolean;
}

/** A parsed `key: value` line. */
interface ParsedEntry {
  Indent: string;
  Key: string;
  Value: string;
}

/**
 * The Angular family, `rxjs` and `zone.js` as Explorer declares them, sorted by
 * name. `devDependencies` win when a package appears in both sections, so the
 * result is deterministic even for an inconsistent manifest.
 *
 * @param dependencies - Explorer's `dependencies`.
 * @param devDependencies - Explorer's `devDependencies`.
 * @returns One pin per matching package; empty when Explorer declares none.
 */
export function ExplorerAngularPins(
  dependencies?: Readonly<Record<string, string>>,
  devDependencies?: Readonly<Record<string, string>>
): PnpmOverridePin[] {
  const declared: Record<string, string> = { ...dependencies, ...devDependencies };
  return Object.keys(declared)
    .filter((name) => isPinnedPackage(name) && isUsableVersion(declared[name]))
    .sort()
    .map((name) => ({ Name: name, Version: declared[name] }));
}

/**
 * Apply `pins` to the `overrides` of a `pnpm-workspace.yaml`.
 *
 * Adds a top-level `overrides:` block when the file has none. When it has a
 * block mapping, missing pins are appended to it and entries whose version
 * differs are rewritten to the pinned version — every other line, including
 * unrelated overrides and comments, is kept as it was. Explorer's versions win a
 * conflict: they are what the install actually runs, and a stale pin left by an
 * earlier install would hold every Angular package back after an upgrade.
 *
 * @param workspaceYaml - Current content of `pnpm-workspace.yaml`.
 * @param pins - Pins to apply, typically from {@link ExplorerAngularPins}.
 * @returns The new content and what changed.
 */
export function MergePnpmOverrides(workspaceYaml: string, pins: readonly PnpmOverridePin[]): PnpmOverridesMergeResult {
  if (pins.length === 0) {
    return unchangedResult(workspaceYaml);
  }
  const eol = workspaceYaml.includes('\r\n') ? '\r\n' : '\n';
  const lines = workspaceYaml.split(/\r?\n/);
  const header = findOverridesHeader(lines);
  if (!header) {
    return { Yaml: appendOverridesBlock(workspaceYaml, pins, eol), Outcome: 'appended', Changed: [] };
  }
  if (!header.BlockStyle) {
    return { Yaml: workspaceYaml, Outcome: 'unsupported', Changed: [] };
  }
  return mergeIntoBlock(lines, readOverridesBlock(lines, header.Index), pins, eol, workspaceYaml);
}

/** True for a package whose second copy breaks Angular's DI. */
function isPinnedPackage(name: string): boolean {
  return name.startsWith(PINNED_SCOPE) || PINNED_NAMES.has(name);
}

/** A manifest value that can be written as an override (a non-empty string). */
function isUsableVersion(version: string): boolean {
  return typeof version === 'string' && version.trim() !== '';
}

/** A result that leaves the file exactly as it was. */
function unchangedResult(workspaceYaml: string): PnpmOverridesMergeResult {
  return { Yaml: workspaceYaml, Outcome: 'unchanged', Changed: [] };
}

/** Locate the top-level `overrides` key, if the file has one. */
function findOverridesHeader(lines: readonly string[]): OverridesHeader | undefined {
  for (let index = 0; index < lines.length; index++) {
    const match = OVERRIDES_HEADER_PATTERN.exec(lines[index]);
    if (match) {
      return { Index: index, BlockStyle: BLOCK_HEADER_REMAINDER_PATTERN.test(match[2]) };
    }
  }
  return undefined;
}

/**
 * Read the block that follows the header: every line up to the next top-level
 * key. Blank and comment lines belong to the block but are not entries.
 */
function readOverridesBlock(lines: readonly string[], headerIndex: number): OverridesBlock {
  const block: OverridesBlock = { InsertAfter: headerIndex, Indent: DEFAULT_INDENT, Entries: new Map() };
  for (let index = headerIndex + 1; index < lines.length && !isTopLevelKeyLine(lines[index]); index++) {
    if (isBlankOrComment(lines[index])) {
      continue;
    }
    block.InsertAfter = index;
    const entry = parseEntryLine(lines[index]);
    if (!entry) {
      continue;
    }
    if (block.Entries.size === 0) {
      block.Indent = entry.Indent;
    }
    block.Entries.set(entry.Key, { LineIndex: index, Indent: entry.Indent, Value: entry.Value });
  }
  return block;
}

/** Add missing pins to the block and rewrite entries whose version differs. */
function mergeIntoBlock(
  lines: readonly string[],
  block: OverridesBlock,
  pins: readonly PnpmOverridePin[],
  eol: string,
  original: string
): PnpmOverridesMergeResult {
  const updated = [...lines];
  const additions: string[] = [];
  const changed: PnpmOverrideChange[] = [];
  for (const pin of pins) {
    const existing = block.Entries.get(pin.Name);
    if (!existing) {
      additions.push(formatEntry(block.Indent, pin));
    } else if (existing.Value !== pin.Version) {
      updated[existing.LineIndex] = formatEntry(existing.Indent, pin);
      changed.push({ Name: pin.Name, Previous: existing.Value, Current: pin.Version });
    }
  }
  if (additions.length === 0 && changed.length === 0) {
    return unchangedResult(original);
  }
  updated.splice(block.InsertAfter + 1, 0, ...additions);
  return { Yaml: updated.join(eol), Outcome: 'merged', Changed: changed };
}

/** Append a new, commented `overrides:` block at the end of the file. */
function appendOverridesBlock(workspaceYaml: string, pins: readonly PnpmOverridePin[], eol: string): string {
  const block = [...OVERRIDES_COMMENT, 'overrides:', ...pins.map((pin) => formatEntry(DEFAULT_INDENT, pin))].join(eol);
  // One blank line between the existing content and the new block.
  const separator = workspaceYaml === '' ? '' : workspaceYaml.endsWith('\n') ? eol : eol + eol;
  return `${workspaceYaml}${separator}${block}${eol}`;
}

/** A non-blank, non-comment line at column 0: the next top-level key, which ends the block. */
function isTopLevelKeyLine(line: string): boolean {
  return line.trim() !== '' && !/^[ \t]/.test(line) && !line.startsWith('#');
}

/** A line that carries no entry. */
function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/** Parse a `key: value` line of the block; undefined for anything else. */
function parseEntryLine(line: string): ParsedEntry | undefined {
  const match = ENTRY_PATTERN.exec(line);
  if (!match) {
    return undefined;
  }
  return { Indent: match[1], Key: unquoteScalar(match[2]), Value: unquoteScalar(match[3]) };
}

/** The text of a YAML scalar: quotes removed, a trailing comment dropped from a plain one. */
function unquoteScalar(raw: string): string {
  const text = raw.trim();
  const singleQuoted = /^'((?:[^']|'')*)'/.exec(text);
  if (singleQuoted) {
    return singleQuoted[1].replace(/''/g, "'");
  }
  const doubleQuoted = /^"([^"]*)"/.exec(text);
  if (doubleQuoted) {
    return doubleQuoted[1];
  }
  return text.replace(/[ \t]+#.*$/, '').trim();
}

/** One block entry in the canonical form: `  '<name>': '<version>'`. */
function formatEntry(indent: string, pin: PnpmOverridePin): string {
  return `${indent}${quoteScalar(pin.Name)}: ${quoteScalar(pin.Version)}`;
}

/** Single-quote a YAML scalar (a `'` inside is written as `''`). */
function quoteScalar(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
