/**
 * FindDuplicateMemberJunctionPackages — reads a real pnpm-lock.yaml from disk.
 *
 * The fixture is the shape `mj app install` produced when More Cheese's BizApps dependencies
 * (`~6.1.5` and `^6.1.0-edge.5` ranges) were installed into a 6.2.0-edge.3 distribution with no
 * `@memberjunction/*` overrides: a parallel 6.1.5 tree beside the host's packages.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FindDuplicateMemberJunctionPackages } from '../install/package-manager.js';

const LOCKFILE_V9 = [
    "lockfileVersion: '9.0'",
    '',
    'overrides:',
    "  '@angular/core': 21.2.22",
    '',
    'importers:',
    '',
    '  apps/MJAPI:',
    '    dependencies:',
    "      '@memberjunction/core':",
    '        specifier: 6.2.0-edge.3',
    '        version: 6.2.0-edge.3',
    '',
    'packages:',
    '',
    "  '@memberjunction/core@6.1.5':",
    '    resolution: {integrity: sha512-a}',
    '',
    "  '@memberjunction/core@6.2.0-edge.3':",
    '    resolution: {integrity: sha512-b}',
    '',
    "  '@memberjunction/global@6.1.5':",
    '    resolution: {integrity: sha512-c}',
    '',
    "  '@memberjunction/global@6.2.0-edge.3':",
    '    resolution: {integrity: sha512-d}',
    '',
    "  '@memberjunction/ng-gantt@6.1.5':",
    '    resolution: {integrity: sha512-e}',
    '',
    "  '@memberjunction/skyway-core@0.6.2':",
    '    resolution: {integrity: sha512-f}',
    '',
    "  '@angular/core@21.2.22':",
    '    resolution: {integrity: sha512-g}',
    '',
    "  '@angular/core@21.2.30':",
    '    resolution: {integrity: sha512-h}',
    '',
    'snapshots:',
    '',
    "  '@memberjunction/ng-gantt@6.1.5(@angular/core@21.2.22)':",
    '    dependencies:',
    "      '@memberjunction/global': 6.2.0-edge.3",
    '',
    "  '@memberjunction/ng-gantt@6.2.0(@angular/core@21.2.22)':",
    '    dependencies: {}',
    '',
].join('\n');

let root: string;

function writeLockfile(content: string): void {
    writeFileSync(join(root, 'pnpm-lock.yaml'), content, 'utf-8');
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mj-dup-check-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('FindDuplicateMemberJunctionPackages', () => {
    it('reports every @memberjunction package installed at more than one version, sorted', () => {
        writeLockfile(LOCKFILE_V9);

        expect(FindDuplicateMemberJunctionPackages(root)).toEqual([
            { Name: '@memberjunction/core', Versions: ['6.1.5', '6.2.0-edge.3'] },
            { Name: '@memberjunction/global', Versions: ['6.1.5', '6.2.0-edge.3'] },
        ]);
    });

    it('ignores single-version MJ packages, other scopes, and names that appear only in snapshots or importers', () => {
        writeLockfile(LOCKFILE_V9);

        const names = FindDuplicateMemberJunctionPackages(root).map((d) => d.Name);
        expect(names).not.toContain('@memberjunction/ng-gantt'); // 6.2.0 exists only as a snapshot key
        expect(names).not.toContain('@memberjunction/skyway-core');
        expect(names).not.toContain('@angular/core');
    });

    it('reads lockfile v6 keys (leading slash, unquoted) and CRLF line endings', () => {
        writeLockfile(
            ["lockfileVersion: '6.0'", '', 'packages:', '', '  /@memberjunction/core@6.1.5:', '    resolution: {}', '', '  /@memberjunction/core@6.2.0:', '    resolution: {}', ''].join('\r\n')
        );

        expect(FindDuplicateMemberJunctionPackages(root)).toEqual([{ Name: '@memberjunction/core', Versions: ['6.1.5', '6.2.0'] }]);
    });

    it('returns nothing when every MJ package has one version, or there is no pnpm lockfile', () => {
        expect(FindDuplicateMemberJunctionPackages(root)).toEqual([]);

        writeLockfile(LOCKFILE_V9.replace(/ {2}'@memberjunction\/(core|global)@6\.1\.5':\n.*\n\n/g, ''));
        expect(FindDuplicateMemberJunctionPackages(root)).toEqual([]);
    });
});
