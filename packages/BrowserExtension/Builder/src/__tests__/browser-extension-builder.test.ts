import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    ExtensionBrandBuilder,
    RunMjExtBuildCli,
    ValidateExtensionBrandProfile,
} from '../index.js';

const REPO_METADATA_DIR = path.resolve(__dirname, '../../../../../metadata');

/**
 * Creates a temporary downstream repository `metadata/` directory containing `MJ: Brand Kits`
 * and `MJ: Applications` (`AgentSettings.BrowserExtension`) rows for `Betty` and `Sidecar`.
 */
function createDownstreamMetadataFixture(baseDir: string): string {
    const metadataDir = path.join(baseDir, 'downstream-metadata');
    const brandKitsDir = path.join(metadataDir, 'brand-kits');
    const appSettingsDir = path.join(metadataDir, 'app-agent-settings');
    fs.mkdirSync(brandKitsDir, { recursive: true });
    fs.mkdirSync(appSettingsDir, { recursive: true });

    fs.writeFileSync(
        path.join(brandKitsDir, '.brand-kits.json'),
        JSON.stringify(
            [
                {
                    fields: {
                        Name: 'Betty Association Brand',
                        Description: 'Association & Community Intelligence Sidekick for member engagement.',
                        Style: {
                            Palette: [
                                { Name: 'Primary', Value: '#7c3aed' },
                                { Name: 'Accent', Value: '#ec4899' },
                                { Name: 'Navy', Value: '#4c1d95' },
                            ],
                            Typography: [
                                { Role: 'Headline', FontFamily: 'Plus Jakarta Sans, sans-serif' },
                                { Role: 'Body', FontFamily: 'Plus Jakarta Sans, sans-serif' },
                                { Role: 'Data', FontFamily: 'JetBrains Mono, monospace' },
                            ],
                        },
                    },
                    primaryKey: { ID: '11111111-2222-4333-8444-555555555555' },
                },
                {
                    fields: {
                        Name: 'Sidecar Learning Brand',
                        Description: 'Continuous Learning & Workflow Companion for micro-learning and playbooks.',
                        Style: {
                            Palette: [
                                { Name: 'Primary', Value: '#0ea5e9' },
                                { Name: 'Accent', Value: '#10b981' },
                                { Name: 'Navy', Value: '#0c4a6e' },
                            ],
                            Typography: [
                                { Role: 'Body', FontFamily: 'DM Sans, system-ui, sans-serif' },
                                { Role: 'Data', FontFamily: 'Fira Code, monospace' },
                            ],
                        },
                    },
                    primaryKey: { ID: '66666666-7777-4888-9999-aaaaaaaaaaaa' },
                },
            ],
            null,
            2
        ),
        'utf8'
    );

    fs.writeFileSync(
        path.join(appSettingsDir, '.downstream-apps.json'),
        JSON.stringify(
            [
                {
                    fields: {
                        Name: 'Betty',
                        AgentSettings: {
                            BrowserExtension: {
                                BrandSlug: 'betty',
                                ExtensionName: 'Betty — Association Intelligence Sidekick',
                                ShortName: 'Betty',
                                Description:
                                    'Association & Community Intelligence Sidekick for member engagement and committee workflows.',
                                Version: '6.2.0',
                                AssistantDisplayName: 'Betty',
                                SidePanelHeaderTitle: 'Betty — Association Sidekick',
                                DefaultServerUrl: 'https://api.association.org/graphql',
                                DefaultAuthProvider: 'auth0',
                                FirefoxExtensionID: 'betty@association.org',
                                SafariBundleIdentifier: 'org.association.betty.extension',
                                SupportedBrowsers: ['chrome', 'edge', 'firefox', 'safari'],
                                DefaultControlBackend: 'content-script',
                                AllowDebuggerCDP: false,
                                BrandKitID: '@lookup:MJ: Brand Kits.Name=Betty Association Brand',
                            },
                        },
                    },
                    primaryKey: { ID: '@lookup:MJ: Applications.Name=Betty' },
                },
                {
                    fields: {
                        Name: 'Sidecar',
                        AgentSettings: {
                            BrowserExtension: {
                                BrandSlug: 'sidecar',
                                ExtensionName: 'Sidecar — Continuous Learning Companion',
                                ShortName: 'Sidecar',
                                Description:
                                    'Continuous Learning & Workflow Companion delivering contextual micro-learning and playbooks.',
                                Version: '6.2.0',
                                AssistantDisplayName: 'Sidecar',
                                SidePanelHeaderTitle: 'Sidecar — Learning Companion',
                                DefaultServerUrl: 'https://api.sidecarlearning.com/graphql',
                                DefaultAuthProvider: 'okta',
                                FirefoxExtensionID: 'sidecar@sidecarlearning.com',
                                SafariBundleIdentifier: 'com.sidecarlearning.extension',
                                SupportedBrowsers: ['chrome', 'edge', 'firefox', 'safari'],
                                DefaultControlBackend: 'auto',
                                AllowDebuggerCDP: true,
                                BrandKitID: '@lookup:MJ: Brand Kits.Name=Sidecar Learning Brand',
                            },
                        },
                    },
                    primaryKey: { ID: '@lookup:MJ: Applications.Name=Sidecar' },
                },
            ],
            null,
            2
        ),
        'utf8'
    );

    return metadataDir;
}

describe('@memberjunction/browser-extension-builder', () => {
    it('loads MemberJunction Co-Pilot from MJ Core metadata/ and downstream Betty & Sidecar from metadata rows', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ext-meta-test-'));
        try {
            const builder = new ExtensionBrandBuilder();

            // 1. Canonical MJ Co-Pilot from MJ Core's real metadata/ directory
            const copilot = builder.LoadBrandProfileFromMetadata({
                MetadataDir: REPO_METADATA_DIR,
                ApplicationName: 'Data Explorer',
            });
            expect(copilot.BrandSlug).toBe('mj-copilot');
            expect(copilot.BrandName).toBe('MemberJunction Agent');
            expect(copilot.ShortName).toBe('MJ Agent');
            expect(copilot.AgentTabLabel).toBe('Agent');
            expect(copilot.ThemeSeeds.primary).toBe('#0076B6');
            expect(copilot.ThemeSeeds.accent).toBe('#5CC0ED');
            expect(copilot.IncludeDebuggerPermission).toBe(true);
            expect(copilot.BrandKitID).toBe('DBBE8BC2-8FEF-4DA9-B24A-C6038129B696');

            // 2. Downstream Betty & Sidecar from downstream metadata rows
            const downstreamMetaDir = createDownstreamMetadataFixture(tmpDir);
            const betty = builder.LoadBrandProfileFromMetadata({
                MetadataDir: downstreamMetaDir,
                ApplicationName: 'Betty',
            });
            expect(betty.BrandSlug).toBe('betty');
            expect(betty.IncludeDebuggerPermission).toBe(false);
            expect(betty.ThemeSeeds.primary).toBe('#7c3aed');

            const sidecar = builder.LoadBrandProfileFromMetadata({
                MetadataDir: downstreamMetaDir,
                ApplicationName: 'Sidecar',
            });
            expect(sidecar.BrandSlug).toBe('sidecar');
            expect(sidecar.DefaultControlBackend).toBe('auto');
            expect(sidecar.ThemeSeeds.primary).toBe('#0ea5e9');

            expect(() =>
                ValidateExtensionBrandProfile({
                    ...copilot,
                    ThemeSeeds: { primary: 'not-a-hex-color' },
                })
            ).toThrow();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('builds multi-browser extensions (chrome, edge, firefox, safari) from metadata rows via CLI & BuildFromMetadata', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ext-build-multi-'));
        try {
            const downstreamMetaDir = createDownstreamMetadataFixture(tmpDir);

            // Build MJ Co-Pilot across all 4 browsers via CLI from repo metadata/
            const copilotCli = RunMjExtBuildCli([
                '--metadata-dir',
                REPO_METADATA_DIR,
                '--app-name',
                'Data Explorer',
                '--browser',
                'all',
                '--out',
                tmpDir,
            ]);
            expect(copilotCli.ExitCode).toBe(0);
            expect(copilotCli.BuiltSlugs).toEqual(['mj-copilot']);
            expect(copilotCli.BuiltBrowsers).toEqual(['chrome', 'edge', 'firefox', 'safari']);

            // Verify Chrome & Edge manifests have side_panel, service_worker, and optional debugger
            for (const chromiumTarget of ['chrome', 'edge'] as const) {
                const manifest = JSON.parse(
                    fs.readFileSync(path.join(tmpDir, 'mj-copilot', chromiumTarget, 'manifest.json'), 'utf8')
                ) as {
                    side_panel?: { default_path: string };
                    background: { service_worker?: string };
                    optional_permissions?: string[];
                    permissions: string[];
                };
                expect(manifest.side_panel?.default_path).toBe('sidepanel.html');
                expect(manifest.background.service_worker).toBe('service-worker.js');
                expect(manifest.optional_permissions).toContain('debugger');
                expect(manifest.permissions).toContain('offscreen');
            }

            // Verify Firefox manifest has sidebar_action, background.scripts, gecko ID, and NO debugger/offscreen
            const firefoxManifest = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'mj-copilot', 'firefox', 'manifest.json'), 'utf8')
            ) as {
                sidebar_action?: { default_panel: string };
                side_panel?: unknown;
                background: { scripts?: string[] };
                browser_specific_settings?: { gecko?: { id: string } };
                optional_permissions?: string[];
                permissions: string[];
            };
            expect(firefoxManifest.sidebar_action?.default_panel).toBe('sidepanel.html');
            expect(firefoxManifest.side_panel).toBeUndefined();
            expect(firefoxManifest.background.scripts).toEqual(['service-worker.js']);
            expect(firefoxManifest.browser_specific_settings?.gecko?.id).toBe('mj-copilot@memberjunction.org');
            expect(firefoxManifest.optional_permissions).toBeUndefined();
            expect(firefoxManifest.permissions).not.toContain('offscreen');
            expect(firefoxManifest.permissions).not.toContain('debugger');

            // Verify Safari manifest has action.default_popup, no debugger, and emits safari-extension-metadata.json
            const safariManifest = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'mj-copilot', 'safari', 'manifest.json'), 'utf8')
            ) as {
                action: { default_popup?: string };
                side_panel?: unknown;
                optional_permissions?: string[];
                permissions: string[];
            };
            expect(safariManifest.action.default_popup).toBe('sidepanel.html');
            expect(safariManifest.side_panel).toBeUndefined();
            expect(safariManifest.optional_permissions).toBeUndefined();
            expect(safariManifest.permissions).not.toContain('debugger');

            const safariMeta = JSON.parse(
                fs.readFileSync(
                    path.join(tmpDir, 'mj-copilot', 'safari', 'safari-extension-metadata.json'),
                    'utf8'
                )
            ) as { BundleIdentifier: string; XcodeConverterCommand: string };
            expect(safariMeta.BundleIdentifier).toBe('org.memberjunction.copilot.extension');
            expect(safariMeta.XcodeConverterCommand).toContain('safari-web-extension-converter');

            // Verify downstream Betty (AllowDebuggerCDP: false) omits debugger on Chrome too
            const bettyCli = RunMjExtBuildCli([
                '--metadata-dir',
                downstreamMetaDir,
                '--app-name',
                'Betty',
                '--out',
                tmpDir,
            ]);
            expect(bettyCli.ExitCode).toBe(0);
            const bettyManifest = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'betty', 'manifest.json'), 'utf8')
            ) as { optional_permissions?: string[]; permissions: string[] };
            expect(bettyManifest.optional_permissions).toBeUndefined();
            expect(bettyManifest.permissions).not.toContain('debugger');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
