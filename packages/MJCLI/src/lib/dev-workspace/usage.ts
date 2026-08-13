/**
 * Progressive-disclosure usage metadata for the `dev` domain (`mj dev usage`).
 *
 * SIDE EFFECT ON IMPORT: {@link RegisterDevWorkspaceUsage} is called at the bottom
 * of this module, so importing it declares the domain. `lib/cli-plugins.ts` imports
 * it alongside the built-in plugin modules — the single funnel both `mj usage` and
 * `mj <domain> usage` go through.
 *
 * Why declared here rather than as `static Usage` on a BaseCLIPlugin: the dev
 * commands are plain oclif Commands that ship inside the CLI and must stay
 * bootstrap-free (they are in LIGHT_COMMANDS), so they are not plugin-backed. The
 * text below is the ONLY place an agent learns these rules before invoking, so it
 * states them outright rather than pointing at the commands' help.
 *
 * @module lib/dev-workspace/usage
 */
import { CLIPluginRegistry, type PluginUsage } from '@memberjunction/cli-core';
import { LOCKFILE_NAME, NODE_MODULES_NAME } from './clean.js';
import { WORKSPACE_DIR_ENV_VAR } from './dir-flag.js';
import { SENTINEL_FILE_NAME, WORKSPACE_FILE_NAMES } from './write.js';

/** The parent-directory contract, stated once — every command's description ends with it. */
const PARENT_DIR_RULE =
  `--dir must be the PLAIN directory that HOLDS the sibling repo clones, never a git repo root itself: a parent ` +
  `carrying a .git entry (directory or worktree file) is refused. The member clones underneath it are of course ` +
  `git repos — only the parent must not be. Defaults to the current directory, or $${WORKSPACE_DIR_ENV_VAR} when ` +
  `set (an explicit --dir always wins over the environment).`;

/** Shared `--dir` flag documentation. */
const DIR_FLAG = {
  name: '--dir',
  type: 'string',
  description: `Parent directory holding the sibling clones (default '.', or $${WORKSPACE_DIR_ENV_VAR}; must not be a git repo root)`,
};

/** Usage for `mj dev workspace` — the generator. */
export const DEV_WORKSPACE_USAGE: PluginUsage = {
  domain: 'dev',
  command: 'dev:workspace',
  summary: 'Join sibling repo clones into one pnpm workspace at their common parent directory.',
  description:
    `Writes ${WORKSPACE_FILE_NAMES.join(', ')} plus the ${SENTINEL_FILE_NAME} sentinel manifest at the parent, then ` +
    `runs pnpm install there (disable with --no-install). Members are detected among the parent's immediate ` +
    `subdirectories: a sibling qualifies when it has a root package.json AND any of (a) an mj-app.json marker, ` +
    `(b) a package under its packages/ dir naming or depending on the @mj-biz-apps scope, (c) a root package name ` +
    `of memberjunction-workspace (the MJ monorepo). Use --include to add a repo detection missed and --exclude to ` +
    `drop one. Existing files are NEVER overwritten silently — the run refuses unless --force, which keeps a ` +
    `<name>.bak copy of each. Workspace globs cover each member's repo root plus the packages-rooted globs of the ` +
    `member's own pnpm-workspace.yaml (packages/* when it has none) — never apps/*, ` +
    `because app-shell names collide across repos. Auth SDKs and @angular/service-worker are peerDependencies of ` +
    `the MJ libraries that expose them: a shell serving those features declares its own picks in its own ` +
    `package.json — the command prints that guidance instead of hoisting them. Light command: no MJ bootstrap, ` +
    `no database. Generated files are ephemeral — never commit them; remove them with dev workspace clean. ` +
    PARENT_DIR_RULE,
  flags: [
    DIR_FLAG,
    { name: '--include', type: 'string (repeatable)', description: 'Repo directory name to add to the detected member set' },
    { name: '--exclude', type: 'string (repeatable)', description: 'Repo directory name to drop from the member set' },
    { name: '--no-install', type: 'boolean', description: 'Generate the files but skip pnpm install' },
    { name: '--force', type: 'boolean', description: 'Overwrite existing generated files, keeping a .bak of each' },
    { name: '--verbose', type: 'boolean', description: 'Show detailed output' },
  ],
  examples: [
    'mj dev workspace --dir ~/code/bluecypress',
    'mj dev workspace --dir ~/code/bluecypress --no-install',
    'mj dev workspace --dir ~/code/bluecypress --include bizapps-common --exclude bizapps-sonar',
    `${WORKSPACE_DIR_ENV_VAR}=~/code/bluecypress mj dev workspace --force`,
  ],
  runtime: {
    class: 'variable',
    typicalSeconds: 90,
    note: 'file generation is under a second; pnpm install dominates and scales with the members\' dependency graph (--no-install skips it)',
  },
};

/** Usage for `mj dev workspace status` — the read-only report. */
export const DEV_WORKSPACE_STATUS_USAGE: PluginUsage = {
  domain: 'dev',
  command: 'dev:workspace:status',
  summary: 'Report the state of a generated cross-repo workspace at a parent directory.',
  description:
    `Read-only: writes nothing. Reports which generated files exist, whether ${LOCKFILE_NAME} and ` +
    `${NODE_MODULES_NAME} are present, whether the ${SENTINEL_FILE_NAME} sentinel is there (proof the workspace ` +
    `came from this generator, and what dev workspace clean requires), the members parsed from ` +
    `pnpm-workspace.yaml versus the candidates detected on disk right now, which members are missing from disk, ` +
    `how --dir was resolved (flag, environment, or default), and whether the active pnpm version matches the ` +
    `generated pin. Run it before clean to see what a teardown would touch. Light command: no MJ bootstrap. ` +
    PARENT_DIR_RULE,
  flags: [DIR_FLAG],
  examples: [
    'mj dev workspace status',
    'mj dev workspace status --dir ~/code/bluecypress',
    `${WORKSPACE_DIR_ENV_VAR}=~/code/bluecypress mj dev workspace status`,
  ],
  runtime: { class: 'fast', typicalSeconds: 1, note: 'one `pnpm --version` probe plus directory reads' },
};

/** Usage for `mj dev workspace clean` — the teardown. */
export const DEV_WORKSPACE_CLEAN_USAGE: PluginUsage = {
  domain: 'dev',
  command: 'dev:workspace:clean',
  summary: 'Remove the generated workspace files, lockfile and node_modules at a parent directory.',
  description:
    `Deletes exactly what the generator owns — ${WORKSPACE_FILE_NAMES.join(', ')}, ${LOCKFILE_NAME}, the ` +
    `${NODE_MODULES_NAME} tree, and ${SENTINEL_FILE_NAME} last — and nothing else: member repo checkouts and any ` +
    `.bak backups are left alone and reported. Without --force a valid ${SENTINEL_FILE_NAME} must be present, so ` +
    `clean refuses to tear down a workspace it cannot prove it generated (hand-made or pre-sentinel ones need ` +
    `--force). Use --dry-run first: it lists the paths that exist and exits 0 without deleting, and combines with ` +
    `--force to preview a sentinel-less parent. Paths already gone are reported, not errors, so a repeat run is ` +
    `safe. Light command: no MJ bootstrap. ` + PARENT_DIR_RULE,
  flags: [
    DIR_FLAG,
    { name: '--dry-run', type: 'boolean', description: 'List what would be removed and exit without deleting' },
    { name: '--force', type: 'boolean', description: `Clean even without a valid ${SENTINEL_FILE_NAME} sentinel` },
  ],
  examples: [
    'mj dev workspace clean --dir ~/code/bluecypress --dry-run',
    'mj dev workspace clean --dir ~/code/bluecypress',
    'mj dev workspace clean --dir ~/code/bluecypress --dry-run --force',
  ],
  runtime: {
    class: 'moderate',
    typicalSeconds: 10,
    note: `removing the ${NODE_MODULES_NAME} tree dominates; --dry-run is instant`,
  },
};

/** Every dev-domain usage declaration, in the order `mj dev usage` should teach them. */
export const DEV_DOMAIN_USAGE: readonly PluginUsage[] = [
  DEV_WORKSPACE_USAGE,
  DEV_WORKSPACE_STATUS_USAGE,
  DEV_WORKSPACE_CLEAN_USAGE,
];

/** Declares the dev domain with the usage registry. Idempotent — safe to call repeatedly. */
export function RegisterDevWorkspaceUsage(): void {
  for (const usage of DEV_DOMAIN_USAGE) {
    CLIPluginRegistry.RegisterUsage(usage);
  }
}

RegisterDevWorkspaceUsage();
