/**
 * Pure content builders for the four generated workspace files.
 *
 * NO SIDE EFFECTS in this module: every function maps member metadata (already
 * loaded by `detect.ts`) to file content strings. Writing is `write.ts`'s job.
 *
 * Content rules reproduce the manual setup this command replaces — each one was
 * proven by joining these repos by hand before any of it was automated:
 *  - pnpm-workspace.yaml: `linkWorkspacePackages: true`, the 16-name build-scripts
 *    allowlist, and per member the repo root plus the member's OWN packages-rooted
 *    workspace globs re-prefixed with its directory name (producer packages only —
 *    `apps/*` globs collide because every repo names its apps `mj_api`/`mj_explorer`,
 *    so detection filters them out before they reach this module). A member with no
 *    workspace file of its own contributes the proven `packages/*` default; the MJ
 *    monorepo contributes its 42 nested globs (#3795).
 *    The same file carries the pnpm SETTINGS (overrides, patches, peer rules):
 *    pnpm 10 reads them only from `pnpm-workspace.yaml` — a `pnpm` block in the
 *    root package.json is ignored with a per-field warning that drowns in the
 *    install output (946 overrides silently inert).
 *  - .npmrc: exactly one settings line. There is deliberately no
 *    `public-hoist-pattern[]` block — see "Why no hoist block" below.
 *    A package name two members both provide (every MJ-based app repo has a
 *    `mj_generatedentities`) gets consumer-scoped `link:` overrides so each
 *    member's own consumers keep its own copy — see {@link ResolveDuplicateProviderLinks}.
 *  - package.json: private root manifest, pnpm `packageManager` pin, and the
 *    devDependency union of member roots (highest version wins, every conflict
 *    reported). No `pnpm` block — see pnpm-workspace.yaml above.
 *  - turbo.json: copied verbatim from a member, with a minimal fallback.
 *
 * Why no hoist block: the 78-entry `public-hoist-pattern[]` set the manual setup
 * carried was written for the npm-hoisted era, when a library could import a
 * package it never declared and hoisting silently covered for it. An attribution
 * audit of all 78 entries against the MJ monorepo (2026-08-13) found no entry that
 * still needs hoisting: every package an MJ library imports is declared by it, and
 * every third-party peer relationship in the set (`@foblex/flow`'s siblings,
 * `rete-*-plugin` -> `rete`, `marked-*` -> `marked`, `date-fns-tz` -> `date-fns`,
 * `ajv-formats` -> `ajv`, radix/expo -> `react`) is satisfied by a real
 * declaration. pnpm's strict layout is what forced that: a package that imports
 * what it does not declare fails to resolve rather than falling through to a
 * hoisted copy, so the pnpm conversion had to fix them all.
 *
 * The one residual class is genuinely the shell's own choice rather than a layout
 * problem — see {@link SHELL_PROVIDED_PEERS}.
 *
 * @module lib/dev-workspace/build
 */
import { DeriveLockfilePins, IsResolvedVersion, MajorOf, type LockfilePinsResult } from './lockfile.js';
import type {
  CandidateRepo,
  DevDepConflict,
  DuplicateFamilyPackage,
  DuplicateProviderLink,
  PackageExtension,
  ParentManifestReport,
  RootPackageJsonResult,
  TurboJsonResult,
  WorkspaceSentinel,
} from './types.js';

/** Build-scripts allowlist proven on the core-monorepo spike. */
export const ONLY_BUILT_DEPENDENCIES: readonly string[] = [
  '@apollo/protobufjs',
  '@google/genai',
  '@parcel/watcher',
  '@zoom/rtms',
  'browser-tabs-lock',
  'core-js',
  'core-js-pure',
  'esbuild',
  'isolated-vm',
  'lmdb',
  'msgpackr-extract',
  'oracledb',
  'protobufjs',
  'rete',
  'sharp',
  'tesseract.js',
];

/**
 * The one .npmrc settings line. The peer settings that used to sit beside it
 * (`strict-peer-dependencies`, `auto-install-peers`) now live in
 * `pnpm-workspace.yaml` with the rest of the pnpm settings — see
 * {@link PEER_INSTALL_SETTINGS}.
 */
export const NPMRC_BASE_LINES: readonly string[] = ['package-manager-strict=false'];

/**
 * Peer-resolution settings for the parent workspace, emitted into
 * `pnpm-workspace.yaml`. Peers are auto-installed but NOT strict: a mixed
 * workspace links MJ from source while a member may still resolve published
 * packages (Skip-Brain's `@mj-biz-apps/*` 5.33) whose peer ranges name an older
 * MJ major than the linked source — a strict install fails on peers no member
 * can fix, while a non-strict one reports them and completes.
 */
export const PEER_INSTALL_SETTINGS = {
  strictPeerDependencies: false,
  autoInstallPeers: true,
} as const;

/**
 * Packages an MJ library declares as a `peerDependency` because the choice belongs
 * to the app shell, not the library — the auth SDK family especially, where a shell
 * picks exactly one provider out of five. These are NOT a layout problem and no
 * pnpm setting fixes them: a shell that serves one of these features declares the
 * package in its own `package.json`, the same as any other direct dependency.
 *
 * Kept here (rather than as prose) so the command's guidance text has one source of
 * truth. Grouped by the MJ package whose peer declaration creates the requirement.
 */
export const SHELL_PROVIDED_PEERS: ReadonlyArray<{ Library: string; Peers: readonly string[] }> = [
  {
    Library: '@memberjunction/ng-auth-services',
    Peers: [
      '@auth0/auth0-angular',
      '@azure/msal-angular',
      '@azure/msal-browser',
      '@azure/msal-common',
      '@okta/okta-auth-js',
      '@workos-inc/authkit-js',
      'aws-amplify',
    ],
  },
  {
    Library: '@memberjunction/ng-explorer-service-worker',
    Peers: ['@angular/service-worker'],
  },
];

/**
 * Peer bridge baseline for older published MJ copies still in the tree.
 *
 * Verified 2026-08-13 against the MJ monorepo root: the five `allowedVersions`
 * rules match MJ's own `pnpm.peerDependencyRules` exactly; `ignoreMissing:
 * ['axios']` is generator-only, for older published MJ copies a parent may still
 * resolve. The baseline stays hardcoded (rather than read from MJ) because a
 * parent whose members declare no rules still needs the proven bridge — and any
 * member-declared `peerDependencyRules` are UNIONED ON TOP of it by
 * {@link ResolveMemberPnpmBlocks}, so MJ's rules can evolve without a generator
 * release as long as MJ is a member.
 */
export const PEER_DEPENDENCY_RULES = {
  allowedVersions: {
    'nunjucks>chokidar': '5',
    '@modelcontextprotocol/sdk>zod': '^3.24',
    'zod-to-json-schema>zod': '^3.24',
    'openai>zod': '^3.24',
    '@anthropic-ai/sdk>zod': '^3.24',
  },
  ignoreMissing: ['axios'],
} as const;

/** Used only when no member pins pnpm — the proven pin (== the MJ monorepo's pin today). */
export const FALLBACK_PNPM_PIN = 'pnpm@10.33.0';

/** The proven root-manifest devDependency baseline; fills gaps the union leaves. */
export const BASELINE_DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
  turbo: '^2.5.0',
  'tsc-alias': '^1.8.16',
};

/** Minimal parent turbo.json used only when no member carries one. */
const FALLBACK_TURBO_JSON = `${JSON.stringify(
  {
    $schema: 'https://turbo.build/schema.json',
    tasks: { build: { dependsOn: ['^build'], outputs: ['dist/**', 'build/**'] } },
  },
  null,
  2
)}\n`;

const GENERATED_HEADER = 'Generated by `mj dev workspace` — never commit to any repo; teardown = delete.';

/** Quotes a YAML list entry the proven way: scoped names quoted, bare names not. */
function yamlListEntry(name: string): string {
  return name.startsWith('@') ? `  - '${name}'` : `  - ${name}`;
}

/**
 * One member's glob lines: the repo root plus each of its workspace globs
 * re-prefixed with its directory name (negations keep the `!` outside the prefix,
 * as pnpm requires). Preconditions — enforced, since violating them silently
 * drops packages from the workspace or admits colliding app shells (#3795): the
 * member has at least one glob, and every POSITIVE glob is packages-rooted.
 * Negations are exempt (a `!**\/dist\/**` guard survives verbatim): they only
 * subtract, so re-prefixing one can never admit anything.
 */
function memberGlobLines(member: Pick<CandidateRepo, 'Name' | 'WorkspaceGlobs' | 'AppGlobs'>): string[] {
  if (member.WorkspaceGlobs.length === 0) {
    throw new Error(`Member ${member.Name} has no workspace globs — detection must supply at least the packages/* default`);
  }
  const lines = [`  - '${member.Name}'`];
  for (const glob of member.WorkspaceGlobs) {
    const negated = glob.startsWith('!');
    const body = negated ? glob.slice(1) : glob;
    if (!negated && !body.startsWith('packages/')) {
      throw new Error(`Member ${member.Name} glob '${glob}' is not rooted under packages/ — detection must filter app-shell globs out`);
    }
    lines.push(negated ? `  - '!${member.Name}/${body}'` : `  - '${member.Name}/${glob}'`);
  }
  // App shells the user admitted for this member with --apps (already validated by SelectAppGlobs).
  for (const glob of member.AppGlobs ?? []) {
    if (glob.startsWith('!') || glob.startsWith('packages/')) {
      throw new Error(`Member ${member.Name} app glob '${glob}' is not an admitted app-shell glob — SelectAppGlobs must run first`);
    }
    lines.push(`  - '${member.Name}/${glob}'`);
  }
  return lines;
}

/**
 * The #3795 guard, made explicit for admitted app shells: every package an `--apps` glob
 * enumerates must have a name no other workspace package uses, or pnpm would silently pick one.
 * Throws naming both sides; returns the admitted app package names otherwise. Pure.
 */
export function AssertAppPackageNamesUnique(
  members: ReadonlyArray<Pick<CandidateRepo, 'Name' | 'Packages' | 'AppGlobs'>>
): string[] {
  const isUnder = (relPath: string, glob: string): boolean =>
    glob.endsWith('/*') ? relPath.startsWith(`${glob.slice(0, -2)}/`) && !relPath.slice(glob.length - 1).includes('/') : relPath === glob;
  const owners = new Map<string, string>(); // package name -> "member/relPath"
  const appNames: string[] = [];
  for (const member of members) {
    for (const pkg of member.Packages) {
      const name = pkg.PackageJson.name;
      if (!name) continue;
      const isApp = (member.AppGlobs ?? []).some((g) => isUnder(pkg.RelPath, g));
      const here = `${member.Name}/${pkg.RelPath}`;
      const other = owners.get(name);
      if (other !== undefined && (isApp || appNames.includes(name))) {
        throw new Error(`--apps: package name '${name}' is declared by both ${other} and ${here} — app-shell names must be unique across the workspace`);
      }
      if (other === undefined) owners.set(name, here);
      if (isApp) appNames.push(name);
    }
  }
  return appNames;
}

/** A YAML mapping key: bare when it is a plain identifier (the pnpm setting names), single-quoted otherwise. */
function yamlKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : yamlScalar(key);
}

/** A YAML scalar: booleans and numbers bare, strings always single-quoted (a `'` doubles). */
function yamlScalar(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  throw new Error(`pnpm settings may hold only strings, numbers, booleans, arrays and objects — got ${typeof value}`);
}

/**
 * Renders one JSON-shaped record as block-style YAML lines at the given indent.
 * Deliberately tiny: the pnpm settings are strings, booleans, string lists and
 * nested records, nothing else — anything else throws rather than mis-rendering.
 */
function yamlMappingLines(record: Readonly<Record<string, unknown>>, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${yamlKey(key)}: []`);
        continue;
      }
      lines.push(`${pad}${yamlKey(key)}:`);
      for (const item of value) lines.push(`${pad}  - ${yamlScalar(item)}`);
    } else if (value !== null && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      if (Object.keys(nested).length === 0) {
        lines.push(`${pad}${yamlKey(key)}: {}`);
        continue;
      }
      lines.push(`${pad}${yamlKey(key)}:`);
      lines.push(...yamlMappingLines(nested, indent + 2));
    } else {
      lines.push(`${pad}${yamlKey(key)}: ${yamlScalar(value)}`);
    }
  }
  return lines;
}

/**
 * Builds `pnpm-workspace.yaml`: per member (sorted by name) the repo root plus the
 * member's own packages-rooted workspace globs re-prefixed with its directory name.
 * Producer packages only — never `apps/*` (app-shell names collide across repos).
 *
 * `settings` — the assembled pnpm settings from {@link BuildRootPackageJson}
 * (`PnpmSettings`: overrides, patches, peer rules, the peer install switches) —
 * are appended as block YAML. pnpm 10 honours them ONLY in this file; the same
 * block in the root package.json is ignored with a per-field warning.
 */
export function BuildWorkspaceYaml(
  members: ReadonlyArray<Pick<CandidateRepo, 'Name' | 'WorkspaceGlobs' | 'AppGlobs'>>,
  settings: Readonly<Record<string, unknown>> = {}
): string {
  if (members.length === 0) {
    throw new Error('BuildWorkspaceYaml requires at least one member repo');
  }
  const lines: string[] = [`# ${GENERATED_HEADER}`, 'linkWorkspacePackages: true', ''];
  lines.push('onlyBuiltDependencies:');
  for (const dep of ONLY_BUILT_DEPENDENCIES) {
    lines.push(yamlListEntry(dep));
  }
  lines.push('', 'packages:');
  // Plain codepoint order (what Array.prototype.sort did on the old name list) —
  // keeps regenerated output byte-identical for pre-existing workspaces.
  for (const member of [...members].sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0))) {
    lines.push(...memberGlobLines(member));
  }
  if (Object.keys(settings).length > 0) {
    lines.push('', '# pnpm settings — pnpm 10 reads these ONLY from this file; a package.json#pnpm block is ignored at a workspace root.');
    lines.push(...yamlMappingLines(settings, 0));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Renders the shell-dependency guidance the command prints — the replacement for
 * the deleted hoist block. Derived from {@link SHELL_PROVIDED_PEERS} so the advice
 * and the data cannot drift apart.
 */
export function BuildShellPeerGuidance(): string[] {
  const lines = ['Serving an app shell from inside the workspace? Declare its own runtime picks in the shell\'s package.json:'];
  for (const { Library, Peers } of SHELL_PROVIDED_PEERS) {
    lines.push(`  ${Library} peers -> ${Peers.join(', ')}`);
  }
  lines.push('  (only the ones your shell actually uses — these are choices, not a layout fix)');
  return lines;
}

/**
 * Builds `.npmrc`: exactly the one settings line pnpm still needs there.
 *
 * No `public-hoist-pattern[]` block by design — see the "Why no hoist block" note
 * at the top of this module.
 */
export function BuildNpmrc(): string {
  return `${[`# ${GENERATED_HEADER}`, ...NPMRC_BASE_LINES].join('\n')}\n`;
}

/** Parses the leading numeric triple out of a version/range string, or null. */
function parseVersionTriple(version: string): [number, number, number] | null {
  const match = /^[\^~>=<\s v]*(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compares two version/range strings by their base numeric triple.
 * Returns >0 when `a` is higher, <0 when `b` is higher, 0 on a tie or when
 * either side has no parseable triple (caller keeps the incumbent and reports).
 */
export function CompareVersionStrings(a: string, b: string): number {
  const ta = parseVersionTriple(a);
  const tb = parseVersionTriple(b);
  if (ta === null || tb === null) return 0;
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i];
  }
  return 0;
}

/** Result of the devDependency union: the deps plus everything it dropped or transformed. */
export interface DevDependencyUnionResult {
  DevDependencies: Record<string, string>;
  Conflicts: DevDepConflict[];
  /** `@types/*` names excluded entirely — two copies of one @types package is a guaranteed nominal-type break. */
  SkippedTypes: string[];
  /** `workspace:` specifiers on packages NO member provides — unresolvable at the parent, dropped. */
  DroppedWorkspace: Array<{ Package: string; Repo: string }>;
}

/**
 * Classifies one member devDep for the union: kept as-is, rewritten to
 * `workspace:*` (member-provided names — local source beats registry pins), or
 * dropped (`@types/*`; `workspace:` on a package no member provides).
 */
function classifyDevDep(
  name: string,
  version: string,
  repo: string,
  familyNames: ReadonlySet<string>,
  result: Pick<DevDependencyUnionResult, 'SkippedTypes' | 'DroppedWorkspace'>
): { Repo: string; Version: string } | null {
  if (name.startsWith('@types/')) {
    if (!result.SkippedTypes.includes(name)) result.SkippedTypes.push(name);
    return null; // the field's @types/mssql 9.1.8+9.1.11 nominal-type break — never union @types
  }
  if (familyNames.has(name)) {
    return { Repo: `workspace member (declared by ${repo})`, Version: 'workspace:*' };
  }
  if (version.startsWith('workspace:')) {
    result.DroppedWorkspace.push({ Package: name, Repo: repo });
    return null; // meaningless at the parent when nothing provides the package
  }
  return { Repo: repo, Version: version };
}

/**
 * Unions every member repo's root devDependencies. Conflict rule: highest base
 * version wins; ties keep the first seen. EVERY conflict, skip, and drop is
 * returned so the command can log it — the resolver never decides silently.
 * `familyNames` = package names provided by workspace members; those become
 * `workspace:*` (local ALWAYS beats a registry pin — field finding on #3795).
 */
export function ResolveDevDependencyUnion(
  members: readonly CandidateRepo[],
  familyNames: ReadonlySet<string> = new Set()
): DevDependencyUnionResult {
  const chosen = new Map<string, { Repo: string; Version: string }>();
  const conflicts = new Map<string, DevDepConflict>();
  const result: Pick<DevDependencyUnionResult, 'SkippedTypes' | 'DroppedWorkspace'> = { SkippedTypes: [], DroppedWorkspace: [] };
  for (const member of [...members].sort((a, b) => a.Name.localeCompare(b.Name))) {
    for (const [name, version] of Object.entries(member.RootPackageJson.devDependencies ?? {})) {
      const candidate = classifyDevDep(name, version, member.Name, familyNames, result);
      if (candidate !== null) recordDevDep(chosen, conflicts, name, candidate);
    }
  }
  for (const [name, version] of Object.entries(BASELINE_DEV_DEPENDENCIES)) {
    if (!chosen.has(name)) chosen.set(name, { Repo: 'generator baseline', Version: version });
  }
  const union: Record<string, string> = {};
  for (const name of [...chosen.keys()].sort()) {
    union[name] = chosen.get(name)!.Version;
  }
  return { DevDependencies: union, Conflicts: [...conflicts.values()], ...result };
}

/** Applies one member's devDep declaration to the union, recording any conflict. */
function recordDevDep(
  chosen: Map<string, { Repo: string; Version: string }>,
  conflicts: Map<string, DevDepConflict>,
  name: string,
  candidate: { Repo: string; Version: string }
): void {
  const incumbent = chosen.get(name);
  if (!incumbent) {
    chosen.set(name, candidate);
    return;
  }
  if (incumbent.Version === candidate.Version) return;
  const winner = CompareVersionStrings(candidate.Version, incumbent.Version) > 0 ? candidate : incumbent;
  const loser = winner === candidate ? incumbent : candidate;
  chosen.set(name, winner);
  const existing = conflicts.get(name);
  if (existing) {
    existing.Winner = winner;
    existing.Losers.push(loser);
  } else {
    conflicts.set(name, { Package: name, Winner: winner, Losers: [loser] });
  }
}

/**
 * Resolves the pnpm `packageManager` pin for the parent manifest: the highest
 * pnpm pin any member carries (the MJ monorepo pins pnpm, so with MJ as a member
 * this matches the MJ repo's pin); otherwise the proven fallback pin.
 */
export function ResolvePnpmPin(members: readonly CandidateRepo[]): { Pin: string; Source: string } {
  let best: { Pin: string; Source: string } | null = null;
  for (const member of [...members].sort((a, b) => a.Name.localeCompare(b.Name))) {
    const pin = member.RootPackageJson.packageManager;
    if (!pin || !pin.startsWith('pnpm@')) continue;
    if (best === null || CompareVersionStrings(pin.slice('pnpm@'.length), best.Pin.slice('pnpm@'.length)) > 0) {
      best = { Pin: pin, Source: member.Name };
    }
  }
  return best ?? { Pin: FALLBACK_PNPM_PIN, Source: 'generator fallback (proven pin)' };
}

/** npm-safe workspace name derived from the parent directory basename. */
function workspaceName(parentDirName: string): string {
  const cleaned = parentDirName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${cleaned.length > 0 ? cleaned : 'mj'}-dev-workspace`;
}

/**
 * Collects every package name the workspace members provide, from the members'
 * OWN package enumerations. These names get `workspace:*` overrides in the
 * parent manifest so local source ALWAYS beats registry copies — the field
 * measured 1,898 registry shadow copies of family packages before forcing local
 * with 367 `workspace:*` overrides (#3795 addendum). Duplicate providers are
 * returned for loud reporting: the link target for a duplicated name is decided
 * by sort order, silently.
 */
export function CollectFamilyPackages(members: readonly CandidateRepo[]): {
  Names: string[];
  Duplicates: DuplicateFamilyPackage[];
} {
  const providers = new Map<string, Set<string>>();
  for (const member of [...members].sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0))) {
    for (const pkg of member.Packages) {
      const name = pkg.PackageJson.name;
      if (name === undefined || name.length === 0) continue;
      const repos = providers.get(name) ?? new Set<string>();
      repos.add(member.Name);
      providers.set(name, repos);
    }
  }
  const duplicates: DuplicateFamilyPackage[] = [];
  for (const [name, repos] of providers) {
    if (repos.size > 1) duplicates.push({ Package: name, Repos: [...repos].sort() });
  }
  return { Names: [...providers.keys()].sort(), Duplicates: duplicates.sort((a, b) => (a.Package < b.Package ? -1 : 1)) };
}

/** The consumer-scoped links for duplicated family names plus every consumer that could not get one. */
export interface DuplicateProviderLinksResult {
  /** `<consumer>><package>` -> `link:<member>/<relPath>` — ready to merge into the parent overrides. */
  Overrides: Record<string, string>;
  Links: DuplicateProviderLink[];
  Unlinked: Array<{ Consumer: string; Package: string; Repo: string; Reason: 'ambiguous-consumer' | 'no-own-copy' }>;
}

/** True when any dependency section of the manifest names `name`. */
function declaresDependency(manifest: CandidateRepo['Packages'][number]['PackageJson'], name: string): boolean {
  return [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies].some((section) => section !== undefined && name in section);
}

/**
 * Keeps each member's OWN copy of a duplicated package name in front of that
 * member's own consumers. A plain `name: workspace:*` override can only pick
 * one provider (pnpm takes the first by sort order), so every MJ-based app repo's
 * `mj_generatedentities` / `mj_generatedactions` collided as soon as two such
 * repos shared a workspace: Skip-Brain's packages type-checked against MJ's
 * generated entities and could not find their own.
 * pnpm's `parent>child` override selector with a root-relative `link:` value
 * scopes the fix to the consumer: `@skip-brain/core>mj_generatedentities:
 * link:Skip-Brain/packages/GeneratedEntities` (verified live).
 *
 * Two consumer shapes cannot be linked and are reported instead: a consumer whose
 * own name is duplicated (the selector would hit every copy of it), and a consumer
 * in a member that provides no copy (nothing of its own to link to — it gets the
 * sort-order provider like before). Pure; deterministic over sorted names.
 */
export function ResolveDuplicateProviderLinks(
  members: readonly CandidateRepo[],
  duplicates: readonly DuplicateFamilyPackage[]
): DuplicateProviderLinksResult {
  const duplicatedNames = new Set(duplicates.map((d) => d.Package));
  const overrides: Record<string, string> = {};
  const links: DuplicateProviderLink[] = [];
  const unlinked: DuplicateProviderLinksResult['Unlinked'] = [];
  const sortedMembers = [...members].sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0));
  for (const dup of [...duplicates].sort((a, b) => (a.Package < b.Package ? -1 : 1))) {
    for (const member of sortedMembers) {
      const provider = [...member.Packages]
        .filter((p) => p.PackageJson.name === dup.Package)
        .sort((a, b) => (a.RelPath < b.RelPath ? -1 : 1))[0];
      for (const consumer of [...member.Packages].sort((a, b) => (a.RelPath < b.RelPath ? -1 : 1))) {
        const consumerName = consumer.PackageJson.name;
        if (consumerName === undefined || consumerName === dup.Package || !declaresDependency(consumer.PackageJson, dup.Package)) continue;
        if (provider === undefined) {
          unlinked.push({ Consumer: consumerName, Package: dup.Package, Repo: member.Name, Reason: 'no-own-copy' });
        } else if (duplicatedNames.has(consumerName)) {
          unlinked.push({ Consumer: consumerName, Package: dup.Package, Repo: member.Name, Reason: 'ambiguous-consumer' });
        } else {
          const target = `link:${member.Name}/${provider.RelPath}`;
          overrides[`${consumerName}>${dup.Package}`] = target;
          links.push({ Consumer: consumerName, Package: dup.Package, Target: target, Repo: member.Name });
        }
      }
    }
  }
  return { Overrides: sortedRecord(overrides), Links: links, Unlinked: unlinked };
}

/** Records a first-member-wins value, reporting any differing later declaration as a conflict. */
function recordFirstWins(
  chosen: Map<string, { Repo: string; Version: string }>,
  conflicts: Map<string, DevDepConflict>,
  key: string,
  candidate: { Repo: string; Version: string }
): void {
  const incumbent = chosen.get(key);
  if (!incumbent) {
    chosen.set(key, candidate);
    return;
  }
  if (incumbent.Version === candidate.Version) return;
  const existing = conflicts.get(key);
  if (existing) {
    existing.Losers.push(candidate);
  } else {
    conflicts.set(key, { Package: key, Winner: incumbent, Losers: [candidate] });
  }
}

/** The unioned member pnpm blocks, ready for the parent manifest. */
export interface MemberPnpmBlocksResult {
  Overrides: Record<string, string>;
  /** `pkg@version` -> patch path RE-ROOTED to `<member>/<path>`. */
  PatchedDependencies: Record<string, string>;
  PackageExtensions: Record<string, PackageExtension>;
  PeerAllowedVersions: Record<string, string>;
  PeerIgnoreMissing: string[];
  Conflicts: DevDepConflict[];
  Patches: Array<{ Package: string; Path: string; Repo: string }>;
}

/** Sorted shallow copy of a record by key (codepoint order — deterministic across locales). */
function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key];
  return sorted;
}

/**
 * Hoists every member's `pnpm` block into one parent-manifest block. pnpm honors
 * NONE of these at a member (finding 2 on #3795: the field workspace ran
 * unpatched type-graphql and lost MJ's 26 pins until this was done by hand).
 * Rules, all deterministic over codepoint-sorted member names:
 *  - overrides: higher base version wins where comparable, first member wins
 *    otherwise (npm-alias values never parse) — every conflict reported;
 *  - patchedDependencies: paths re-rooted to `<member>/<path>`; first member
 *    wins a same-key conflict (two patches cannot merge) — reported;
 *  - packageExtensions: first member wins a differing same-key block — reported;
 *  - peerDependencyRules: allowedVersions first-wins with conflicts reported,
 *    ignoreMissing set-unioned.
 */
export function ResolveMemberPnpmBlocks(members: readonly CandidateRepo[]): MemberPnpmBlocksResult {
  const overrides = new Map<string, { Repo: string; Version: string }>();
  const patches = new Map<string, { Repo: string; Version: string }>();
  const extensionMeta = new Map<string, { Repo: string; Version: string }>();
  const extensionValues = new Map<string, PackageExtension>();
  const peerAllowed = new Map<string, { Repo: string; Version: string }>();
  const conflicts = new Map<string, DevDepConflict>();
  const ignoreMissing = new Set<string>();
  for (const member of [...members].sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0))) {
    const block = member.RootPackageJson.pnpm ?? {};
    for (const [name, version] of Object.entries(block.overrides ?? {})) {
      recordDevDep(overrides, conflicts, name, { Repo: member.Name, Version: version });
    }
    for (const [pkg, patchPath] of Object.entries(block.patchedDependencies ?? {})) {
      recordFirstWins(patches, conflicts, pkg, { Repo: member.Name, Version: `${member.Name}/${patchPath}` });
    }
    for (const [pkg, extension] of Object.entries(block.packageExtensions ?? {})) {
      recordFirstWins(extensionMeta, conflicts, pkg, { Repo: member.Name, Version: JSON.stringify(extension) });
      if (!extensionValues.has(pkg)) extensionValues.set(pkg, extension); // mirrors first-wins
    }
    for (const [rule, range] of Object.entries(block.peerDependencyRules?.allowedVersions ?? {})) {
      recordFirstWins(peerAllowed, conflicts, rule, { Repo: member.Name, Version: range });
    }
    for (const name of block.peerDependencyRules?.ignoreMissing ?? []) {
      ignoreMissing.add(name);
    }
  }
  return {
    Overrides: sortedRecord(Object.fromEntries([...overrides].map(([k, v]) => [k, v.Version]))),
    PatchedDependencies: sortedRecord(Object.fromEntries([...patches].map(([k, v]) => [k, v.Version]))),
    PackageExtensions: sortedRecord(Object.fromEntries(extensionValues)),
    PeerAllowedVersions: sortedRecord(Object.fromEntries([...peerAllowed].map(([k, v]) => [k, v.Version]))),
    PeerIgnoreMissing: [...ignoreMissing].sort(),
    Conflicts: [...conflicts.values()],
    Patches: [...patches].map(([pkg, v]) => ({ Package: pkg, Path: v.Version, Repo: v.Repo })).sort((a, b) => (a.Package < b.Package ? -1 : 1)),
  };
}

/** The bare package name of an override key: `chalk@^5` -> `chalk`, `@types/node@^4` -> `@types/node`. */
function overrideKeyName(key: string): string {
  const at = key.lastIndexOf('@');
  return at <= 0 ? key : key.slice(0, at);
}

/** Removes every pin entry (plain or per-major selector) for a name; records what was displaced. */
function displacePinsForName(overrides: Record<string, string>, name: string, newValue: string, superseded: Set<string>): void {
  for (const key of Object.keys(overrides)) {
    if (overrideKeyName(key) !== name && key !== name) continue;
    if (overrides[key] !== newValue) superseded.add(key);
    delete overrides[key];
  }
}

/**
 * Pins a patched package to the exact version its patch is keyed to. A patch
 * `name@version` only ever applies to that version: letting a lockfile pin or a
 * member override resolve `name` elsewhere leaves the patch inert (pnpm merely
 * warns "patches were not used" — SaaS's committed
 * `type-graphql@2.0.0-rc.3` out-voted MJ's patched `2.0.0-beta.3`, and every
 * consumer of MJ's server then type-checked against the wrong type-graphql).
 * The pin takes the per-major selector shape when other majors of the name are
 * already pinned (never forcing another major), the plain name otherwise.
 * Returns the override key it wrote, or null when the patch key is not pinnable
 * (a range or a bare name — pnpm allows those; there is nothing exact to pin).
 */
function pinPatchedPackage(overrides: Record<string, string>, patchKey: string, superseded: Set<string>): string | null {
  const name = overrideKeyName(patchKey);
  const version = name === patchKey ? '' : patchKey.slice(name.length + 1);
  if (!IsResolvedVersion(version)) return null;
  const selector = `${name}@^${MajorOf(version)}`;
  const otherSelectors = Object.keys(overrides).filter((key) => key !== name && overrideKeyName(key) === name);
  const target = otherSelectors.length > 0 ? selector : name;
  if (target === selector && name in overrides) {
    // a plain-name entry and a selector must not fight: the plain entry gives way
    if (overrides[name] !== version) superseded.add(name);
    delete overrides[name];
  } else if (target === name) {
    displacePinsForName(overrides, name, version, superseded);
  }
  if (target in overrides && overrides[target] !== version) superseded.add(target);
  overrides[target] = version;
  return target;
}

/** The assembled parent overrides plus every decision the layering made. */
export interface AssembledOverrides {
  Overrides: Record<string, string>;
  /** Entries a stronger layer displaced (lockfile pins, member overrides, or both). */
  SupersededPins: string[];
  /** Override keys written from a member's `patchedDependencies` key — the patched exact version wins. */
  PatchPins: string[];
}

/**
 * Layers the override sources into the parent overrides, weakest first:
 * lockfile-derived pins < explicit member overrides < patched-package pins <
 * family `workspace:*` (local source always wins). A member's or family's
 * whole-name entry displaces every per-major pin selector for that name (a plain
 * key and a `name@^N` selector must not fight). Displacements are returned so
 * the command reports them — nothing is overwritten silently.
 *
 * `patchedPackages` are the members' `patchedDependencies` keys (`name@version`);
 * see {@link pinPatchedPackage} for why a patch outranks an override.
 */
export function AssembleParentOverrides(
  lockfilePins: Record<string, string>,
  memberOverrides: Record<string, string>,
  familyNames: readonly string[],
  patchedPackages: readonly string[] = []
): AssembledOverrides {
  const overrides: Record<string, string> = { ...lockfilePins };
  const superseded = new Set<string>();
  for (const [key, version] of Object.entries(memberOverrides)) {
    if (overrideKeyName(key) === key) {
      // whole-name member override displaces every per-major pin selector for the name
      displacePinsForName(overrides, key, version, superseded);
    } else if (key in overrides && overrides[key] !== version) {
      superseded.add(key); // range-scoped member override displaces only its own selector
    }
    overrides[key] = version;
  }
  const patchPins = new Set<string>();
  for (const patchKey of [...patchedPackages].sort()) {
    const written = pinPatchedPackage(overrides, patchKey, superseded);
    if (written !== null) patchPins.add(written);
  }
  for (const name of familyNames) {
    displacePinsForName(overrides, name, 'workspace:*', superseded);
    overrides[name] = 'workspace:*';
    for (const key of [...patchPins]) if (overrideKeyName(key) === name) patchPins.delete(key); // source beats patch
  }
  return { Overrides: sortedRecord(overrides), SupersededPins: [...superseded].sort(), PatchPins: [...patchPins].sort() };
}

/**
 * Builds the pnpm settings for `pnpm-workspace.yaml` from the assembled parts,
 * omitting empty sections: the peer install switches, the peer bridge rules, the
 * layered overrides, hoisted patches and package extensions. Key order is fixed
 * so a regenerated workspace is byte-identical.
 */
export function BuildPnpmWorkspaceSettings(overrides: Record<string, string>, blocks: MemberPnpmBlocksResult): Record<string, unknown> {
  const peerDependencyRules = {
    allowedVersions: sortedRecord({ ...PEER_DEPENDENCY_RULES.allowedVersions, ...blocks.PeerAllowedVersions }),
    ignoreMissing: [...new Set([...PEER_DEPENDENCY_RULES.ignoreMissing, ...blocks.PeerIgnoreMissing])].sort(),
  };
  const settings: Record<string, unknown> = { ...PEER_INSTALL_SETTINGS, peerDependencyRules };
  if (Object.keys(overrides).length > 0) settings.overrides = overrides;
  if (Object.keys(blocks.PatchedDependencies).length > 0) {
    settings.patchedDependencies = blocks.PatchedDependencies;
    // A member patch is keyed to pkg@version; when the parent graph never resolves
    // that exact version, pnpm hard-fails the WHOLE install with ERR_PNPM_UNUSED_PATCH.
    // One member's stale patch must not brick every member's workspace — allow it,
    // and rely on the assembly report, which names every hoisted patch. (The
    // patched-package pins in AssembleParentOverrides make this the rare case.)
    settings.allowUnusedPatches = true;
  }
  if (Object.keys(blocks.PackageExtensions).length > 0) settings.packageExtensions = blocks.PackageExtensions;
  return settings;
}

/**
 * Builds the private parent `package.json` — pnpm pin and the cleaned member
 * devDependency union — and, alongside it, the pnpm settings the workspace yaml
 * carries: member overrides and patches hoisted, lockfile-derived pins,
 * patched-package pins, and `workspace:*` overrides for every member-provided
 * package. The settings are returned rather than written into the manifest
 * because pnpm 10 ignores a `pnpm` block at a workspace root. Every decision
 * lands in the returned Report.
 */
export function BuildRootPackageJson(parentDirName: string, members: readonly CandidateRepo[]): RootPackageJsonResult {
  if (members.length === 0) {
    throw new Error('BuildRootPackageJson requires at least one member repo');
  }
  const family = CollectFamilyPackages(members);
  const union = ResolveDevDependencyUnion(members, new Set(family.Names));
  const pins = DeriveLockfilePins(
    members.flatMap((m) => (m.Lockfile !== null && m.Lockfile.Kind !== 'unsupported' ? [{ Repo: m.Name, Lockfile: m.Lockfile }] : [])),
    new Set(family.Names)
  );
  const blocks = ResolveMemberPnpmBlocks(members);
  const assembled = AssembleParentOverrides(pins.Pins, blocks.Overrides, family.Names, Object.keys(blocks.PatchedDependencies));
  const duplicateLinks = ResolveDuplicateProviderLinks(members, family.Duplicates);
  const { Pin, Source } = ResolvePnpmPin(members);
  const manifest = {
    name: workspaceName(parentDirName),
    private: true,
    packageManager: Pin,
    devDependencies: union.DevDependencies,
  };
  return {
    Content: `${JSON.stringify(manifest, null, 2)}\n`,
    // scoped `consumer>package` keys sit beside the plain ones — they never collide
    PnpmSettings: BuildPnpmWorkspaceSettings(sortedRecord({ ...assembled.Overrides, ...duplicateLinks.Overrides }), blocks),
    Conflicts: union.Conflicts,
    PinSource: Source,
    Pin,
    Report: buildManifestReport(members, family, union, pins, blocks, assembled, duplicateLinks),
  };
}

/** Assembles the absorption report — one place, so nothing the build decided goes unreported. */
function buildManifestReport(
  members: readonly CandidateRepo[],
  family: { Names: string[]; Duplicates: DuplicateFamilyPackage[] },
  union: DevDependencyUnionResult,
  pins: LockfilePinsResult,
  blocks: MemberPnpmBlocksResult,
  assembled: AssembledOverrides,
  duplicateLinks: DuplicateProviderLinksResult
): ParentManifestReport {
  const lockfileSkips = members.flatMap((m) =>
    m.Lockfile !== null && m.Lockfile.Kind !== 'unsupported' ? m.Lockfile.Skipped.map((skip) => ({ Repo: m.Name, Skip: skip })) : []
  );
  const unsupportedLockfiles = members.flatMap((m) =>
    m.Lockfile !== null && m.Lockfile.Kind === 'unsupported' ? [{ Repo: m.Name, File: m.Lockfile.File, Version: m.Lockfile.Version }] : []
  );
  return {
    LockfilePinCount: Object.keys(pins.Pins).length,
    PinConflicts: pins.Conflicts,
    LockfileSkips: lockfileSkips,
    UnsupportedLockfiles: unsupportedLockfiles,
    HoistedOverrideCount: Object.keys(blocks.Overrides).length,
    BlockConflicts: blocks.Conflicts,
    Patches: blocks.Patches,
    FamilyOverrideCount: family.Names.length,
    DuplicateFamilyPackages: family.Duplicates,
    DuplicateProviderLinks: duplicateLinks.Links,
    UnlinkedDuplicateConsumers: duplicateLinks.Unlinked,
    SkippedTypesDevDeps: [...union.SkippedTypes].sort(),
    DroppedWorkspaceDevDeps: union.DroppedWorkspace,
    SupersededPins: assembled.SupersededPins,
    PatchPins: assembled.PatchPins,
  };
}

/**
 * Marker value the sentinel carries. `mj dev workspace clean` refuses to delete a
 * workspace whose sentinel does not carry exactly this string, so it is the proof
 * that the residue at a parent directory is this tool's own output.
 */
export const SENTINEL_MARKER = 'mj dev workspace';

/**
 * Builds the `.mj-dev-workspace.json` sentinel manifest: the marker `clean`
 * checks, the files the generator wrote, and the members it wrote them for.
 *
 * Both lists are sorted and no timestamp is recorded — regenerating an unchanged
 * workspace must produce a byte-identical sentinel.
 */
export function BuildSentinel(fileNames: readonly string[], memberNames: readonly string[]): string {
  if (fileNames.length === 0) {
    throw new Error('BuildSentinel requires at least one generated file name');
  }
  if (memberNames.length === 0) {
    throw new Error('BuildSentinel requires at least one member repo');
  }
  const sentinel: WorkspaceSentinel = {
    generatedBy: SENTINEL_MARKER,
    files: [...fileNames].sort(),
    members: [...memberNames].sort(),
  };
  return `${JSON.stringify(sentinel, null, 2)}\n`;
}

/**
 * Picks the parent `turbo.json`: copied verbatim from the first member (sorted by
 * name) that carries one; a minimal proven config otherwise.
 */
export function PickTurboJson(members: readonly CandidateRepo[]): TurboJsonResult {
  for (const member of [...members].sort((a, b) => a.Name.localeCompare(b.Name))) {
    if (member.TurboJson !== null) {
      return { Content: member.TurboJson, Source: member.Name };
    }
  }
  return { Content: FALLBACK_TURBO_JSON, Source: 'generator fallback' };
}
