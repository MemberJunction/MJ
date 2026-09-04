/**
 * The loader. One call per process, right after configuration is discovered and BEFORE any
 * database provider is set up — so registration happens exactly where it does in MJAPI, and a
 * `StartupExport` can rely on nothing but the ClassFactory (the contract MJAPI has always
 * imposed: startup exports register classes, they do not touch a provider).
 *
 * Robustness contract, identical to the loader this replaces in @memberjunction/server-bootstrap:
 * no-op when nothing is configured, per-package try/catch, a package that cannot be resolved is
 * reported as not-found (expected before `npm install`, and for a workspace member found on disk
 * whose entry file has not been built yet), a
 * package that resolves but throws surfaces its own error on the warn path, and boot never
 * crashes because of an app package.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cosmiconfigSync } from 'cosmiconfig';
import {
    DiscoverAppManifestPackages,
    DiscoverGeneratedPackages,
    FindWorkspacePackageDir,
    ReadDynamicPackagesConfig,
} from './discover.js';
import { importFromHost, isResolutionFailure } from './host-import.js';
import { ResolveDynamicPackagesMode } from './mode.js';
import { MatchesProcess, NormalizeProcessId } from './process-id.js';
import type {
    DiscoveredDynamicPackage,
    DynamicPackagesLogger,
    DynamicPackagesReport,
    LoadDynamicPackagesOptions,
    LoadedDynamicPackage,
} from './types.js';

/** Default output channel: plain console, the way MJAPI has always logged its boot. */
export const ConsoleDynamicPackagesLogger: DynamicPackagesLogger = {
    info: (message) => console.log(message),
    warn: (message, error) => (error === undefined ? console.warn(message) : console.warn(message, error)),
    verbose: () => undefined,
};

/**
 * A logger that keeps stdout clean: progress and warnings go to stderr, verbose detail is dropped.
 * For CLI hosts whose stdout is a machine-readable envelope (`--format=json`, `--output=json`) —
 * the default console logger would print "Loading Open App server packages..." ahead of the JSON.
 */
export const StderrDynamicPackagesLogger: DynamicPackagesLogger = {
    info: (message) => process.stderr.write(`${message}\n`),
    warn: (message, error) => {
        const detail = error === undefined ? '' : ` ${error instanceof Error ? error.message : String(error)}`;
        process.stderr.write(`${message}${detail}\n`);
    },
    verbose: () => undefined,
};

/** A logger that says nothing — for hosts that read the report and render it themselves. */
export const SilentDynamicPackagesLogger: DynamicPackagesLogger = {
    info: () => undefined,
    warn: () => undefined,
    verbose: () => undefined,
};

/**
 * Discovers `mj.config.cjs` the way every MJ entry point does (cosmiconfig, module name `mj`,
 * global search strategy) and returns the RAW object plus its path. Hosts whose own config
 * loader Zod-strips `dynamicPackages` use this to hand the loader an unstripped view.
 */
export function DiscoverMJConfig(searchFrom?: string): { config: Record<string, unknown>; configFilePath?: string } {
    const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
    const result = explorer.search(searchFrom ?? process.cwd());
    return {
        config: (result?.config ?? {}) as Record<string, unknown>,
        configFilePath: result?.filepath,
    };
}

/** Human-readable label for a discovered entry's origin, used in log lines. */
function describeSource(pkg: DiscoveredDynamicPackage): string {
    switch (pkg.Source) {
        case 'generated':
            return 'generated package';
        case 'manifest':
            return `Open App package (from mj-app.json${pkg.Entry.AppName ? ` of ${pkg.Entry.AppName}` : ''})`;
        default:
            return 'Open App server package';
    }
}

/**
 * Loads every dynamic package that applies to `options.processId`, in discovery order:
 * host generated packages → `dynamicPackages.<tier>[]` → the local `mj-app.json` (if any).
 * Never throws for a package problem; the returned report says what happened to each entry.
 */
export async function LoadDynamicPackages(options: LoadDynamicPackagesOptions): Promise<DynamicPackagesReport> {
    const processId = NormalizeProcessId(options.processId);
    if (!processId) {
        throw new Error('LoadDynamicPackages: processId is required (e.g. "mjapi", "cli:sync:push", "mcp").');
    }
    const tier = options.tier ?? 'server';
    const log = options.log ?? ConsoleDynamicPackagesLogger;
    const config = options.config ?? null;
    const section = ReadDynamicPackagesConfig(config);

    const resolved = ResolveDynamicPackagesMode({ processId, option: options.mode, policy: section.policy });
    if (resolved.ignoredInvalid) {
        log.warn(`[dynamic-packages] Ignoring invalid ${resolved.ignoredInvalid} (expected 'load' or 'none')`);
    }
    log.verbose?.(`[dynamic-packages] process '${processId}', tier '${tier}', mode '${resolved.mode}' (source: ${resolved.source})`);

    const report: DynamicPackagesReport = {
        ProcessId: processId,
        Tier: tier,
        Mode: resolved.mode,
        ModeSource: resolved.source,
        Loaded: [],
        Skipped: [],
        NotFound: [],
        Failed: [],
    };

    const candidates = collectCandidates(options, tier, config, section, log);
    if (candidates.length === 0) {
        return report;
    }

    if (resolved.mode === 'none') {
        for (const candidate of candidates) {
            report.Skipped.push({ ...candidate, Reason: 'mode-none' });
        }
        log.info(`[dynamic-packages] Skipping ${candidates.length} package(s): mode 'none' (source: ${resolved.source})`);
        return report;
    }

    const seen = new Set<string>();
    const alreadyLoaded = loadedInThisProcess();
    let announcedGenerated = false;
    let announcedApps = false;
    for (const candidate of candidates) {
        const { Entry: entry } = candidate;
        if (seen.has(entry.PackageName)) {
            report.Skipped.push({ ...candidate, Reason: 'duplicate' });
            continue;
        }
        const cached = alreadyLoaded.get(entry.PackageName);
        if (cached) {
            // A second host in the same process (e.g. `mj-ai` driven by `mj`) still needs the
            // module — to read RESOLVER_PATHS, MJ_SERVER_EXTENSIONS, … — but must not re-run the
            // startup export. ESM caches the module anyway; this only prevents the double hook.
            report.Loaded.push({ ...candidate, Module: cached, RanStartupExport: false });
            log.verbose?.(`[dynamic-packages] ${entry.PackageName} already loaded in this process; startup export not re-run`);
            continue;
        }
        if (entry.Enabled === false) {
            report.Skipped.push({ ...candidate, Reason: 'disabled' });
            log.verbose?.(`[dynamic-packages] Skipping ${entry.PackageName}: disabled`);
            continue;
        }
        if (!MatchesProcess(processId, entry)) {
            report.Skipped.push({ ...candidate, Reason: 'process-filter' });
            log.verbose?.(`[dynamic-packages] Skipping ${entry.PackageName}: not scoped to process '${processId}'`);
            continue;
        }
        seen.add(entry.PackageName);

        // Section headers mirror the lines MJAPI has printed at boot for years.
        if (candidate.Source === 'generated' && !announcedGenerated) {
            log.info('Loading generated packages...');
            announcedGenerated = true;
        } else if (candidate.Source !== 'generated' && !announcedApps) {
            log.info(`Loading Open App ${tier} packages...`);
            announcedApps = true;
        }

        await loadOne(candidate, options, report, log);
    }
    return report;
}

/** Orders the three discovery sources. Manifest discovery failures are the operator's to see, not fatal. */
function collectCandidates(
    options: LoadDynamicPackagesOptions,
    tier: 'server' | 'client',
    config: Record<string, unknown> | null,
    section: ReturnType<typeof ReadDynamicPackagesConfig>,
    log: DynamicPackagesLogger
): DiscoveredDynamicPackage[] {
    const candidates: DiscoveredDynamicPackage[] = [];
    if (options.includeGeneratedPackages !== false) {
        candidates.push(...DiscoverGeneratedPackages(config, tier));
    }
    for (const entry of section[tier] ?? []) {
        candidates.push({ Source: 'config', Entry: entry });
    }
    if (options.discoverAppManifest !== false) {
        const repoDir = options.appManifestDir ?? (options.configFilePath ? path.dirname(options.configFilePath) : process.cwd());
        try {
            const manifest = DiscoverAppManifestPackages(repoDir, tier);
            if (manifest) {
                candidates.push(...manifest.Entries);
            }
        } catch (error: unknown) {
            log.warn(`[dynamic-packages] Could not read ${path.join(repoDir, 'mj-app.json')}:`, error);
        }
    }
    return candidates;
}

async function loadOne(
    candidate: DiscoveredDynamicPackage,
    options: LoadDynamicPackagesOptions,
    report: DynamicPackagesReport,
    log: DynamicPackagesLogger
): Promise<void> {
    const { Entry: entry } = candidate;
    const pkgName = entry.PackageName;
    const label = describeSource(candidate);
    const manifestHome = candidate.WorkspaceHome;
    try {
        let mod: Record<string, unknown>;
        try {
            mod = await importFromHost(pkgName, options.configFilePath);
        } catch (error: unknown) {
            // A manifest-sourced package may be a workspace member nothing can require.resolve
            // (pnpm strict layout, root without the package as a dependency). Find it on disk.
            const onDisk = manifestHome && isOwnResolutionFailure(error, pkgName)
                ? FindWorkspacePackageDir(manifestHome.RepoDir, manifestHome.SourceDirectory, pkgName)
                : null;
            if (!onDisk) {
                throw error;
            }
            const entryFile = resolvePackageEntryFile(onDisk);
            if (!existsSync(entryFile)) {
                // The workspace member exists but has not been built (no dist yet) — the expected
                // state before the app's own build, not an error. Report it as not-found, with the
                // file the build is expected to produce, and never on the warn path.
                report.NotFound.push(candidate);
                log.info(`  ${label} ${pkgName} found at ${onDisk} but not built (missing ${path.relative(onDisk, entryFile)}) — build it first`);
                return;
            }
            mod = await importPackageDir(entryFile);
        }

        const startup = entry.StartupExport ? mod[entry.StartupExport] : undefined;
        let ranStartupExport = false;
        if (typeof startup === 'function') {
            await Promise.resolve((startup as () => unknown)());
            ranStartupExport = true;
        } else if (entry.StartupExport) {
            // A named export that is missing is a real mis-configuration (renamed export, stale
            // config) — say so instead of silently skipping it.
            log.warn(`  ${label} ${pkgName} has no export named '${entry.StartupExport}' — startup hook not run`);
        }

        const loaded: LoadedDynamicPackage = { ...candidate, Module: mod, RanStartupExport: ranStartupExport };
        report.Loaded.push(loaded);
        loadedInThisProcess().set(pkgName, mod);
        log.info(`  Loaded ${label}: ${pkgName}${ranStartupExport ? ` (ran ${entry.StartupExport})` : ''}`);
    } catch (error: unknown) {
        if (isOwnResolutionFailure(error, pkgName)) {
            report.NotFound.push(candidate);
            log.info(
                candidate.Source === 'generated'
                    ? `  Generated package not found (may not exist yet): ${pkgName}`
                    : `  Open App ${report.Tier} package not found (run 'npm install'?): ${pkgName}`
            );
        } else {
            report.Failed.push({ ...candidate, Error: error });
            log.warn(`  Error loading ${label} ${pkgName}:`, error);
        }
    }
}

/**
 * Modules already loaded by ANY copy of this module in the process, by package name. Kept on
 * `globalThis` (not a module variable) because a duplicated module copy — two dist paths under
 * pnpm, a bundled and an unbundled copy — must still agree on what has run.
 */
const LOADED_STORE_KEY = Symbol.for('memberjunction.dynamic-packages.loaded');

function loadedInThisProcess(): Map<string, Record<string, unknown>> {
    const store = globalThis as unknown as Record<symbol, Map<string, Record<string, unknown>> | undefined>;
    let map = store[LOADED_STORE_KEY];
    if (!map) {
        map = new Map<string, Record<string, unknown>>();
        store[LOADED_STORE_KEY] = map;
    }
    return map;
}

/** Test seam: forget what has been loaded so a fresh process can be simulated. */
export function ResetLoadedDynamicPackages(): void {
    loadedInThisProcess().clear();
}

/**
 * True only when THIS package is the error's quoted subject ("Cannot find package '<name>'").
 * A missing TRANSITIVE dependency of a package that WAS found quotes the transitive name
 * instead (this package's name still appears unquoted in the imported-from path, which is why
 * a bare `includes(pkgName)` is not enough); that message is the true cause and must reach
 * the operator via the warn path.
 */
function isOwnResolutionFailure(error: unknown, pkgName: string): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return isResolutionFailure(error) && message.includes(`'${pkgName}'`);
}

/**
 * Resolves a package directory's entry file, honouring a string/"."/conditional `exports` map,
 * else `main`, else `index.js`. Pure path work — whether the file exists is the caller's question.
 */
function resolvePackageEntryFile(dir: string): string {
    const pkgJson = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
        main?: unknown;
        exports?: unknown;
    };
    const entry = resolveExportsEntry(pkgJson.exports) ?? (typeof pkgJson.main === 'string' ? pkgJson.main : 'index.js');
    return path.resolve(dir, entry);
}

/**
 * Imports a package by its resolved entry file. (Dynamic import is justified here as runtime
 * plugin discovery: the path comes from a manifest on disk, not from code.)
 */
async function importPackageDir(entryFile: string): Promise<Record<string, unknown>> {
    return (await import(pathToFileURL(entryFile).href)) as Record<string, unknown>;
}

function resolveExportsEntry(exportsField: unknown): string | null {
    if (typeof exportsField === 'string') {
        return exportsField;
    }
    if (!exportsField || typeof exportsField !== 'object') {
        return null;
    }
    const rec = exportsField as Record<string, unknown>;
    const root = '.' in rec ? rec['.'] : rec;
    if (typeof root === 'string') {
        return root;
    }
    if (root && typeof root === 'object') {
        const cond = root as Record<string, unknown>;
        for (const key of ['import', 'default', 'require', 'node']) {
            if (typeof cond[key] === 'string') {
                return cond[key] as string;
            }
        }
    }
    return null;
}
