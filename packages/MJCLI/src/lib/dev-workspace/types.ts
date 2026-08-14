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

/** One pnpm packageExtensions value: the sections pnpm merges into the target package's manifest. */
export interface PackageExtension {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

/**
 * The `pnpm` config block a member's root package.json may carry. pnpm honors
 * NONE of these at a workspace member — only the workspace root's block applies
 * (it warns per field, and in the field "the warning drowns") — so the generator
 * must hoist them into the parent manifest or the workspace silently runs
 * without the member's overrides and patches (field finding on #3795: the
 * 14-member workspace ran unpatched type-graphql and lost MJ's 26 pins).
 */
export interface MemberPnpmBlock {
  overrides?: Record<string, string>;
  /** `pkg@version` -> patch file path RELATIVE TO THE MEMBER REPO ROOT — re-rooted on hoist. */
  patchedDependencies?: Record<string, string>;
  packageExtensions?: Record<string, PackageExtension>;
  peerDependencyRules?: { allowedVersions?: Record<string, string>; ignoreMissing?: string[] };
}

/** The root-level package.json fields the workspace generator reads from member repos. */
export interface MemberPackageJson {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  pnpm?: MemberPnpmBlock;
}

/** One package.json found under a member repo's workspace globs. */
export interface MemberPackageInfo {
  /** Package directory path relative to the repo root (e.g. `packages/AI/Engine`). */
  RelPath: string;
  PackageJson: MemberPackageJson;
}

/** One dependency resolution read from a member's committed lockfile. */
export interface ResolvedLockEntry {
  Name: string;
  /** Concrete resolved version (peer-suffix stripped), e.g. `1.64.1` or `2.0.0-beta.3`. */
  Version: string;
  /**
   * For at-depth `@types/*` entries only: the package names that depend on this
   * resolution, where the lockfile makes parentage derivable (npm v3 nesting
   * paths; pnpm v9 snapshot dependencies). Undefined/empty = parentage unknown
   * (hoisted or importer-direct) — treated as legitimate. Used to exclude
   * `@types` that exist ONLY beneath registry copies of family packages: those
   * graphs cannot exist in the generated workspace, where family packages are
   * workspace-linked, so they are not pin authority.
   */
  Dependents?: string[];
}

/** A lockfile entry the pin derivation dropped — always carried to output, never silent. */
export interface LockfileSkip {
  Name: string;
  Version: string;
  Reason: string;
}

/** Everything the generator reads from one member's committed lockfile. Pure data — no network. */
export interface MemberLockfile {
  Kind: 'pnpm' | 'npm';
  /** Resolved versions of every DIRECT dependency of the member's importers. */
  Direct: ResolvedLockEntry[];
  /** Every `@types/*` resolution at ANY depth (duplicate @types are a guaranteed nominal-type break). */
  Types: ResolvedLockEntry[];
  /**
   * EVERY resolved `name@version` at ANY depth. Pin derivation reads this so a
   * name pinned for one member's direct use also pins per-major for every OTHER
   * committed major in any member's graph — a single global pin would force
   * transitive consumers cross-major (review probe: MJ's graph holds chalk
   * 2.4.2 / 4.1.2 / 5.3.0 / 5.6.2 simultaneously).
   */
  Resolutions: ResolvedLockEntry[];
  Skipped: LockfileSkip[];
}

/** A committed lockfile in a format the derivation does not read — reported loudly, never a silent zero. */
export interface UnsupportedLockfile {
  Kind: 'unsupported';
  /** The lockfile's filename (`pnpm-lock.yaml` or `package-lock.json`). */
  File: string;
  /** The detected lockfileVersion, or 'unknown'. */
  Version: string;
}

/** Why a sibling directory qualified as a workspace member candidate. */
export type CandidateReason = 'mj-app-json' | 'bizapps-packages' | 'mj-monorepo';

/**
 * Where a member's {@link CandidateRepo.WorkspaceGlobs} came from:
 * - `member-workspace-yaml` — parsed from the member's own pnpm-workspace.yaml.
 * - `no-workspace-yaml` — the member has no workspace file; the proven `packages/*` default.
 * - `workspace-yaml-without-packages-globs` — the member HAS a workspace file but it
 *   yielded no packages-rooted positive glob (unsupported shape, or a layout this
 *   generator excludes); the default was substituted and the command MUST warn —
 *   a silent fallback is the #3795 failure mode.
 */
export type WorkspaceGlobsSource = 'member-workspace-yaml' | 'no-workspace-yaml' | 'workspace-yaml-without-packages-globs';

/** A sibling repo checkout that qualifies (or was explicitly included) as a workspace member. */
export interface CandidateRepo {
  /** Directory basename — this is the name used in the workspace globs. */
  Name: string;
  /** Absolute path to the repo checkout. */
  Path: string;
  /** Detection reasons; empty when the repo was force-included via `--include`. */
  Reasons: CandidateReason[];
  RootPackageJson: MemberPackageJson;
  /** Every package the member's OWN workspace globs enumerate (nested dirs included). */
  Packages: MemberPackageInfo[];
  /** Positive globs whose shape the expander does not support — reported by the command, never silent. */
  UnsupportedGlobs: string[];
  /** The member's committed lockfile data, an unsupported-format marker, or null when the repo commits none. */
  Lockfile: MemberLockfile | UnsupportedLockfile | null;
  /** Raw contents of the repo's root `turbo.json`, or null when absent. */
  TurboJson: string | null;
  /**
   * The member's own workspace globs, relative to its repo root: the `packages:`
   * list of its `pnpm-workspace.yaml` with positives filtered to packages-rooted
   * entries and negations all kept (a `!**\/dist\/**` guard included — they only subtract),
   * or `['packages/*']` when the repo has no workspace file. Never empty. The MJ
   * monorepo declares 42 nested globs (`packages/AI/*`,
   * `packages/Angular/Explorer/*`, ...) — assuming `packages/*` for it silently
   * dropped 248 of its 307 packages from the workspace (#3795).
   */
  WorkspaceGlobs: string[];
  /** Provenance of {@link CandidateRepo.WorkspaceGlobs}; the command warns on the fallback case. */
  WorkspaceGlobsSource: WorkspaceGlobsSource;
}

/** A specifier conflict a resolver decided (never silently) — devDeps, overrides, patches, or pins. */
export interface DevDepConflict {
  Package: string;
  Winner: { Repo: string; Version: string };
  Losers: Array<{ Repo: string; Version: string }>;
}

/** A package name more than one member provides — link target becomes sort-order dependent. */
export interface DuplicateFamilyPackage {
  Package: string;
  Repos: string[];
}

/** Everything the parent-manifest assembly decided — the command reports ALL of it, never silently. */
export interface ParentManifestReport {
  /** Lockfile-derived override entries emitted (EXACT versions; per-major `name@^N` keys for multi-major names). */
  LockfilePinCount: number;
  /** Same-major lockfile disagreements the highest committed exact resolution won. */
  PinConflicts: DevDepConflict[];
  /** Per-member lockfile entries the derivation dropped, with reasons. */
  LockfileSkips: Array<{ Repo: string; Skip: LockfileSkip }>;
  /** Members whose committed lockfile is a format the derivation cannot read — they contribute NO pins. */
  UnsupportedLockfiles: Array<{ Repo: string; File: string; Version: string }>;
  /** Member `pnpm.overrides` entries hoisted into the parent. */
  HoistedOverrideCount: number;
  /** Conflicts among member pnpm blocks (overrides / patches / extensions / peer rules). */
  BlockConflicts: DevDepConflict[];
  /** Patches hoisted, with their re-rooted paths. */
  Patches: Array<{ Package: string; Path: string; Repo: string }>;
  /** `workspace:*` overrides emitted for member-provided package names. */
  FamilyOverrideCount: number;
  /** Package names provided by more than one member. */
  DuplicateFamilyPackages: DuplicateFamilyPackage[];
  /** `@types/*` devDependencies excluded from the union (duplicate @types = nominal-type break). */
  SkippedTypesDevDeps: string[];
  /** `workspace:` devDependency specifiers on packages NO member provides — dropped. */
  DroppedWorkspaceDevDeps: Array<{ Package: string; Repo: string }>;
  /** Lockfile-derived pins displaced by an explicit member override or a family workspace:* override. */
  SupersededPins: string[];
}

/** Result of building the parent `package.json`. */
export interface RootPackageJsonResult {
  Content: string;
  Conflicts: DevDepConflict[];
  /** Which member repo (or fallback) supplied the pnpm `packageManager` pin. */
  PinSource: string;
  Pin: string;
  /** Every absorption decision the assembly made. */
  Report: ParentManifestReport;
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
