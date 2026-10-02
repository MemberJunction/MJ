/**
 * Discovery — turns configuration into an ordered list of candidate entries, each tagged with
 * where it came from. Order matters: the ClassFactory's load-order priority means a later
 * registration wins, so the host's generated packages go first, then installed Open Apps
 * (from `dynamicPackages`), then the app whose repository we are standing in (from
 * `mj-app.json`), so the most local definition overrides the most generic one.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DiscoveredDynamicPackage, DynamicPackageEntry, DynamicPackageTier, DynamicPackagesConfig } from './types.js';

/**
 * `codeGeneration.packages.<type>.name` keys that make sense for each tier. `angularForms` is
 * a browser library and must never be imported into a Node process; `graphqlResolvers` has no
 * meaning in a browser bundle.
 */
export const GENERATED_PACKAGE_TYPES_BY_TIER: Record<DynamicPackageTier, readonly string[]> = {
    server: ['entities', 'actions', 'graphqlResolvers'],
    client: ['entities', 'actions', 'angularForms'],
};

/** The manifest file every Open App repository carries at its root. */
export const APP_MANIFEST_FILE_NAME = 'mj-app.json';

/** Reads the `dynamicPackages` section off a raw config object, tolerating any shape. */
export function ReadDynamicPackagesConfig(config: Record<string, unknown> | null | undefined): DynamicPackagesConfig {
    const raw = config?.dynamicPackages;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }
    const section = raw as Record<string, unknown>;
    return {
        server: sanitizeEntries(section.server),
        client: sanitizeEntries(section.client),
        policy: sanitizePolicy(section.policy),
    };
}

function sanitizeEntries(raw: unknown): DynamicPackageEntry[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const entries: DynamicPackageEntry[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const rec = item as Record<string, unknown>;
        const name = typeof rec.PackageName === 'string' ? rec.PackageName.trim() : '';
        if (!name) {
            continue;
        }
        entries.push({
            PackageName: name,
            StartupExport: typeof rec.StartupExport === 'string' && rec.StartupExport.trim() ? rec.StartupExport.trim() : undefined,
            AppName: typeof rec.AppName === 'string' ? rec.AppName : undefined,
            Enabled: rec.Enabled === false ? false : true,
            Processes: stringList(rec.Processes),
            ExcludeProcesses: stringList(rec.ExcludeProcesses),
        });
    }
    return entries;
}

function stringList(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const list = raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return list.length > 0 ? list : undefined;
}

function sanitizePolicy(raw: unknown): Record<string, 'load' | 'none'> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const policy: Record<string, 'load' | 'none'> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string') {
            // Kept as-is (typed loosely); mode parsing decides validity and reports it.
            policy[key] = value as 'load' | 'none';
        }
    }
    return Object.keys(policy).length > 0 ? policy : undefined;
}

/** Entries for the host's own generated packages (`codeGeneration.packages`). */
export function DiscoverGeneratedPackages(
    config: Record<string, unknown> | null | undefined,
    tier: DynamicPackageTier
): DiscoveredDynamicPackage[] {
    const codeGeneration = config?.codeGeneration as { packages?: Record<string, { name?: unknown }> } | undefined;
    const packages = codeGeneration?.packages;
    if (!packages || typeof packages !== 'object') {
        return [];
    }
    const found: DiscoveredDynamicPackage[] = [];
    for (const type of GENERATED_PACKAGE_TYPES_BY_TIER[tier]) {
        const name = packages[type]?.name;
        if (typeof name === 'string' && name.trim().length > 0) {
            found.push({ Source: 'generated', Entry: { PackageName: name.trim(), Enabled: true } });
        }
    }
    return found;
}

/** Minimal view of `mj-app.json` — only what discovery needs; the engine owns the full schema. */
interface AppManifestPackage {
    name?: unknown;
    role?: unknown;
    startupExport?: unknown;
}
interface AppManifest {
    name?: unknown;
    packages?: { server?: AppManifestPackage[]; client?: AppManifestPackage[]; shared?: AppManifestPackage[] };
    code?: { sourceDirectory?: unknown };
}

export interface AppManifestDiscovery {
    /** Directory the manifest was read from. */
    RepoDir: string;
    /** `mj-app.json` `name`. */
    AppName: string;
    /** Directory under the repo that holds the app's workspace packages (`code.sourceDirectory`, default `packages`). */
    SourceDirectory: string;
    Entries: DiscoveredDynamicPackage[];
}

/**
 * Reads `mj-app.json` from `repoDir` and returns the packages a process of `tier` should
 * load: `shared` libraries first (entities/actions register on import), then the tier's own
 * packages, with each `startupExport` carried through. Returns `null` when there is no
 * manifest, and throws only when a manifest exists but is not valid JSON — a corrupt file is
 * a problem the operator must see, an absent one is the common case.
 */
export function DiscoverAppManifestPackages(repoDir: string, tier: DynamicPackageTier): AppManifestDiscovery | null {
    const manifestPath = path.join(repoDir, APP_MANIFEST_FILE_NAME);
    if (!existsSync(manifestPath)) {
        return null;
    }
    let manifest: AppManifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AppManifest;
    } catch (error: unknown) {
        throw new Error(`Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const appName = typeof manifest.name === 'string' ? manifest.name : path.basename(repoDir);
    const sourceDirectory = typeof manifest.code?.sourceDirectory === 'string' && manifest.code.sourceDirectory.trim()
        ? manifest.code.sourceDirectory.trim()
        : 'packages';

    const entries: DiscoveredDynamicPackage[] = [];
    const push = (pkg: AppManifestPackage): void => {
        const name = typeof pkg?.name === 'string' ? pkg.name.trim() : '';
        if (!name) {
            return;
        }
        entries.push({
            Source: 'manifest',
            WorkspaceHome: { RepoDir: repoDir, SourceDirectory: sourceDirectory },
            Entry: {
                PackageName: name,
                StartupExport: typeof pkg.startupExport === 'string' && pkg.startupExport.trim() ? pkg.startupExport.trim() : undefined,
                AppName: appName,
                Enabled: true,
            },
        });
    };
    for (const pkg of manifest.packages?.shared ?? []) {
        push(pkg);
    }
    for (const pkg of manifest.packages?.[tier] ?? []) {
        push(pkg);
    }
    return { RepoDir: repoDir, AppName: appName, SourceDirectory: sourceDirectory, Entries: entries };
}

/**
 * Locates a workspace package by name under an app repo's source directory (one level deep,
 * matching `code.sourceDirectory`), returning its directory. Used when the process runs inside
 * the app's own repository: the package is a workspace member there, but under pnpm's strict
 * layout nothing at the repo root can `require.resolve` it, so we find it on disk instead.
 */
export function FindWorkspacePackageDir(repoDir: string, sourceDirectory: string, packageName: string): string | null {
    const root = path.resolve(repoDir, sourceDirectory);
    if (!existsSync(root)) {
        return null;
    }
    let children: string[];
    try {
        children = readdirSync(root);
    } catch {
        return null;
    }
    for (const child of children) {
        const pkgJsonPath = path.join(root, child, 'package.json');
        if (!existsSync(pkgJsonPath)) {
            continue;
        }
        try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { name?: unknown };
            if (pkgJson.name === packageName) {
                return path.join(root, child);
            }
        } catch {
            // unreadable package.json — not the one we want
        }
    }
    return null;
}
