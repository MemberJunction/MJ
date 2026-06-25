/**
 * Hardening tests for the package manager:
 *  - B40: the custom registry URL is interpolated into an execSync command, so a malformed /
 *    hostile value must be rejected before it ever reaches the shell.
 *  - B39: a malformed package.json yields a clear, path-qualified error (not an opaque
 *    "Unexpected token in JSON").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(() => []),
}));
vi.mock('node:child_process', () => ({
    execSync: vi.fn(() => ''),
}));

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { RunPackageInstall, AddAppPackages, type PackageManagerOptions } from '../install/package-manager.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
    vi.clearAllMocks();
    // No lock files → npm is the detected package manager.
    mockExistsSync.mockReturnValue(false);
});

describe('RunPackageInstall — registry URL validation (B40)', () => {
    const hostile = [
        'https://evil.com; rm -rf ~',
        'https://evil.com/$(whoami)',
        'https://evil.com/`id`',
        'https://reg.com && curl evil',
        'file:///etc/passwd',
        'not-a-url',
    ];

    for (const url of hostile) {
        it(`rejects a hostile/invalid registry URL without shelling out: ${url}`, () => {
            const result = RunPackageInstall('/fake/root', false, url);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Invalid custom registry URL');
            expect(mockExecSync).not.toHaveBeenCalled();
        });
    }

    it('allows a clean custom registry and passes it through as --registry', () => {
        const result = RunPackageInstall('/fake/root', false, 'https://registry.acme.com/');
        expect(result.Success).toBe(true);
        expect(mockExecSync).toHaveBeenCalledTimes(1);
        expect(mockExecSync.mock.calls[0][0]).toContain('--registry=https://registry.acme.com/');
    });

    it('does not pass --registry for the default npm registry', () => {
        const result = RunPackageInstall('/fake/root', false, 'https://registry.npmjs.org/');
        expect(result.Success).toBe(true);
        expect(mockExecSync).toHaveBeenCalledTimes(1);
        expect(mockExecSync.mock.calls[0][0]).not.toContain('--registry');
    });
});

describe('AddAppPackages — malformed package.json (B39)', () => {
    function opts(): PackageManagerOptions {
        return {
            RepoRoot: '/fake/root',
            ServerPackages: [{ name: '@acme/server', role: 'bootstrap', startupExport: 'LoadAcme' }],
            ClientPackages: [],
            SharedPackages: [],
            Version: '1.0.0',
            ServerPackagePath: 'apps/Server',
            ClientPackagePath: 'apps/Client',
        };
    }

    it('returns a clear, path-qualified error instead of an opaque JSON SyntaxError', () => {
        mockExistsSync.mockReturnValue(true); // package.json "exists"
        mockReadFileSync.mockReturnValue('{ this is not valid json ');

        const result = AddAppPackages(opts());

        expect(result.Success).toBe(false);
        // Pre-fix: a bare "Unexpected token..." with no file context.
        expect(result.ErrorMessage).toContain('Invalid JSON in');
        expect(result.ErrorMessage).toContain('package.json');
    });
});
