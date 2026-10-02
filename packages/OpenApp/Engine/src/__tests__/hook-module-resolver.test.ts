/**
 * Hook module resolution under real directory layouts (no fs mocks — the point is how
 * Node resolves through pnpm's symlinked store).
 *
 * `mj app install` of the Skip client on a pnpm MJ repo failed
 * at the postInstall hook — `@askskip/core/setup` could not be resolved from the repo
 * root. Under pnpm the app's server package is installed beneath `packages/MJAPI`, and
 * `@askskip/core` (a dependency OF `@askskip/server`) is visible only from inside that
 * package's real store directory. Resolution must start there.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuildHookResolutionBases, ResolveHookModule } from '../install/hook-module-resolver.js';

let repo: string;

function writeJson(path: string, value: unknown): void {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value), 'utf-8');
}

/**
 * Lays out a pnpm-shaped consumer repo:
 *   <repo>/package.json
 *   <repo>/packages/MJAPI/package.json                       (declares @scope/server)
 *   <repo>/packages/MJAPI/node_modules/@scope/server  -> symlink -> store/@scope+server/node_modules/@scope/server
 *   <repo>/node_modules/.pnpm/@scope+server/node_modules/@scope/core/{package.json,dist/setup.js}  (sibling in the store)
 * `@scope/core` is NOT reachable from the repo root or from MJAPI — only from the server package's real path.
 */
function layOutPnpmRepo(root: string): void {
    writeJson(join(root, 'package.json'), { name: 'consumer', private: true });
    writeJson(join(root, 'packages', 'MJAPI', 'package.json'), { name: 'mj_api', dependencies: { '@scope/server': '^1.0.0' } });
    const storeDir = join(root, 'node_modules', '.pnpm', '@scope+server@1.0.0', 'node_modules');
    writeJson(join(storeDir, '@scope', 'server', 'package.json'), { name: '@scope/server', version: '1.0.0', dependencies: { '@scope/core': '1.0.0' } });
    writeJson(join(storeDir, '@scope', 'core', 'package.json'), {
        name: '@scope/core',
        version: '1.0.0',
        exports: { './setup': './dist/setup.js' },
    });
    mkdirSync(join(storeDir, '@scope', 'core', 'dist'), { recursive: true });
    writeFileSync(join(storeDir, '@scope', 'core', 'dist', 'setup.js'), 'module.exports = async () => {};', 'utf-8');
    mkdirSync(join(root, 'packages', 'MJAPI', 'node_modules', '@scope'), { recursive: true });
    symlinkSync(join(storeDir, '@scope', 'server'), join(root, 'packages', 'MJAPI', 'node_modules', '@scope', 'server'), 'dir');
}

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-hook-resolver-'));
});

afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('BuildHookResolutionBases', () => {
    it('lists each installed app package first, then the server and client workspaces, then the repo root — existing files only', () => {
        layOutPnpmRepo(repo);
        const bases = BuildHookResolutionBases({
            RepoRoot: repo,
            ServerPackageNames: ['@scope/server', '@scope/not-installed'],
            ClientPackageNames: ['@scope/ng-client'], // no client workspace exists in this layout
        });
        expect(bases).toEqual([
            join(repo, 'packages', 'MJAPI', 'node_modules', '@scope', 'server', 'package.json'),
            join(repo, 'packages', 'MJAPI', 'package.json'),
            join(repo, 'package.json'),
        ]);
    });

    it('honours explicit server / client workspace paths and never repeats a base', () => {
        writeJson(join(repo, 'package.json'), { name: 'consumer' });
        writeJson(join(repo, 'apps', 'API', 'package.json'), { name: 'api' });
        const bases = BuildHookResolutionBases({
            RepoRoot: repo,
            ServerPackagePath: 'apps/API',
            ClientPackagePath: 'apps/API', // same dir on purpose
            ServerPackageNames: [],
            ClientPackageNames: [],
        });
        expect(bases).toEqual([join(repo, 'apps', 'API', 'package.json'), join(repo, 'package.json')]);
    });
});

describe('ResolveHookModule', () => {
    it("resolves a dependency of the installed app package through the package's REAL path (pnpm store)", () => {
        layOutPnpmRepo(repo);
        const bases = BuildHookResolutionBases({ RepoRoot: repo, ServerPackageNames: ['@scope/server'], ClientPackageNames: [] });
        const result = ResolveHookModule('@scope/core/setup', bases);
        expect('Resolved' in result).toBe(true);
        if ('Resolved' in result) {
            expect(result.Resolved.endsWith(join('@scope', 'core', 'dist', 'setup.js'))).toBe(true);
        }
    });

    it('cannot resolve that same module from the repo root alone — the pre-fix behaviour', () => {
        layOutPnpmRepo(repo);
        const result = ResolveHookModule('@scope/core/setup', [join(repo, 'package.json')]);
        expect('Error' in result).toBe(true);
    });

    it('names every base it tried when nothing resolves, most specific first', () => {
        layOutPnpmRepo(repo);
        const bases = BuildHookResolutionBases({ RepoRoot: repo, ServerPackageNames: ['@scope/server'], ClientPackageNames: [] });
        const result = ResolveHookModule('@scope/core/does-not-exist', bases);
        expect('Error' in result).toBe(true);
        if ('Error' in result) {
            expect(result.Error).toContain("Hook module '@scope/core/does-not-exist' could not be resolved from any of:");
            expect(result.Error).toContain(join('@scope+server@1.0.0', 'node_modules', '@scope', 'server')); // the real path, not the symlink
            expect(result.Error).toContain(join(repo, 'packages', 'MJAPI'));
            expect(result.Error.endsWith(`${repo}. Ensure it is exported by one of the app's installed packages (or by a dependency of one).`)).toBe(true);
        }
    });

    it('reports an empty base list plainly', () => {
        const result = ResolveHookModule('@scope/core/setup', []);
        expect(result).toEqual({
            Error:
                "Hook module '@scope/core/setup' could not be resolved from any location (no package.json exists at the app packages, " +
                "the server/client workspaces, or the repo root). Ensure it is exported by one of the app's installed packages (or by a dependency of one).",
        });
    });
});
