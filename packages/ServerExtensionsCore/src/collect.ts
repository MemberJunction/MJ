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
