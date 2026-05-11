/**
 * Shared types for the Claude Code pack install / update flow.
 *
 * The build pipeline in `templates/claude-pack/build-pack.mjs` (Milestone 1)
 * emits a `MANIFEST.json` that this package consumes — its shape is the
 * authoritative contract between the two.
 *
 * @see plans/claude-install-pack.md §5.2 (manifest format), §6.4 (merge rules),
 *      §7.4 (flags), §7.5 (JSON output)
 */

// ---------------------------------------------------------------------------
// Manifest — must match the JSON written by build-pack.mjs
// ---------------------------------------------------------------------------

/** One file entry inside a pack's `MANIFEST.json`. */
export interface ManifestEntry {
  /** Pack-relative POSIX path, e.g. `.claude/mj/core.md`. */
  path: string;
  /** Byte length of the file as shipped. */
  bytes: number;
  /** Hex sha256 digest of the file bytes. */
  sha256: string;
}

/** Top-level shape of `.claude/mj/MANIFEST.json`. */
export interface Manifest {
  /** Pack semver, e.g. `5.1.0`. */
  packVersion: string;
  /** MJ major version, e.g. `5`. */
  mjMajor: string;
  /**
   * Public URL prefix used as the base for over-the-wire fetches.
   * Example: `https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/`
   */
  remoteUrlPrefix: string;
  files: ManifestEntry[];
}

// ---------------------------------------------------------------------------
// Per-file merge outcomes
// ---------------------------------------------------------------------------

/**
 * Outcome bucket for a single file/path during install or update.
 *
 * Mirrors the `actions` keys in the JSON output (§7.5).
 */
export type FileOutcome = 'added' | 'updated' | 'skipped' | 'error';

/**
 * Per-file result emitted by the merger. The `reason` is a human-readable
 * explanation surfaced in `--verbose` output and warnings.
 */
export interface FileMergeResult {
  path: string;
  outcome: FileOutcome;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Aggregate result — what `mj install:claude` and `mj update:claude` return
// ---------------------------------------------------------------------------

/**
 * Bucketed view of every file the operation touched. Drives both the
 * human-readable summary and the `--json` output (§7.5).
 */
export interface ActionLog {
  added: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Full result object — the shape returned to callers and serialized for
 * `--json`. Matches the schema in §7.5 of the plan.
 */
export interface InstallResult {
  ok: boolean;
  packVersion: string;
  /** MJ semver detected in the target dir (e.g. `5.33.0`), or `null` if undetectable. */
  installedMJVersion: string | null;
  actions: ActionLog;
  warnings: string[];
}

/** Empty action log helper — exported to avoid `{} as ActionLog` casts. */
export function emptyActionLog(): ActionLog {
  return { added: [], updated: [], skipped: [], errors: [] };
}

/**
 * Maps the per-file outcome to its bucket in `ActionLog`. The singular form
 * (`'error'`) maps to the plural bucket name (`errors`) — kept this way
 * because the JSON contract in §7.5 specifies `errors` (a list) while the
 * outcome enum reads more naturally in singular form per record.
 */
const OUTCOME_TO_BUCKET: Record<FileOutcome, keyof ActionLog> = {
  added: 'added',
  updated: 'updated',
  skipped: 'skipped',
  error: 'errors',
};

/** Apply a single file's outcome to the rolling action log. */
export function recordOutcome(log: ActionLog, result: FileMergeResult): void {
  const bucket = OUTCOME_TO_BUCKET[result.outcome];
  log[bucket].push(result.reason ? `${result.path} (${result.reason})` : result.path);
}

// ---------------------------------------------------------------------------
// Pack source — abstracts "where do we pull bytes from"
// ---------------------------------------------------------------------------

/**
 * A pack can be sourced from the network (raw.githubusercontent.com),
 * from a local path on disk (for `--from <path>` or `--offline`), or from
 * an already-installed copy (the user's existing `.claude/mj/`).
 */
export type PackSource =
  | { kind: 'remote'; baseUrl: string; ref: string }
  | { kind: 'local'; rootDir: string };

// ---------------------------------------------------------------------------
// Managed settings.json metadata
// ---------------------------------------------------------------------------

/**
 * The `__mj_managed` block embedded inside a user's `.claude/settings.json`.
 * `keys` lists the dotted paths the MJ pack owns; the merger uses this to
 * know what it's allowed to rewrite vs what belongs to the user.
 *
 * @see plans/claude-install-pack.md §10.2
 */
export interface ManagedSettingsMeta {
  /** Pack semver that last wrote this block. */
  version: string;
  /** MJ major the pack was built for. */
  mjMajor?: string;
  /** Dotted paths in `settings.json` that MJ manages. */
  keys: string[];
}

// ---------------------------------------------------------------------------
// Managed-block markers in CLAUDE.md
// ---------------------------------------------------------------------------

/**
 * Parsed shape of the `<!-- MJ-MANAGED:CLAUDE-PACK START … -->`…`<!-- MJ-MANAGED:CLAUDE-PACK END -->`
 * block in a user's root `CLAUDE.md`. `before` and `after` together with the
 * rewritten block reconstitute the full file.
 */
export interface ManagedBlock {
  before: string;
  /** The contents between START and END markers (exclusive of marker lines). */
  body: string;
  after: string;
  /** Attributes parsed off the START marker, e.g. `version=5.1.0` and `mj-major=5`. */
  attrs: Record<string, string>;
}
