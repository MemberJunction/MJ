/**
 * Pure content builders for the four generated workspace files.
 *
 * NO SIDE EFFECTS in this module: every function maps member metadata (already
 * loaded by `detect.ts`) to file content strings. Writing is `write.ts`'s job.
 *
 * Content rules reproduce the manual setup this command replaces — each one was
 * proven by joining these repos by hand before any of it was automated:
 *  - pnpm-workspace.yaml: `linkWorkspacePackages: true`, the 16-name build-scripts
 *    allowlist, and per member ONLY the repo root + `packages/*` globs (producer
 *    packages only — `apps/*` globs collide because every repo names its apps
 *    `mj_api`/`mj_explorer`).
 *  - .npmrc: exactly three settings lines. There is deliberately no
 *    `public-hoist-pattern[]` block — see "Why no hoist block" below.
 *  - package.json: private root manifest, pnpm `packageManager` pin, the
 *    devDependency union of member roots (highest version wins, every conflict
 *    reported), and the proven peerDependencyRules bridge block.
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
import type {
  CandidateRepo,
  DevDepConflict,
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

/** The three .npmrc settings lines — strict peers has been the standard since 2026-08-07. */
export const NPMRC_BASE_LINES: readonly string[] = [
  'package-manager-strict=false',
  'strict-peer-dependencies=true',
  'auto-install-peers=true',
];

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

/** Peer bridge block for older published MJ copies still in the tree. */
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
 * Builds `pnpm-workspace.yaml`: member repo roots plus their `packages/*` globs only.
 * Producer packages only — never `apps/*` (app-shell names collide across repos).
 */
export function BuildWorkspaceYaml(memberNames: readonly string[]): string {
  if (memberNames.length === 0) {
    throw new Error('BuildWorkspaceYaml requires at least one member repo');
  }
  const lines: string[] = [`# ${GENERATED_HEADER}`, 'linkWorkspacePackages: true', ''];
  lines.push('onlyBuiltDependencies:');
  for (const dep of ONLY_BUILT_DEPENDENCIES) {
    lines.push(yamlListEntry(dep));
  }
  lines.push('', 'packages:');
  for (const name of [...memberNames].sort()) {
    lines.push(`  - '${name}'`);
    lines.push(`  - '${name}/packages/*'`);
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
 * Builds `.npmrc`: exactly the three proven settings lines.
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

/**
 * Unions every member repo's root devDependencies. Conflict rule: highest base
 * version wins; ties keep the first seen. EVERY conflict is returned so the
 * command can log it — the resolver never picks silently.
 */
export function ResolveDevDependencyUnion(members: readonly CandidateRepo[]): {
  DevDependencies: Record<string, string>;
  Conflicts: DevDepConflict[];
} {
  const chosen = new Map<string, { Repo: string; Version: string }>();
  const conflicts = new Map<string, DevDepConflict>();
  for (const member of [...members].sort((a, b) => a.Name.localeCompare(b.Name))) {
    const devDeps = member.RootPackageJson.devDependencies ?? {};
    for (const [name, version] of Object.entries(devDeps)) {
      recordDevDep(chosen, conflicts, name, { Repo: member.Name, Version: version });
    }
  }
  for (const [name, version] of Object.entries(BASELINE_DEV_DEPENDENCIES)) {
    if (!chosen.has(name)) chosen.set(name, { Repo: 'generator baseline', Version: version });
  }
  const union: Record<string, string> = {};
  for (const name of [...chosen.keys()].sort()) {
    union[name] = chosen.get(name)!.Version;
  }
  return { DevDependencies: union, Conflicts: [...conflicts.values()] };
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
 * Builds the private parent `package.json`: pnpm pin, member devDependency union,
 * and the proven peerDependencyRules bridge block.
 */
export function BuildRootPackageJson(parentDirName: string, members: readonly CandidateRepo[]): RootPackageJsonResult {
  if (members.length === 0) {
    throw new Error('BuildRootPackageJson requires at least one member repo');
  }
  const { DevDependencies, Conflicts } = ResolveDevDependencyUnion(members);
  const { Pin, Source } = ResolvePnpmPin(members);
  const manifest = {
    name: workspaceName(parentDirName),
    private: true,
    packageManager: Pin,
    devDependencies: DevDependencies,
    pnpm: { peerDependencyRules: PEER_DEPENDENCY_RULES },
  };
  return {
    Content: `${JSON.stringify(manifest, null, 2)}\n`,
    Conflicts,
    PinSource: Source,
    Pin,
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
