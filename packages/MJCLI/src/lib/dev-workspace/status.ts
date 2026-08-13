/**
 * Workspace state reporting for `mj dev workspace status`.
 *
 * SIDE EFFECTS: read-only filesystem access (existence checks + file reads) via
 * {@link CollectWorkspaceStatus}. The pnpm version probe is NOT run here — the
 * command spawns it (see `pnpm.ts`) and passes the result in, so this module's
 * process interaction stays zero. `ParseWorkspaceMembers` and `RenderStatus`
 * are pure.
 *
 * @module lib/dev-workspace/status
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { SENTINEL_MARKER } from './build.js';
import { ReadSentinel } from './clean.js';
import { DetectCandidates } from './detect.js';
import { DescribeDirSource } from './dir-flag.js';
import { SENTINEL_FILE_NAME, WORKSPACE_FILE_NAMES } from './write.js';
import type { DirSource, MemberPackageJson, SentinelReadResult, WorkspaceStatus } from './types.js';

/** Longest workspace file we will parse for members (guards against reading a rogue blob). */
const MAX_WORKSPACE_YAML_BYTES = 1_000_000;

/**
 * Parses member repo names out of a generated pnpm-workspace.yaml: entries under
 * `packages:` that contain no `/` are member repo roots (each member also has a
 * `<name>/packages` glob line, which is skipped). Pure.
 */
export function ParseWorkspaceMembers(yamlText: string): string[] {
  const members: string[] = [];
  let inPackages = false;
  for (const rawLine of yamlText.split('\n')) {
    const line = rawLine.trimEnd();
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line) && line.length > 0) inPackages = false; // next top-level key
    if (!inPackages) continue;
    const match = /^\s+-\s+'?([^'#]+?)'?\s*$/.exec(line);
    if (match && !match[1].includes('/')) members.push(match[1]);
  }
  return members;
}

/** Reads the parent package.json's packageManager pnpm pin, or null. */
function readPinnedPnpm(parentDir: string): string | null {
  const manifestPath = path.join(parentDir, 'package.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as MemberPackageJson;
    const pin = manifest.packageManager;
    return pin?.startsWith('pnpm@') ? pin : null;
  } catch {
    return null; // unparseable manifest is reported via the file listing, not a crash
  }
}

/** Reads workspace members from pnpm-workspace.yaml at the parent, or [] when absent. */
function readMembers(parentDir: string): string[] {
  const yamlPath = path.join(parentDir, 'pnpm-workspace.yaml');
  if (!existsSync(yamlPath)) return [];
  const raw = readFileSync(yamlPath, 'utf8');
  if (raw.length > MAX_WORKSPACE_YAML_BYTES) {
    throw new Error(`${yamlPath} is over ${MAX_WORKSPACE_YAML_BYTES} bytes — not a generated workspace file`);
  }
  return ParseWorkspaceMembers(raw);
}

/**
 * Collects the full workspace status at a parent directory. `activePnpmVersion`
 * comes from the caller (a spawn — see `pnpm.ts`) so this stays spawn-free, and
 * `dirSource` likewise, so this module never reads argv or the environment.
 */
export function CollectWorkspaceStatus(
  parentDir: string,
  activePnpmVersion: string | null,
  dirSource: DirSource
): WorkspaceStatus {
  if (!path.isAbsolute(parentDir)) {
    throw new Error(`CollectWorkspaceStatus requires an absolute path, got: ${parentDir}`);
  }
  const members = readMembers(parentDir);
  const detected = DetectCandidates(parentDir).map((c) => c.Name);
  const memberSet = new Set(members);
  return {
    ParentDir: parentDir,
    DirSource: dirSource,
    ParentIsGitRepo: existsSync(path.join(parentDir, '.git')),
    Files: WORKSPACE_FILE_NAMES.map((name) => ({ Name: name, Exists: existsSync(path.join(parentDir, name)) })),
    LockfileExists: existsSync(path.join(parentDir, 'pnpm-lock.yaml')),
    NodeModulesExists: existsSync(path.join(parentDir, 'node_modules')),
    Members: members,
    MissingMemberDirs: members.filter((m) => !existsSync(path.join(parentDir, m))),
    DetectedCandidates: detected,
    CandidatesNotInWorkspace: detected.filter((c) => !memberSet.has(c)),
    Sentinel: ReadSentinel(parentDir),
    PinnedPnpm: readPinnedPnpm(parentDir),
    ActivePnpmVersion: activePnpmVersion,
  };
}

/** One [x]/[ ] line. */
function checkLine(exists: boolean, label: string): string {
  return exists ? `${chalk.green('[x]')} ${label}` : `${chalk.red('[ ]')} ${label}`;
}

/** Renders the pnpm pin-vs-active comparison line. Pure. */
function renderPnpmLine(status: WorkspaceStatus): string {
  const pinned = status.PinnedPnpm ? status.PinnedPnpm.slice('pnpm@'.length) : null;
  if (pinned === null) return chalk.dim('pnpm pin: none (no generated package.json)');
  if (status.ActivePnpmVersion === null) return chalk.yellow(`pnpm pin: ${pinned} — pnpm not runnable at the parent`);
  if (status.ActivePnpmVersion === pinned) return chalk.green(`pnpm: pinned ${pinned}, active ${status.ActivePnpmVersion} — match`);
  return chalk.yellow(`pnpm: pinned ${pinned}, active ${status.ActivePnpmVersion} — MISMATCH`);
}

/**
 * Renders the sentinel line — whether this workspace can be proven to be the
 * generator's own output, which is exactly what `clean` requires. Pure.
 */
function renderSentinelLine(sentinel: SentinelReadResult): string {
  if (sentinel.Kind === 'valid') {
    const members = sentinel.Sentinel.members.join(', ') || '(none recorded)';
    return chalk.green(`sentinel: ${SENTINEL_FILE_NAME} — generated by ${SENTINEL_MARKER} (members: ${members})`);
  }
  if (sentinel.Kind === 'invalid') {
    return chalk.yellow(`sentinel: ${SENTINEL_FILE_NAME} present but not ours (${sentinel.Reason}) — clean needs --force`);
  }
  return chalk.dim('sentinel: none — hand-made or pre-sentinel workspace; clean needs --force');
}

/** Renders the member-vs-candidates section lines. Pure. */
function renderMemberLines(status: WorkspaceStatus): string[] {
  const lines: string[] = [];
  if (status.Members.length === 0) {
    lines.push(chalk.dim('members: none (no pnpm-workspace.yaml)'));
  } else {
    lines.push(`members (${status.Members.length}): ${status.Members.join(', ')}`);
  }
  for (const missing of status.MissingMemberDirs) {
    lines.push(chalk.red(`  missing on disk: ${missing}`));
  }
  lines.push(`detected candidates (${status.DetectedCandidates.length}): ${status.DetectedCandidates.join(', ') || '(none)'}`);
  if (status.CandidatesNotInWorkspace.length > 0) {
    lines.push(chalk.yellow(`  not in workspace: ${status.CandidatesNotInWorkspace.join(', ')}`));
  }
  return lines;
}

/** Renders a WorkspaceStatus as the terminal report. Pure. */
export function RenderStatus(status: WorkspaceStatus): string {
  const lines: string[] = [
    chalk.bold(`Workspace parent: ${status.ParentDir}`),
    chalk.dim(`  resolved from: ${DescribeDirSource(status.DirSource)}`),
  ];
  if (status.ParentIsGitRepo) {
    lines.push(chalk.red('WARNING: this directory is a git repo root — a workspace parent must be a plain directory of sibling clones.'));
  }
  lines.push('');
  for (const file of status.Files) {
    lines.push(checkLine(file.Exists, file.Name));
  }
  lines.push(checkLine(status.LockfileExists, 'pnpm-lock.yaml (generated by install)'));
  lines.push(checkLine(status.NodeModulesExists, 'node_modules (installed)'));
  lines.push('');
  lines.push(renderSentinelLine(status.Sentinel));
  lines.push('');
  lines.push(...renderMemberLines(status));
  lines.push('');
  lines.push(renderPnpmLine(status));
  return lines.join('\n');
}
