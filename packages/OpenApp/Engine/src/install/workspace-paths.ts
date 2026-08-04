/**
 * Shared workspace-layout detection for Open App installs.
 *
 * MJ ships two layouts and its two installers disagree on which one you get (#3270): a
 * monorepo checkout puts the apps under `packages/` (packages/MJAPI, packages/MJExplorer),
 * while `mj install` — the distribution installer — scaffolds them under `apps/`. Hardcoding
 * the `packages/` default made `mj app install` fail on a host created by `mj install`, and it
 * failed at the `[Packages]` step, i.e. AFTER schema creation and migrations had already
 * committed, leaving the app recorded with `Status='Error'`.
 *
 * Probing both keeps a plain `mj app install` working on either layout with no configuration,
 * while an explicit `openApps.serverPackagePath` / `clientPackagePath` still wins for hosts
 * that put their workspaces somewhere else entirely.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Candidate server (MJAPI) workspace locations, most conventional first. */
export const SERVER_PATH_CANDIDATES = ['packages/MJAPI', 'apps/MJAPI'] as const;

/** Candidate client (MJExplorer) workspace locations, most conventional first. */
export const CLIENT_PATH_CANDIDATES = ['packages/MJExplorer', 'apps/MJExplorer'] as const;

/** Conventional server workspace path, used when nothing is configured and nothing is found. */
export const DEFAULT_SERVER_PATH = SERVER_PATH_CANDIDATES[0];

/** Conventional client workspace path, used when nothing is configured and nothing is found. */
export const DEFAULT_CLIENT_PATH = CLIENT_PATH_CANDIDATES[0];

/**
 * Picks the first candidate workspace that actually contains a package.json.
 *
 * Falls back to `fallback` when none match, so a downstream "could not read package.json"
 * error still names the conventional path rather than something surprising.
 */
export function DetectWorkspacePath(repoRoot: string, candidates: readonly string[], fallback: string): string {
    for (const candidate of candidates) {
        if (existsSync(resolve(repoRoot, candidate, 'package.json'))) return candidate;
    }
    return fallback;
}

/** Resolves the effective server workspace path: explicit config wins, else detect, else default. */
export function ResolveServerPackagePath(repoRoot: string, configured?: string): string {
    return configured ?? DetectWorkspacePath(repoRoot, SERVER_PATH_CANDIDATES, DEFAULT_SERVER_PATH);
}

/** Resolves the effective client workspace path: explicit config wins, else detect, else default. */
export function ResolveClientPackagePath(repoRoot: string, configured?: string): string {
    return configured ?? DetectWorkspacePath(repoRoot, CLIENT_PATH_CANDIDATES, DEFAULT_CLIENT_PATH);
}
