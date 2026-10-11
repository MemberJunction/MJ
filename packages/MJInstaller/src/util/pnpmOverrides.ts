/**
 * pnpm `overrides` that keep a distribution install on ONE copy of Angular and ONE copy of
 * each `@memberjunction/*` package.
 *
 * **Angular.** MJ's Angular packages declare Angular only as a peer range, and some packages in
 * Explorer's dependency graph declare no Angular dependency at all. With nothing
 * pinned at the workspace root, pnpm 10 (`auto-install-peers`) fills those peers
 * with the NEWEST Angular release, while `apps/MJExplorer` pins an exact one. Two
 * copies of `@angular/core` then load and Explorer renders a blank page (NG0203 on
 * `MSAL_INSTANCE`). Pinning the Angular family — plus `rxjs` and `zone.js`, whose second copy
 * breaks the same way — to Explorer's own versions collapses the graph to one copy. Those pins
 * are derived from `apps/MJExplorer/package.json` at install time, so they move with Explorer.
 *
 * **MemberJunction.** Open Apps declare `@memberjunction/*` with ranges written against the MJ
 * release they were built on (`~6.1.5`, `^6.1.0-edge.5`). A host on another release — a
 * `6.2.0-edge.N` prerelease satisfies neither — gets a parallel 6.1.x tree: every MJ package
 * pins its siblings exactly, so one out-of-range `@memberjunction/ng-hierarchy-tree` drags in its
 * own `@memberjunction/core` and `global`. Two copies of those split MJ's class-factory registry,
 * and entities and resolvers silently stop registering. The host's version is authoritative (the
 * Open App engine checks each app's `mjVersionRange` before installing it), so every
 * `@memberjunction/*` package of the host's release is pinned to it. pnpm has no glob override
 * keys, so the names come from the install's own lockfile plus the list of lockstep packages the
 * installer ships with ({@link MemberJunctionPins}) — the lockfile alone misses packages only an
 * Open App uses, which are not in the graph until the app is installed. Each pin is written as
 * `$@memberjunction/cli` — a reference to the root
 * manifest's `@memberjunction/cli` dependency — rather than a literal version, so `mj bump`
 * moving that dependency moves every pin with it instead of silently holding the upgrade back.
 *
 * pnpm applies `overrides` to peer ranges as well as to dependency specs, which is what makes
 * both families work.
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
  '# Keeps one copy of Angular and of each @memberjunction/* package. mj install refreshes',
  '# these entries on every run.',
  '# - The Angular family (plus rxjs and zone.js) at the versions apps/MJExplorer/package.json',
  '#   declares. Without them pnpm fills peer-only Angular ranges with the newest release and',
  '#   Explorer loads two copies of Angular (blank page, NG0203).',
  "# - Every @memberjunction/* package at the root @memberjunction/cli version ('$@memberjunction/cli').",
  '#   Without them an Open App built on an older MJ release pulls in a second copy of',
  "#   @memberjunction/core and MJ's class registry splits. Upgrade MJ with 'mj bump -r' so the",
  '#   root @memberjunction/cli moves with everything else.',
];

/** Scope of the MemberJunction packages {@link MemberJunctionPins} pins. */
const MEMBERJUNCTION_SCOPE = '@memberjunction/';

/** The root dependency every MemberJunction pin references. */
export const MEMBERJUNCTION_PIN_SOURCE = '@memberjunction/cli';

/** Override value for a MemberJunction pin: pnpm's reference to the root `@memberjunction/cli` spec. */
export const MEMBERJUNCTION_PIN_VALUE = `$${MEMBERJUNCTION_PIN_SOURCE}`;

/** An exact semver version (prerelease and build metadata allowed) — never a range or a dist-tag. */
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * One package entry of a pnpm lockfile's top-level `packages:` section: two-space indent, an
 * optionally quoted key, an optional leading `/` (lockfile v6), then `name@version`. Group 1 is
 * the name, group 2 the version — which stops at a `(` peer suffix (lockfile v9 snapshots).
 */
const LOCKFILE_PACKAGE_KEY_PATTERN = /^  ['"]?\/?((?:@[^@\s'"/]+\/)?[^@\s'"(/]+)@(\d[0-9A-Za-z.+-]*)/;

/** One override: a package and the version spec every resolution of it is forced to. */
export interface PnpmOverridePin {
  /** Package name, e.g. `@angular/core`. */
  Name: string;
  /** Override value, e.g. `21.2.22` (as Explorer declares it) or `$@memberjunction/cli`. */
  Version: string;
}

/** An existing override whose version the merge replaced. */
export interface PnpmOverrideChange {
  /** Package name. */
  Name: string;
  /** Version the workspace file held before the merge. */
  Previous: string;
  /** Pinned version, now written in its place. */
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
  /** Existing entries whose version the merge replaced (only ever non-empty when `merged`). */
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
 * True for an exact version such as `6.2.0` or `6.2.0-edge.3`; false for a range (`^6.2.0`), a
 * dist-tag (`latest`) or a protocol (`workspace:*`). Only an exact host version can anchor the
 * MemberJunction pins.
 */
export function IsExactVersion(spec: string | undefined): spec is string {
  return typeof spec === 'string' && EXACT_VERSION_PATTERN.test(spec.trim());
}

/**
 * The versions a pnpm lockfile resolves for each package of its top-level `packages:` section.
 * Importer specifiers, `overrides`, and `snapshots` are not read, so a name maps only to versions
 * that are actually installed.
 *
 * @param lockfileYaml - Content of `pnpm-lock.yaml` (lockfile v6 or v9).
 * @returns Package name → the distinct versions resolved for it.
 */
export function LockfilePackageVersions(lockfileYaml: string): Map<string, Set<string>> {
  const versions = new Map<string, Set<string>>();
  let inPackages = false;
  for (const line of lockfileYaml.split(/\r?\n/)) {
    if (isTopLevelKeyLine(line)) {
      inPackages = /^packages:\s*$/.test(line);
      continue;
    }
    const match = inPackages ? LOCKFILE_PACKAGE_KEY_PATTERN.exec(line) : null;
    if (match) {
      const set = versions.get(match[1]) ?? new Set<string>();
      set.add(match[2]);
      versions.set(match[1], set);
    }
  }
  return versions;
}

/**
 * Pins for every `@memberjunction/*` package of the host's lockstep release, each written as
 * {@link MEMBERJUNCTION_PIN_VALUE}, sorted by name. The names are the union of:
 *
 * - every package the lockfile resolves at `hostVersion` — published in MJ's lockstep release, so
 *   they exist at whatever version the root `@memberjunction/cli` names; and
 * - `lockstepPackages`, the release's full package list ({@link LockstepPackageList}). It covers
 *   packages only an Open App uses (`ng-gantt`, `ng-kanban`, ...), which are absent from a fresh
 *   distribution's lockfile and would otherwise come in at whatever version the app's range allows.
 *   A pin for a package nothing installs is inert.
 *
 * Separately versioned packages in the scope (the `@memberjunction/skyway-*` migration engine, at
 * `0.6.x`) appear in neither, so they are left alone — pinning them to the MJ version would ask for
 * a release that does not exist.
 *
 * @param lockfileYaml - Content of the install's `pnpm-lock.yaml`.
 * @param hostVersion - The exact MJ version the install runs (the root `@memberjunction/cli` spec).
 * @param lockstepPackages - Names from {@link UsableLockstepPackages}; empty pins the lockfile's only.
 * @returns One pin per MemberJunction package; empty when `hostVersion` is not an exact version.
 */
export function MemberJunctionPins(
  lockfileYaml: string,
  hostVersion: string,
  lockstepPackages: readonly string[] = []
): PnpmOverridePin[] {
  if (!IsExactVersion(hostVersion)) {
    return [];
  }
  const host = hostVersion.trim();
  const fromLockfile = [...LockfilePackageVersions(lockfileYaml)]
    .filter(([name, resolved]) => name.startsWith(MEMBERJUNCTION_SCOPE) && resolved.has(host))
    .map(([name]) => name);
  const names = new Set([...fromLockfile, ...lockstepPackages.filter((name) => name.startsWith(MEMBERJUNCTION_SCOPE))]);
  return [...names].sort().map((name) => ({ Name: name, Version: MEMBERJUNCTION_PIN_VALUE }));
}

/**
 * The installer's list of its own lockstep release: every published `@memberjunction/*` package at
 * `Version`. Written to `dist/memberjunction-packages.json` by `scripts/write-lockstep-packages.mjs`
 * at build time.
 */
export interface LockstepPackageList {
  Version: string;
  Packages: string[];
}

/** File name of the {@link LockstepPackageList} in the installer's `dist/`. */
export const LOCKSTEP_PACKAGES_FILE = 'memberjunction-packages.json';

/**
 * The names from `list` that may be pinned for a host on `hostVersion`: all of them when the list
 * belongs to the same major release, none otherwise (or when there is no list). Within a major,
 * a package the host's release lacks is only installed by an app the host could not run anyway,
 * and a package the list lacks is still pinned from the lockfile when it is there.
 *
 * @param list - The installer's shipped list, or undefined when it was not found.
 * @param hostVersion - The exact MJ version the install runs.
 */
export function UsableLockstepPackages(list: LockstepPackageList | undefined, hostVersion: string): string[] {
  if (!list || !Array.isArray(list.Packages) || !IsExactVersion(list.Version) || !IsExactVersion(hostVersion)) {
    return [];
  }
  return majorOf(list.Version) === majorOf(hostVersion) ? [...list.Packages] : [];
}

/** The major version of an exact version string. */
function majorOf(version: string): string {
  return version.trim().split('.')[0];
}

/**
 * Apply `pins` to the `overrides` of a `pnpm-workspace.yaml`.
 *
 * Adds a top-level `overrides:` block when the file has none. When it has a
 * block mapping, missing pins are appended to it and entries whose version
 * differs are rewritten to the pinned version — every other line, including
 * unrelated overrides and comments, is kept as it was. The pins win a conflict:
 * they are what the install actually runs, and a stale pin left by an earlier
 * install would hold every Angular package back after an upgrade.
 *
 * @param workspaceYaml - Current content of `pnpm-workspace.yaml`.
 * @param pins - Pins to apply, from {@link ExplorerAngularPins} and/or {@link MemberJunctionPins}.
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
