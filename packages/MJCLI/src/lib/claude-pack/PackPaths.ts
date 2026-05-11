/**
 * Path helpers for the Claude Code pack install / update flow.
 *
 * Pure path math + a small `package.json`-reading helper for detecting the
 * MJ major version a user's project is on. No network, no FS mutation.
 *
 * @see plans/claude-install-pack.md §3.2 (target layout), §6.4 (paths per rule)
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Target paths in the user's project directory
// ---------------------------------------------------------------------------

/**
 * Every file/directory in a user's project that the pack writes to or
 * reads from. Built from a single `targetDir` so callers don't have to
 * `path.join` repeatedly.
 */
export interface TargetPaths {
  /** The root directory we're installing into. */
  Root: string;
  /** `<Root>/CLAUDE.md` — root instructions file. */
  ClaudeMd: string;
  /** `<Root>/package.json` — used for MJ major detection. */
  PackageJson: string;
  /** `<Root>/.claude/` — the Claude Code config root. */
  ClaudeDir: string;
  /** `<Root>/.claude/settings.json` — settings file we merge into. */
  SettingsJson: string;
  /** `<Root>/.claude/mj/` — the fully-managed bundle directory. */
  MjDir: string;
  /** `<Root>/.claude/mj/VERSION` — pack version stamp. */
  VersionFile: string;
  /** `<Root>/.claude/mj/MANIFEST.json` — checksums of the installed pack. */
  ManifestFile: string;
  /** `<Root>/.claude/commands/` — curated commands directory. */
  CommandsDir: string;
  /** `<Root>/.claude/skills/` — curated skills directory. */
  SkillsDir: string;
}

/** Compute every target path for a given install directory. */
export function targetPathsFor(targetDir: string): TargetPaths {
  const root = path.resolve(targetDir);
  const claudeDir = path.join(root, '.claude');
  const mjDir = path.join(claudeDir, 'mj');
  return {
    Root: root,
    ClaudeMd: path.join(root, 'CLAUDE.md'),
    PackageJson: path.join(root, 'package.json'),
    ClaudeDir: claudeDir,
    SettingsJson: path.join(claudeDir, 'settings.json'),
    MjDir: mjDir,
    VersionFile: path.join(mjDir, 'VERSION'),
    ManifestFile: path.join(mjDir, 'MANIFEST.json'),
    CommandsDir: path.join(claudeDir, 'commands'),
    SkillsDir: path.join(claudeDir, 'skills'),
  };
}

// ---------------------------------------------------------------------------
// Pack source paths (when loading from a local copy of the MJ repo)
// ---------------------------------------------------------------------------

/**
 * When `--from <path>` is used, the path may point at either:
 * - the **MJ repo root** (we look for `templates/claude-pack/dist/v{N}/` underneath), or
 * - an **already-unpacked dist directory** (we use it directly).
 *
 * Returns the resolved root of the pack contents, or null if neither shape works.
 */
export function resolveLocalPackRoot(fromPath: string, mjMajor: string): string | null {
  const abs = path.resolve(fromPath);

  // Shape A: MJ repo root — look for templates/claude-pack/dist/v{N}/
  const repoCandidate = path.join(abs, 'templates', 'claude-pack', 'dist', `v${mjMajor}`);
  if (existsSync(path.join(repoCandidate, 'CLAUDE.md'))) {
    return repoCandidate;
  }

  // Shape B: already-unpacked dist — must contain CLAUDE.md + .claude/mj/VERSION
  if (
    existsSync(path.join(abs, 'CLAUDE.md')) &&
    existsSync(path.join(abs, '.claude', 'mj', 'VERSION'))
  ) {
    return abs;
  }

  return null;
}

// ---------------------------------------------------------------------------
// MJ major version detection
// ---------------------------------------------------------------------------

/**
 * Strip the leading `^` / `~` / `>=` / etc. and extract the first numeric
 * component. Returns `null` if the string isn't a recognizable semver.
 *
 * Accepts: `5.33.0`, `^5.33.0`, `~5.33.0`, `>=5.33.0`, `5`, `v5.33.0`.
 * Rejects: empty, `next`, `latest`, `*`, anything without a leading digit
 * after the strip.
 */
export function parseSemverMajor(version: string): string | null {
  const trimmed = version.trim();
  if (!trimmed) return null;
  // Strip common range/prefix chars: ^ ~ >= <= = > < v
  const stripped = trimmed.replace(/^(\^|~|>=|<=|>|<|=|v)+/, '');
  const match = stripped.match(/^(\d+)(?:\.|$)/);
  return match ? match[1] : null;
}

/**
 * Detect the MJ major version installed in the user's project. Reads
 * `<dir>/package.json` and looks at any `@memberjunction/*` entry in
 * `dependencies` or `devDependencies`.
 *
 * Returns `null` if no MJ dependency is declared (e.g., a fresh `mj install`
 * that hasn't run `npm install` yet, or a non-MJ project).
 */
export function detectMJMajor(targetDir: string): string | null {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }

  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const [name, version] of Object.entries(allDeps)) {
    if (!name.startsWith('@memberjunction/')) continue;
    const major = parseSemverMajor(version);
    if (major) return major;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Remote URL construction
// ---------------------------------------------------------------------------

/** Default GitHub raw URL prefix for the pack's `dist/` tree. */
const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/MemberJunction/MJ';

/**
 * Build the remote URL prefix for a given MJ major and git ref.
 *
 * `ref` defaults to `main`. Callers that want pinned-to-tag behavior should
 * pass the tag explicitly (e.g. `v5.33.0`) — see plan §8.5.
 */
export function buildRemoteUrlPrefix(mjMajor: string, ref: string = 'main'): string {
  return `${DEFAULT_RAW_BASE}/${ref}/templates/claude-pack/dist/v${mjMajor}/`;
}
