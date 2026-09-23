import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { importFromHost, isResolutionFailure, resolvePackageJsonFromHost } from '../host-import';

describe('isResolutionFailure', () => {
    it('recognizes coded ESM resolution failures (ERR_MODULE_NOT_FOUND)', () => {
        expect(isResolutionFailure(Object.assign(new Error('x'), { code: 'ERR_MODULE_NOT_FOUND' }))).toBe(true);
    });

    it('recognizes coded CJS resolution failures (MODULE_NOT_FOUND)', () => {
        expect(isResolutionFailure(Object.assign(new Error('x'), { code: 'MODULE_NOT_FOUND' }))).toBe(true);
    });

    it('recognizes exports-map mismatches (ERR_PACKAGE_PATH_NOT_EXPORTED)', () => {
        expect(isResolutionFailure(Object.assign(new Error('x'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }))).toBe(true);
    });

    it("recognizes ts-node-shaped code-less resolution failures by Node's resolver message", () => {
        expect(isResolutionFailure(new Error("Cannot find package 'x' imported from /a/b.js"))).toBe(true);
        expect(isResolutionFailure(new Error("Cannot find module 'x' imported from /a/b.js"))).toBe(true);
    });

    it('does NOT match code-less errors with unrelated messages (genuine load errors)', () => {
        expect(isResolutionFailure(new Error('boom during module evaluation'))).toBe(false);
    });

    it('does NOT match errors with unrelated codes, whatever the message', () => {
        expect(isResolutionFailure(Object.assign(new Error("Cannot find package 'x'"), { code: 'ERR_INVALID_URL' }))).toBe(false);
        expect(isResolutionFailure(undefined)).toBe(false);
    });
});

describe('importFromHost', () => {
    // A fake HOST directory whose node_modules carries packages that this package
    // (dynamic-packages) cannot resolve — mirroring MJAPI holding the Open App server
    // packages that the loader must load on the host's behalf. The mj.config.cjs path inside it is the
    // anchor handed to importFromHost.
    let hostDir: string;
    let hostConfigPath: string;

    const scope = '@sb-hosttest';

    function writeHostPackage(name: string, files: Record<string, string>, pkgJsonExtra: Record<string, unknown> = {}): void {
        const dir = path.join(hostDir, 'node_modules', scope, name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `${scope}/${name}`, version: '1.0.0', type: 'module', main: 'index.js', ...pkgJsonExtra }));
        for (const [file, content] of Object.entries(files)) {
            writeFileSync(path.join(dir, file), content);
        }
    }

    beforeAll(() => {
        hostDir = mkdtempSync(path.join(tmpdir(), 'sb-host-import-'));
        hostConfigPath = path.join(hostDir, 'mj.config.cjs');
        writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'fake-host', version: '1.0.0' }));
        writeFileSync(hostConfigPath, 'module.exports = {};');

        writeHostPackage('good', { 'index.js': "export const RESOLVER_PATHS = ['/abs/generated.js']; export function load() { return 'loaded'; }" });
        writeHostPackage('throwing', { 'index.js': "throw new Error('boom-load: module evaluated and failed');" });
        writeHostPackage('broken-transitive', { 'index.js': "import 'sb-hosttest-definitely-missing-dep';" });
        writeHostPackage('importonly', { 'index.js': 'export const ok = true;' }, { exports: { '.': { import: './index.js' } } });
        writeHostPackage(
            'jsonexport',
            { 'index.js': 'export const ok = true;' },
            { exports: { '.': './index.js', './package.json': './package.json' } },
        );
    });

    afterAll(() => {
        rmSync(hostDir, { recursive: true, force: true });
    });

    it('loads a package visible only from the host anchor (the pnpm scenario)', async () => {
        const mod = await importFromHost(`${scope}/good`, hostConfigPath);
        expect(mod.RESOLVER_PATHS).toEqual(['/abs/generated.js']);
        expect((mod.load as () => string)()).toBe('loaded');
    });

    it("surfaces a resolved module's own top-level throw instead of masking it as 'cannot find'", async () => {
        await expect(importFromHost(`${scope}/throwing`, hostConfigPath)).rejects.toThrow(/boom-load/);
    });

    it("surfaces a resolved module's missing TRANSITIVE dependency, naming the transitive dep", async () => {
        await expect(importFromHost(`${scope}/broken-transitive`, hostConfigPath)).rejects.toThrow(/sb-hosttest-definitely-missing-dep/);
    });

    it('explains an exports map with no CJS-resolvable condition instead of repeating "cannot find"', async () => {
        await expect(importFromHost(`${scope}/importonly`, hostConfigPath)).rejects.toThrow(/exports map has no CJS-resolvable condition/);
    });

    it('rethrows the original bare-import failure when no anchor resolves the package', async () => {
        await expect(importFromHost(`${scope}/does-not-exist-anywhere`, hostConfigPath)).rejects.toThrow(/Cannot find (package|module)/);
    });

    it('resolvePackageJsonFromHost: uses the exports map when package.json is exposed', () => {
        const resolved = resolvePackageJsonFromHost(`${scope}/jsonexport`, hostConfigPath);
        expect(resolved).toBeTruthy();
        expect(realpathSync(resolved!)).toBe(
            realpathSync(path.join(hostDir, 'node_modules', scope, 'jsonexport', 'package.json')),
        );
    });

    it('resolvePackageJsonFromHost: walks up from main when package.json is not a subpath export', () => {
        const resolved = resolvePackageJsonFromHost(`${scope}/good`, hostConfigPath);
        expect(resolved).toBeTruthy();
        expect(realpathSync(resolved!)).toBe(
            realpathSync(path.join(hostDir, 'node_modules', scope, 'good', 'package.json')),
        );
    });

    it('resolvePackageJsonFromHost: returns null when no host anchor can see the package', () => {
        expect(resolvePackageJsonFromHost(`${scope}/does-not-exist-anywhere`, hostConfigPath)).toBeNull();
    });
});
