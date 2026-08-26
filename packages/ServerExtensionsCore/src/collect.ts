/**
 * @module @memberjunction/server-extensions-core
 * @description Pure collect / normalize / merge for Open App server-extension metadata.
 *
 * Open App server packages declare the extensions they need mounted. The host
 * `mj.config.cjs` `serverExtensions[]` remains the override layer (and the place
 * host-only extensions such as Slack/Teams live). Discovery of the Open App
 * declarations happens in `@memberjunction/server-bootstrap` because
 * `dynamicPackages` is stripped from MJServer's Zod-parsed `configInfo`.
 */

import { ServerExtensionConfig } from './types.js';

/** Named export Open App server packages use to publish their extension configs. */
export const MJ_SERVER_EXTENSIONS_EXPORT = 'MJ_SERVER_EXTENSIONS';

/** `package.json` path Open App server packages use for static introspection. */
export const MJ_SERVER_EXTENSIONS_PACKAGE_JSON_PATH = 'memberjunction.serverExtensions';

export interface NormalizeServerExtensionOptions {
    /** Label used in skip messages (package name, file path, etc.). */
    source?: string;
    /** Called once per skipped/invalid entry. Tests pass a spy; production logs. */
    onInvalid?: (message: string) => void;
}

function cloneConfig(config: ServerExtensionConfig): ServerExtensionConfig {
    return {
        Enabled: config.Enabled,
        DriverClass: config.DriverClass,
        RootPath: config.RootPath,
        Settings: { ...(config.Settings ?? {}) },
    };
}

function invalid(options: NormalizeServerExtensionOptions | undefined, message: string): void {
    options?.onInvalid?.(message);
}

/**
 * Coerce unknown JSON / module-export data into `ServerExtensionConfig[]`.
 * Invalid entries are skipped (not thrown) so one bad Open App declaration
 * cannot take down server boot.
 */
export function normalizeServerExtensionConfigs(
    raw: unknown,
    options?: NormalizeServerExtensionOptions
): ServerExtensionConfig[] {
    const source = options?.source ? ` (${options.source})` : '';
    if (raw == null) {
        return [];
    }
    if (!Array.isArray(raw)) {
        invalid(options, `serverExtensions must be an array${source}`);
        return [];
    }

    const result: ServerExtensionConfig[] = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
            invalid(options, `serverExtensions[${i}] is not an object${source}`);
            continue;
        }
        const rec = entry as Record<string, unknown>;
        const driverClass = typeof rec.DriverClass === 'string' ? rec.DriverClass.trim() : '';
        if (!driverClass) {
            invalid(options, `serverExtensions[${i}] missing DriverClass${source}`);
            continue;
        }
        const rootPath = typeof rec.RootPath === 'string' ? rec.RootPath.trim() : '';
        if (!rootPath) {
            invalid(options, `serverExtensions[${i}] ('${driverClass}') missing RootPath${source}`);
            continue;
        }
        const rootError = validateServerExtensionRootPath(rootPath);
        if (rootError) {
            invalid(options, `serverExtensions[${i}] ('${driverClass}') ${rootError}${source}`);
            continue;
        }
        let enabled = true;
        if (rec.Enabled !== undefined) {
            if (typeof rec.Enabled !== 'boolean') {
                invalid(options, `serverExtensions[${i}] ('${driverClass}') Enabled must be a boolean${source}`);
                continue;
            }
            enabled = rec.Enabled;
        }
        const settings =
            rec.Settings != null && typeof rec.Settings === 'object' && !Array.isArray(rec.Settings)
                ? { ...(rec.Settings as Record<string, unknown>) }
                : {};
        if (rec.Settings != null && (typeof rec.Settings !== 'object' || Array.isArray(rec.Settings))) {
            invalid(options, `serverExtensions[${i}] ('${driverClass}') Settings is not an object; using {}${source}`);
        }
        result.push({
            Enabled: enabled,
            DriverClass: driverClass,
            RootPath: rootPath,
            Settings: settings,
        });
    }
    return result;
}

/**
 * Read `MJ_SERVER_EXTENSIONS` from an already-imported Open App server module.
 */
export function extractServerExtensionsFromModule(
    mod: Record<string, unknown> | null | undefined,
    options?: NormalizeServerExtensionOptions
): ServerExtensionConfig[] {
    if (!mod || typeof mod !== 'object') {
        return [];
    }
    if (!(MJ_SERVER_EXTENSIONS_EXPORT in mod)) {
        return [];
    }
    return normalizeServerExtensionConfigs(mod[MJ_SERVER_EXTENSIONS_EXPORT], options);
}

/**
 * Read `memberjunction.serverExtensions` from a parsed `package.json`.
 */
export function extractServerExtensionsFromPackageJson(
    pkgJson: unknown,
    options?: NormalizeServerExtensionOptions
): ServerExtensionConfig[] {
    if (pkgJson == null || typeof pkgJson !== 'object' || Array.isArray(pkgJson)) {
        return [];
    }
    const memberjunction = (pkgJson as Record<string, unknown>).memberjunction;
    if (memberjunction == null || typeof memberjunction !== 'object' || Array.isArray(memberjunction)) {
        return [];
    }
    return normalizeServerExtensionConfigs(
        (memberjunction as Record<string, unknown>).serverExtensions,
        options
    );
}

/**
 * Merge Open App–discovered extension configs with the host `mj.config.cjs` list.
 *
 * - Identity is `DriverClass`.
 * - Later discovered entries replace earlier ones (ClassFactory last-wins).
 * - Host overlay wins `Enabled` and `RootPath` when the host provides them;
 *   `Settings` is `{ ...discovered, ...host }`.
 * - Host-only DriverClasses append after discovered ones.
 * - A host `Enabled: false` entry is kept so the loader skips that DriverClass
 *   rather than falling back to the discovered one.
 */
export function mergeServerExtensionConfigs(
    discovered: readonly ServerExtensionConfig[] | null | undefined,
    host: readonly ServerExtensionConfig[] | null | undefined
): ServerExtensionConfig[] {
    const byClass = new Map<string, ServerExtensionConfig>();
    const order: string[] = [];

    const remember = (driverClass: string, config: ServerExtensionConfig): void => {
        if (!byClass.has(driverClass)) {
            order.push(driverClass);
        }
        byClass.set(driverClass, config);
    };

    for (const entry of discovered ?? []) {
        const key = entry?.DriverClass?.trim();
        if (!key) {
            continue;
        }
        remember(key, cloneConfig({ ...entry, DriverClass: key }));
    }

    for (const entry of host ?? []) {
        const key = entry?.DriverClass?.trim();
        if (!key) {
            continue;
        }
        const existing = byClass.get(key);
        if (!existing) {
            remember(key, cloneConfig({ ...entry, DriverClass: key }));
            continue;
        }
        const hostRoot = typeof entry.RootPath === 'string' ? entry.RootPath.trim() : '';
        remember(key, {
            Enabled: entry.Enabled ?? existing.Enabled,
            DriverClass: key,
            RootPath: hostRoot || existing.RootPath,
            Settings: { ...(existing.Settings ?? {}), ...(entry.Settings ?? {}) },
        });
    }

    return order.map((key) => byClass.get(key)!);
}

/** Exact RootPaths that must never be claimed by an extension (they are the whole tree or a core endpoint). */
export const RESERVED_SERVER_EXTENSION_ROOTS: readonly string[] = ['/'];

/**
 * Prefixes of core MJServer routes. An extension RootPath that equals one of these
 * or is nested under it would mount pre-auth on top of (or instead of) a core path.
 * Matching is prefix-with-slash so `/health` rejects `/health/extensions` but not `/healthcare`.
 */
export const RESERVED_SERVER_EXTENSION_ROOT_PREFIXES: readonly string[] = [
    '/graphql',
    '/auth',
    '/oauth',
    '/health',
    '/magic-link',
];

export const MAX_SERVER_EXTENSION_ROOT_PATH_LENGTH = 128;

function normalizeRoot(rootPath: string): string {
    const trimmed = rootPath.trim();
    if (trimmed === '/') {
        return '/';
    }
    return trimmed.replace(/\/+$/, '') || '/';
}

/**
 * Returns an error message when `rootPath` is unsafe to mount pre-auth, or `null` when it is usable.
 * Fail closed: invalid paths must not be mounted.
 */
export function validateServerExtensionRootPath(rootPath: string): string | null {
    const raw = rootPath.trim();
    if (!raw) {
        return 'RootPath is empty';
    }
    if (!raw.startsWith('/')) {
        return `RootPath '${raw}' must start with '/'`;
    }
    if (raw.length > MAX_SERVER_EXTENSION_ROOT_PATH_LENGTH) {
        return `RootPath exceeds ${MAX_SERVER_EXTENSION_ROOT_PATH_LENGTH} characters`;
    }
    if (/[*?[\](){}]/.test(raw)) {
        return `RootPath '${raw}' must not contain wildcards or glob characters`;
    }
    const normalized = normalizeRoot(raw);
    if (RESERVED_SERVER_EXTENSION_ROOTS.includes(normalized)) {
        return `RootPath '${raw}' is reserved`;
    }
    for (const prefix of RESERVED_SERVER_EXTENSION_ROOT_PREFIXES) {
        if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
            return `RootPath '${raw}' collides with the reserved prefix '${prefix}'`;
        }
    }
    return null;
}

/** True when two roots are equal or one is a nested path of the other. */
export function serverExtensionRootsOverlap(a: string, b: string): boolean {
    const na = normalizeRoot(a);
    const nb = normalizeRoot(b);
    if (na === nb) {
        return true;
    }
    return na.startsWith(`${nb}/`) || nb.startsWith(`${na}/`);
}

export interface PrepareServerExtensionOptions extends NormalizeServerExtensionOptions {
    onOverlap?: (message: string) => void;
}

/**
 * Post-merge filter used by `serve()`: drop invalid roots (fail closed) and warn when
 * two *enabled* extensions claim overlapping paths. Disabled entries are kept so the
 * loader can skip them by DriverClass (host `Enabled: false` stays visible).
 */
export function prepareServerExtensionConfigs(
    configs: readonly ServerExtensionConfig[] | null | undefined,
    options?: PrepareServerExtensionOptions
): ServerExtensionConfig[] {
    const kept: ServerExtensionConfig[] = [];
    for (const entry of configs ?? []) {
        const rootError = validateServerExtensionRootPath(entry.RootPath ?? '');
        if (rootError) {
            invalid(options, `Dropping server extension '${entry.DriverClass}': ${rootError}`);
            continue;
        }
        kept.push(cloneConfig({ ...entry, RootPath: normalizeRoot(entry.RootPath) }));
    }

    const enabled = kept.filter((c) => c.Enabled);
    for (let i = 0; i < enabled.length; i++) {
        for (let j = i + 1; j < enabled.length; j++) {
            if (serverExtensionRootsOverlap(enabled[i].RootPath, enabled[j].RootPath)) {
                options?.onOverlap?.(
                    `Enabled server extensions '${enabled[i].DriverClass}' (${enabled[i].RootPath}) and '${enabled[j].DriverClass}' (${enabled[j].RootPath}) have overlapping RootPaths`
                );
            }
        }
    }
    return kept;
}

/**
 * One-line inventory of a server-extension mount. All extension routes are installed
 * BEFORE MJServer's auth middleware — the operator must be able to see that at boot.
 */
export function describeServerExtensionMount(config: ServerExtensionConfig): string {
    const state = config.Enabled ? 'enabled' : 'disabled';
    return `${config.DriverClass} at ${config.RootPath} (${state}, PRE-AUTH; host mj.config.cjs serverExtensions[] can set Enabled: false to suppress)`;
}
