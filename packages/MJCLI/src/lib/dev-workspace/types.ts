/**
 * Shared types for the `mj dev workspace` generator.
 *
 * The generator creates the four ephemeral files that join sibling repo checkouts
 * into a single pnpm workspace at their common parent directory:
 * `pnpm-workspace.yaml`, `.npmrc`, `package.json`, `turbo.json`.
 *
 * The generated contents reproduce the manual setup this command replaces: every
 * value was proven by joining these repos by hand before it was automated.
 *
 * @module lib/dev-workspace/types
 */

/** The root-level package.json fields the workspace generator reads from member repos. */
export interface MemberPackageJson {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** One package.json found under a member repo's `packages/` directory. */
export interface MemberPackageInfo {
  /** Directory name under `packages/` (e.g. `Entities`). */
  DirName: string;
  PackageJson: MemberPackageJson;
}

/** Why a sibling directory qualified as a workspace member candidate. */
export type CandidateReason = 'mj-app-json' | 'bizapps-packages' | 'mj-monorepo';

/** A sibling repo checkout that qualifies (or was explicitly included) as a workspace member. */
export interface CandidateRepo {
  /** Directory basename — this is the name used in the workspace globs. */
  Name: string;
  /** Absolute path to the repo checkout. */
  Path: string;
  /** Detection reasons; empty when the repo was force-included via `--include`. */
  Reasons: CandidateReason[];
  RootPackageJson: MemberPackageJson;
  /** Contents of every package.json found one level under the repo's `packages/` dir. */
  Packages: MemberPackageInfo[];
  /** Raw contents of the repo's root `turbo.json`, or null when absent. */
  TurboJson: string | null;
}

/** A devDependency version conflict the union resolver decided (never silently). */
export interface DevDepConflict {
  Package: string;
  Winner: { Repo: string; Version: string };
  Losers: Array<{ Repo: string; Version: string }>;
}

/** Result of building the parent `package.json`. */
export interface RootPackageJsonResult {
  Content: string;
  Conflicts: DevDepConflict[];
  /** Which member repo (or fallback) supplied the pnpm `packageManager` pin. */
  PinSource: string;
  Pin: string;
}

/** Result of picking the parent `turbo.json`. */
export interface TurboJsonResult {
  Content: string;
  /** Member repo the file was copied from, or 'generator fallback'. */
  Source: string;
}

/** One generated file, by name relative to the parent directory. */
export interface GeneratedFile {
  Name: string;
  Content: string;
}

/** Outcome of writing the generated files. */
export interface WriteResult {
  Written: string[];
  /** Files that existed and were saved to `<name>.bak` before overwrite (only with force). */
  BackedUp: string[];
}

/**
 * Contents of the `.mj-dev-workspace.json` sentinel written beside the other
 * generated files. Lowercase keys: this is a JSON wire shape, not a class.
 */
export interface WorkspaceSentinel {
  /** Fixed marker identifying the writer — what `clean` checks before deleting. */
  generatedBy: string;
  /** Every file name (relative to the parent) the generator wrote, sorted. */
  files: string[];
  /** Member repo directory names the workspace was generated for, sorted. */
  members: string[];
}

/** Outcome of reading the sentinel: ours, not there, or there but not ours. */
export type SentinelReadResult =
  | { Kind: 'valid'; Sentinel: WorkspaceSentinel }
  | { Kind: 'absent' }
  | { Kind: 'invalid'; Reason: string };

/** One path `dev workspace clean` owns at the parent directory. */
export interface CleanTarget {
  /** Path relative to the parent directory. */
  Name: string;
  Kind: 'file' | 'directory';
  Exists: boolean;
}

/** What `dev workspace clean` would remove at a parent directory. */
export interface CleanPlan {
  ParentDir: string;
  /** Every owned path, in removal order (the sentinel last). */
  Targets: CleanTarget[];
  /** `.bak` files present at the parent — never removed, always reported. */
  PreservedBackups: string[];
}

/** Outcome of executing a clean plan. */
export interface CleanResult {
  Removed: string[];
  /** Owned paths that were already absent — reported, never an error. */
  AlreadyGone: string[];
}

/**
 * Where a command's `--dir` value came from. oclif resolves flag > env > default;
 * this records which of the three won so `status` can report it.
 */
export type DirSource = 'flag' | 'env' | 'default';

/** Everything `dev workspace status` reports. */
export interface WorkspaceStatus {
  ParentDir: string;
  /** Which input supplied {@link WorkspaceStatus.ParentDir}. */
  DirSource: DirSource;
  /** Whether the parent dir itself looks like a git repo root (it must not). */
  ParentIsGitRepo: boolean;
  /** Existence of each generated file at the parent. */
  Files: Array<{ Name: string; Exists: boolean }>;
  LockfileExists: boolean;
  NodeModulesExists: boolean;
  /** Member repo names parsed from pnpm-workspace.yaml (empty when the file is absent). */
  Members: string[];
  /** Members listed in the workspace file whose directory no longer exists. */
  MissingMemberDirs: string[];
  /** Candidate repo names detected on disk right now. */
  DetectedCandidates: string[];
  /** Detected candidates that are not members of the current workspace. */
  CandidatesNotInWorkspace: string[];
  /** Whether the parent carries the generator's sentinel manifest, and if not, why. */
  Sentinel: SentinelReadResult;
  /** The pnpm version pinned in the parent package.json (`pnpm@X.Y.Z`), or null. */
  PinnedPnpm: string | null;
  /** Output of `pnpm --version` at the parent, or null when pnpm was not runnable. */
  ActivePnpmVersion: string | null;
}
