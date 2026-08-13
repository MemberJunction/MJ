/**
 * Shared types for the `mj dev workspace` generator.
 *
 * The generator creates the four ephemeral files that join sibling repo checkouts
 * into a single pnpm workspace at their common parent directory:
 * `pnpm-workspace.yaml`, `.npmrc`, `package.json`, `turbo.json`.
 *
 * Ground truth for the file contents is the hand-proven recipe in
 * `plans/openapp-hackathon-quickstart.md` (MJ repo, git-excluded local doc).
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

/** Everything `dev workspace status` reports. */
export interface WorkspaceStatus {
  ParentDir: string;
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
  /** The pnpm version pinned in the parent package.json (`pnpm@X.Y.Z`), or null. */
  PinnedPnpm: string | null;
  /** Output of `pnpm --version` at the parent, or null when pnpm was not runnable. */
  ActivePnpmVersion: string | null;
}
