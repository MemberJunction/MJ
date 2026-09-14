/**
 * Where `RunPackageInstall` runs when the consumer repo is a member of an `mj dev workspace`.
 *
 * `mj app install` inside the MJ member of a dev workspace ran
 * `pnpm install` in MJ — pnpm treats a member with its own pnpm-workspace.yaml as a root — and
 * created a second, standalone store beside the parent's links (split singletons; the app's
 * packages came from the registry instead of the sibling checkout the workspace links).
 * The install must run at the parent when, and only when, the parent's sentinel claims the repo.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEV_WORKSPACE_SENTINEL, ResolveInstallRoot } from '../install/package-manager.js';

let parent: string;
let repo: string;

beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'mj-install-root-'));
    repo = join(parent, 'MJ');
    mkdirSync(repo);
    writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf-8');
});

afterEach(() => {
    rmSync(parent, { recursive: true, force: true });
});

function writeParentWorkspace(members: string[], generatedBy = 'mj dev workspace'): void {
    writeFileSync(join(parent, 'pnpm-workspace.yaml'), "packages:\n  - 'MJ'\n", 'utf-8');
    writeFileSync(join(parent, DEV_WORKSPACE_SENTINEL), JSON.stringify({ generatedBy, files: [], members }), 'utf-8');
}

describe('ResolveInstallRoot', () => {
    it('installs in the repo itself with its own package manager when the parent is a plain directory', () => {
        expect(ResolveInstallRoot(repo)).toEqual({ Root: repo, PackageManager: 'pnpm' });
        expect(ResolveInstallRoot(repo, 'npm')).toEqual({ Root: repo, PackageManager: 'npm' });
    });

    it('installs at the dev workspace parent, with pnpm, when its sentinel names this repo as a member', () => {
        writeParentWorkspace(['MJ', 'SaaS']);
        expect(ResolveInstallRoot(repo, 'npm')).toEqual({ Root: parent, PackageManager: 'pnpm', DevWorkspaceParent: parent });
    });

    it('ignores a sentinel that does not name this repo', () => {
        writeParentWorkspace(['SaaS']);
        expect(ResolveInstallRoot(repo)).toEqual({ Root: repo, PackageManager: 'pnpm' });
    });

    it('ignores a sentinel another tool wrote, a sentinel without the workspace yaml, and an unreadable one', () => {
        writeParentWorkspace(['MJ'], 'something else');
        expect(ResolveInstallRoot(repo).Root).toBe(repo);

        writeParentWorkspace(['MJ']);
        rmSync(join(parent, 'pnpm-workspace.yaml'));
        expect(ResolveInstallRoot(repo).Root).toBe(repo);

        writeFileSync(join(parent, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf-8');
        writeFileSync(join(parent, DEV_WORKSPACE_SENTINEL), '{ not json', 'utf-8');
        expect(ResolveInstallRoot(repo).Root).toBe(repo);
    });
});
