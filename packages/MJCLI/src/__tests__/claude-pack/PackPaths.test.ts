import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    targetPathsFor,
    parseSemverMajor,
    detectMJMajor,
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
