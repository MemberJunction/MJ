/**
 * @fileoverview `ExtensionBrandBuilder` — White-Label Brand Stamping Factory for
 * MemberJunction Browser Extensions (`MJ Co-Pilot`, `Betty`, `Sidecar`, and custom tenant brands).
 *
 * Responsibilities:
 * 1. Validates `mj-extension-brand.json` via {@link ValidateExtensionBrandProfile}.
 * 2. Derives `--mj-*` CSS design tokens using `@memberjunction/theme-engine` via {@link RuntimeBrandKitHydrator}.
 * 3. Stamps `manifest.json` (including conditional `"debugger"` in `optional_permissions` vs omitted when
 *    `IncludeDebuggerPermission === false`).
 * 4. Emits self-contained Manifest V3 runtime scripts (`content-script.js`, `service-worker.js`,
 *    `sidepanel.js`, `offscreen-audio.js`, `sidepanel.html`, `offscreen.html`) and icons into `UnpackedDir`.
 * 5. Packages a Chrome Web Store ready `.zip` archive (`ZipPath`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {
    BrowserControlBackendMode,
    BrowserTarget,
    ExtensionBrandProfile,
    HydratedExtensionBrandTheme,
    REDACTED_SENTINEL,
    RuntimeBrandKitHydrator,
} from '@memberjunction/browser-extension-core';
import { ValidateExtensionBrandProfile } from './BrandProfileSchema.js';

/**
 * Stamped Manifest V3 JSON structure written to `manifest.json` across `chrome`, `edge`, `firefox`, and `safari`.
 */
export interface StampedExtensionManifest {
    manifest_version: 3;
    name: string;
    short_name: string;
    version: string;
    description: string;
    permissions: string[];
    optional_permissions?: string[];
    host_permissions: string[];
    background: {
        service_worker?: string;
        scripts?: string[];
        type: 'module';
    };
    side_panel?: {
        default_path: string;
    };
    sidebar_action?: {
        default_panel: string;
        default_title: string;
        default_icon: Record<string, string>;
    };
    action: {
        default_title: string;
        default_popup?: string;
        default_icon?: Record<string, string>;
    };
    browser_specific_settings?: {
        gecko?: {
            id: string;
            strict_min_version: string;
        };
    };
    content_scripts: Array<{
        matches: string[];
        js: string[];
        run_at: 'document_idle' | 'document_end' | 'document_start';
        all_frames?: boolean;
    }>;
    externally_connectable?: {
        matches: string[];
    };
    icons: Record<string, string>;
}

/**
 * Companion metadata emitted alongside `manifest.json` for Safari 17+ Web Extensions (`safari-extension-metadata.json`).
 */
export interface SafariExtensionMetadata {
    BundleIdentifier: string;
    ExtensionName: string;
    ShortName: string;
    Version: string;
    XcodeConverterCommand: string;
}

/**
 * Options for building a white-label branded browser extension.
 */
export interface BuildBrandedExtensionOptions {
    /** Path to `mj-extension-brand.json` OR an in-memory `ExtensionBrandProfile` object. */
    BrandSource: string | ExtensionBrandProfile;
    /** Output root directory where `<BrandSlug>/` unpacked folder and `.zip` archive will be written. */
    OutputRootDir: string;
    /** Target browser engine (`'chrome'` default, `'edge'`, `'firefox'`, or `'safari'`). */
    TargetBrowser?: BrowserTarget;
    /** When `true`, nests the output inside `<OutputRootDir>/<BrandSlug>/<TargetBrowser>`. */
    IncludeBrowserSubdir?: boolean;
    /** Whether to also produce a `.zip` archive (defaults to `true`). */
    CreateZipArchive?: boolean;
}

/**
 * Result returned by {@link ExtensionBrandBuilder.BuildBrandedExtension}.
 */
export interface BuildBrandedExtensionResult {
    /** Target browser that this bundle was compiled for (`'chrome' | 'edge' | 'firefox' | 'safari'`). */
    TargetBrowser: BrowserTarget;
    /** Validated brand profile. */
    BrandProfile: ExtensionBrandProfile;
    /** Stamped `manifest.json` object. */
    Manifest: StampedExtensionManifest;
    /** Hydrated `@memberjunction/theme-engine` CSS theme. */
    Theme: HydratedExtensionBrandTheme;
    /** Absolute path to the unpacked MV3 extension directory (ready for `--load-extension`). */
    UnpackedDir: string;
    /** Absolute path to `manifest.json`. */
    ManifestPath: string;
    /** Absolute path to `brand-theme.css`. */
    StylesheetPath: string;
    /** Absolute path to `safari-extension-metadata.json` when `TargetBrowser === 'safari'`, otherwise `null`. */
    SafariMetadataPath: string | null;
    /** Absolute path to the generated `.zip` archive (if `CreateZipArchive !== false`). */
    ZipPath: string | null;
}

/**
 * Options for building a brand profile across multiple browsers (`chrome`, `edge`, `firefox`, `safari`).
 */
export interface BuildMultiBrowserExtensionOptions {
    /** Path to `mj-extension-brand.json` OR an in-memory `ExtensionBrandProfile` object. */
    BrandSource: string | ExtensionBrandProfile;
    /** Output root directory where `<BrandSlug>/<browser>/` unpacked folders and `.zip` archives will be written. */
    OutputRootDir: string;
    /** Target browsers to compile (defaults to `profile.SupportedBrowsers ?? ['chrome', 'edge', 'firefox', 'safari']`). */
    TargetBrowsers?: BrowserTarget[];
    /** Whether to also produce `.zip` archives (defaults to `true`). */
    CreateZipArchive?: boolean;
}

/**
 * Options for loading an {@link ExtensionBrandProfile} from `mj-sync` metadata rows
 * (`<MetadataDir>/app-agent-settings/` + `<MetadataDir>/brand-kits/`).
 */
export interface LoadBrandProfileFromMetadataOptions {
    /** Root `metadata/` directory containing `app-agent-settings/` and `brand-kits/`. */
    MetadataDir: string;
    /** Optional `MJ: Applications` Name (e.g. `'Data Explorer'`, `'Betty'`, `'Sidecar'`) to select. */
    ApplicationName?: string;
    /** Optional `BrandSlug` filter (e.g. `'mj-copilot'`, `'betty'`, `'sidecar'`). */
    BrandSlug?: string;
}

/**
 * Options for building one or more browser extension packages directly from `mj-sync` metadata rows.
 */
export interface BuildFromMetadataOptions extends LoadBrandProfileFromMetadataOptions {
    /** Output root directory where unpacked folders and `.zip` archives will be written. */
    OutputRootDir: string;
    /** Single target browser (`'chrome'` default) when building a single target. */
    TargetBrowser?: BrowserTarget;
    /** Multiple target browsers (`['chrome', 'edge', 'firefox', 'safari']`) when building multi-browser packages. */
    TargetBrowsers?: BrowserTarget[];
    /** Whether to also produce `.zip` archives (defaults to `true`). */
    CreateZipArchive?: boolean;
}

/**
 * Result returned by {@link ExtensionBrandBuilder.BuildFromMetadata}.
 */
export interface BuildFromMetadataResult {
    /** Hydrated `ExtensionBrandProfile` merged from `MJ: Applications.AgentSettings.BrowserExtension` + `MJ: Brand Kits`. */
    BrandProfile: ExtensionBrandProfile;
    /** Primary build result (first target browser). */
    PrimaryResult: BuildBrandedExtensionResult;
    /** Map of build results keyed by `BrowserTarget`. */
    BrowserResults: Partial<Record<BrowserTarget, BuildBrandedExtensionResult>>;
}

interface RawBrandKitMetadataRecord {
    fields?: {
        Name?: string;
        Description?: string;
        Style?: {
            Palette?: Array<{ Name?: string; Value?: string }>;
            Typography?: Array<{ Role?: string; FontFamily?: string }>;
        };
    };
    primaryKey?: {
        ID?: string;
    };
}

interface RawApplicationMetadataRecord {
    fields?: {
        Name?: string;
        AgentSettings?: {
            BrowserExtension?: {
                BrandSlug?: string | null;
                ExtensionName?: string | null;
                ShortName?: string | null;
                Description?: string | null;
                Version?: string | null;
                AssistantDisplayName?: string | null;
                AgentTabLabel?: string | null;
                SidePanelHeaderTitle?: string | null;
                DefaultServerUrl?: string | null;
                DefaultAuthProvider?: 'msal' | 'auth0' | 'okta' | 'cognito' | 'custom-oidc' | null;
                KeyboardShortcut?: string | null;
                FirefoxExtensionID?: string | null;
                SafariBundleIdentifier?: string | null;
                SupportedBrowsers?: BrowserTarget[] | null;
                DefaultControlBackend?: BrowserControlBackendMode | null;
                AllowDebuggerCDP?: boolean | null;
                BrandKitID?: string | null;
                BlockedDomains?: string[] | null;
                HostPermissions?: string[] | null;
                ExternallyConnectableMatches?: string[] | null;
            } | null;
        } | null;
    };
    primaryKey?: {
        ID?: string;
    };
}

/**
 * Valid 1x1 PNG binary header/bytes used when generating fallback brand icons.
 */
const MINIMAL_VALID_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * White-Label Brand Stamping Factory for MemberJunction Browser Extensions.
 */
export class ExtensionBrandBuilder {
    private readonly hydrator = new RuntimeBrandKitHydrator();

    /**
     * Load and validate an `mj-extension-brand.json` file from disk.
     */
    public LoadBrandProfileFromFile(brandJsonPath: string): ExtensionBrandProfile {
        const resolved = path.resolve(brandJsonPath);
        const raw = fs.readFileSync(resolved, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        return ValidateExtensionBrandProfile(parsed);
    }

    /**
     * Load and construct a validated {@link ExtensionBrandProfile} directly from `mj-sync` metadata rows
     * in `<MetadataDir>/app-agent-settings/` and `<MetadataDir>/brand-kits/`.
     *
     * Resolves `"BrandKitID": "@lookup:MJ: Brand Kits.Name=<Name>"` (or UUID) against the `MJ: Brand Kits`
     * records, extracts `Style.Palette` (`Primary`, `Navy`/`Secondary`, `Accent`, `Cyan`) and
     * `Style.Typography` (`Headline`, `Body`, `Data`), and merges them with `AgentSettings.BrowserExtension`.
     */
    public LoadBrandProfileFromMetadata(options: LoadBrandProfileFromMetadataOptions): ExtensionBrandProfile {
        const metadataRoot = path.resolve(options.MetadataDir);
        const appSettingsDir = path.join(metadataRoot, 'app-agent-settings');
        const brandKitsDir = path.join(metadataRoot, 'brand-kits');

        const appRows = this.readMetadataRecordsFromDir<RawApplicationMetadataRecord>(appSettingsDir);
        const brandKitRows = this.readMetadataRecordsFromDir<RawBrandKitMetadataRecord>(brandKitsDir);

        const matchedAppRow = appRows.find((row) => {
            const ext = row.fields?.AgentSettings?.BrowserExtension;
            if (!ext) {
                return false;
            }
            if (options.BrandSlug && ext.BrandSlug === options.BrandSlug) {
                return true;
            }
            if (options.ApplicationName) {
                const pk = row.primaryKey?.ID ?? '';
                const nameField = row.fields?.Name ?? '';
                return (
                    nameField === options.ApplicationName ||
                    pk === `@lookup:MJ: Applications.Name=${options.ApplicationName}`
                );
            }
            return true;
        });

        if (!matchedAppRow || !matchedAppRow.fields?.AgentSettings?.BrowserExtension) {
            throw new Error(
                `No MJ: Applications row with AgentSettings.BrowserExtension found in "${appSettingsDir}"` +
                    (options.ApplicationName ? ` for ApplicationName="${options.ApplicationName}"` : '') +
                    (options.BrandSlug ? ` for BrandSlug="${options.BrandSlug}"` : '')
            );
        }

        const ext = matchedAppRow.fields.AgentSettings.BrowserExtension;
        const brandKitRef = ext.BrandKitID ?? '';
        const lookupPrefix = '@lookup:MJ: Brand Kits.Name=';
        const targetBrandKitName = brandKitRef.startsWith(lookupPrefix)
            ? brandKitRef.slice(lookupPrefix.length).trim()
            : brandKitRef.trim();

        const matchedBrandKit =
            brandKitRows.find((bk) => {
                const name = bk.fields?.Name ?? '';
                const id = bk.primaryKey?.ID ?? '';
                return (
                    (targetBrandKitName &&
                        (name.toLowerCase() === targetBrandKitName.toLowerCase() ||
                            id.toLowerCase() === targetBrandKitName.toLowerCase())) ||
                    false
                );
            }) ?? brandKitRows[0];

        const palette = matchedBrandKit?.fields?.Style?.Palette ?? [];
        const typography = matchedBrandKit?.fields?.Style?.Typography ?? [];

        const findColor = (names: string[], fallback: string): string => {
            for (const candidate of names) {
                const found = palette.find(
                    (p) => (p.Name ?? '').toLowerCase() === candidate.toLowerCase() && p.Value
                );
                if (found?.Value) {
                    return found.Value;
                }
            }
            return fallback;
        };

        const findFont = (roles: string[], fallback: string): string => {
            for (const role of roles) {
                const found = typography.find(
                    (t) => (t.Role ?? '').toLowerCase() === role.toLowerCase() && t.FontFamily
                );
                if (found?.FontFamily) {
                    return found.FontFamily;
                }
            }
            return fallback;
        };

        const primaryHex = findColor(['Primary', 'Brand'], '#0076B6');
        const accentHex = findColor(['Accent', 'Cyan', 'Secondary'], '#5CC0ED');
        const tertiaryHex = findColor(['Navy', 'Tertiary', 'Cyan'], '#092340');
        const bodyFont = findFont(['Body', 'Headline'], 'MJ Sans, Inter, system-ui, sans-serif');
        const monoFont = findFont(['Data', 'Mono'], 'MJ Mono, JetBrains Mono, monospace');

        const slug = ext.BrandSlug ?? 'mj-copilot';
        const extensionName = ext.ExtensionName ?? matchedBrandKit?.fields?.Name ?? 'MemberJunction Agent';
        const shortName = (ext.ShortName ?? extensionName).slice(0, 12);
        const description = (
            ext.Description ??
            matchedBrandKit?.fields?.Description ??
            'Enterprise AI Browser Agent with multi-app context braiding and guided playbooks.'
        ).slice(0, 132);

        const profileCandidate: ExtensionBrandProfile = {
            BrandSlug: slug,
            BrandName: extensionName.slice(0, 45),
            ShortName: shortName,
            Version: ext.Version ?? '6.2.0',
            Description: description,
            AssistantDisplayName: ext.AssistantDisplayName ?? shortName,
            AgentTabLabel: ext.AgentTabLabel ?? 'Agent',
            SidePanelHeaderTitle: ext.SidePanelHeaderTitle ?? extensionName.slice(0, 45),
            Tagline: ext.SidePanelHeaderTitle ?? extensionName,
            DefaultServerUrl: ext.DefaultServerUrl ?? 'http://localhost:4000/graphql',
            DefaultAuthProvider: ext.DefaultAuthProvider ?? 'msal',
            KeyboardShortcut: ext.KeyboardShortcut ?? 'Ctrl+Shift+M',
            FirefoxExtensionID: ext.FirefoxExtensionID ?? `${slug}@memberjunction.org`,
            SafariBundleIdentifier: ext.SafariBundleIdentifier ?? `org.memberjunction.${slug}.extension`,
            SupportedBrowsers: ext.SupportedBrowsers ?? ['chrome', 'edge', 'firefox', 'safari'],
            BrandKitID: matchedBrandKit?.primaryKey?.ID ?? (brandKitRef || undefined),
            DefaultControlBackend: ext.DefaultControlBackend ?? 'content-script',
            IncludeDebuggerPermission: ext.AllowDebuggerCDP !== false,
            HostPermissions:
                ext.HostPermissions && ext.HostPermissions.length > 0
                    ? [...ext.HostPermissions]
                    : ['<all_urls>'],
            ExternallyConnectableMatches:
                ext.ExternallyConnectableMatches && ext.ExternallyConnectableMatches.length > 0
                    ? [...ext.ExternallyConnectableMatches]
                    : ['https://*.memberjunction.com/*', 'http://localhost:*/*'],
            BlockedDomains: ext.BlockedDomains
                ? [...ext.BlockedDomains]
                : ['*.1password.com', '*.lastpass.com', '*.bitwarden.com', '*.dashlane.com'],
            ThemeSeeds: {
                primary: primaryHex,
                accent: accentHex,
                tertiary: tertiaryHex,
                neutralChroma: 0.25,
                vibrancy: 1,
                radius: 8,
                depth: 1,
                fontFamily: bodyFont,
                fontFamilyMono: monoFont,
            },
            Icons: {
                Icon16: 'icons/icon-16.png',
                Icon32: 'icons/icon-32.png',
                Icon48: 'icons/icon-48.png',
                Icon128: 'icons/icon-128.png',
            },
        };

        return ValidateExtensionBrandProfile(profileCandidate);
    }

    /**
     * Stamp a browser-specific Manifest V3 `manifest.json` object from a validated {@link ExtensionBrandProfile}.
     *
     * Supports:
     * - `'chrome'` & `'edge'`: Chromium MV3 (`side_panel`, `background.service_worker`, `offscreen`, optional `debugger`)
     * - `'firefox'`: Firefox WebExtensions MV3 (`sidebar_action`, `background.scripts`, `browser_specific_settings.gecko`, no `debugger`)
     * - `'safari'`: Safari 17+ WebExtensions MV3 (`action.default_popup`, `background.service_worker`, no `debugger`)
     */
    public StampManifest(
        profile: ExtensionBrandProfile,
        targetBrowser: BrowserTarget = 'chrome'
    ): StampedExtensionManifest {
        const validated = ValidateExtensionBrandProfile(profile);
        const iconsMap: Record<string, string> = {
            '16': validated.Icons.Icon16,
            '32': validated.Icons.Icon32,
            '48': validated.Icons.Icon48,
            '128': validated.Icons.Icon128,
        };
        const headerTitle = validated.SidePanelHeaderTitle ?? validated.BrandName;

        if (targetBrowser === 'firefox') {
            return {
                manifest_version: 3,
                name: validated.BrandName,
                short_name: validated.ShortName,
                version: validated.Version,
                description: validated.Description,
                permissions: ['activeTab', 'scripting', 'tabs', 'storage'],
                host_permissions: [...validated.HostPermissions],
                background: {
                    scripts: ['service-worker.js'],
                    type: 'module',
                },
                sidebar_action: {
                    default_panel: 'sidepanel.html',
                    default_title: headerTitle,
                    default_icon: iconsMap,
                },
                action: {
                    default_title: `Open ${validated.ShortName}`,
                },
                browser_specific_settings: {
                    gecko: {
                        id: validated.FirefoxExtensionID ?? `${validated.BrandSlug}@memberjunction.org`,
                        strict_min_version: '128.0',
                    },
                },
                content_scripts: [
                    {
                        matches: [...validated.HostPermissions],
                        js: ['content-script.js'],
                        run_at: 'document_idle',
                        all_frames: true,
                    },
                ],
                icons: iconsMap,
            };
        }

        if (targetBrowser === 'safari') {
            return {
                manifest_version: 3,
                name: validated.BrandName,
                short_name: validated.ShortName,
                version: validated.Version,
                description: validated.Description,
                permissions: ['activeTab', 'scripting', 'tabs', 'storage'],
                host_permissions: [...validated.HostPermissions],
                background: {
                    service_worker: 'service-worker.js',
                    type: 'module',
                },
                action: {
                    default_title: headerTitle,
                    default_popup: 'sidepanel.html',
                    default_icon: iconsMap,
                },
                content_scripts: [
                    {
                        matches: [...validated.HostPermissions],
                        js: ['content-script.js'],
                        run_at: 'document_idle',
                        all_frames: true,
                    },
                ],
                icons: iconsMap,
            };
        }

        // Default: Chromium MV3 ('chrome' and 'edge')
        const manifest: StampedExtensionManifest = {
            manifest_version: 3,
            name: validated.BrandName,
            short_name: validated.ShortName,
            version: validated.Version,
            description: validated.Description,
            permissions: ['sidePanel', 'activeTab', 'scripting', 'storage', 'offscreen', 'tabs'],
            host_permissions: [...validated.HostPermissions],
            background: {
                service_worker: 'service-worker.js',
                type: 'module',
            },
            side_panel: {
                default_path: 'sidepanel.html',
            },
            action: {
                default_title: `Open ${validated.ShortName}`,
            },
            content_scripts: [
                {
                    matches: [...validated.HostPermissions],
                    js: ['content-script.js'],
                    run_at: 'document_idle',
                    all_frames: true,
                },
            ],
            externally_connectable: {
                matches: [...validated.ExternallyConnectableMatches],
            },
            icons: iconsMap,
        };

        if (validated.IncludeDebuggerPermission) {
            manifest.optional_permissions = ['debugger'];
        }

        return manifest;
    }

    /**
     * Build a complete unpacked MV3 Extension directory and optional `.zip` archive
     * for the specified brand profile and target browser (`chrome`, `edge`, `firefox`, or `safari`).
     */
    public BuildBrandedExtension(
        options: BuildBrandedExtensionOptions
    ): BuildBrandedExtensionResult {
        const targetBrowser: BrowserTarget = options.TargetBrowser ?? 'chrome';
        const profile =
            typeof options.BrandSource === 'string'
                ? this.LoadBrandProfileFromFile(options.BrandSource)
                : ValidateExtensionBrandProfile(options.BrandSource);

        const brandSourceDir =
            typeof options.BrandSource === 'string'
                ? path.dirname(path.resolve(options.BrandSource))
                : null;

        const outputRoot = path.resolve(options.OutputRootDir);
        const unpackedDir = options.IncludeBrowserSubdir
            ? path.join(outputRoot, profile.BrandSlug, targetBrowser)
            : path.join(outputRoot, profile.BrandSlug);
        fs.mkdirSync(unpackedDir, { recursive: true });

        // 1. Derive Theme CSS via @memberjunction/theme-engine
        const theme = this.hydrator.HydrateFromBrandProfile(profile);
        const stylesheetPath = path.join(unpackedDir, 'brand-theme.css');
        fs.writeFileSync(stylesheetPath, theme.StylesheetCss, 'utf8');

        // 2. Stamp browser-specific manifest.json
        const manifest = this.StampManifest(profile, targetBrowser);
        const manifestPath = path.join(unpackedDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

        // 2b. Emit safari-extension-metadata.json for Safari target
        let safariMetadataPath: string | null = null;
        if (targetBrowser === 'safari') {
            const safariMetadata: SafariExtensionMetadata = {
                BundleIdentifier:
                    profile.SafariBundleIdentifier ?? `org.memberjunction.${profile.BrandSlug}.extension`,
                ExtensionName: profile.BrandName,
                ShortName: profile.ShortName,
                Version: profile.Version,
                XcodeConverterCommand: 'xcrun safari-web-extension-converter .',
            };
            safariMetadataPath = path.join(unpackedDir, 'safari-extension-metadata.json');
            fs.writeFileSync(safariMetadataPath, JSON.stringify(safariMetadata, null, 2) + '\n', 'utf8');
        }

        // 3. Emit self-contained MV3 runtime bundles
        fs.writeFileSync(
            path.join(unpackedDir, 'content-script.js'),
            this.generateContentScriptBundle(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'service-worker.js'),
            this.generateServiceWorkerBundle(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'sidepanel.html'),
            this.generateSidePanelHtml(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'sidepanel.js'),
            this.generateSidePanelScript(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'offscreen.html'),
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${profile.ShortName} Offscreen Audio Daemon</title></head><body><script type="module" src="offscreen-audio.js"></script></body></html>\n`,
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'offscreen-audio.js'),
            this.generateOffscreenAudioScript(profile),
            'utf8'
        );

        // 4. Copy or generate icons
        this.ensureBrandIcons(unpackedDir, brandSourceDir, profile);

        // 5. Create deterministic .zip archive if requested
        let zipPath: string | null = null;
        if (options.CreateZipArchive !== false) {
            const zipSuffix = options.IncludeBrowserSubdir ? `-${targetBrowser}-${profile.Version}` : `-${profile.Version}`;
            zipPath = path.join(outputRoot, `${profile.BrandSlug}${zipSuffix}.zip`);
            this.createZipArchiveFromDirectory(unpackedDir, zipPath);
        }

        return {
            TargetBrowser: targetBrowser,
            BrandProfile: profile,
            Manifest: manifest,
            Theme: theme,
            UnpackedDir: unpackedDir,
            ManifestPath: manifestPath,
            StylesheetPath: stylesheetPath,
            SafariMetadataPath: safariMetadataPath,
            ZipPath: zipPath,
        };
    }

    /**
     * Build a brand profile across multiple browsers (`chrome`, `edge`, `firefox`, `safari`),
     * emitting `<OutputRootDir>/<BrandSlug>/<browser>/` and `<BrandSlug>-<browser>-<Version>.zip`.
     */
    public BuildMultiBrowserExtension(
        options: BuildMultiBrowserExtensionOptions
    ): Record<BrowserTarget, BuildBrandedExtensionResult> {
        const profile =
            typeof options.BrandSource === 'string'
                ? this.LoadBrandProfileFromFile(options.BrandSource)
                : ValidateExtensionBrandProfile(options.BrandSource);

        const browsers: BrowserTarget[] =
            options.TargetBrowsers && options.TargetBrowsers.length > 0
                ? options.TargetBrowsers
                : profile.SupportedBrowsers && profile.SupportedBrowsers.length > 0
                  ? profile.SupportedBrowsers
                  : ['chrome', 'edge', 'firefox', 'safari'];

        const results = {} as Record<BrowserTarget, BuildBrandedExtensionResult>;
        for (const browser of browsers) {
            results[browser] = this.BuildBrandedExtension({
                BrandSource: profile,
                OutputRootDir: options.OutputRootDir,
                TargetBrowser: browser,
                IncludeBrowserSubdir: true,
                CreateZipArchive: options.CreateZipArchive,
            });
        }
        return results;
    }

    /**
     * Build an extension brand directly from `mj-sync` metadata rows (`<MetadataDir>/app-agent-settings/`
     * + `<MetadataDir>/brand-kits/`), optionally across multiple browser targets.
     */
    public BuildFromMetadata(options: BuildFromMetadataOptions): BuildFromMetadataResult {
        const profile = this.LoadBrandProfileFromMetadata(options);
        const browsers: BrowserTarget[] =
            options.TargetBrowsers && options.TargetBrowsers.length > 0
                ? options.TargetBrowsers
                : options.TargetBrowser
                  ? [options.TargetBrowser]
                  : ['chrome'];

        const multiBrowser = browsers.length > 1;
        const browserResults: Partial<Record<BrowserTarget, BuildBrandedExtensionResult>> = {};
        let primaryResult: BuildBrandedExtensionResult | null = null;

        for (const browser of browsers) {
            const built = this.BuildBrandedExtension({
                BrandSource: profile,
                OutputRootDir: options.OutputRootDir,
                TargetBrowser: browser,
                IncludeBrowserSubdir: multiBrowser,
                CreateZipArchive: options.CreateZipArchive,
            });
            browserResults[browser] = built;
            if (!primaryResult) {
                primaryResult = built;
            }
        }

        return {
            BrandProfile: profile,
            PrimaryResult: primaryResult!,
            BrowserResults: browserResults,
        };
    }

    private readMetadataRecordsFromDir<TRecord>(dirPath: string): TRecord[] {
        if (!fs.existsSync(dirPath)) {
            return [];
        }
        const entries = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json') && f !== '.mj-sync.json');
        const records: TRecord[] = [];
        for (const file of entries) {
            const fullPath = path.join(dirPath, file);
            const raw = fs.readFileSync(fullPath, 'utf8');
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                records.push(...(parsed as TRecord[]));
            } else if (parsed && typeof parsed === 'object') {
                records.push(parsed as TRecord);
            }
        }
        return records;
    }

    private ensureBrandIcons(
        unpackedDir: string,
        brandSourceDir: string | null,
        profile: ExtensionBrandProfile
    ): void {
        const iconPaths = [
            profile.Icons.Icon16,
            profile.Icons.Icon32,
            profile.Icons.Icon48,
            profile.Icons.Icon128,
        ];
        const fallbackBuffer = Buffer.from(MINIMAL_VALID_PNG_BASE64, 'base64');

        for (const relIcon of iconPaths) {
            const targetPath = path.join(unpackedDir, relIcon);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            const candidateSrc = brandSourceDir ? path.join(brandSourceDir, relIcon) : null;
            if (candidateSrc && fs.existsSync(candidateSrc)) {
                fs.copyFileSync(candidateSrc, targetPath);
            } else {
                fs.writeFileSync(targetPath, fallbackBuffer);
            }
        }
    }

    /**
     * Generate a self-contained MV3 `content-script.js` bundle that runs natively inside Chromium
     * tabs (`wikipedia.org`, `amazon.com`, etc.), sets readiness markers, runs the canonical
     * `INTERACTIVITYPROBE`, enforces `SensitivePageGuard` password/CC/OTP masking, renders
     * Shadow-DOM Coach-Marks (`#mj-ext-coach-mark-host`), and bridges commands over both
     * `chrome.runtime.onMessage` and custom DOM events (`mj-ext-command` / `mj-ext-response`).
     */
    private generateContentScriptBundle(profile: ExtensionBrandProfile): string {
        return `// Generated by @memberjunction/browser-extension-builder for brand "${profile.BrandSlug}" (${profile.Version})
(() => {
  const IS_TOP_FRAME = (typeof window !== 'undefined' && window === window.top);
  const IS_EMBED_AGENT_FRAME = (
    typeof window !== 'undefined' &&
    (window.name === 'mj-ext-agent-embed-frame' ||
      Boolean(window.location && window.location.search && window.location.search.includes('mj_ext_agent_embed=1')))
  );
  // Never run in third-party ad/tracker iframes (e.g. LinkedIn tscp-serving/dtag ad frames)
  if (!IS_TOP_FRAME && !IS_EMBED_AGENT_FRAME) {
    return;
  }

  const BRAND_SLUG = ${JSON.stringify(profile.BrandSlug)};
  const ASSISTANT_NAME = ${JSON.stringify(profile.AssistantDisplayName)};
  const REDACTED_SENTINEL = ${JSON.stringify(REDACTED_SENTINEL)};
  const BLOCKED_DOMAINS = ${JSON.stringify(profile.BlockedDomains)};
  const PRIMARY_COLOR = ${JSON.stringify(profile.ThemeSeeds.primary)};

  const INTERACTIVE_SELECTOR = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'summary',
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
    '[role="tab"]', '[role="menuitem"]', '[role="switch"]', '[role="combobox"]',
    '[role="option"]', '[role="textbox"]', '[contenteditable=""]', '[contenteditable="true"]',
    '[role="separator"]', '[onclick]', '[tabindex]'
  ].join(',');

  const INTERACTIVE_WITHOUT_TABINDEX = INTERACTIVE_SELECTOR
    .split(',')
    .filter(sel => sel !== '[tabindex]' && sel !== '[onclick]')
    .join(',');

  const SCOPE_ROLES = new Set([
    'group', 'region', 'dialog', 'alertdialog', 'navigation', 'main', 'form',
    'table', 'grid', 'list', 'listbox', 'tabpanel', 'menu', 'toolbar',
    'banner', 'complementary', 'contentinfo', 'search', 'article'
  ]);
  const IMPLICIT_SCOPE_ROLE = {
    NAV: 'navigation', MAIN: 'main', FORM: 'form', DIALOG: 'dialog',
    TABLE: 'table', SECTION: 'region', ASIDE: 'complementary',
    HEADER: 'banner', FOOTER: 'contentinfo', UL: 'list', OL: 'list',
    ARTICLE: 'article', SEARCH: 'search'
  };

  function isSensitiveInput(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    const type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
    if (type === 'password') return true;
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (auto.startsWith('cc-') || auto === 'one-time-code' || auto.includes('password')) return true;
    const nameId = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const tokens = ['password', 'passcode', 'cvv', 'cvc', 'card-number', 'card_number', 'cardnumber', 'otp', 'totp'];
    return tokens.some(tok => nameId.includes(tok));
  }

  function matchesChallengeRoute(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      if (host === 'login.microsoftonline.com') return true;
      if (host === 'accounts.google.com' && pathname.startsWith('/v3/signin')) return true;
      const segments = pathname.split('/').filter(Boolean);
      const challengeSegments = new Set(['login', 'signin', 'sign-in', 'mfa', '2fa', 'two-factor', 'totp']);
      return segments.some(seg => challengeSegments.has(seg));
    } catch {
      return false;
    }
  }

  function probeInteractiveElements() {
    const xpathOf = (node) => {
      const segments = [];
      let el = node;
      while (el && el.nodeType === 1 && el !== document.documentElement) {
        let index = 1;
        let sib = el.previousElementSibling;
        while (sib) {
          if (sib.tagName === el.tagName) index++;
          sib = sib.previousElementSibling;
        }
        segments.unshift(el.tagName.toLowerCase() + '[' + index + ']');
        el = el.parentElement;
      }
      return '/html/' + segments.join('/');
    };

    const roleOf = (el) => {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button' || tag === 'summary') return 'button';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const t = (el.getAttribute('type') || el.type || 'text').toLowerCase();
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'button' || t === 'submit' || t === 'reset') return 'button';
        return 'textbox';
      }
      return tag;
    };

    const nameOf = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        const ref = document.getElementById(labelledby);
        if (ref && ref.textContent) return ref.textContent.trim();
      }
      if (el.id) {
        const escaped = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
          ? CSS.escape(el.id)
          : el.id.replace(/["\\\\]/g, '\\\\$&');
        const lbl = document.querySelector('label[for="' + escaped + '"]');
        if (lbl && lbl.textContent) return lbl.textContent.trim();
      }
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder.trim();
      const title = el.getAttribute('title');
      if (title) return title.trim();
      const text = el.innerText || el.textContent || '';
      return text.trim().slice(0, 120);
    };

    const regionName = (node) => {
      const label = node.getAttribute('aria-label');
      if (label && label.trim()) return label.trim();
      const labelledBy = node.getAttribute('aria-labelledby');
      if (!labelledBy) return '';
      return labelledBy
        .split(' ')
        .filter(Boolean)
        .map(id => document.getElementById(id))
        .map(n => (n && n.textContent ? n.textContent.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
    };

    const scopeOf = (el) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const role = (node.getAttribute('role') || IMPLICIT_SCOPE_ROLE[node.tagName] || '').trim().toLowerCase();
        if (role && SCOPE_ROLES.has(role)) {
          const name = regionName(node);
          if (name) return role + ':' + name;
        }
        node = node.parentElement;
      }
      return '';
    };

    const results = [];
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const seen = new Set();

    document.querySelectorAll(INTERACTIVE_SELECTOR).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.getAttribute && el.getAttribute('type') === 'hidden') return;
      if (el.getAttribute('tabindex') === '-1' && !el.hasAttribute('onclick') && !el.matches(INTERACTIVE_WITHOUT_TABINDEX)) return;
      const style = window.getComputedStyle(el);
      if (typeof el.checkVisibility === 'function') {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return;
      } else if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return;
      }
      if (style.pointerEvents === 'none') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.bottom < -vh || rect.top > vh * 2 || rect.right < -vw || rect.left > vw * 2) return;

      const elementIndex = results.length;
      try {
        el.setAttribute('data-mj-cu-index', String(elementIndex));
      } catch {}

      const isFormValue = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      const rawVal = isFormValue ? String(el.value || '') : undefined;
      const safeVal = isSensitiveInput(el) ? REDACTED_SENTINEL : rawVal;
      const scope = scopeOf(el);
      const scrollable = (el.scrollHeight > el.clientHeight + 4) &&
        (style.overflowY === 'auto' || style.overflowY === 'scroll');

      results.push({
        Index: elementIndex,
        Role: roleOf(el),
        Name: nameOf(el),
        Selector: 'xpath=' + xpathOf(el),
        Scope: scope || undefined,
        Value: safeVal,
        Scrollable: scrollable,
        BoundingBox: {
          XMin: Math.round(rect.left),
          YMin: Math.round(rect.top),
          XMax: Math.round(rect.left + rect.width),
          YMax: Math.round(rect.top + rect.height)
        },
        Disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true')
      });
    });
    return results;
  }

  function extractPageState() {
    const openGraph = {};
    const metaTags = {};
    document.querySelectorAll('meta').forEach((m) => {
      const content = (m.getAttribute('content') || '').trim();
      if (!content) return;
      const prop = (m.getAttribute('property') || '').trim();
      const name = (m.getAttribute('name') || '').trim();
      if (prop) {
        const lowerProp = prop.toLowerCase();
        openGraph[prop] = content;
        openGraph[lowerProp] = content;
        if (lowerProp.startsWith('og:')) {
          openGraph[lowerProp.slice(3)] = content;
        }
      }
      if (name) {
        metaTags[name] = content;
        metaTags[name.toLowerCase()] = content;
      }
    });
    const schemaOrg = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const parsed = JSON.parse(s.textContent || '');
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (item && typeof item === 'object') schemaOrg.push(item);
          });
        } else if (parsed && typeof parsed === 'object') {
          schemaOrg.push(parsed);
        }
      } catch {}
    });
    const hasPasswordInput = document.querySelectorAll('input[type="password"]').length > 0;
    const hasOtpInput = document.querySelectorAll('input[autocomplete="one-time-code"]').length > 0;
    const rawHost = (window.location.hostname || '').toLowerCase();
    const hostnameRoot = rawHost.startsWith('www.') ? rawHost.slice(4) : rawHost;
    const isAuthOrMfa = hasPasswordInput || hasOtpInput || matchesChallengeRoute(window.location.href);

    // Extract rich LinkedIn & Organization signals directly from the live DOM
    const h1El = document.querySelector('main h1, h1.text-heading-xlarge, h1');
    let h1Text = h1El ? (h1El.innerText || h1El.textContent || '').trim() : '';
    const headlineEl = document.querySelector('.pv-text-details__left-panel .text-body-medium, main .text-body-medium.break-words, [data-generated-suggestion-target]');
    let headlineText = headlineEl ? (headlineEl.innerText || headlineEl.textContent || '').trim() : '';
    const locationEl = document.querySelector('.pv-text-details__left-panel .text-body-small.inline, main span.text-body-small.inline');
    let locationText = locationEl ? (locationEl.innerText || locationEl.textContent || '').trim() : '';

    if (window.location.href.includes('linkedin.com/in/')) {
      const mainEl = document.querySelector('main') || document.body;
      const lines = (mainEl ? (mainEl.innerText || '') : '')
        .split('\\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 1);
      const contactInfoIdx = lines.findIndex((l) => l.includes('Contact info'));
      if (contactInfoIdx >= 0) {
        const locPart = lines[contactInfoIdx].split('Contact info')[0].replace(/[·•|-]+\\s*$/, '').trim();
        if (locPart && !locationText) {
          locationText = locPart;
        }
        if (contactInfoIdx >= 1 && !headlineText) {
          headlineText = lines[contactInfoIdx - 1];
        }
        if (contactInfoIdx >= 2 && !h1Text) {
          h1Text = lines[contactInfoIdx - 2];
        }
      }
    }

    return {
      Url: window.location.href,
      Title: document.title || '',
      Hostname: rawHost,
      ViewportWidth: window.innerWidth || 1280,
      ViewportHeight: window.innerHeight || 800,
      InteractiveElements: probeInteractiveElements(),
      VisibleTextExcerpt: (document.body ? (document.body.innerText || document.body.textContent || '') : '').trim().slice(0, 12000),
      OpenGraph: openGraph,
      SchemaOrgEntities: schemaOrg,
      MetaTags: metaTags,
      CapturedSignals: {
        FullUrl: window.location.href,
        HostnameRoot: hostnameRoot,
        PrimaryHeading: h1Text,
        Headline: headlineText,
        Location: locationText
      },
      IsAuthOrMfaScreen: isAuthOrMfa,
      ActiveBackend: 'content-script',
      BrandSlug: BRAND_SLUG,
      CapturedAtIso: new Date().toISOString()
    };
  }

  function resolveSelector(selector) {
    if (!selector) return null;
    if (selector.startsWith('xpath=') || selector.startsWith('/')) {
      const expr = selector.startsWith('xpath=') ? selector.slice(6) : selector;
      const res = document.evaluate(expr, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return res.singleNodeValue;
    }
    return document.querySelector(selector);
  }

  function resolveTarget(req) {
    if (req.Selector) {
      const direct = resolveSelector(req.Selector);
      if (direct) return direct;
    }
    const targetIdx = typeof req.Index === 'number' ? req.Index : (typeof req.ElementIndex === 'number' ? req.ElementIndex : undefined);
    if (typeof targetIdx === 'number') {
      const byAttr = document.querySelector('[data-mj-cu-index="' + targetIdx + '"]');
      if (byAttr) return byAttr;
      const list = probeInteractiveElements();
      const entry = list.find(e => e.Index === targetIdx);
      if (entry) return resolveSelector(entry.Selector);
    }
    return null;
  }

  function highlightElement(req) {
    const target = resolveTarget(req);
    if (!target) {
      return { Success: false, ErrorMessage: 'Target element not found for selector: ' + (req.Selector || req.Index) };
    }
    target.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = target.getBoundingClientRect();
    let host = document.getElementById('mj-ext-coach-mark-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mj-ext-coach-mark-host';
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      document.body.appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const highlightId = req.HighlightId || ('mj-cm-' + Date.now());
    host.setAttribute('data-active-highlight-id', highlightId);
    host.setAttribute('data-target-top', String(Math.round(rect.top)));
    host.setAttribute('data-target-left', String(Math.round(rect.left)));
    host.setAttribute('data-target-width', String(Math.round(rect.width)));
    host.setAttribute('data-target-height', String(Math.round(rect.height)));

    shadow.innerHTML = \`
      <style>
        .mj-spotlight-ring {
          position: fixed;
          top: \${Math.max(0, rect.top - 4)}px;
          left: \${Math.max(0, rect.left - 4)}px;
          width: \${rect.width + 8}px;
          height: \${rect.height + 8}px;
          border: 3px solid var(--mj-brand-primary, \${PRIMARY_COLOR});
          border-radius: 8px;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.25);
          pointer-events: none;
          box-sizing: border-box;
        }
        .mj-spotlight-callout {
          position: fixed;
          top: \${Math.min((window.innerHeight || 800) - 60, rect.bottom + 10)}px;
          left: \${Math.max(8, rect.left)}px;
          background: #0f172a;
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }
      </style>
      <div class="mj-spotlight-ring" id="\${highlightId}"></div>
      <div class="mj-spotlight-callout">
        \${req.StepBadge ? '<span class="mj-step-badge">' + req.StepBadge + ': </span>' : ''}
        <span class="mj-callout-label">\${req.Label || ''}</span>
      </div>
    \`;
    return {
      Success: true,
      BackendUsed: 'content-script',
      EscalatedToDebugger: false,
      Data: {
        HighlightId: highlightId,
        BoundingBox: {
          Top: rect.top,
          Left: rect.left,
          Width: rect.width,
          Height: rect.height
        }
      }
    };
  }

  function clearHighlights() {
    const host = document.getElementById('mj-ext-coach-mark-host');
    if (host) host.remove();
    return { Success: true, BackendUsed: 'content-script', EscalatedToDebugger: false, Data: { ClearedCount: 1 } };
  }

  function clickElement(req) {
    const target = resolveTarget(req);
    if (!target) {
      return { Success: false, ErrorMessage: 'Element not found for click' };
    }
    target.click();
    return {
      Success: true,
      BackendUsed: 'content-script',
      EscalatedToDebugger: false,
      Data: { Selector: req.Selector, Healed: false }
    };
  }

  function fillInput(req) {
    const target = resolveTarget(req);
    if (!target) {
      return { Success: false, ErrorMessage: 'Input element not found' };
    }
    target.focus();
    target.value = req.Value || '';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    if (req.PressEnter) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      const form = target.closest('form');
      if (form && typeof form.submit === 'function') {
        form.submit();
      }
    }
    return {
      Success: true,
      BackendUsed: 'content-script',
      EscalatedToDebugger: false,
      Data: { Selector: req.Selector, Healed: false }
    };
  }

  function ensureReadyAttributes() {
    if (document.documentElement) {
      if (document.documentElement.getAttribute('data-mj-extension-content-script') !== 'ready') {
        document.documentElement.setAttribute('data-mj-extension-content-script', 'ready');
      }
      if (document.documentElement.getAttribute('data-mj-extension-brand') !== BRAND_SLUG) {
        document.documentElement.setAttribute('data-mj-extension-brand', BRAND_SLUG);
      }
      if (document.documentElement.getAttribute('data-mj-extension-assistant') !== ASSISTANT_NAME) {
        document.documentElement.setAttribute('data-mj-extension-assistant', ASSISTANT_NAME);
      }
    }
  }

  function extractMjHostSession() {
    let idToken = '';
    let graphQLUrl = '';
    let conversationId = (document.documentElement && document.documentElement.getAttribute('data-mj-active-conversation-id')) || '';
    let sessionId = (document.documentElement && document.documentElement.getAttribute('data-mj-active-session-id')) || '';

    try {
      const urlObj = new URL(window.location.href);
      if (!conversationId) {
        conversationId = urlObj.searchParams.get('conversationId') || urlObj.searchParams.get('ConversationID') || '';
      }
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || '';
          const rawVal = localStorage.getItem(key) || '';
          if (!rawVal) continue;
          if (!idToken && rawVal.includes('"credentialType":"IdToken"')) {
            try {
              const parsed = JSON.parse(rawVal);
              if (parsed && typeof parsed.secret === 'string' && parsed.secret.split('.').length === 3) {
                idToken = parsed.secret;
              }
            } catch {}
          } else if (!idToken && key.startsWith('@@auth0spajs@@')) {
            try {
              const parsed = JSON.parse(rawVal);
              if (parsed && parsed.body && (parsed.body.id_token || parsed.body.access_token)) {
                idToken = parsed.body.id_token || parsed.body.access_token;
              }
            } catch {}
          }
        }
      }
      if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
        const entries = performance.getEntriesByType('resource') || [];
        for (let i = entries.length - 1; i >= 0; i--) {
          const name = (entries[i] && entries[i].name) || '';
          if (!name) continue;
          if (name.includes('/graphql') || name.startsWith('http://localhost:40') || name.startsWith('http://localhost:41')) {
            graphQLUrl = name.split('?')[0];
            break;
          }
        }
      }
      if (!graphQLUrl && window.location.hostname === 'localhost') {
        const portNum = Number(window.location.port || '0');
        if (portNum >= 4201 && portNum <= 4299) {
          graphQLUrl = 'http://localhost:' + String(portNum - 100) + '/';
        } else if (portNum === 4200) {
          graphQLUrl = 'http://localhost:4000/graphql';
        }
      }
    } catch {}

    return {
      Success: true,
      HasHostSession: Boolean(idToken || conversationId || sessionId),
      IdToken: idToken || null,
      GraphQLUrl: graphQLUrl || null,
      ConversationID: conversationId || null,
      LastSessionID: sessionId || null,
      Origin: window.location.origin,
      Url: window.location.href
    };
  }

  function activateEmbeddedConversationsOverlay() {
    if (!IS_EMBED_AGENT_FRAME) {
      return;
    }
    const styleId = 'mj-ext-agent-embed-style';
    const injectEmbedCss = () => {
      if (!document.head || document.getElementById(styleId)) return;
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = \`
        .shell-header,
        .shell-sidebar,
        .tab-bar,
        .chat-overlay-bubble,
        .chat-overlay-sliver,
        .chat-overlay-panel .resize-handle,
        .chat-overlay-panel .chat-overlay-header-btn[title="Minimize"],
        .chat-overlay-panel .chat-overlay-header-btn[title="Maximize"],
        .chat-overlay-panel .chat-overlay-header-btn[title="Restore size"],
        .workspace-navigation {
          display: none !important;
        }
        mj-chat-agents-overlay .chat-overlay-panel {
          position: fixed !important;
          inset: 0 !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          border-radius: 0 !important;
          border: none !important;
          box-shadow: none !important;
          z-index: 2147483647 !important;
        }
        mj-conversation-workspace,
        .conversation-workspace {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483646 !important;
          background: var(--mj-bg-surface, #ffffff) !important;
        }
      \`;
      document.head.appendChild(st);
    };
    injectEmbedCss();

    // Inject Main-World bridge so any MJExplorer build (even one on another worktree) registers
    // the 5 Browser Extension Client Tools on ConversationsRuntime.Instance.Tools and expands the overlay
    const injectMainWorldBridge = () => {
      if (!document.head || document.getElementById('mj-ext-mainworld-bridge')) return;
      const scriptEl = document.createElement('script');
      scriptEl.id = 'mj-ext-mainworld-bridge';
      scriptEl.textContent = \`
        (() => {
          const forwardCmd = (commandType, commandPayload) => new Promise((resolve) => {
            const requestId = 'mj-ext-mw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            const t = setTimeout(() => {
              document.removeEventListener('mj-ext-response', onRes);
              resolve({ Success: false, ErrorMessage: 'Timed out waiting for browser extension' });
            }, 8000);
            const onRes = (ev) => {
              if (!ev.detail || ev.detail.RequestId !== requestId) return;
              clearTimeout(t);
              document.removeEventListener('mj-ext-response', onRes);
              resolve(ev.detail.Result || { Success: true });
            };
            document.addEventListener('mj-ext-response', onRes);
            document.dispatchEvent(new CustomEvent('mj-ext-command', {
              detail: {
                RequestId: requestId,
                Type: 'MJ_EXT_FORWARD_TO_ACTIVE_TAB',
                Payload: { CommandType: commandType, CommandPayload: commandPayload || {} }
              }
            }));
          });

          const specs = [
            { Name: 'GetActiveTabPageState', Description: 'Reads active browser tab URL, title, signals, and interactive elements.', ParameterSchema: { type: 'object', properties: {} }, CommandType: 'MJ_CS_GET_PAGE_STATE' },
            { Name: 'HighlightElementOnPage', Description: 'Draws a Coach-Mark Spotlight ring and instruction callout around an element on the active browser tab.', ParameterSchema: { type: 'object', properties: { Selector: { type: 'string' }, Index: { type: 'number' }, Label: { type: 'string' }, StepBadge: { type: 'string' } }, required: ['Label'] }, CommandType: 'MJ_CS_HIGHLIGHT_ELEMENT' },
            { Name: 'ClearPageHighlights', Description: 'Clears all Coach-Mark Spotlight rings on the active browser tab.', ParameterSchema: { type: 'object', properties: {} }, CommandType: 'MJ_CS_CLEAR_HIGHLIGHTS' },
            { Name: 'ClickElementOnPage', Description: 'Clicks an interactive element on the active browser tab by Selector or Index.', ParameterSchema: { type: 'object', properties: { Selector: { type: 'string' }, Index: { type: 'number' } } }, CommandType: 'MJ_CS_CLICK_ELEMENT' },
            { Name: 'FillInputOnPage', Description: 'Fills text into an input on the active browser tab by Selector or Index.', ParameterSchema: { type: 'object', properties: { Selector: { type: 'string' }, Index: { type: 'number' }, Value: { type: 'string' }, PressEnter: { type: 'boolean' } }, required: ['Value'] }, CommandType: 'MJ_CS_FILL_INPUT' }
          ];

          const syncRuntime = () => {
            const rt = window['___SINGLETON__ConversationsRuntime'];
            if (rt && rt.Tools && typeof rt.Tools.Register === 'function') {
              specs.forEach((s) => {
                if (!rt.Tools.GetTool(s.Name)) {
                  rt.Tools.Register({
                    Name: s.Name,
                    Description: s.Description,
                    ParameterSchema: s.ParameterSchema,
                    Handler: async (params) => {
                      const res = await forwardCmd(s.CommandType, params);
                      const ok = res && res.Success !== false;
                      return { Success: ok, Data: res, ErrorMessage: ok ? undefined : String((res && res.ErrorMessage) || 'Failed') };
                    }
                  });
                }
              });
            }
            if (rt && rt.Bridge && typeof rt.Bridge.RequestExpandOverlay === 'function') {
              rt.Bridge.RequestExpandOverlay();
            }
          };

          syncRuntime();
          const timer = setInterval(syncRuntime, 1000);
          setTimeout(() => clearInterval(timer), 30000);

          document.addEventListener('mj-ext-active-tab-context', (ev) => {
            const detail = ev && ev.detail;
            if (!detail) return;
            syncRuntime();
            try {
              if (window.ng && typeof window.ng.getComponent === 'function') {
                const overlayEl = document.querySelector('mj-chat-agents-overlay');
                const overlayComp = overlayEl ? window.ng.getComponent(overlayEl) : null;
                if (overlayComp) {
                  overlayComp.AppContext = {
                    ...(overlayComp.AppContext || {}),
                    BrowserExtensionActiveTab: detail,
                    AdditionalContext: {
                      ...((overlayComp.AppContext && overlayComp.AppContext.AdditionalContext) || {}),
                      BrowserExtensionActiveTab: detail
                    }
                  };
                  if (overlayComp.cdr) overlayComp.cdr.detectChanges();
                }
                const chatAreaEl = document.querySelector('mj-conversation-chat-area');
                const chatAreaComp = chatAreaEl ? window.ng.getComponent(chatAreaEl) : null;
                if (chatAreaComp) {
                  chatAreaComp.AppContext = {
                    ...(chatAreaComp.AppContext || {}),
                    BrowserExtensionActiveTab: detail,
                    AdditionalContext: {
                      ...((chatAreaComp.AppContext && chatAreaComp.AppContext.AdditionalContext) || {}),
                      BrowserExtensionActiveTab: detail
                    }
                  };
                  if (chatAreaComp.cdr) chatAreaComp.cdr.detectChanges();
                }
              }
            } catch {}
          });
        })();
      \`;
      document.head.appendChild(scriptEl);
    };

    const tryExpandOverlay = () => {
      injectEmbedCss();
      injectMainWorldBridge();
      const panel = document.querySelector('mj-chat-agents-overlay .chat-overlay-panel');
      if (panel) {
        if (!panel.classList.contains('maximized')) {
          const maxBtn = panel.querySelector('.chat-overlay-header-btn[title="Maximize"]');
          if (maxBtn instanceof HTMLElement) maxBtn.click();
        }
        return;
      }
      // Step 2: Sliver uses standard (click)="Expand()" without setPointerCapture
      const sliver = document.querySelector('mj-chat-agents-overlay .chat-overlay-sliver');
      if (sliver instanceof HTMLElement) {
        sliver.click();
        return;
      }
      // Step 1: Close button on bubble uses standard (click)="Hide($event)" which transitions bubble -> sliver
      const closeBtn = document.querySelector('mj-chat-agents-overlay .chat-overlay-bubble-close');
      if (closeBtn instanceof HTMLElement) {
        closeBtn.click();
      }
    };

    tryExpandOverlay();
    const timer = setInterval(tryExpandOverlay, 350);
    setTimeout(() => clearInterval(timer), 30000);

    window.addEventListener('message', (ev) => {
      const data = ev && ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.Type === 'MJ_EXT_PUSH_TAB_CONTEXT' && data.Payload) {
        document.dispatchEvent(new CustomEvent('mj-ext-active-tab-context', { detail: data.Payload }));
      } else if (data.Type === 'MJ_EXT_RESUME_CONVERSATION' && data.Payload) {
        resumeConversationInHost(data.Payload);
      }
    });
  }

  function resumeConversationInHost(payload) {
    const convId = payload && payload.ConversationID ? String(payload.ConversationID) : '';
    if (!convId) {
      return { Success: false, ErrorMessage: 'ConversationID is required.' };
    }
    if (document.documentElement) {
      document.documentElement.setAttribute('data-mj-active-conversation-id', convId);
    }
    document.dispatchEvent(new CustomEvent('mj-ext-resume-conversation', {
      detail: {
        ConversationID: convId,
        MessageID: payload && payload.MessageID ? String(payload.MessageID) : undefined
      }
    }));
    return { Success: true, ConversationID: convId };
  }

  function handleCommand(cmd) {
    ensureReadyAttributes();
    const p = cmd.Payload || {};
    switch (cmd.Type) {
      case 'MJ_CS_GET_PAGE_STATE':
        return extractPageState();
      case 'MJ_CS_HIGHLIGHT_ELEMENT':
        return highlightElement(p);
      case 'MJ_CS_CLEAR_HIGHLIGHTS':
        return clearHighlights();
      case 'MJ_CS_CLICK_ELEMENT':
        return clickElement(p);
      case 'MJ_CS_FILL_INPUT':
        return fillInput(p);
      case 'MJ_CS_GET_MJ_HOST_SESSION':
        return extractMjHostSession();
      case 'MJ_CS_RESUME_CONVERSATION':
        return resumeConversationInHost(p);
      case 'MJ_EXT_PING':
        return {
          Installed: true,
          Version: '6.2.0',
          BrandSlug: BRAND_SLUG,
          ActiveTopology: 'topology-a-shared-daemon'
        };
      case 'MJ_EXT_SESSION_HANDOFF':
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ Type: 'MJ_EXT_HOST_SYNC', Payload: p }).catch(() => {});
        }
        return {
          Accepted: true,
          ActiveTopology: (p && p.Topology) || 'topology-a-shared-daemon',
          ZeroBlipGuaranteed: true,
          ExtensionVersion: '6.2.0',
          BrandSlug: BRAND_SLUG
        };
      default:
        return { Success: false, ErrorMessage: 'Unknown command: ' + cmd.Type };
    }
  }

  ensureReadyAttributes();
  activateEmbeddedConversationsOverlay();
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    const attrObserver = new MutationObserver(() => ensureReadyAttributes());
    attrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mj-extension-content-script', 'data-mj-extension-brand']
    });
  }

  // Forward live MJExplorer conversation & realtime session updates (mj-ext-host-sync) to the extension
  document.addEventListener('mj-ext-host-sync', (ev) => {
    const detail = (ev && ev.detail) || {};
    const hostSession = extractMjHostSession();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        Type: 'MJ_EXT_HOST_SYNC',
        Payload: {
          ConversationID: detail.ConversationID || hostSession.ConversationID,
          LastSessionID: detail.LastSessionID || hostSession.LastSessionID,
          IdToken: hostSession.IdToken,
          GraphQLUrl: hostSession.GraphQLUrl,
          Origin: hostSession.Origin
        }
      }).catch(() => {});
    }
  });

  // Listen to custom DOM command events so both Main World and Extension World can exchange structured messages
  document.addEventListener('mj-ext-command', (ev) => {
    const detail = ev.detail || {};
    const requestId = detail.RequestId || 'default';
    if (detail.Type === 'MJ_EXT_FORWARD_TO_ACTIVE_TAB') {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          Type: 'MJ_EXT_FORWARD_TO_ACTIVE_TAB',
          Payload: detail.Payload || {}
        }).then((res) => {
          document.dispatchEvent(new CustomEvent('mj-ext-response', {
            detail: { RequestId: requestId, Result: res || { Success: false, ErrorMessage: 'No response from active tab' } }
          }));
        }).catch((err) => {
          document.dispatchEvent(new CustomEvent('mj-ext-response', {
            detail: { RequestId: requestId, Result: { Success: false, ErrorMessage: String(err) } }
          }));
        });
        return;
      }
    }
    const result = handleCommand(detail);
    document.dispatchEvent(new CustomEvent('mj-ext-response', {
      detail: { RequestId: requestId, Result: result }
    }));
  });

  // Only the top-level document frame should ever respond to tab-level MJ_CS_* / MJ_EXT_* messages
  if (IS_TOP_FRAME && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && typeof msg.Type === 'string' && (msg.Type.startsWith('MJ_CS_') || msg.Type.startsWith('MJ_EXT_'))) {
        sendResponse(handleCommand(msg));
        return true;
      }
    });
  }
})();
`;
    }

    private generateServiceWorkerBundle(profile: ExtensionBrandProfile): string {
        return `// Generated by @memberjunction/browser-extension-builder for brand "${profile.BrandSlug}" (${profile.Version})
const BRAND_SLUG = ${JSON.stringify(profile.BrandSlug)};
const EXTENSION_VERSION = ${JSON.stringify(profile.Version)};
const extApi = globalThis.browser ?? globalThis.chrome;
let lastActiveWebTabId = null;

function isWebTargetTab(tab) {
  if (!tab || !tab.id || !tab.url) return false;
  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false;
  if (tab.url.includes('mj_ext_agent_embed=1')) return false;
  return true;
}

if (extApi && extApi.sidePanel && extApi.sidePanel.setPanelBehavior) {
  extApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else if (extApi && extApi.sidebarAction && extApi.sidebarAction.setPanel) {
  extApi.sidebarAction.setPanel({ panel: 'sidepanel.html' }).catch(() => {});
}

// Automatically inject content-script.js into already-open http/https tabs when the extension is loaded or reloaded
async function injectIntoExistingTabs() {
  if (!extApi || !extApi.tabs || !extApi.scripting) return;
  try {
    const tabs = await extApi.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        extApi.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-script.js']
        }).catch(() => {});
      }
    }
  } catch {}
}

if (extApi && extApi.runtime && extApi.runtime.onInstalled) {
  extApi.runtime.onInstalled.addListener(() => {
    injectIntoExistingTabs();
  });
}

async function forwardCommandToActiveWebTab(commandType, commandPayload) {
  if (!extApi || !extApi.tabs) {
    return { Success: false, ErrorMessage: 'Tabs API unavailable' };
  }
  try {
    const activeTabs = await extApi.tabs.query({ active: true, currentWindow: true });
    let targetTab = activeTabs.find(isWebTargetTab) || null;
    if (!targetTab && lastActiveWebTabId) {
      try {
        const candidate = await extApi.tabs.get(lastActiveWebTabId);
        if (isWebTargetTab(candidate)) targetTab = candidate;
      } catch {}
    }
    if (!targetTab) {
      const allTabs = await extApi.tabs.query({ currentWindow: true });
      targetTab = allTabs.find(isWebTargetTab) || null;
    }
    if (!targetTab || !targetTab.id) {
      return { Success: false, ErrorMessage: 'No active web tab found' };
    }
    try {
      return await extApi.tabs.sendMessage(
        targetTab.id,
        { Type: commandType, Payload: commandPayload || {} },
        { frameId: 0 }
      );
    } catch {
      if (extApi.scripting) {
        await extApi.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['content-script.js']
        });
        return await extApi.tabs.sendMessage(
          targetTab.id,
          { Type: commandType, Payload: commandPayload || {} },
          { frameId: 0 }
        );
      }
    }
  } catch (err) {
    return { Success: false, ErrorMessage: err && err.message ? err.message : String(err) };
  }
  return { Success: false, ErrorMessage: 'Failed to reach content script' };
}

if (extApi && extApi.runtime && extApi.runtime.onMessage) {
  extApi.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.Type === 'MJ_EXT_HOST_SYNC' && msg.Payload) {
      if (extApi.storage && extApi.storage.local) {
        extApi.storage.local.set({ mj_ext_handoff_session: msg.Payload }).catch(() => {});
      }
      return false;
    }
    if (msg && msg.Type === 'MJ_EXT_FORWARD_TO_ACTIVE_TAB' && msg.Payload) {
      forwardCommandToActiveWebTab(msg.Payload.CommandType, msg.Payload.CommandPayload).then((res) => {
        sendResponse(res);
      });
      return true;
    }
    return false;
  });
}

if (extApi && extApi.tabs) {
  extApi.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await extApi.tabs.get(activeInfo.tabId);
      if (isWebTargetTab(tab)) {
        lastActiveWebTabId = tab.id;
      }
    } catch {}
    extApi.runtime.sendMessage({
      Type: 'MJ_EXT_ACTIVE_TAB_UPDATED',
      TabId: activeInfo.tabId
    }).catch(() => {});
  });
  extApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (isWebTargetTab(tab)) {
      lastActiveWebTabId = tabId;
    }
    if (changeInfo.status === 'complete' || changeInfo.url) {
      extApi.runtime.sendMessage({
        Type: 'MJ_EXT_ACTIVE_TAB_UPDATED',
        TabId: tabId,
        Url: tab.url
      }).catch(() => {});
    }
  });
}

if (extApi && extApi.runtime && extApi.runtime.onMessageExternal) {
  extApi.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.Type === 'MJ_EXT_PING') {
      sendResponse({
        Installed: true,
        Version: EXTENSION_VERSION,
        BrandSlug: BRAND_SLUG,
        ActiveTopology: 'topology-a-shared-daemon'
      });
      return true;
    }
    if (msg && msg.Type === 'MJ_EXT_SESSION_HANDOFF') {
      if (extApi.storage && extApi.storage.local && msg.Payload) {
        extApi.storage.local.set({ mj_ext_handoff_session: msg.Payload }).catch(() => {});
      }
      sendResponse({
        Accepted: true,
        ActiveTopology: (msg.Payload && msg.Payload.Topology) || 'topology-a-shared-daemon',
        ZeroBlipGuaranteed: true,
        ExtensionVersion: EXTENSION_VERSION,
        BrandSlug: BRAND_SLUG
      });
      return true;
    }
  });
}
`;
    }

    private generateSidePanelHtml(profile: ExtensionBrandProfile): string {
        const agentTabLabel = profile.AgentTabLabel ?? 'Agent';
        return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-theme-overlay="${profile.BrandSlug}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${profile.BrandName}</title>
  <link rel="stylesheet" href="brand-theme.css" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: var(--mj-bg-surface, #f8fafc);
      color: var(--mj-text-primary, #0f172a);
      font-family: var(--mj-font-family-base, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: 13px;
    }
    .mj-sidepanel-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .mj-sidepanel-header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
      background: var(--mj-bg-surface-card, #ffffff);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .mj-brand-identity {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .mj-brand-mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--mj-brand-primary, ${profile.ThemeSeeds.primary}), #0369a1);
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.22);
    }
    .mj-sidepanel-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--mj-text-primary, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mj-sidepanel-tagline {
      margin: 1px 0 0;
      font-size: 11px;
      color: var(--mj-text-secondary, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mj-auth-pill {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid var(--mj-border-default, #cbd5e1);
      background: var(--mj-bg-surface, #ffffff);
      color: var(--mj-text-primary, #0f172a);
      cursor: pointer;
      white-space: nowrap;
    }
    .mj-auth-pill.connected {
      border-color: #16a34a;
      color: #15803d;
      background: #f0fdf4;
    }
    .mj-auth-drawer {
      padding: 12px;
      background: var(--mj-bg-surface-card, #ffffff);
      border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
      display: none;
      flex-direction: column;
      gap: 8px;
    }
    .mj-auth-drawer.open {
      display: flex;
    }
    .mj-trust-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }
    .mj-host-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--mj-bg-surface-sunken, #f1f5f9);
      border: 1px solid var(--mj-border-default, #e2e8f0);
      color: var(--mj-text-secondary, #475569);
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mj-select {
      font-size: 11px;
      padding: 4px 6px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default, #cbd5e1);
      background: var(--mj-bg-surface, #ffffff);
      color: var(--mj-text-primary, #0f172a);
    }
    .mj-toolbar-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .mj-btn {
      font-size: 11px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 7px;
      border: 1px solid var(--mj-border-default, #cbd5e1);
      background: var(--mj-bg-surface, #ffffff);
      color: var(--mj-text-primary, #0f172a);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .mj-btn:hover {
      background: var(--mj-bg-surface-hover, #f1f5f9);
    }
    .mj-btn-primary {
      background: var(--mj-brand-primary, ${profile.ThemeSeeds.primary});
      color: #ffffff;
      border-color: var(--mj-brand-primary, ${profile.ThemeSeeds.primary});
    }
    .mj-btn-primary:hover {
      opacity: 0.94;
      background: var(--mj-brand-primary, ${profile.ThemeSeeds.primary});
    }
    .mj-btn-hero {
      width: 100%;
      padding: 9px 12px;
      font-size: 12px;
      font-weight: 700;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.2);
    }
    .mj-nav-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      padding: 6px 12px;
      gap: 6px;
      border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
      background: var(--mj-bg-surface-card, #ffffff);
    }
    .mj-nav-tab {
      padding: 6px 8px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-text-secondary, #475569);
      background: var(--mj-bg-surface-sunken, #f1f5f9);
      border: 1px solid transparent;
      border-radius: 7px;
      cursor: pointer;
    }
    .mj-nav-tab.active {
      color: var(--mj-brand-primary, ${profile.ThemeSeeds.primary});
      border-color: var(--mj-border-default, #cbd5e1);
      background: var(--mj-bg-surface, #ffffff);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .mj-main-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mj-card {
      border: 1px solid var(--mj-border-default, #e2e8f0);
      border-radius: 10px;
      background: var(--mj-bg-surface-card, #ffffff);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .mj-facet-accordion {
      padding: 0;
      overflow: hidden;
    }
    .mj-facet-accordion > summary {
      list-style: none;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: var(--mj-bg-surface-card, #ffffff);
      user-select: none;
    }
    .mj-facet-accordion > summary::-webkit-details-marker {
      display: none;
    }
    .mj-facet-body {
      padding: 0 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-top: 1px solid var(--mj-border-default, #f1f5f9);
    }
    .mj-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .mj-card-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--mj-text-primary, #0f172a);
    }
    .mj-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      background: #dbeafe;
      color: #1d4ed8;
    }
    .mj-badge-success {
      background: #dcfce7;
      color: #15803d;
    }
    .mj-badge-warn {
      background: #fef3c7;
      color: #b45309;
    }
    .mj-kv-grid {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 5px 8px;
      font-size: 12px;
    }
    .mj-kv-label {
      color: var(--mj-text-secondary, #64748b);
      font-weight: 500;
    }
    .mj-kv-value {
      color: var(--mj-text-primary, #0f172a);
      font-weight: 600;
      word-break: break-word;
    }
    .mj-facet-item {
      padding: 7px 9px;
      border-radius: 7px;
      background: var(--mj-bg-surface-sunken, #f8fafc);
      border: 1px solid var(--mj-border-default, #e2e8f0);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .mj-diff-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 6px;
      background: var(--mj-bg-surface-sunken, #f8fafc);
      font-size: 12px;
    }
    .mj-input {
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default, #cbd5e1);
      font-size: 12px;
    }
    .mj-status-toast {
      padding: 8px 10px;
      border-radius: 6px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
      font-size: 12px;
      font-weight: 600;
      display: none;
    }
    .mj-status-toast.visible {
      display: block;
    }
    .mj-el-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--mj-border-default, #f1f5f9);
      font-size: 11px;
    }
    .mj-embed-frame {
      width: 100%;
      flex: 1;
      min-height: 420px;
      border: 1px solid var(--mj-border-default, #e2e8f0);
      border-radius: 10px;
      background: #ffffff;
    }
    .mj-hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="mj-extension-sidepanel-root" class="mj-sidepanel-shell" data-brand-slug="${profile.BrandSlug}" data-assistant-name="${profile.AssistantDisplayName}" data-agent-tab-label="${agentTabLabel}">
    <header class="mj-sidepanel-header">
      <div class="mj-brand-identity">
        <div class="mj-brand-mark">${profile.ShortName.slice(0, 2).toUpperCase()}</div>
        <div style="min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:6px;">
            <h1 class="mj-sidepanel-title">${profile.AssistantDisplayName}</h1>
            <span id="mj-active-host-badge" class="mj-host-badge">🌐 Ready</span>
          </div>
          <p class="mj-sidepanel-tagline">${profile.Tagline}</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button id="mj-btn-resume-in-explorer" class="mj-btn" title="Switch to MJ Explorer and resume this conversation" style="padding:4px 7px;font-size:11px;">
          ↗ MJ Explorer
        </button>
        <button id="mj-btn-toggle-auth" class="mj-auth-pill" title="Sign In or Account Status">
          🔌 Sign In
        </button>
        <button id="mj-btn-toggle-settings" class="mj-btn" title="Connection & Page Guidance Settings" style="padding:4px 7px;">
          ⚙️
        </button>
      </div>
    </header>

    <section id="mj-auth-drawer" class="mj-auth-drawer open">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:12px;">Connect to MemberJunction</strong>
        <span id="mj-auth-mode-badge" class="mj-badge mj-badge-warn">Not Signed In</span>
      </div>
      <p id="mj-auth-helper-copy" style="margin:0;font-size:11px;color:var(--mj-text-secondary);">
        Sign in with one click using your open <strong>MemberJunction Explorer</strong> session (auto-detects your server &amp; active conversation).
      </p>
      <div id="mj-signed-in-user-bar" style="display:none;padding:6px 8px;border-radius:6px;background:#dcfce7;border:1px solid #86efac;color:#14532d;font-size:11px;align-items:center;justify-content:space-between;gap:6px;">
        <span id="mj-signed-in-user-label" style="font-weight:700;"></span>
        <button id="mj-btn-sign-out" class="mj-btn" style="padding:2px 6px;font-size:10px;">Sign Out</button>
      </div>
      <button id="mj-btn-sync-explorer-tab" class="mj-btn mj-btn-primary mj-btn-hero" title="Sign in automatically via your open MemberJunction Explorer tab">
        ⚡ Sign In via MemberJunction Explorer
      </button>
      <div id="mj-provider-catalog-list" style="display:flex;flex-direction:column;gap:4px;"></div>
      <details id="mj-auth-advanced-details" style="font-size:11px;color:var(--mj-text-secondary);margin-top:2px;">
        <summary style="cursor:pointer;font-weight:600;">Direct SSO &amp; Server Endpoint Options</summary>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
          <div class="mj-toolbar-actions">
            <button id="mj-btn-idp-msal" class="mj-btn">🔐 Sign In with Microsoft</button>
            <button id="mj-btn-idp-auth0" class="mj-btn">🔐 Sign In with Auth0</button>
            <button id="mj-btn-discover-catalog" class="mj-btn">🔄 Discover /auth/providers</button>
          </div>
          <label style="font-size:11px;color:var(--mj-text-secondary);">MJAPI GraphQL Endpoint URL</label>
          <input id="mj-input-api-url" class="mj-input" type="url" value="${profile.DefaultServerUrl ?? 'http://localhost:4000/graphql'}" placeholder="http://localhost:4115/ or http://localhost:4000/graphql" />
          <label style="font-size:11px;color:var(--mj-text-secondary);">Bearer Token (auto-filled from MJ Explorer)</label>
          <input id="mj-input-api-token" class="mj-input" type="password" placeholder="Auto-populated via MJ Explorer / MSAL / Auth0..." />
          <div class="mj-toolbar-actions">
            <button id="mj-btn-save-auth" class="mj-btn mj-btn-primary">Save &amp; Connect</button>
            <button id="mj-btn-open-explorer" class="mj-btn">Open MJ Explorer</button>
          </div>
        </div>
      </details>
    </section>

    <section id="mj-settings-drawer" class="mj-auth-drawer" style="display:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:11px;">Page Guidance &amp; Perception Controls</strong>
        <span style="font-size:10px;color:var(--mj-text-secondary);">Grounded Elements: <strong id="mj-el-count">0</strong></span>
      </div>
      <div class="mj-trust-row">
        <select id="mj-select-exposure" class="mj-select" title="Channel Exposure Ceiling">
          <option value="state" selected>Exposure: DOM State</option>
          <option value="pixels">Exposure: Pixels + DOM</option>
          <option value="none">Exposure: Paused (None)</option>
        </select>
        <select id="mj-select-backend" class="mj-select" title="Browser Control Mode">
          <option value="content-script" ${profile.DefaultControlBackend === 'content-script' ? 'selected' : ''}>Mode 1: Content Script</option>
          <option value="auto" ${profile.DefaultControlBackend === 'auto' ? 'selected' : ''}>Mode 3: Auto Escalation</option>
          <option value="debugger-cdp" ${profile.DefaultControlBackend === 'debugger-cdp' ? 'selected' : ''}>Mode 2: Debugger CDP</option>
        </select>
      </div>
      <div class="mj-toolbar-actions">
        <button id="mj-btn-scan-tab" class="mj-btn mj-btn-primary">🔄 Rescan Page</button>
        <button id="mj-btn-spotlight-main" class="mj-btn">🎯 Spotlight Header</button>
        <button id="mj-btn-clear-spotlight" class="mj-btn">🧹 Clear Spotlight</button>
      </div>
    </section>

    <div id="mj-status-toast" class="mj-status-toast" style="margin:6px 12px 0;"></div>

    <nav class="mj-nav-tabs">
      <button class="mj-nav-tab active" data-tab="context">Context</button>
      <button class="mj-nav-tab" data-tab="chat">${agentTabLabel}</button>
      <button class="mj-nav-tab" data-tab="playbooks">Actions</button>
    </nav>

    <main id="mj-sidepanel-context-view" class="mj-main-scroll">
      <div id="mj-sidepanel-tab-content" style="display:flex;flex-direction:column;gap:10px;flex:1;"></div>
      <div id="mj-sidepanel-embed-slot" class="mj-hidden" style="flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;"></div>
    </main>
  </div>
  <script src="sidepanel.js"></script>
</body>
</html>
`;
    }

    private generateSidePanelScript(profile: ExtensionBrandProfile): string {
        const agentTabLabel = profile.AgentTabLabel ?? 'Agent';
        return `// Side Panel Interactive Controller for ${profile.BrandName} (${profile.BrandSlug})
const ASSISTANT_NAME = ${JSON.stringify(profile.AssistantDisplayName)};
const AGENT_TAB_LABEL = ${JSON.stringify(agentTabLabel)};
const DEFAULT_BACKEND = ${JSON.stringify(profile.DefaultControlBackend)};

const root = document.getElementById('mj-extension-sidepanel-root');
if (root) {
  root.setAttribute('data-ready', 'true');
  root.setAttribute('data-default-backend', DEFAULT_BACKEND);
}

const state = {
  activeView: 'context',
  pageSnapshot: null,
  activeTabId: null,
  connectedServerUrl: ${JSON.stringify(profile.DefaultServerUrl ?? 'http://localhost:4115/')},
  apiToken: '',
  isSignedIn: false,
  mjapiOnline: false,
  explorerTabId: null,
  explorerOrigin: 'http://localhost:4215',
  explorerReachable: false,
  agentSurfaceMode: (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') ? 'direct' : 'embed',
  isVoiceListening: false,
  activeConversationId: null,
  activeConversationName: null,
  activeRealtimeSessionId: null,
  activeAgentId: null,
  installedApps: [],
  dynamicContextRules: [],
  dynamicEntityFacets: [],
  liveBraidedResult: null,
  capturedEntities: [],
  chatMessages: []
};

function showToast(msg) {
  const toast = document.getElementById('mj-status-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3800);
}

async function executeGraphQL(query, variables = {}) {
  const candidateUrls = [
    state.connectedServerUrl,
    'http://localhost:4115/',
    'http://localhost:4115/graphql',
    'http://localhost:4000/graphql',
    'http://localhost:4000/',
    'http://localhost:4103/',
    'http://localhost:4103/graphql'
  ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);

  const tokenInput = document.getElementById('mj-input-api-token');
  const token = state.apiToken || (tokenInput && tokenInput.value ? tokenInput.value.trim() : '');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = token.startsWith('Bearer ') ? token : ('Bearer ' + token);
  }

  for (const endpoint of candidateUrls) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables })
      });
      if (resp.ok) {
        const payload = await resp.json();
        if (payload && !payload.errors) {
          state.connectedServerUrl = endpoint;
          state.mjapiOnline = true;
          const urlInput = document.getElementById('mj-input-api-url');
          if (urlInput) urlInput.value = endpoint;
          return payload.data;
        }
      }
    } catch {
      // Try next candidate port
    }
  }
  return null;
}

async function runViewsViaGraphQL(viewInputs) {
  const query = \`
    query RunViewsQuery($input: [RunViewGenericInput!]!) {
      RunViews(input: $input) {
        Results {
          PrimaryKey { FieldName Value }
          EntityID
          Data
        }
        RowCount
        TotalRowCount
        Success
        ErrorMessage
      }
    }
  \`;
  const formattedInputs = viewInputs.map((v) => ({
    EntityName: v.EntityName,
    ExtraFilter: v.ExtraFilter || '',
    OrderBy: v.OrderBy || '',
    UserSearchString: '',
    IgnoreMaxRows: false,
    MaxRows: v.MaxRows || 10,
    ForceAuditLog: false,
    ResultType: 'simple'
  }));
  const data = await executeGraphQL(query, { input: formattedInputs });
  if (!data || !Array.isArray(data.RunViews)) return null;
  return data.RunViews.map((rv) => ({
    Success: Boolean(rv && rv.Success),
    TotalRowCount: (rv && rv.TotalRowCount) || 0,
    ErrorMessage: rv && rv.ErrorMessage,
    Results: Array.isArray(rv && rv.Results)
      ? rv.Results.map((r) => {
          try {
            return typeof r.Data === 'string' ? JSON.parse(r.Data) : (r.Data || r || {});
          } catch {
            return {};
          }
        })
      : []
  }));
}

async function searchKnowledgeViaGraphQL(searchTerms, maxResults = 5) {
  const cleanQuery = String(searchTerms || '').trim();
  if (!cleanQuery) return [];
  const mutation = \`
    mutation SearchKnowledge($query: String!, $maxResults: Float) {
      SearchKnowledge(query: $query, maxResults: $maxResults) {
        Success
        TotalCount
        ErrorMessage
        Results {
          ID
          EntityName
          EntityDisplayName
          RecordID
          SourceType
          Title
          Snippet
          Score
          RecordName
        }
      }
    }
  \`;
  const data = await executeGraphQL(mutation, { query: cleanQuery, maxResults });
  if (data && data.SearchKnowledge && data.SearchKnowledge.Success && Array.isArray(data.SearchKnowledge.Results)) {
    return data.SearchKnowledge.Results;
  }
  return [];
}

async function loadInstalledOpenAppMetadata() {
  const results = await runViewsViaGraphQL([
    { EntityName: 'MJ: Applications', ExtraFilter: '', MaxRows: 50 },
    { EntityName: 'MJ: AI Agents', ExtraFilter: '', MaxRows: 10 }
  ]);
  if (!results) return;

  const appRows = (results[0] && results[0].Results) || [];
  const agentRows = (results[1] && results[1].Results) || [];
  if (agentRows.length > 0 && !state.activeAgentId) {
    state.activeAgentId = agentRows[0].ID;
  }

  const rules = [];
  const facets = [];
  const appNames = [];

  for (const app of appRows) {
    if (app.Name) appNames.push(app.Name);
    if (!app.AgentSettings) continue;
    try {
      const parsed = typeof app.AgentSettings === 'string' ? JSON.parse(app.AgentSettings) : app.AgentSettings;
      const ext = parsed && parsed.BrowserExtension;
      if (ext && Array.isArray(ext.ContextRules)) {
        ext.ContextRules.forEach((r) => rules.push({ ...r, SourceApp: app.Name || 'MJ' }));
      }
      if (ext && Array.isArray(ext.EntityFacets)) {
        ext.EntityFacets.forEach((f) => facets.push({ ...f, SourceApp: app.Name || 'MJ' }));
      }
    } catch {}
  }

  state.installedApps = appNames;
  state.dynamicContextRules = rules;
  state.dynamicEntityFacets = facets;
}

async function loadActiveConversationFromMJAPI(conversationId) {
  if (!conversationId) return;
  state.activeConversationId = conversationId;
  const safeId = String(conversationId).replace(/'/g, "''");
  const results = await runViewsViaGraphQL([
    {
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: "ConversationID = '" + safeId + "'",
      OrderBy: '__mj_CreatedAt ASC',
      MaxRows: 30
    }
  ]);
  if (results && results[0] && results[0].Success && results[0].Results.length > 0) {
    state.chatMessages = results[0].Results.map((row) => ({
      sender: row.Role === 'User' ? 'You' : ASSISTANT_NAME,
      text: row.Message || '',
      detailId: row.ID
    }));
    renderActiveTab();
  }
}

function pushTabContextToEmbeddedAgent() {
  const frame = document.getElementById('mj-ext-agent-embed-frame');
  if (frame && frame.contentWindow && state.pageSnapshot) {
    try {
      frame.contentWindow.postMessage({
        Type: 'MJ_EXT_PUSH_TAB_CONTEXT',
        Payload: {
          Url: state.pageSnapshot.Url,
          Title: state.pageSnapshot.Title,
          Hostname: state.pageSnapshot.Hostname,
          CapturedSignals: state.pageSnapshot.CapturedSignals,
          BraidedContext: state.liveBraidedResult
        }
      }, '*');
    } catch {}
  }
}

async function syncWithOpenMjExplorerTab(silent = true) {
  if (typeof chrome === 'undefined' || !chrome.tabs) return false;
  try {
    const tabs = await chrome.tabs.query({
      url: ['http://localhost:*/*', 'https://*.memberjunction.com/*']
    });
    for (const tab of tabs) {
      if (!tab.id || (tab.url && tab.url.includes('mj_ext_agent_embed=1'))) continue;
      let hostSession = null;
      try {
        hostSession = await chrome.tabs.sendMessage(tab.id, { Type: 'MJ_CS_GET_MJ_HOST_SESSION' }, { frameId: 0 });
      } catch {
        if (chrome.scripting) {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] });
            hostSession = await chrome.tabs.sendMessage(tab.id, { Type: 'MJ_CS_GET_MJ_HOST_SESSION' }, { frameId: 0 });
          } catch {}
        }
      }
      if (hostSession && hostSession.Success) {
        state.explorerTabId = tab.id;
        if (hostSession.Origin) {
          state.explorerOrigin = hostSession.Origin;
          state.explorerReachable = true;
        }
        if (hostSession.GraphQLUrl) {
          state.connectedServerUrl = hostSession.GraphQLUrl;
          const urlInput = document.getElementById('mj-input-api-url');
          if (urlInput) urlInput.value = hostSession.GraphQLUrl;
        }
        if (hostSession.IdToken) {
          const claims = decodeJwtPayload(hostSession.IdToken) || {};
          applySignedInSession({
            provider: 'MJ Explorer',
            idToken: hostSession.IdToken,
            graphQLUrl: hostSession.GraphQLUrl || state.connectedServerUrl,
            explorerOrigin: hostSession.Origin || state.explorerOrigin,
            userName: claims.name || claims.preferred_username || claims.nickname || 'MJ User',
            email: claims.email || claims.preferred_username || ''
          });
        }
        if (hostSession.LastSessionID) {
          state.activeRealtimeSessionId = hostSession.LastSessionID;
        }
        if (hostSession.ConversationID && hostSession.ConversationID !== state.activeConversationId) {
          state.activeConversationId = hostSession.ConversationID;
          if (state.agentSurfaceMode === 'direct') {
            await loadActiveConversationFromMJAPI(hostSession.ConversationID);
          }
        }
        if (!silent) {
          if (hostSession.IdToken) {
            showToast('Signed in via MemberJunction Explorer (' + (hostSession.Origin || 'localhost') + ')!');
          } else {
            await chrome.tabs.update(tab.id, { active: true });
            showToast('Focused MemberJunction Explorer — complete sign-in there and it will sync automatically!');
          }
        }
        return Boolean(hostSession.IdToken);
      }
    }
  } catch {}
  if (!silent) {
    // Probe common local MJ Explorer ports (4215, 4200, 4203) and open a tab for the user
    const candidateExplorerUrls = ['http://localhost:4215', 'http://localhost:4200', 'http://localhost:4203'];
    let targetOpenUrl = state.explorerOrigin || 'http://localhost:4215';
    for (const candidate of candidateExplorerUrls) {
      try {
        const res = await fetch(candidate, { method: 'HEAD' });
        if (res.ok) {
          targetOpenUrl = candidate;
          state.explorerOrigin = candidate;
          state.explorerReachable = true;
          break;
        }
      } catch {}
    }
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: targetOpenUrl });
    }
    showToast('Opening MemberJunction Explorer (' + targetOpenUrl + ') — sign in there to connect automatically.');
  }
  return false;
}

async function resumeConversationInMjExplorer() {
  await syncWithOpenMjExplorerTab(true);
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (state.explorerTabId) {
      try {
        await chrome.tabs.update(state.explorerTabId, { active: true });
        if (state.activeConversationId) {
          await chrome.tabs.sendMessage(state.explorerTabId, {
            Type: 'MJ_CS_RESUME_CONVERSATION',
            Payload: { ConversationID: state.activeConversationId }
          }, { frameId: 0 });
          showToast('Switched to MJ Explorer & resumed conversation!');
          return;
        }
      } catch {}
    }
    const targetUrl = state.activeConversationId
      ? (state.explorerOrigin + '/?conversationId=' + encodeURIComponent(state.activeConversationId))
      : state.explorerOrigin;
    chrome.tabs.create({ url: targetUrl });
  }
}

async function getActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

async function sendToActiveTab(type, payload = {}) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    showToast('No active browser tab found.');
    return null;
  }
  state.activeTabId = tab.id;

  // Always target frameId: 0 (the top-level document frame) so third-party ad/tracker iframes never answer
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { Type: type, Payload: payload }, { frameId: 0 });
    if (res) return res;
  } catch {
    // If the tab was opened before the extension was loaded, dynamically inject content-script.js now!
    if (chrome.scripting && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-script.js']
        });
        const retryRes = await chrome.tabs.sendMessage(tab.id, { Type: type, Payload: payload }, { frameId: 0 });
        return retryRes;
      } catch {
        showToast('Cannot inspect restricted browser page (' + (tab.url || 'chrome://') + ').');
        return null;
      }
    }
  }
  return null;
}

/**
 * Extracts ONLY real DOM metadata signals from the active page snapshot.
 * Never fabricates or seeds synthetic deals, tasks, or CRM records.
 */
function extractLivePageSignals(snap) {
  const url = snap.Url || '';
  const host = snap.Hostname || '';
  const signals = snap.CapturedSignals || {};
  const og = snap.OpenGraph || {};
  const meta = snap.MetaTags || {};

  const isLinkedInProfile = host.includes('linkedin.com') && url.includes('/in/');
  const isLinkedInCompany = host.includes('linkedin.com') && url.includes('/company/');

  if (isLinkedInProfile) {
    let rawTitle = (snap.Title || '').split('|')[0].trim();
    if (rawTitle.startsWith('(') && rawTitle.indexOf(')') > 0) {
      rawTitle = rawTitle.slice(rawTitle.indexOf(')') + 1).trim();
    }
    const parts = rawTitle.split(' - ');
    const fullName = signals.PrimaryHeading || parts[0] || 'LinkedIn Profile';
    const headline = signals.Headline || parts.slice(1).join(' - ') || meta['description'] || '';
    const location = signals.Location || '';
    const handleMatch = url.split('/in/')[1] ? url.split('/in/')[1].split('/')[0].split('?')[0] : 'profile';
    const safeName = fullName.replace(/'/g, "''");
    const safeHandle = handleMatch.replace(/'/g, "''");

    const fields = {
      FullName: fullName,
      LinkedInURL: 'https://www.linkedin.com/in/' + handleMatch,
      SourceDomain: 'linkedin.com'
    };
    if (headline) fields.Title = headline;
    if (location) fields.Location = location;

    return {
      EntityType: 'Person Candidate',
      RuleName: 'common.person.linkedin',
      TargetEntityName: 'People',
      LookupFilter: "LinkedInURL LIKE '%" + safeHandle + "%' OR Name LIKE '%" + safeName + "%'",
      SearchQuery: fullName + ' ' + handleMatch,
      DisplayName: fullName,
      Subtitle: headline || ('linkedin.com/in/' + handleMatch),
      BadgeText: 'LinkedIn /in/' + handleMatch,
      MatchedInMJ: false,
      MatchedRecordID: null,
      MatchedEntityName: null,
      Fields: fields,
      Facets: []
    };
  }

  const orgName =
    (isLinkedInCompany && signals.PrimaryHeading) ||
    og['site_name'] ||
    og['og:site_name'] ||
    (snap.Title ? snap.Title.split(' - ')[0].split('|')[0].trim() : '') ||
    signals.HostnameRoot ||
    host ||
    'Active Web Page';

  const description =
    og['description'] ||
    meta['description'] ||
    signals.Headline ||
    (snap.VisibleTextExcerpt ? snap.VisibleTextExcerpt.slice(0, 160) : '');

  const cleanDomain = (signals.HostnameRoot || host || '').replace(/^www\\./, '').replace(/'/g, "''");
  const safeOrg = orgName.replace(/'/g, "''");

  const fields = {
    Name: orgName,
    Website: url,
    Domain: signals.HostnameRoot || host
  };
  if (description) {
    fields.Description = description.slice(0, 200);
  }

  return {
    EntityType: 'Web Domain',
    RuleName: 'common.organization.by-domain',
    TargetEntityName: 'Organizations',
    LookupFilter: cleanDomain
      ? ("Website LIKE '%" + cleanDomain + "%' OR Name LIKE '%" + safeOrg + "%'")
      : ("Name LIKE '%" + safeOrg + "%'"),
    SearchQuery: orgName + ' ' + cleanDomain,
    DisplayName: orgName,
    Subtitle: signals.HostnameRoot || host,
    BadgeText: signals.HostnameRoot || 'Web Domain',
    MatchedInMJ: false,
    MatchedRecordID: null,
    MatchedEntityName: null,
    Fields: fields,
    Facets: []
  };
}

async function resolveLiveMJBraiding(snap, baseBraided) {
  if (!state.isSignedIn) return baseBraided;
  if (state.installedApps.length === 0) {
    await loadInstalledOpenAppMetadata();
  }

  const matchingRule = state.dynamicContextRules.find(
    (r) =>
      r.RuleName === baseBraided.RuleName ||
      (r.EntityName && String(r.EntityName).toLowerCase().includes((baseBraided.TargetEntityName || '').toLowerCase())) ||
      (r.EntityResolution && r.EntityResolution.EntityName && String(r.EntityResolution.EntityName).toLowerCase().includes((baseBraided.TargetEntityName || '').toLowerCase()))
  );
  const ruleEntity =
    matchingRule && (matchingRule.EntityName || (matchingRule.EntityResolution && matchingRule.EntityResolution.EntityName));
  const anchorEntity =
    (ruleEntity && !String(ruleEntity).startsWith('MJ:') ? String(ruleEntity) : null) ||
    baseBraided.TargetEntityName ||
    'Organizations';

  const stage1Inputs = [
    {
      EntityName: anchorEntity,
      ExtraFilter: baseBraided.LookupFilter || '',
      MaxRows: 5
    }
  ];
  if (state.agentSurfaceMode === 'direct') {
    stage1Inputs.push({
      EntityName: 'MJ: Conversations',
      ExtraFilter: '',
      OrderBy: '__mj_UpdatedAt DESC',
      MaxRows: 5
    });
  }

  // Run Stage 1 RunViews against real business entities only (never MJ:* system metadata / MJ: Actions)
  const stage1Res = await runViewsViaGraphQL(stage1Inputs);

  const liveFacets = [];

  if (stage1Res) {
    const anchorRes = stage1Res[0];
    const convsRes = stage1Res[1];

    if (anchorRes && anchorRes.Success && anchorRes.Results.length > 0) {
      const matchedRecord = anchorRes.Results[0];
      baseBraided.MatchedInMJ = true;
      baseBraided.MatchedRecordID = matchedRecord.ID;
      baseBraided.MatchedEntityName = anchorEntity;
      if (matchedRecord.Name || matchedRecord.FullName) {
        baseBraided.DisplayName = matchedRecord.Name || matchedRecord.FullName;
      }
      baseBraided.EntityType = anchorEntity;

      // Stage 2: Query configured Open App EntityFacets ONLY when an anchor record actually matched in MJ!
      const matchingFacets = state.dynamicEntityFacets.filter(
        (f) =>
          (f.AnchorEntityName || f.ParentEntityName) === anchorEntity ||
          (f.AnchorEntityName || f.ParentEntityName) === baseBraided.TargetEntityName
      );
      if (matchingFacets.length > 0 && matchedRecord.ID) {
        const safeRecordId = String(matchedRecord.ID).replace(/'/g, "''");
        const stage2Views = matchingFacets.map((f) => {
          const querySpec = f.Query || f;
          const rawTemplate = querySpec.FilterTemplate || f.ForeignKeyFilterTemplate || '';
          const filter = rawTemplate
            ? String(rawTemplate).replace(/\\{\\{?AnchorRecordID\\}?\\}/g, safeRecordId)
            : f.ForeignKeyField
              ? (f.ForeignKeyField + " = '" + safeRecordId + "'")
              : '';
          return {
            EntityName: querySpec.EntityName || f.FacetEntityName || f.RelatedEntityName || 'People',
            ExtraFilter: filter,
            OrderBy: querySpec.OrderBy || f.OrderBy || '',
            MaxRows: querySpec.MaxRows || f.MaxRecords || 5
          };
        });
        const stage2Res = await runViewsViaGraphQL(stage2Views);
        if (stage2Res) {
          stage2Res.forEach((rv, idx) => {
            const spec = matchingFacets[idx];
            const querySpec = spec.Query || spec;
            const facetEntity = querySpec.EntityName || spec.FacetEntityName || spec.RelatedEntityName || 'Records';
            if (rv && rv.Success && rv.Results.length > 0) {
              liveFacets.push({
                App: spec.ApplicationName || spec.SourceApp || 'MJ Open App',
                Header: spec.HeaderLabel || spec.Title || facetEntity,
                Badge: rv.TotalRowCount + ' in MJ',
                Items: rv.Results.map((row) => ({
                  RecordID: row.ID,
                  EntityName: facetEntity,
                  Title: String(row[spec.TitleField || 'Name'] || row.Name || row.FullName || row.Title || row.ID || 'Record'),
                  Subtitle: spec.SubtitleField && row[spec.SubtitleField] ? String(row[spec.SubtitleField]) : (row.Status || row.Title || facetEntity),
                  Badge: spec.BadgeField && row[spec.BadgeField] ? String(row[spec.BadgeField]) : 'MJ Live'
                }))
              });
            }
          });
        }
      }
    }

    if (convsRes && convsRes.Success && convsRes.Results.length > 0) {
      const firstConv = convsRes.Results[0];
      if (firstConv && firstConv.Name) {
        state.activeConversationName = firstConv.Name;
      }
      if (firstConv && firstConv.ID && !state.activeConversationId) {
        await loadActiveConversationFromMJAPI(firstConv.ID);
      }
    }
  }

  baseBraided.Facets = liveFacets;
  return baseBraided;
}

function renderContextTab(container) {
  const snap = state.pageSnapshot;
  if (!snap) {
    container.innerHTML = \`
      <div class="mj-card">
        <h3 class="mj-card-title">No Active Web Page</h3>
        <p style="margin:0;color:var(--mj-text-secondary);">Switch to any browser tab to inspect live MemberJunction context.</p>
      </div>
    \`;
    return;
  }

  const braided = state.liveBraidedResult || extractLivePageSignals(snap);
  const fieldEntries = Object.entries(braided.Fields);
  const initials = String(braided.DisplayName || 'MJ')
    .split(/\\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const matchBadgeClass = braided.MatchedInMJ ? 'mj-badge mj-badge-success' : 'mj-badge mj-badge-warn';
  const matchBadgeLabel = braided.MatchedInMJ
    ? ('✓ In MemberJunction (' + (braided.MatchedEntityName || braided.TargetEntityName) + ')')
    : 'Not in MemberJunction';

  container.innerHTML = \`
    <div class="mj-card">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:40px;height:40px;border-radius:10px;background:var(--mj-brand-primary, #0076B6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">
          \${initials}
        </div>
        <div style="min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <h2 style="margin:0;font-size:15px;color:var(--mj-text-primary);">\${braided.DisplayName}</h2>
            <span class="\${matchBadgeClass}">\${matchBadgeLabel}</span>
          </div>
          <p style="margin:2px 0 0;font-size:12px;color:var(--mj-text-secondary);">\${braided.Subtitle}</p>
        </div>
      </div>
      <div class="mj-kv-grid" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--mj-border-default, #f1f5f9);">
        \${fieldEntries.map(([k, v]) => \`
          <div class="mj-kv-label">\${k}</div>
          <div class="mj-kv-value">\${v}</div>
        \`).join('')}
      </div>
      <div class="mj-toolbar-actions" style="margin-top:8px;">
        <button id="mj-btn-capture-entity" class="mj-btn mj-btn-primary">
          \${braided.MatchedInMJ ? '↗ Open Record in MJ Explorer' : '➕ Create in MemberJunction'}
        </button>
        <button id="mj-btn-ask-copilot-about" class="mj-btn">💬 Ask \${AGENT_TAB_LABEL}</button>
        <button id="mj-btn-highlight-anchor" class="mj-btn">🎯 Highlight on Page</button>
      </div>
    </div>

    \${braided.Facets.length > 0 ? braided.Facets.map(facet => \`
      <details open class="mj-card mj-facet-accordion">
        <summary>
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mj-text-secondary);display:block;">\${facet.App}</span>
            <span class="mj-card-title">\${facet.Header}</span>
          </div>
          <span class="mj-badge">\${facet.Badge}</span>
        </summary>
        <div class="mj-facet-body">
          \${facet.Items.map(item => \`
            <div class="mj-facet-item">
              <div style="min-width:0;flex:1;">
                <div style="font-weight:600;font-size:12px;">\${item.Title}</div>
                <div style="font-size:11px;color:var(--mj-text-secondary);">\${item.Subtitle}</div>
              </div>
              <span class="mj-badge mj-badge-success">\${item.Badge}</span>
            </div>
          \`).join('')}
        </div>
      </details>
    \`).join('') : \`
      <div class="mj-card" style="background:var(--mj-bg-surface-sunken, #f8fafc);border-style:dashed;">
        <div class="mj-card-header">
          <h3 class="mj-card-title" style="font-size:12px;color:var(--mj-text-secondary);">
            \${state.isSignedIn ? 'No Matching Records in MemberJunction' : 'Connect to MemberJunction for 360° Context'}
          </h3>
          <span class="mj-badge mj-badge-warn">\${state.isSignedIn ? '0 Matches' : 'Offline'}</span>
        </div>
        <p style="margin:0;font-size:11px;color:var(--mj-text-secondary);line-height:1.45;">
          \${state.isSignedIn
            ? ('We queried your MemberJunction instance for "' + braided.DisplayName + '" (' + (braided.Subtitle || snap.Hostname) + ') and found no existing records. Only real database records are shown here — never synthetic or mock data.')
            : 'Click "⚡ Sign In via MemberJunction Explorer" above to automatically query your Open Apps and Knowledge Hub as you browse.'}
        </p>
      </div>
    \`}

    <details class="mj-card" style="cursor:pointer;">
      <summary style="font-weight:700;font-size:12px;color:var(--mj-text-secondary);">
        Extracted Page Signals (\${fieldEntries.length} fields)
      </summary>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
        \${fieldEntries.map(([k, v]) => \`
          <label class="mj-diff-row">
            <input type="checkbox" checked />
            <span style="font-weight:700;min-width:85px;">\${k}</span>
            <span style="color:#15803d;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${v}</span>
          </label>
        \`).join('')}
      </div>
    </details>
  \`;

  const captureBtn = document.getElementById('mj-btn-capture-entity');
  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      if (braided.MatchedInMJ && braided.MatchedRecordID && typeof chrome !== 'undefined' && chrome.tabs) {
        const entityParam = encodeURIComponent(braided.MatchedEntityName || braided.TargetEntityName);
        const recordParam = encodeURIComponent(braided.MatchedRecordID);
        chrome.tabs.create({ url: state.explorerOrigin + '/?entity=' + entityParam + '&recordId=' + recordParam });
        return;
      }
      state.capturedEntities.push({
        entity: braided.TargetEntityName,
        name: braided.DisplayName,
        at: new Date().toLocaleTimeString()
      });
      // Switch to Agent tab and pre-fill creation request so the MJ Agent creates/enriches the record with real tools
      document.querySelectorAll('.mj-nav-tab').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-tab') === 'chat');
      });
      state.activeView = 'chat';
      renderActiveTab();
      showToast('Ready to create "' + braided.DisplayName + '" (' + braided.TargetEntityName + ') via ' + AGENT_TAB_LABEL + '!');
    });
  }

  const askBtn = document.getElementById('mj-btn-ask-copilot-about');
  if (askBtn) {
    askBtn.addEventListener('click', () => {
      document.querySelectorAll('.mj-nav-tab').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-tab') === 'chat');
      });
      state.activeView = 'chat';
      renderActiveTab();
    });
  }

  const highlightBtn = document.getElementById('mj-btn-highlight-anchor');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', async () => {
      const res = await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
        Selector: 'main h1, h1, input[type="search"], input[name="search"], a[href]',
        StepBadge: ASSISTANT_NAME,
        Label: braided.DisplayName
      });
      if (res && res.Success) {
        showToast('Highlighted "' + braided.DisplayName + '" on active page!');
      } else {
        await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
          Index: 0,
          StepBadge: ASSISTANT_NAME,
          Label: braided.DisplayName
        });
      }
    });
  }
}

function renderElementsTab(container) {
  const snap = state.pageSnapshot;
  const elements = (snap && snap.InteractiveElements) ? snap.InteractiveElements : [];
  if (elements.length === 0) {
    container.innerHTML = \`
      <div class="mj-card">
        <h3 class="mj-card-title">No Interactive Elements Grounded Yet</h3>
        <p style="margin:0;color:var(--mj-text-secondary);">Click <strong>🔄 Rescan Page</strong> to inspect interactive elements on the current tab.</p>
      </div>
    \`;
    return;
  }

  const slice = elements.slice(0, 40);
  container.innerHTML = \`
    <div class="mj-card">
      <div class="mj-card-header">
        <h3 class="mj-card-title">Grounded DOM Elements</h3>
        <span class="mj-badge">\${elements.length} total</span>
      </div>
      <div style="display:flex;flex-direction:column;margin-top:4px;">
        \${slice.map(el => \`
          <div class="mj-el-row">
            <div style="overflow:hidden;flex:1;">
              <strong>[#\${el.Index}]</strong> <span class="mj-badge">\${el.Role}</span>
              <span style="font-weight:600;margin-left:4px;">\${(el.Name || '(unnamed)').replace(/</g, '&lt;')}</span>
            </div>
            <button class="mj-btn mj-btn-spotlight-idx" data-idx="\${el.Index}" data-name="\${(el.Name || el.Role).replace(/"/g, '&quot;')}">🎯 Spotlight</button>
          </div>
        \`).join('')}
      </div>
    </div>
  \`;

  container.querySelectorAll('.mj-btn-spotlight-idx').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-idx'));
      const name = btn.getAttribute('data-name') || ('Element #' + idx);
      const res = await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
        Index: idx,
        StepBadge: 'Element #' + idx,
        Label: name
      });
      if (res && res.Success) {
        showToast('Spotlighted [#' + idx + '] "' + name + '" on page!');
      }
    });
  });
}

function renderPlaybooksTab(container) {
  const playbooks = [
    {
      id: 'linkedin-capture',
      title: 'LinkedIn Executive Capture & Braided Briefing',
      steps: [
        { badge: 'Step 1 of 3', label: 'Highlight Profile Heading & Verify Identity', selector: 'main h1, h1' },
        { badge: 'Step 2 of 3', label: 'Highlight Primary Connect / Message Action', selector: 'main button, button' },
        { badge: 'Step 3 of 3', label: 'Sync Extracted Profile Signals to MJ People', selector: 'body' }
      ]
    },
    {
      id: 'hubspot-oauth',
      title: 'Guided OAuth App Registration & Secret Vault Pipe',
      steps: [
        { badge: 'Step 1 of 3', label: 'Spotlight OAuth Redirect URI Input on Portal', selector: 'input, a[href]' },
        { badge: 'Step 2 of 3', label: 'Auto-Pause on Login / MFA Consent Screen', selector: 'button, a[href]' },
        { badge: 'Step 3 of 3', label: 'Copy Client Secret Directly to MJ Vault (Zero LLM Exposure)', selector: 'input, code' }
      ]
    }
  ];

  container.innerHTML = playbooks.map(pb => \`
    <div class="mj-card">
      <div class="mj-card-header">
        <h3 class="mj-card-title">\${pb.title}</h3>
        <span class="mj-badge">\${pb.steps.length} Steps</span>
      </div>
      \${pb.steps.map((st) => \`
        <div class="mj-facet-item">
          <div>
            <div style="font-weight:700;font-size:11px;color:var(--mj-brand-primary);">\${st.badge}</div>
            <div style="font-size:12px;">\${st.label}</div>
          </div>
          <button class="mj-btn mj-btn-run-step" data-selector="\${st.selector}" data-badge="\${st.badge}" data-label="\${st.label}">▶ Guide Me</button>
        </div>
      \`).join('')}
    </div>
  \`).join('');

  container.querySelectorAll('.mj-btn-run-step').forEach(btn => {
    btn.addEventListener('click', async () => {
      const selector = btn.getAttribute('data-selector');
      const badge = btn.getAttribute('data-badge');
      const label = btn.getAttribute('data-label');
      const res = await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
        Selector: selector,
        StepBadge: badge,
        Label: label
      });
      if (!res || !res.Success) {
        await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
          Index: 0,
          StepBadge: badge,
          Label: label
        });
      }
      showToast(badge + ': ' + label);
    });
  });
}

function renderChatTab(container) {
  const snap = state.pageSnapshot;
  const braided = state.liveBraidedResult || (snap ? extractLivePageSignals(snap) : null);
  const useEmbeddedOverlay = state.agentSurfaceMode === 'embed' && Boolean(state.explorerOrigin);
  const embedSrc = state.explorerOrigin + '/?mj_ext_agent_embed=1';

  const existingFrame = container.querySelector('#mj-ext-agent-embed-frame');
  if (useEmbeddedOverlay && existingFrame) {
    const titleEl = container.querySelector('#mj-embed-header-title');
    const subEl = container.querySelector('#mj-embed-header-subtitle');
    if (titleEl) {
      titleEl.textContent = state.activeConversationName
        ? ('🔄 ' + state.activeConversationName)
        : ('💬 ' + ASSISTANT_NAME + ' · @memberjunction/ng-conversations');
    }
    if (subEl) {
      subEl.textContent = state.activeRealtimeSessionId
        ? ('🎙️ Live Realtime Session: ' + state.activeRealtimeSessionId.slice(0, 8) + '...')
        : ('🌐 Context: ' + (braided ? braided.DisplayName : 'Active Tab') + ' · 5 Browser Tools Active');
    }
    pushTabContextToEmbeddedAgent();
    return;
  }

  container.innerHTML = \`
    <div class="mj-card" style="padding:8px 10px;background:var(--mj-bg-surface-sunken, #f8fafc);flex-direction:row;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <div style="min-width:0;flex:1;">
        <div id="mj-embed-header-title" style="font-size:11px;font-weight:700;color:var(--mj-text-primary);">
          \${state.activeConversationName ? ('🔄 ' + state.activeConversationName) : ('💬 ' + ASSISTANT_NAME + ' · @memberjunction/ng-conversations')}
        </div>
        <div id="mj-embed-header-subtitle" style="font-size:10px;color:var(--mj-text-secondary);">
          \${state.activeRealtimeSessionId
            ? ('🎙️ Live Realtime Session: ' + state.activeRealtimeSessionId.slice(0, 8) + '...')
            : ('🌐 Context: ' + (braided ? braided.DisplayName : 'Active Tab') + ' · 5 Browser Tools Active')}
        </div>
      </div>
      <div style="display:flex;gap:4px;">
        <button id="mj-btn-toggle-embed-widget" class="mj-btn" style="font-size:10px;padding:4px 7px;" title="Toggle embedded @memberjunction/ng-conversations overlay widget">
          \${useEmbeddedOverlay ? '💬 Thread View' : '⚡ Live MJ Widget'}
        </button>
        <button id="mj-btn-chat-resume-explorer" class="mj-btn mj-btn-primary" style="font-size:10px;padding:4px 8px;">
          ↗ MJ Explorer
        </button>
      </div>
    </div>

    \${useEmbeddedOverlay ? \`
      <iframe
        id="mj-ext-agent-embed-frame"
        name="mj-ext-agent-embed-frame"
        class="mj-embed-frame"
        src="\${embedSrc}"
        allow="microphone *; camera *; clipboard-read *; clipboard-write *; autoplay *"
        title="\${ASSISTANT_NAME} Embedded Conversations Widget"
      ></iframe>
    \` : \`
      <div class="mj-card" style="flex:1;display:flex;flex-direction:column;justify-content:space-between;min-height:320px;">
        <div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;">
          \${state.chatMessages.length > 0 ? state.chatMessages.map(m => \`
            <div style="padding:8px 10px;border-radius:8px;background:\${m.sender === 'You' ? '#dbeafe' : 'var(--mj-bg-surface-sunken, #f1f5f9)'};align-self:\${m.sender === 'You' ? 'flex-end' : 'flex-start'};max-width:92%;">
              <div style="font-size:10px;font-weight:700;color:var(--mj-text-secondary);">\${m.sender}</div>
              <div style="font-size:12px;margin-top:2px;white-space:pre-wrap;">\${m.text}</div>
            </div>
          \`).join('') : \`
            <div style="padding:12px;border-radius:8px;background:var(--mj-bg-surface-sunken, #f8fafc);color:var(--mj-text-secondary);font-size:12px;line-height:1.45;">
              <strong>\${ASSISTANT_NAME}</strong> has live context on <strong>\${braided ? braided.DisplayName : 'this page'}</strong> and can inspect the DOM, highlight elements, click, fill inputs, or query your MemberJunction records via text or voice.
            </div>
          \`}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">
          <div class="mj-toolbar-actions">
            <button class="mj-btn mj-chat-chip" data-prompt="Summarize this page and any matching MemberJunction records">✨ Page &amp; MJ Briefing</button>
            <button class="mj-btn mj-chat-chip" data-prompt="Spotlight the primary action on this page">🎯 Spotlight Action</button>
          </div>
          <div style="display:flex;gap:6px;">
            <button id="mj-chat-voice-btn" class="mj-btn" title="Speak to \${ASSISTANT_NAME} (Voice Input)">
              \${state.isVoiceListening ? '🔴 Listening...' : '🎙️'}
            </button>
            <input id="mj-chat-input" class="mj-input" type="text" placeholder="Ask \${ASSISTANT_NAME} about \${braided ? braided.DisplayName : 'this page'}..." />
            <button id="mj-chat-send" class="mj-btn mj-btn-primary">Send</button>
          </div>
        </div>
      </div>
    \`}
  \`;

  const embedFrame = document.getElementById('mj-ext-agent-embed-frame');
  if (embedFrame) {
    embedFrame.addEventListener('load', () => {
      pushTabContextToEmbeddedAgent();
    });
  }

  document.getElementById('mj-btn-toggle-embed-widget')?.addEventListener('click', () => {
    state.agentSurfaceMode = useEmbeddedOverlay ? 'direct' : 'embed';
    if (container) container.innerHTML = '';
    renderActiveTab();
  });

  document.getElementById('mj-btn-chat-resume-explorer')?.addEventListener('click', () => {
    resumeConversationInMjExplorer();
  });

  const handleSend = async (promptText) => {
    const text = (promptText || '').trim();
    if (!text) return;
    state.chatMessages.push({ sender: 'You', text });
    renderActiveTab();

    if (text.toLowerCase().includes('spotlight') || text.toLowerCase().includes('show me where')) {
      const hlRes = await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
        Index: 0,
        StepBadge: ASSISTANT_NAME,
        Label: ASSISTANT_NAME + ' Highlighted Action'
      });
      state.chatMessages.push({
        sender: ASSISTANT_NAME,
        text: hlRes && hlRes.Success
          ? ('Highlighted the primary interactive element on ' + (snap ? snap.Hostname : 'the page') + '.')
          : 'Could not locate an interactive element to highlight on this tab.'
      });
      renderActiveTab();
      return;
    }

    if (!state.isSignedIn) {
      state.chatMessages.push({
        sender: ASSISTANT_NAME,
        text: 'Please click "⚡ Sign In via MemberJunction Explorer" above to connect to your live MemberJunction server.'
      });
      renderActiveTab();
      return;
    }

    if (state.activeConversationId) {
      await executeGraphQL(
        \`mutation CreateDetail($input: CreateMJConversationDetailInput!) {
          CreateMJConversationDetail(input: $input) { ID ConversationID Message }
        }\`,
        {
          input: {
            ConversationID: state.activeConversationId,
            Message: text,
            Role: 'User'
          }
        }
      );
    }

    const systemPrompt =
      'You are ' + ASSISTANT_NAME + ', the MemberJunction AI Browser Agent. ' +
      'Active Browser Tab: ' + (snap ? (snap.Title + ' (' + snap.Url + ')') : 'Unknown') + '. ' +
      'Visible Page Excerpt: ' + (snap && snap.VisibleTextExcerpt ? snap.VisibleTextExcerpt.slice(0, 1500) : 'None') + '. ' +
      'MemberJunction Context Dossier: ' + (braided ? JSON.stringify({
        DisplayName: braided.DisplayName,
        MatchedInMJ: braided.MatchedInMJ,
        MatchedEntityName: braided.MatchedEntityName,
        Fields: braided.Fields,
        Facets: braided.Facets
      }) : 'None') + '. ' +
      'Provide a concise, accurate response based only on the real page content and real MemberJunction records.';

    const aiData = await executeGraphQL(
      \`mutation ExecuteSimplePrompt($systemPrompt: String!, $messages: String) {
        ExecuteSimplePrompt(systemPrompt: $systemPrompt, messages: $messages) {
          success result error
        }
      }\`,
      {
        systemPrompt,
        messages: JSON.stringify([{ role: 'user', message: text }])
      }
    );

    if (aiData && aiData.ExecuteSimplePrompt && aiData.ExecuteSimplePrompt.success && aiData.ExecuteSimplePrompt.result) {
      const replyText = aiData.ExecuteSimplePrompt.result;
      state.chatMessages.push({
        sender: ASSISTANT_NAME,
        text: replyText
      });
      if (state.activeConversationId) {
        await executeGraphQL(
          \`mutation CreateAssistantDetail($input: CreateMJConversationDetailInput!) {
            CreateMJConversationDetail(input: $input) { ID }
          }\`,
          {
            input: {
              ConversationID: state.activeConversationId,
              Message: replyText,
              Role: 'AI'
            }
          }
        );
      }
      renderActiveTab();
      return;
    }

    const errMsg = (aiData && aiData.ExecuteSimplePrompt && aiData.ExecuteSimplePrompt.error) || 'Could not reach MJAPI ExecuteSimplePrompt.';
    state.chatMessages.push({
      sender: ASSISTANT_NAME,
      text: 'MJAPI Error: ' + errMsg + ' (Tip: Click "⚡ Live MJ Widget" above to use the full MJ Explorer conversation overlay).'
    });
    renderActiveTab();
  };

  const voiceBtn = document.getElementById('mj-chat-voice-btn');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        state.agentSurfaceMode = 'embed';
        renderActiveTab();
        showToast('Switched to Embedded MJ Widget for LiveKit / Realtime Voice!');
        return;
      }
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      state.isVoiceListening = true;
      renderActiveTab();
      recognition.onresult = (event) => {
        state.isVoiceListening = false;
        const transcript = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : '';
        if (transcript) {
          handleSend(transcript);
        } else {
          renderActiveTab();
        }
      };
      recognition.onerror = () => {
        state.isVoiceListening = false;
        renderActiveTab();
      };
      recognition.onend = () => {
        state.isVoiceListening = false;
      };
      recognition.start();
    });
  }

  const sendBtn = document.getElementById('mj-chat-send');
  const inputEl = document.getElementById('mj-chat-input');
  if (sendBtn && inputEl) {
    sendBtn.addEventListener('click', () => handleSend(inputEl.value));
    inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') handleSend(inputEl.value);
    });
  }
  container.querySelectorAll('.mj-chat-chip').forEach(chip => {
    chip.addEventListener('click', () => handleSend(chip.getAttribute('data-prompt')));
  });
}

function renderActiveTab() {
  const outer = document.getElementById('mj-sidepanel-context-view');
  if (!outer) return;
  const tabContent = document.getElementById('mj-sidepanel-tab-content') || outer;
  const embedSlot = document.getElementById('mj-sidepanel-embed-slot');
  const useEmbeddedOverlay =
    state.activeView === 'chat' && state.agentSurfaceMode === 'embed' && Boolean(state.explorerOrigin);

  if (useEmbeddedOverlay && embedSlot) {
    tabContent.classList.add('mj-hidden');
    embedSlot.classList.remove('mj-hidden');
    renderChatTab(embedSlot);
  } else {
    tabContent.classList.remove('mj-hidden');
    if (embedSlot) embedSlot.classList.add('mj-hidden');
    if (state.activeView === 'context') renderContextTab(tabContent);
    else if (state.activeView === 'elements') renderElementsTab(tabContent);
    else if (state.activeView === 'playbooks') renderPlaybooksTab(tabContent);
    else if (state.activeView === 'chat') renderChatTab(tabContent);
  }
}

async function scanActiveTab() {
  const hostBadge = document.getElementById('mj-active-host-badge');
  const elCount = document.getElementById('mj-el-count');
  await syncWithOpenMjExplorerTab(true);
  let snap = await sendToActiveTab('MJ_CS_GET_PAGE_STATE');
  if (
    snap &&
    snap.Url &&
    (snap.Url.includes('/tscp-serving/') ||
      snap.Url.includes('doubleclick.net') ||
      snap.Url.includes('googlesyndication.com'))
  ) {
    // Defense-in-depth: never let an ad/tracker iframe snapshot overwrite the top-level page state
    snap = state.pageSnapshot;
  }
  if (!snap || !snap.Url) {
    snap = state.pageSnapshot || {
      Url: 'https://en.wikipedia.org/wiki/Main_Page',
      Hostname: 'en.wikipedia.org',
      Title: 'Wikipedia, the free encyclopedia',
      InteractiveElements: [],
      CapturedSignals: { HostnameRoot: 'wikipedia.org', H1Text: 'Wikipedia' }
    };
  }
  state.pageSnapshot = snap;
  if (hostBadge) {
    hostBadge.textContent = (snap.IsAuthOrMfaScreen ? '🔒 ' : '🌐 ') + (snap.Hostname || 'Active Tab');
  }
  if (elCount) {
    elCount.textContent = String((snap.InteractiveElements || []).length);
  }
  const baseBraided = extractLivePageSignals(snap);
  state.liveBraidedResult = baseBraided;
  renderActiveTab();
  state.liveBraidedResult = await resolveLiveMJBraiding(snap, baseBraided);
  pushTabContextToEmbeddedAgent();
  renderActiveTab();
}

// Wire up header & toolbar controls
document.getElementById('mj-btn-toggle-auth')?.addEventListener('click', () => {
  document.getElementById('mj-auth-drawer')?.classList.toggle('open');
});

document.getElementById('mj-btn-toggle-settings')?.addEventListener('click', () => {
  const drawer = document.getElementById('mj-settings-drawer');
  if (drawer) {
    drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
  }
});

document.getElementById('mj-btn-resume-in-explorer')?.addEventListener('click', () => {
  resumeConversationInMjExplorer();
});

document.getElementById('mj-btn-sync-explorer-tab')?.addEventListener('click', () => {
  syncWithOpenMjExplorerTab(false);
});

document.getElementById('mj-btn-save-auth')?.addEventListener('click', async () => {
  const urlInput = document.getElementById('mj-input-api-url');
  const tokenInput = document.getElementById('mj-input-api-token');
  const authBtn = document.getElementById('mj-btn-toggle-auth');
  const badge = document.getElementById('mj-auth-mode-badge');
  if (urlInput && urlInput.value) {
    state.connectedServerUrl = urlInput.value.trim();
    const tokenVal = tokenInput && tokenInput.value ? tokenInput.value.trim() : '';
    if (tokenVal) {
      state.apiToken = tokenVal;
      state.isSignedIn = true;
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (tokenVal) headers['Authorization'] = tokenVal.startsWith('Bearer ') ? tokenVal : ('Bearer ' + tokenVal);
      const resp = await fetch(state.connectedServerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: '{ __typename }' })
      });
      if (resp.ok) {
        state.isSignedIn = true;
        if (authBtn) {
          authBtn.textContent = '🟢 MJ Live: ' + new URL(state.connectedServerUrl).host;
          authBtn.classList.add('connected');
        }
        if (badge) {
          badge.textContent = '🟢 Connected';
          badge.className = 'mj-badge mj-badge-success';
        }
        document.getElementById('mj-auth-drawer')?.classList.remove('open');
        showToast('Verified live GraphQL connection to ' + state.connectedServerUrl);
        await scanActiveTab();
      } else {
        if (badge) badge.textContent = '🟡 HTTP ' + resp.status + ' (Auth Required)';
        showToast('MJAPI reachable at ' + state.connectedServerUrl + ' (HTTP ' + resp.status + ').');
      }
    } catch {
      if (badge) badge.textContent = '🟡 MJAPI Unreachable';
      showToast('Could not reach ' + state.connectedServerUrl + ' — click "Sign In via MemberJunction Explorer" to auto-detect port.');
    }
  }
});

const DEFAULT_OAUTH_CONFIG = {
  msal: {
    clientId: '7e6e6ecf-66ff-4733-9c60-1e6def949897',
    authority: 'https://login.microsoftonline.com/ff10ade7-5d03-40a9-be28-cb7ab99670b1',
    redirectUri: 'http://localhost:4200',
    scopes: ['openid', 'profile', 'email', 'User.Read']
  },
  auth0: {
    clientId: 'uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI',
    domain: 'bluecypress-dev.us.auth0.com',
    redirectUri: 'http://localhost:4200',
    scopes: ['openid', 'profile', 'email']
  }
};

let pendingOAuthFlow = null;

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}

async function generatePkcePair() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = base64UrlEncode(randomBytes);
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function applySignedInSession(session) {
  if (!session || !session.idToken) return;
  state.isSignedIn = true;
  state.apiToken = session.idToken;
  if (session.graphQLUrl) {
    state.connectedServerUrl = session.graphQLUrl;
    const urlInput = document.getElementById('mj-input-api-url');
    if (urlInput) urlInput.value = session.graphQLUrl;
  }
  if (session.explorerOrigin) {
    state.explorerOrigin = session.explorerOrigin;
    state.explorerReachable = true;
  }
  const tokenInput = document.getElementById('mj-input-api-token');
  const authBtn = document.getElementById('mj-btn-toggle-auth');
  const badge = document.getElementById('mj-auth-mode-badge');
  const userBar = document.getElementById('mj-signed-in-user-bar');
  const userLabel = document.getElementById('mj-signed-in-user-label');

  if (tokenInput) tokenInput.value = session.idToken;
  const displayUser = session.userName || session.email || 'Authenticated User';
  if (authBtn) {
    authBtn.textContent = '🟢 ' + displayUser;
    authBtn.classList.add('connected');
  }
  if (badge) {
    badge.textContent = '🟢 Signed In (' + (session.provider || 'MJ Explorer') + ')';
    badge.className = 'mj-badge mj-badge-success';
  }
  if (userBar && userLabel) {
    userBar.style.display = 'flex';
    userLabel.textContent = '🟢 ' + displayUser + (session.email && session.userName ? ' (' + session.email + ')' : '');
  }
  // Collapse the sign-in drawer automatically once signed in so Context & Agent own the screen
  document.getElementById('mj-auth-drawer')?.classList.remove('open');
  document.getElementById('mj-settings-drawer')?.classList.remove('open');
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ mj_ext_auth_session: session });
  }
}

document.getElementById('mj-btn-sign-out')?.addEventListener('click', () => {
  state.isSignedIn = false;
  state.apiToken = '';
  state.liveBraidedResult = null;
  const tokenInput = document.getElementById('mj-input-api-token');
  const authBtn = document.getElementById('mj-btn-toggle-auth');
  const badge = document.getElementById('mj-auth-mode-badge');
  const userBar = document.getElementById('mj-signed-in-user-bar');
  if (tokenInput) tokenInput.value = '';
  if (authBtn) {
    authBtn.textContent = '🔌 Sign In';
    authBtn.classList.remove('connected');
  }
  if (badge) {
    badge.textContent = 'Not Signed In';
    badge.className = 'mj-badge mj-badge-warn';
  }
  if (userBar) userBar.style.display = 'none';
  document.getElementById('mj-auth-drawer')?.classList.add('open');
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove('mj_ext_auth_session');
  }
  scanActiveTab();
  showToast('Signed out of MemberJunction session.');
});

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['mj_ext_auth_session'], (res) => {
    if (res && res.mj_ext_auth_session && res.mj_ext_auth_session.idToken) {
      applySignedInSession(res.mj_ext_auth_session);
      scanActiveTab();
    }
  });
}

async function handleOAuthRedirectUrl(rawUrl) {
  if (!pendingOAuthFlow || !rawUrl) return false;
  if (!rawUrl.startsWith(pendingOAuthFlow.redirectUri)) return false;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const queryParams = new URLSearchParams(parsed.search);
  const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
  const code = queryParams.get('code') || hashParams.get('code');
  const directIdToken = hashParams.get('id_token') || queryParams.get('id_token');
  const error = queryParams.get('error') || hashParams.get('error');

  if (!code && !directIdToken && !error) return false;

  const flow = pendingOAuthFlow;
  pendingOAuthFlow = null;

  // Close the OAuth popup window/tab automatically
  if (typeof chrome !== 'undefined') {
    if (flow.windowId && chrome.windows && chrome.windows.remove) {
      chrome.windows.remove(flow.windowId).catch(() => {});
    } else if (flow.tabId && chrome.tabs && chrome.tabs.remove) {
      chrome.tabs.remove(flow.tabId).catch(() => {});
    }
  }
  if (flow.popupRef && typeof flow.popupRef.close === 'function') {
    try { flow.popupRef.close(); } catch {}
  }

  if (error) {
    const desc = queryParams.get('error_description') || hashParams.get('error_description') || error;
    showToast('OAuth Sign-In error: ' + desc);
    return true;
  }

  if (directIdToken) {
    const claims = decodeJwtPayload(directIdToken) || {};
    applySignedInSession({
      provider: flow.provider,
      idToken: directIdToken,
      userName: claims.name || claims.preferred_username || claims.nickname || 'MJ User',
      email: claims.email || claims.preferred_username || ''
    });
    showToast('Signed in via ' + flow.provider.toUpperCase() + '!');
    return true;
  }

  // Exchange authorization code + PKCE code_verifier for JWT tokens
  try {
    showToast('Exchanging OAuth authorization code via PKCE...');
    const body = new URLSearchParams({
      client_id: flow.clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.codeVerifier
    });
    const tokenResp = await fetch(flow.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const tokenData = await tokenResp.json();
    const jwt = tokenData.id_token || tokenData.access_token;
    if (jwt) {
      const claims = decodeJwtPayload(jwt) || {};
      applySignedInSession({
        provider: flow.provider,
        idToken: jwt,
        accessToken: tokenData.access_token,
        userName: claims.name || claims.preferred_username || claims.nickname || 'MJ User',
        email: claims.email || claims.preferred_username || ''
      });
      showToast('Signed in as ' + (claims.name || claims.preferred_username || claims.email || 'MJ User') + '!');
      document.getElementById('mj-btn-save-auth')?.click();
    } else {
      showToast('Token exchange returned: ' + (tokenData.error_description || tokenData.error || 'No id_token'));
    }
  } catch (err) {
    showToast('PKCE token exchange failed: ' + (err && err.message ? err.message : String(err)));
  }
  return true;
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const candidateUrl = changeInfo.url || (tab && tab.url);
    if (candidateUrl && pendingOAuthFlow) {
      handleOAuthRedirectUrl(candidateUrl);
    }
  });
}

async function launchOAuthPkcePopup(providerType, catalogEntry) {
  const { codeVerifier, codeChallenge } = await generatePkcePair();
  const stateToken = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const nonceToken = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));

  let authorizeUrl = '';
  let tokenEndpoint = '';
  let clientId = '';
  const redirectUri = DEFAULT_OAUTH_CONFIG.msal.redirectUri;

  if (providerType === 'auth0') {
    clientId = (catalogEntry && catalogEntry.clientId) || DEFAULT_OAUTH_CONFIG.auth0.clientId;
    const rawDomain = (catalogEntry && (catalogEntry.domain || catalogEntry.issuer)) || DEFAULT_OAUTH_CONFIG.auth0.domain;
    const cleanDomain = rawDomain.replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '');
    const scopes = (catalogEntry && Array.isArray(catalogEntry.scopes) && catalogEntry.scopes.length > 0)
      ? catalogEntry.scopes.join(' ')
      : DEFAULT_OAUTH_CONFIG.auth0.scopes.join(' ');
    tokenEndpoint = 'https://' + cleanDomain + '/oauth/token';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: stateToken,
      nonce: nonceToken
    });
    authorizeUrl = 'https://' + cleanDomain + '/authorize?' + params.toString();
  } else {
    clientId = (catalogEntry && catalogEntry.clientId) || DEFAULT_OAUTH_CONFIG.msal.clientId;
    let authority = (catalogEntry && catalogEntry.clientConfiguration && catalogEntry.clientConfiguration.authority) ||
      (catalogEntry && catalogEntry.issuer ? catalogEntry.issuer.replace(/\\/v2\\.0\\/?$/, '') : '') ||
      DEFAULT_OAUTH_CONFIG.msal.authority;
    authority = authority.replace(/\\/+$/, '');
    const scopes = (catalogEntry && Array.isArray(catalogEntry.scopes) && catalogEntry.scopes.length > 0)
      ? catalogEntry.scopes.join(' ')
      : DEFAULT_OAUTH_CONFIG.msal.scopes.join(' ');
    tokenEndpoint = authority + '/oauth2/v2.0/token';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: stateToken,
      nonce: nonceToken,
      prompt: 'select_account'
    });
    authorizeUrl = authority + '/oauth2/v2.0/authorize?' + params.toString();
  }

  if (root) {
    root.setAttribute('data-last-oauth-url', authorizeUrl);
    root.setAttribute('data-last-oauth-provider', providerType);
  }

  pendingOAuthFlow = {
    provider: providerType,
    clientId,
    redirectUri,
    codeVerifier,
    tokenEndpoint,
    state: stateToken,
    windowId: null,
    tabId: null,
    popupRef: null
  };

  showToast('Opening ' + (providerType === 'auth0' ? 'Auth0 / OIDC' : 'Microsoft Entra (MSAL)') + ' Sign-In popup...');

  if (typeof chrome !== 'undefined' && chrome.windows && typeof chrome.windows.create === 'function') {
    try {
      const win = await chrome.windows.create({
        url: authorizeUrl,
        type: 'popup',
        width: 520,
        height: 680,
        focused: true
      });
      if (win && pendingOAuthFlow) {
        pendingOAuthFlow.windowId = win.id || null;
        if (win.tabs && win.tabs[0] && win.tabs[0].id) {
          pendingOAuthFlow.tabId = win.tabs[0].id;
        }
      }
      return;
    } catch {
      // Fall through to window.open
    }
  }

  const popupRef = window.open(authorizeUrl, 'mj_oauth_pkce_popup', 'popup=yes,width=520,height=680');
  if (pendingOAuthFlow) {
    pendingOAuthFlow.popupRef = popupRef;
  }
}

document.getElementById('mj-btn-discover-catalog')?.addEventListener('click', async () => {
  const urlInput = document.getElementById('mj-input-api-url');
  const listEl = document.getElementById('mj-provider-catalog-list');
  let baseUrl = urlInput && urlInput.value ? urlInput.value.trim() : 'http://localhost:4000';
  if (baseUrl.endsWith('/graphql/')) baseUrl = baseUrl.slice(0, -9);
  else if (baseUrl.endsWith('/graphql')) baseUrl = baseUrl.slice(0, -8);
  const catalogUrl = baseUrl + '/auth/providers';
  try {
    const resp = await fetch(catalogUrl);
    if (resp.ok) {
      const data = await resp.json();
      const providers = Array.isArray(data.providers) ? data.providers : (Array.isArray(data) ? data : []);
      if (listEl) {
        listEl.innerHTML = providers.map((p, idx) => \`<button class="mj-btn mj-btn-primary mj-catalog-idp-btn" data-idx="\${idx}">🔐 Sign In via \${p.displayName || p.name || p.driverClass || p.type}</button>\`).join('');
        listEl.querySelectorAll('.mj-catalog-idp-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const p = providers[Number(btn.getAttribute('data-idx'))];
            const kind = String((p && (p.driverClass || p.type || p.name)) || 'msal').toLowerCase().includes('auth0') ? 'auth0' : 'msal';
            launchOAuthPkcePopup(kind, p);
          });
        });
      }
      showToast('Discovered ' + providers.length + ' Identity Providers from ' + catalogUrl);
    } else {
      showToast('Catalog endpoint ' + catalogUrl + ' returned HTTP ' + resp.status);
    }
  } catch {
    showToast('Could not reach ' + catalogUrl + ' — using built-in MSAL & Auth0 PKCE configuration.');
  }
});

document.getElementById('mj-btn-idp-msal')?.addEventListener('click', () => {
  launchOAuthPkcePopup('msal', null);
});

document.getElementById('mj-btn-idp-auth0')?.addEventListener('click', () => {
  launchOAuthPkcePopup('auth0', null);
});

document.getElementById('mj-btn-open-explorer')?.addEventListener('click', () => {
  const urlInput = document.getElementById('mj-input-api-url');
  let baseUrl = urlInput && urlInput.value ? urlInput.value.trim() : 'http://localhost:4200';
  if (baseUrl.endsWith('/graphql/')) baseUrl = baseUrl.slice(0, -9);
  else if (baseUrl.endsWith('/graphql')) baseUrl = baseUrl.slice(0, -8);
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: baseUrl });
  }
});

document.getElementById('mj-btn-scan-tab')?.addEventListener('click', () => {
  scanActiveTab();
});

document.getElementById('mj-btn-spotlight-main')?.addEventListener('click', async () => {
  const res = await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
    Selector: 'main h1, h1, input[type="search"], input[name="search"], a[href]',
    StepBadge: ASSISTANT_NAME,
    Label: 'Primary Grounded Page Target'
  });
  if (!res || !res.Success) {
    await sendToActiveTab('MJ_CS_HIGHLIGHT_ELEMENT', {
      Index: 0,
      StepBadge: ASSISTANT_NAME,
      Label: 'Primary Interactive Target (#0)'
    });
  }
  showToast('Spotlight Coach-Mark rendered on active tab!');
});

document.getElementById('mj-btn-clear-spotlight')?.addEventListener('click', async () => {
  await sendToActiveTab('MJ_CS_CLEAR_HIGHLIGHTS');
  showToast('Cleared Coach-Mark overlays on active tab.');
});

document.querySelectorAll('.mj-nav-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('.mj-nav-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
    state.activeView = tabBtn.getAttribute('data-tab') || 'context';
    renderActiveTab();
  });
});

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && (msg.Type === 'MJ_EXT_ACTIVE_TAB_UPDATED' || msg.Type === 'MJ_EXT_TAB_URL_CHANGED')) {
      scanActiveTab();
    } else if (msg && msg.Type === 'MJ_EXT_HOST_SYNC' && msg.Payload) {
      const p = msg.Payload;
      if (p.Origin) state.explorerOrigin = p.Origin;
      if (p.IdToken && !state.isSignedIn) {
        const claims = decodeJwtPayload(p.IdToken) || {};
        applySignedInSession({
          provider: 'MJExplorer Session Sync',
          idToken: p.IdToken,
          userName: claims.name || claims.preferred_username || claims.email || 'MJ Explorer User',
          email: claims.email || claims.preferred_username || '',
          graphQLUrl: p.GraphQLUrl || '',
          explorerOrigin: p.Origin || ''
        });
      }
      if (p.LastSessionID !== undefined) {
        state.activeRealtimeSessionId = p.LastSessionID || '';
      }
      if (p.ConversationID && p.ConversationID !== state.activeConversationId) {
        state.activeConversationId = p.ConversationID;
        if (state.agentSurfaceMode === 'direct') {
          loadActiveConversationFromMJAPI(p.ConversationID);
        } else {
          renderActiveTab();
        }
      } else {
        renderActiveTab();
      }
    }
  });
}

// Initial scan on Side Panel open
scanActiveTab();
`;
    }

    private generateOffscreenAudioScript(profile: ExtensionBrandProfile): string {
        return `// Offscreen Audio Daemon for ${profile.BrandName} (${profile.BrandSlug}) — Topology A 0ms Continuity
window.__MJ_OFFSCREEN_DAEMON_READY__ = true;
`;
    }

    /**
     * Create a standard ZIP archive containing all files in `sourceDir` using pure Node.js
     * CRC32 + Deflate (`node:zlib`) so it works across macOS, Linux, and Windows CI without external `zip` binaries.
     */
    private createZipArchiveFromDirectory(sourceDir: string, zipFilePath: string): void {
        const files = this.collectFilesRecursively(sourceDir, sourceDir);
        const localFileParts: Buffer[] = [];
        const centralDirParts: Buffer[] = [];
        let offset = 0;

        for (const relPath of files) {
            const posixName = relPath.split(path.sep).join('/');
            const nameBuf = Buffer.from(posixName, 'utf8');
            const fullPath = path.join(sourceDir, relPath);
            const rawData = fs.readFileSync(fullPath);
            const compressed = zlib.deflateRawSync(rawData);
            const crc = this.computeCrc32(rawData);

            // Local file header (30 bytes + filename)
            const localHeader = Buffer.alloc(30);
            localHeader.writeUInt32LE(0x04034b50, 0); // signature
            localHeader.writeUInt16LE(20, 4); // version needed
            localHeader.writeUInt16LE(0, 6); // flags
            localHeader.writeUInt16LE(8, 8); // compression method: deflate
            localHeader.writeUInt16LE(0, 10); // mod time
            localHeader.writeUInt16LE(0, 12); // mod date
            localHeader.writeUInt32LE(crc, 14);
            localHeader.writeUInt32LE(compressed.length, 18);
            localHeader.writeUInt32LE(rawData.length, 22);
            localHeader.writeUInt16LE(nameBuf.length, 26);
            localHeader.writeUInt16LE(0, 28); // extra length

            localFileParts.push(localHeader, nameBuf, compressed);

            // Central directory header (46 bytes + filename)
            const centralHeader = Buffer.alloc(46);
            centralHeader.writeUInt32LE(0x02014b50, 0); // signature
            centralHeader.writeUInt16LE(20, 4); // version made by
            centralHeader.writeUInt16LE(20, 6); // version needed
            centralHeader.writeUInt16LE(0, 8); // flags
            centralHeader.writeUInt16LE(8, 10); // compression: deflate
            centralHeader.writeUInt16LE(0, 12); // mod time
            centralHeader.writeUInt16LE(0, 14); // mod date
            centralHeader.writeUInt32LE(crc, 16);
            centralHeader.writeUInt32LE(compressed.length, 20);
            centralHeader.writeUInt32LE(rawData.length, 24);
            centralHeader.writeUInt16LE(nameBuf.length, 28);
            centralHeader.writeUInt16LE(0, 30); // extra length
            centralHeader.writeUInt16LE(0, 32); // comment length
            centralHeader.writeUInt16LE(0, 34); // disk number
            centralHeader.writeUInt16LE(0, 36); // internal attrs
            centralHeader.writeUInt32LE(0, 38); // external attrs
            centralHeader.writeUInt32LE(offset, 42); // local header offset

            centralDirParts.push(centralHeader, nameBuf);
            offset += localHeader.length + nameBuf.length + compressed.length;
        }

        const centralDirBuffer = Buffer.concat(centralDirParts);
        const endOfCentralDir = Buffer.alloc(22);
        endOfCentralDir.writeUInt32LE(0x06054b50, 0); // EOCD signature
        endOfCentralDir.writeUInt16LE(0, 4); // disk number
        endOfCentralDir.writeUInt16LE(0, 6); // central dir disk
        endOfCentralDir.writeUInt16LE(files.length, 8);
        endOfCentralDir.writeUInt16LE(files.length, 10);
        endOfCentralDir.writeUInt32LE(centralDirBuffer.length, 12);
        endOfCentralDir.writeUInt32LE(offset, 16);
        endOfCentralDir.writeUInt16LE(0, 20); // comment length

        const finalZip = Buffer.concat([...localFileParts, centralDirBuffer, endOfCentralDir]);
        fs.writeFileSync(zipFilePath, finalZip);
    }

    private collectFilesRecursively(dir: string, rootDir: string): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const results: string[] = [];
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.collectFilesRecursively(full, rootDir));
            } else if (entry.isFile()) {
                results.push(path.relative(rootDir, full));
            }
        }
        return results.sort();
    }

    private computeCrc32(buf: Buffer): number {
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
}
