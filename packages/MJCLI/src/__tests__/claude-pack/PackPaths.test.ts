import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    targetPathsFor,
    parseSemverMajor,
    detectMJMajor,
    detectMJVersionString,
    resolveLocalPackRoot,
    buildRemoteUrlPrefix,
} from '../../lib/claude-pack/PackPaths.js';

describe('PackPaths', () => {
    describe('targetPathsFor', () => {
        it('builds every standard path under the target dir', () => {
            const paths = targetPathsFor('/some/project');
            // Use path.resolve to make assertions OS-agnostic
            const root = path.resolve('/some/project');
            expect(paths.Root).toBe(root);
            expect(paths.ClaudeMd).toBe(path.join(root, 'CLAUDE.md'));
            expect(paths.PackageJson).toBe(path.join(root, 'package.json'));
            expect(paths.ClaudeDir).toBe(path.join(root, '.claude'));
            expect(paths.SettingsJson).toBe(path.join(root, '.claude', 'settings.json'));
            expect(paths.MjDir).toBe(path.join(root, '.claude', 'mj'));
            expect(paths.VersionFile).toBe(path.join(root, '.claude', 'mj', 'VERSION'));
            expect(paths.ManifestFile).toBe(path.join(root, '.claude', 'mj', 'MANIFEST.json'));
            expect(paths.CommandsDir).toBe(path.join(root, '.claude', 'commands'));
            expect(paths.SkillsDir).toBe(path.join(root, '.claude', 'skills'));
        });

        it('resolves relative paths to absolute', () => {
            const paths = targetPathsFor('.');
            expect(path.isAbsolute(paths.Root)).toBe(true);
        });
    });

    describe('parseSemverMajor', () => {
        it.each([
            ['5.33.0', '5'],
            ['^5.33.0', '5'],
            ['~5.33.0', '5'],
            ['>=5.33.0', '5'],
            ['>5', '5'],
            ['v5.33.0', '5'],
            ['5', '5'],
            ['10.0.0', '10'],
            ['^10.0.0-beta.1', '10'],
            ['0.1.0', '0'],
        ])('extracts %s as major=%s', (input, expected) => {
            expect(parseSemverMajor(input)).toBe(expected);
        });

        it.each([['next'], ['latest'], ['*'], [''], ['   '], ['workspace:*']])(
            'rejects non-numeric or empty: %s',
            (input) => {
                expect(parseSemverMajor(input)).toBe(null);
            }
        );
    });

    describe('detectMJMajor', () => {
        let tmp: string;
        beforeEach(() => {
            tmp = mkdtempSync(path.join(tmpdir(), 'mjcli-pack-paths-'));
        });
        afterEach(() => {
            rmSync(tmp, { recursive: true, force: true });
        });

        it('reads major from an @memberjunction/* dependency', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    dependencies: { '@memberjunction/cli': '^5.33.0' },
                })
            );
            expect(detectMJMajor(tmp)).toBe('5');
        });

        it('reads major from devDependencies if not in dependencies', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    devDependencies: { '@memberjunction/core': '~6.0.0' },
                })
            );
            expect(detectMJMajor(tmp)).toBe('6');
        });

        it('returns null when no @memberjunction/* dependency is declared', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    dependencies: { lodash: '^4.0.0' },
                })
            );
            expect(detectMJMajor(tmp)).toBe(null);
        });

        it('returns null when package.json is absent', () => {
            expect(detectMJMajor(tmp)).toBe(null);
        });

        it('returns null when package.json is malformed', () => {
            writeFileSync(path.join(tmp, 'package.json'), 'not json {');
            expect(detectMJMajor(tmp)).toBe(null);
        });

        it('returns null when MJ dep version is non-semver (e.g., workspace:*)', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    dependencies: { '@memberjunction/cli': 'workspace:*' },
                })
            );
            expect(detectMJMajor(tmp)).toBe(null);
        });

        // Distribution-style `mj install` produces a workspace layout where
        // @memberjunction/* deps live in apps/MJAPI and apps/MJExplorer, not
        // the root. Detection has to walk in one level or it returns null on
        // exactly the install dirs the pack is *designed* for.
        it('walks into apps/* when root package.json has no @memberjunction/* deps', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'memberjunction-distribution',
                    workspaces: ['apps/*', 'packages/*'],
                    // No @memberjunction/* at root — workspace shell only
                    dependencies: { turbo: '^2.0.0' },
                })
            );
            const appDir = path.join(tmp, 'apps', 'MJAPI');
            mkdirSync(appDir, { recursive: true });
            writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'mj_api',
                    dependencies: { '@memberjunction/server': '^5.37.0' },
                })
            );
            expect(detectMJMajor(tmp)).toBe('5');
        });

        it('walks into packages/* when root package.json has no @memberjunction/* deps', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'memberjunction-distribution',
                    workspaces: ['packages/*'],
                })
            );
            const pkgDir = path.join(tmp, 'packages', 'mj_generatedentities');
            mkdirSync(pkgDir, { recursive: true });
            writeFileSync(
                path.join(pkgDir, 'package.json'),
                JSON.stringify({
                    name: 'mj_generatedentities',
                    dependencies: { '@memberjunction/core-entities': '^6.0.0' },
                })
            );
            expect(detectMJMajor(tmp)).toBe('6');
        });

        it('prefers root package.json deps when both root and apps/* have @mj deps', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    dependencies: { '@memberjunction/cli': '^5.33.0' },
                })
            );
            const appDir = path.join(tmp, 'apps', 'MJAPI');
            mkdirSync(appDir, { recursive: true });
            writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'mj_api',
                    dependencies: { '@memberjunction/server': '^99.0.0' },
                })
            );
            // Root wins — the workspace walk is a *fallback*, not an override.
            expect(detectMJMajor(tmp)).toBe('5');
        });

        it('returns null when neither root nor workspace subdirs declare an @mj dep', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    workspaces: ['apps/*'],
                })
            );
            const appDir = path.join(tmp, 'apps', 'frontend');
            mkdirSync(appDir, { recursive: true });
            writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({ name: 'frontend', dependencies: { react: '^18.0.0' } })
            );
            expect(detectMJMajor(tmp)).toBe(null);
        });

        // The next few cases are defensive — making sure the workspace walk
        // doesn't crash on weird-but-real filesystem states.

        it('returns null when an @mj dep at a workspace subdir uses workspace:* (non-semver)', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({ name: 'workspace-root', workspaces: ['apps/*'] })
            );
            const appDir = path.join(tmp, 'apps', 'MJAPI');
            mkdirSync(appDir, { recursive: true });
            writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'mj_api',
                    dependencies: { '@memberjunction/server': 'workspace:*' },
                })
            );
            // workspace:* isn't a real version — rejected, no fallback elsewhere.
            expect(detectMJMajor(tmp)).toBe(null);
        });

        it('tolerates a malformed package.json in one workspace dir (continues to next)', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({ name: 'workspace-root', workspaces: ['apps/*'] })
            );
            // Use names where the BROKEN one sorts BEFORE the good one so the
            // walk hits the failure first and we genuinely exercise the
            // try/catch-then-continue path. ASCII sort: '0' < 'A'-'Z' < 'a'-'z',
            // so '0-broken' sorts before 'mj-api'.
            const badApp = path.join(tmp, 'apps', '0-broken');
            mkdirSync(badApp, { recursive: true });
            writeFileSync(path.join(badApp, 'package.json'), 'not json {');

            const goodApp = path.join(tmp, 'apps', 'mj-api');
            mkdirSync(goodApp, { recursive: true });
            writeFileSync(
                path.join(goodApp, 'package.json'),
                JSON.stringify({
                    name: 'mj_api',
                    dependencies: { '@memberjunction/server': '^5.37.0' },
                })
            );
            // Walk hits 0-broken/package.json first (JSON.parse throws → catch
            // → continue), then mj-api/package.json (good → returns '5').
            expect(detectMJMajor(tmp)).toBe('5');
        });

        it('tolerates `apps` being a file rather than a directory', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({ name: 'user', workspaces: ['apps/*'] })
            );
            // Simulate: someone shipped an `apps` text file by accident
            writeFileSync(path.join(tmp, 'apps'), 'this is a file, not a dir');
            // The walk should silently skip, returning null.
            expect(detectMJMajor(tmp)).toBe(null);
        });

        it('tolerates a workspace subdir without any package.json', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({ name: 'user', workspaces: ['apps/*'] })
            );
            const emptyApp = path.join(tmp, 'apps', 'empty');
            mkdirSync(emptyApp, { recursive: true });
            // No package.json in apps/empty/ — should silently skip, not crash.
            expect(detectMJMajor(tmp)).toBe(null);
        });

        // Regression guard: non-workspace consumer projects (the ORIGINAL happy
        // path before fix #1) must keep working identically. This test echoes
        // the very first assertion in the file but lives down here to make the
        // "didn't break the simple case" intent explicit.
        it('still works for non-workspace consumer projects (regression guard for fix #1)', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'simple-consumer',
                    // No `workspaces` field at all — typical consumer
                    dependencies: {
                        '@memberjunction/core-entities': '^5.20.0',
                        react: '^18.0.0',
                    },
                })
            );
            // No apps/ or packages/ subdirs at all.
            expect(detectMJMajor(tmp)).toBe('5');
        });
    });

    describe('detectMJVersionString', () => {
        let tmp: string;
        beforeEach(() => {
            tmp = mkdtempSync(path.join(tmpdir(), 'mjcli-pack-ver-'));
        });
        afterEach(() => {
            rmSync(tmp, { recursive: true, force: true });
        });

        it('returns the full semver from root deps', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'user-project',
                    dependencies: { '@memberjunction/cli': '^5.33.0' },
                })
            );
            expect(detectMJVersionString(tmp)).toBe('5.33.0');
        });

        it('walks into apps/* for workspace-style installs (same fallback as detectMJMajor)', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({
                    name: 'memberjunction-distribution',
                    workspaces: ['apps/*'],
                })
            );
            const appDir = path.join(tmp, 'apps', 'MJAPI');
            mkdirSync(appDir, { recursive: true });
            writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'mj_api',
                    dependencies: { '@memberjunction/server': '^5.37.0' },
                })
            );
            expect(detectMJVersionString(tmp)).toBe('5.37.0');
        });

        it('returns null when no MJ dep is reachable', () => {
            writeFileSync(
                path.join(tmp, 'package.json'),
                JSON.stringify({ name: 'user-project', dependencies: {} })
            );
            expect(detectMJVersionString(tmp)).toBe(null);
        });
    });

    describe('resolveLocalPackRoot', () => {
        let tmp: string;
        beforeEach(() => {
            tmp = mkdtempSync(path.join(tmpdir(), 'mjcli-pack-resolve-'));
        });
        afterEach(() => {
            rmSync(tmp, { recursive: true, force: true });
        });

        it('finds the pack inside templates/claude-pack/dist/v{N}/ (repo-root shape)', () => {
            const distDir = path.join(tmp, 'templates', 'claude-pack', 'dist', 'v5');
            mkdirSync(distDir, { recursive: true });
            writeFileSync(path.join(distDir, 'CLAUDE.md'), '# pack');
            expect(resolveLocalPackRoot(tmp, '5')).toBe(distDir);
        });

        it('accepts an already-unpacked dist directory directly', () => {
            mkdirSync(path.join(tmp, '.claude', 'mj'), { recursive: true });
            writeFileSync(path.join(tmp, 'CLAUDE.md'), '# pack');
            writeFileSync(path.join(tmp, '.claude', 'mj', 'VERSION'), '5.1.0\n');
            expect(resolveLocalPackRoot(tmp, '5')).toBe(path.resolve(tmp));
        });

        it('returns null when neither shape matches', () => {
            // empty dir
            expect(resolveLocalPackRoot(tmp, '5')).toBe(null);
        });

        it('returns null when only CLAUDE.md is present (missing VERSION)', () => {
            writeFileSync(path.join(tmp, 'CLAUDE.md'), '# pack');
            expect(resolveLocalPackRoot(tmp, '5')).toBe(null);
        });

        it('returns the correct major when multiple v{N} dirs exist', () => {
            const v5 = path.join(tmp, 'templates', 'claude-pack', 'dist', 'v5');
            const v6 = path.join(tmp, 'templates', 'claude-pack', 'dist', 'v6');
            mkdirSync(v5, { recursive: true });
            mkdirSync(v6, { recursive: true });
            writeFileSync(path.join(v5, 'CLAUDE.md'), '# v5');
            writeFileSync(path.join(v6, 'CLAUDE.md'), '# v6');
            expect(resolveLocalPackRoot(tmp, '5')).toBe(v5);
            expect(resolveLocalPackRoot(tmp, '6')).toBe(v6);
        });
    });

    describe('buildRemoteUrlPrefix', () => {
        it('defaults to main branch', () => {
            expect(buildRemoteUrlPrefix('5')).toBe(
                'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/'
            );
        });

        it('accepts a specific tag', () => {
            expect(buildRemoteUrlPrefix('5', 'v5.33.0')).toBe(
                'https://raw.githubusercontent.com/MemberJunction/MJ/v5.33.0/templates/claude-pack/dist/v5/'
            );
        });

        it('accepts a branch name', () => {
            expect(buildRemoteUrlPrefix('6', 'develop')).toBe(
                'https://raw.githubusercontent.com/MemberJunction/MJ/develop/templates/claude-pack/dist/v6/'
            );
        });

        it('handles any major value', () => {
            expect(buildRemoteUrlPrefix('10')).toContain('/dist/v10/');
        });
    });
});
