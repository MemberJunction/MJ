import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    ExtensionBrandBuilder,
    RunMjExtBuildCli,
    ValidateExtensionBrandProfile,
} from '../index.js';

const BRANDS_DIR = path.resolve(__dirname, '../../../Brands');

describe('@memberjunction/browser-extension-builder', () => {
    it('validates all 3 reference brand profiles (mj-copilot, betty, sidecar) and rejects invalid profiles', () => {
        const builder = new ExtensionBrandBuilder();

        const copilot = builder.LoadBrandProfileFromFile(
            path.join(BRANDS_DIR, 'mj-copilot/mj-extension-brand.json')
        );
        expect(copilot.BrandSlug).toBe('mj-copilot');
        expect(copilot.IncludeDebuggerPermission).toBe(true);

        const betty = builder.LoadBrandProfileFromFile(
            path.join(BRANDS_DIR, 'betty/mj-extension-brand.json')
        );
        expect(betty.BrandSlug).toBe('betty');
        expect(betty.IncludeDebuggerPermission).toBe(false);

        const sidecar = builder.LoadBrandProfileFromFile(
            path.join(BRANDS_DIR, 'sidecar/mj-extension-brand.json')
        );
        expect(sidecar.BrandSlug).toBe('sidecar');
        expect(sidecar.DefaultControlBackend).toBe('auto');

        expect(() =>
            ValidateExtensionBrandProfile({
                ...copilot,
                ThemeSeeds: { primary: 'not-a-hex-color' },
            })
        ).toThrow();
    });

    it('builds unpacked MV3 extensions and .zip archives for mj-copilot, betty, and sidecar via CLI', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ext-build-test-'));
        try {
            const cliResult = RunMjExtBuildCli([
                '--brand',
                path.join(BRANDS_DIR, 'mj-copilot/mj-extension-brand.json'),
                '--brand',
                path.join(BRANDS_DIR, 'betty/mj-extension-brand.json'),
                '--brand',
                path.join(BRANDS_DIR, 'sidecar/mj-extension-brand.json'),
                '--out',
                tmpDir,
            ]);

            expect(cliResult.ExitCode).toBe(0);
            expect(cliResult.BuiltSlugs).toEqual(['mj-copilot', 'betty', 'sidecar']);

            // Verify mj-copilot has "debugger" in optional_permissions
            const copilotManifest = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'mj-copilot/manifest.json'), 'utf8')
            ) as { optional_permissions?: string[]; permissions: string[] };
            expect(copilotManifest.optional_permissions).toContain('debugger');
            expect(copilotManifest.permissions).not.toContain('debugger');

            // Verify betty (IncludeDebuggerPermission: false) omits "debugger" completely
            const bettyManifest = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'betty/manifest.json'), 'utf8')
            ) as { optional_permissions?: string[]; permissions: string[] };
            expect(bettyManifest.optional_permissions).toBeUndefined();
            expect(bettyManifest.permissions).not.toContain('debugger');

            // Verify brand-theme.css and .zip files exist
            for (const slug of ['mj-copilot', 'betty', 'sidecar']) {
                const css = fs.readFileSync(path.join(tmpDir, slug, 'brand-theme.css'), 'utf8');
                expect(css).toContain('--mj-brand-primary');
                const zipPath = path.join(tmpDir, `${slug}-6.2.0.zip`);
                expect(fs.existsSync(zipPath)).toBe(true);
                expect(fs.statSync(zipPath).size).toBeGreaterThan(200);
            }
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
