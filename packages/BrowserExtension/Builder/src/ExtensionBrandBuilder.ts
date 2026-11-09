/**
 * @fileoverview `ExtensionBrandBuilder` — White-Label Brand Stamping Factory for
 * MemberJunction Browser Extensions (`MJ Co-Pilot`, `Betty`, `Sidecar`, and custom tenant brands).
 *
 * Responsibilities:
 * 1. Validates `mj-extension-brand.json` via {@link ValidateExtensionBrandProfile}.
 * 2. Derives `--mj-*` CSS design tokens using `@memberjunction/theme-engine` via {@link RuntimeBrandKitHydrator}.
 * 3. Stamps `manifest.json` (including conditional `"debugger"` in `optional_permissions` vs omitted when
 *    `IncludeDebuggerPermission === false`).
 * 4. Copies the compiled standalone Angular 21 Side Panel application (`sidepanel-app/` mounting
 *    `@memberjunction/ng-conversations` + `@memberjunction/ng-browser-extension` directly with zero `<iframe>`
 *    and zero `MJExplorer` shell) and emits Manifest V3 runtime scripts (`content-script.js`,
 *    `service-worker.js`, `brand-config.js`, `offscreen-audio.js`, `sidepanel.html`, `offscreen.html`)
 *    and icons into `UnpackedDir`.
 * 5. Packages a Chrome Web Store ready `.zip` archive (`ZipPath`).
 */

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import {
    BrowserControlBackendMode,
    BrowserTarget,
    EnsureFontFallbackStack,
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

interface CachedZipEntry {
    compressed: Buffer;
    crc: number;
    rawLength: number;
}

/**
 * Memoizes compressed Deflate + CRC32 buffers for invariant `sidepanel-app/*` assets across multi-browser builds.
 */
const sidePanelZipDeflateCache = new Map<string, CachedZipEntry>();

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
        const bodyFont = EnsureFontFallbackStack(
            findFont(['Body', 'Headline'], 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'),
            'sans'
        );
        const monoFont = EnsureFontFallbackStack(
            findFont(['Data', 'Mono'], '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'),
            'mono'
        );

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
            DefaultServerUrl: ext.DefaultServerUrl ?? 'http://localhost:4115/',
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
                        all_frames: false,
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
                        all_frames: false,
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
                    all_frames: false,
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

        // 3. Emit self-contained MV3 runtime scripts + compiled standalone Angular 21 Side Panel app
        const legacySidePanelScript = path.join(unpackedDir, 'sidepanel.js');
        if (fs.existsSync(legacySidePanelScript)) {
            fs.rmSync(legacySidePanelScript, { force: true });
        }
        this.copyCompiledSidePanelApp(unpackedDir);

        fs.writeFileSync(
            path.join(unpackedDir, 'brand-config.js'),
            this.generateBrandConfigScript(profile),
            'utf8'
        );
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
            path.join(unpackedDir, 'offscreen.html'),
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${profile.ShortName} Offscreen Audio Daemon</title></head><body><script type="module" src="offscreen-audio.js"></script></body></html>\n`,
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'offscreen-audio.js'),
            this.generateOffscreenAudioScript(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'mj-audio-worklets.js'),
            this.generateAudioWorkletsScript(),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'mic-permission.html'),
            this.generateMicPermissionHtml(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'mic-permission.js'),
            this.generateMicPermissionScript(),
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
  // Never run in third-party ad/tracker iframes (e.g. LinkedIn tscp-serving/dtag ad frames)
  if (!IS_TOP_FRAME) {
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
        .filter((l) => l.length > 0);
      const contactInfoIdx = lines.findIndex((l) => l.includes('Contact info'));
      if (contactInfoIdx >= 0) {
        const inlineLocPart = lines[contactInfoIdx]
          .split('Contact info')[0]
          .replace(/[·•|-]+\\s*$/, '')
          .trim();
        let locIdx = contactInfoIdx;
        if (inlineLocPart) {
          if (!locationText) {
            locationText = inlineLocPart;
          }
        } else {
          for (let j = contactInfoIdx - 1; j >= 0; j--) {
            const candidate = lines[j].replace(/[·•|-]+\\s*$/, '').trim();
            if (candidate && candidate !== '·' && candidate !== '•') {
              locIdx = j;
              if (!locationText) {
                locationText = candidate;
              }
              break;
            }
          }
        }
        const above = lines
          .slice(0, locIdx)
          .map((l) => l.replace(/\\s*[·•]\\s*(1st|2nd|3rd\\+?)$/i, '').trim())
          .filter(
            (l) =>
              l.length > 1 &&
              l !== '·' &&
              l !== '•' &&
              !/^\\(?(he\\/him|she\\/her|they\\/them|he\\/they|she\\/they)\\)?$/i.test(l) &&
              !/^\\+\\s*\\d+\\s*more$/i.test(l) &&
              !/^(1st|2nd|3rd\\+?)$/i.test(l),
          );
        if (above.length >= 1 && !headlineText) {
          headlineText = above[above.length - 1];
        }
        if (above.length >= 2 && !h1Text) {
          h1Text = above[above.length - 2];
        }
      }
      if (!h1Text && document.title && !/^(\\(?\\d+\\)?\\s*)?Feed\\b/i.test(document.title)) {
        const titleName = document.title
          .replace(/^\\(\\d+\\)\\s*/, '')
          .split('|')[0]
          .split(' - ')[0]
          .trim();
        if (titleName && titleName.toLowerCase() !== 'linkedin') {
          h1Text = titleName;
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

  function isFreshJwtToken(token) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      if (payload && typeof payload.exp === 'number') {
        return payload.exp * 1000 > Date.now() + 15000;
      }
      return true;
    } catch {
      return true;
    }
  }

  function extractMjHostSession() {
    let idToken = '';
    let fallbackToken = '';
    let graphQLUrl = '';
    let conversationId = (document.documentElement && document.documentElement.getAttribute('data-mj-active-conversation-id')) || '';
    let sessionId = (document.documentElement && document.documentElement.getAttribute('data-mj-active-session-id')) || '';

    try {
      const urlObj = new URL(window.location.href);
      if (!conversationId) {
        conversationId = urlObj.searchParams.get('conversationId') || urlObj.searchParams.get('ConversationID') || '';
      }
      if (typeof sessionStorage !== 'undefined') {
        const devToken = sessionStorage.getItem('mj_local_dev_token') || '';
        if (devToken && devToken.split('.').length === 3) {
          if (isFreshJwtToken(devToken)) {
            idToken = devToken;
          } else {
            fallbackToken = devToken;
          }
        }
      }
      if (!idToken && typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || '';
          const rawVal = localStorage.getItem(key) || '';
          if (!rawVal) continue;
          if (rawVal.includes('"credentialType":"IdToken"')) {
            try {
              const parsed = JSON.parse(rawVal);
              if (parsed && typeof parsed.secret === 'string' && parsed.secret.split('.').length === 3) {
                if (isFreshJwtToken(parsed.secret)) {
                  idToken = parsed.secret;
                  break;
                } else if (!fallbackToken) {
                  fallbackToken = parsed.secret;
                }
              }
            } catch {}
          } else if (key.startsWith('@@auth0spajs@@')) {
            try {
              const parsed = JSON.parse(rawVal);
              const candidate = parsed && parsed.body && (parsed.body.id_token || parsed.body.access_token);
              if (typeof candidate === 'string' && candidate.split('.').length === 3) {
                if (isFreshJwtToken(candidate)) {
                  idToken = candidate;
                  break;
                } else if (!fallbackToken) {
                  fallbackToken = candidate;
                }
              }
            } catch {}
          }
        }
      }
      if (!idToken && fallbackToken) {
        idToken = fallbackToken;
      }
      if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
        const entries = performance.getEntriesByType('resource') || [];
        for (let i = entries.length - 1; i >= 0; i--) {
          const name = (entries[i] && entries[i].name) || '';
          if (!name) continue;
          if (name.includes('/graphql') || name.startsWith('http://localhost:40') || name.startsWith('http://localhost:41')) {
            try {
              const u = new URL(name);
              graphQLUrl = u.origin + (u.pathname === '/graphql' ? '/graphql' : '/');
            } catch {
              graphQLUrl = name.split('?')[0];
            }
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

    /**
     * Resolves the compiled standalone Angular 21 Side Panel output directory
     * (`@memberjunction/browser-extension-host/dist/sidepanel-app/browser`).
     */
    private resolveCompiledSidePanelAppDir(): string {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        const candidates: string[] = [];

        try {
            const req = createRequire(import.meta.url);
            const hostPkgJsonPath = req.resolve('@memberjunction/browser-extension-host/package.json');
            candidates.push(path.join(path.dirname(hostPkgJsonPath), 'dist', 'sidepanel-app', 'browser'));
        } catch {
            // Fall through to workspace relative path
        }
        candidates.push(path.resolve(currentDir, '../../Host/dist/sidepanel-app/browser'));

        for (const candidate of candidates) {
            if (fs.existsSync(path.join(candidate, 'main.js'))) {
                return candidate;
            }
        }

        throw new Error(
            `Compiled Angular Side Panel bundle not found in [@memberjunction/browser-extension-host]. ` +
                `Expected main.js in: ${candidates.join(' or ')}. Run "npm run build" in packages/BrowserExtension/Host first.`
        );
    }

    /**
     * Copies the compiled Angular 21 Side Panel assets (`main.js`, `polyfills.js`, `styles.css`,
     * `chunk-*.js`, `media/*`) into `<unpackedDir>/sidepanel-app/`.
     */
    private copyCompiledSidePanelApp(unpackedDir: string): void {
        const srcDir = this.resolveCompiledSidePanelAppDir();
        const destDir = path.join(unpackedDir, 'sidepanel-app');
        if (fs.existsSync(destDir)) {
            fs.rmSync(destDir, { recursive: true, force: true });
        }
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(srcDir, destDir, {
            recursive: true,
            filter: (srcPath) => path.basename(srcPath) !== 'index.html',
        });
    }

    /**
     * Emits Manifest V3 CSP-compliant external `brand-config.js` (zero inline scripts) that
     * provides `window.__MJ_EXTENSION_BRAND_PROFILE__` before Angular 21 bootstraps.
     */
    private generateBrandConfigScript(profile: ExtensionBrandProfile): string {
        return `// Generated by @memberjunction/browser-extension-builder — Manifest V3 CSP-safe brand configuration
window.__MJ_EXTENSION_BRAND_PROFILE__ = ${JSON.stringify(profile, null, 2)};
`;
    }

    /**
     * Emits Manifest V3 CSP-compliant `sidepanel.html` mounting the standalone Angular 21
     * Side Panel application (`<mj-extension-sidepanel-app>`) directly inside the extension origin
     * with zero inline scripts, zero `<iframe>`, and zero `MJExplorer` (`<mj-shell>`) overhead.
     */
    private generateSidePanelHtml(profile: ExtensionBrandProfile): string {
        const pageTitle = profile.SidePanelHeaderTitle ?? profile.BrandName;
        return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-theme-overlay="${profile.BrandSlug}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <base href="./sidepanel-app/" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="../brand-theme.css" />
  <script src="../brand-config.js"></script>
</head>
<body>
  <mj-extension-sidepanel-app></mj-extension-sidepanel-app>
  <script src="polyfills.js" type="module"></script>
  <script src="main.js" type="module"></script>
</body>
</html>
`;
    }

    private generateOffscreenAudioScript(profile: ExtensionBrandProfile): string {
        return `// Offscreen Audio Daemon for ${profile.BrandName} (${profile.BrandSlug}) — Topology A 0ms Continuity
window.__MJ_OFFSCREEN_DAEMON_READY__ = true;
`;
    }

    /**
     * Emits Manifest V3 CSP-compliant `mj-audio-worklets.js` bundling the inline AudioWorklet
     * processors used by `@memberjunction/ai-realtime-client` (`mj-realtime-pcm16-capture`) and
     * `@memberjunction/ng-conversations` (`mj-pcm-capture`), allowing `AudioWorklet.addModule()`
     * to run cleanly under `script-src 'self'` inside `chrome-extension://` pages.
     */
    private generateAudioWorkletsScript(): string {
        return `// Generated by @memberjunction/browser-extension-builder — Manifest V3 AudioWorklet processors
class MJRealtimePcm16Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}

class MJPcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}

try {
  registerProcessor('mj-realtime-pcm16-capture', MJRealtimePcm16Capture);
} catch {}

try {
  registerProcessor('mj-pcm-capture', MJPcmCaptureProcessor);
} catch {}
`;
    }

    /**
     * Emits Manifest V3 CSP-compliant `mic-permission.html` popup page so Chrome can anchor
     * the one-time microphone permission bubble for `chrome-extension://<id>` (Chrome Side Panels
     * cannot display initial `getUserMedia` permission bubbles without an extension tab/popup).
     */
    private generateMicPermissionHtml(profile: ExtensionBrandProfile): string {
        return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-theme-overlay="${profile.BrandSlug}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Enable Microphone — ${profile.AssistantDisplayName}</title>
  <link rel="stylesheet" href="brand-theme.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: var(--mj-bg-surface-sunken, #f8fafc);
      color: var(--mj-text-primary, #0f172a);
      font-family: var(--mj-font-family, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif);
    }
    .mj-mic-card {
      background: var(--mj-bg-surface, #ffffff);
      border: 1px solid var(--mj-border-default, #e2e8f0);
      border-radius: 14px;
      padding: 22px 20px;
      max-width: 360px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    }
    .mj-mic-badge {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--mj-brand-primary, #0076b6) 12%, #ffffff);
      color: var(--mj-brand-primary, #0076b6);
      font-size: 22px;
      font-weight: 700;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 700;
    }
    p {
      margin: 0 0 14px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--mj-text-secondary, #475569);
    }
    .mj-mic-status {
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-brand-primary, #0076b6);
      margin-bottom: 12px;
    }
    .mj-mic-status.error {
      color: #b91c1c;
    }
    button {
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 9px 16px;
      border-radius: 8px;
      border: 1px solid var(--mj-brand-primary, #0076b6);
      background: var(--mj-brand-primary, #0076b6);
      color: #ffffff;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="mj-mic-card">
    <div class="mj-mic-badge">🎙️</div>
    <h1>Enable Microphone for ${profile.AssistantDisplayName}</h1>
    <p>Click <strong>Allow</strong> in Chrome's permission prompt above to start live realtime voice in the Side Panel.</p>
    <div id="mj-mic-status" class="mj-mic-status">Requesting microphone access…</div>
    <button id="mj-mic-retry-btn" type="button" hidden>Grant Microphone Access</button>
  </div>
  <script src="mic-permission.js"></script>
</body>
</html>
`;
    }

    /**
     * Emits Manifest V3 CSP-compliant `mic-permission.js` external script for `mic-permission.html`.
     */
    private generateMicPermissionScript(): string {
        return `// Generated by @memberjunction/browser-extension-builder — One-time Side Panel microphone permission helper
(function () {
  const statusEl = document.getElementById('mj-mic-status');
  const retryBtn = document.getElementById('mj-mic-retry-btn');

  async function requestMic() {
    if (statusEl) {
      statusEl.textContent = 'Click Allow in the browser prompt above…';
      statusEl.classList.remove('error');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      if (statusEl) {
        statusEl.textContent = 'Microphone enabled! Returning to Side Panel…';
      }
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ Type: 'MJ_EXT_MIC_PERMISSION_RESULT', Granted: true }, () => {
          void chrome.runtime.lastError;
          window.close();
        });
      } else {
        window.close();
      }
    } catch (err) {
      const msg = err && err.message ? String(err.message) : 'Microphone permission was not granted.';
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.classList.add('error');
      }
      if (retryBtn) {
        retryBtn.hidden = false;
      }
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ Type: 'MJ_EXT_MIC_PERMISSION_RESULT', Granted: false, ErrorMessage: msg }, () => {
          void chrome.runtime.lastError;
        });
      }
    }
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      void requestMic();
    });
  }

  void requestMic();
})();
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

            let compressed: Buffer;
            let crc: number;
            let rawLength: number;

            if (posixName.startsWith('sidepanel-app/')) {
                const stat = fs.statSync(fullPath);
                const cacheKey = `${posixName}:${stat.size}`;
                const cached = sidePanelZipDeflateCache.get(cacheKey);
                if (cached) {
                    compressed = cached.compressed;
                    crc = cached.crc;
                    rawLength = cached.rawLength;
                } else {
                    const rawData = fs.readFileSync(fullPath);
                    compressed = zlib.deflateRawSync(rawData);
                    crc = this.computeCrc32(rawData);
                    rawLength = rawData.length;
                    sidePanelZipDeflateCache.set(cacheKey, { compressed, crc, rawLength });
                }
            } else {
                const rawData = fs.readFileSync(fullPath);
                compressed = zlib.deflateRawSync(rawData);
                crc = this.computeCrc32(rawData);
                rawLength = rawData.length;
            }

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
            localHeader.writeUInt32LE(rawLength, 22);
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
            centralHeader.writeUInt32LE(rawLength, 24);
            centralHeader.writeUInt16LE(nameBuf.length, 28);
            centralHeader.writeUInt16LE(0, 30); // extra length
            centralHeader.writeUInt16LE(0, 32); // comment length
            centralHeader.writeUInt16LE(0, 34); // disk number
            centralHeader.writeUInt16LE(0, 36); // internal attrs
            centralHeader.writeUInt16LE(0, 38); // external attrs
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
