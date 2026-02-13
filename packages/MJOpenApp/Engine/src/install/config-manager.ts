/**
 * Configuration manager for MJ Open Apps.
 *
 * Manages the `dynamicPackages.server` section in `mj.config.cjs`,
 * adding/removing/toggling entries for installed app server packages.
 *
 * Uses string-based manipulation of the config file to preserve formatting
 * and comments as much as possible.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

/**
 * A single entry in the dynamicPackages.server array.
 */
export interface DynamicPackageEntry {
    /** npm package name */
    PackageName: string;
    /** Named export to call after import */
    StartupExport: string;
    /** Open App name this package belongs to */
    AppName: string;
    /** Whether this package should be loaded */
    Enabled: boolean;
}

/**
 * Result of a config operation.
 */
export interface ConfigOperationResult {
    /** Whether the operation succeeded */
    Success: boolean;
    /** Error message if the operation failed */
    ErrorMessage?: string;
}

/**
 * Adds server dynamic package entries to mj.config.cjs for an installed app.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param manifest - The app's validated manifest
 * @returns Operation result
 */
export function AddServerDynamicPackages(
    repoRoot: string,
    manifest: MJAppManifest
): ConfigOperationResult {
    const configPath = resolve(repoRoot, 'mj.config.cjs');
    const serverPackages = GetServerPackagesFromManifest(manifest);

    if (serverPackages.length === 0) {
        return { Success: true };
    }

    try {
        let content = readFileSync(configPath, 'utf-8');
        content = EnsureDynamicPackagesSection(content);

        for (const entry of serverPackages) {
            content = AddEntryToServerArray(content, entry);
        }

        writeFileSync(configPath, content, 'utf-8');
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to update config: ${message}` };
    }
}

/**
 * Removes all server dynamic package entries for an app from mj.config.cjs.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param appName - The app name to remove entries for
 * @returns Operation result
 */
export function RemoveServerDynamicPackages(
    repoRoot: string,
    appName: string
): ConfigOperationResult {
    const configPath = resolve(repoRoot, 'mj.config.cjs');

    try {
        let content = readFileSync(configPath, 'utf-8');
        content = RemoveEntriesForApp(content, appName);
        writeFileSync(configPath, content, 'utf-8');
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to update config: ${message}` };
    }
}

/**
 * Toggles the enabled state of all dynamic package entries for an app.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param appName - The app name to toggle
 * @param enabled - Whether to enable or disable
 * @returns Operation result
 */
export function ToggleServerDynamicPackages(
    repoRoot: string,
    appName: string,
    enabled: boolean
): ConfigOperationResult {
    const configPath = resolve(repoRoot, 'mj.config.cjs');

    try {
        let content = readFileSync(configPath, 'utf-8');
        content = ToggleEntriesForApp(content, appName, enabled);
        writeFileSync(configPath, content, 'utf-8');
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to update config: ${message}` };
    }
}

/**
 * Extracts server package entries from a manifest's packages section.
 */
function GetServerPackagesFromManifest(manifest: MJAppManifest): DynamicPackageEntry[] {
    const entries: DynamicPackageEntry[] = [];
    const serverPkgs = manifest.packages?.server ?? [];
    const sharedPkgs = manifest.packages?.shared ?? [];

    for (const pkg of [...serverPkgs, ...sharedPkgs]) {
        if (pkg.startupExport) {
            entries.push({
                PackageName: pkg.name,
                StartupExport: pkg.startupExport,
                AppName: manifest.name,
                Enabled: true
            });
        }
    }

    return entries;
}

/**
 * Ensures the config file has a dynamicPackages.server section.
 * If it doesn't exist, adds one before module.exports closing.
 */
function EnsureDynamicPackagesSection(content: string): string {
    if (content.includes('dynamicPackages')) {
        return content;
    }

    // Insert dynamicPackages section before the closing of module.exports
    const insertionPoint = content.lastIndexOf('};');
    if (insertionPoint === -1) {
        return content;
    }

    const section = `\n  dynamicPackages: {\n    server: []\n  },\n`;
    return content.slice(0, insertionPoint) + section + content.slice(insertionPoint);
}

/**
 * Adds a single entry to the dynamicPackages.server array in the config string.
 */
function AddEntryToServerArray(content: string, entry: DynamicPackageEntry): string {
    // Find the server array
    const serverArrayMatch = content.match(/server:\s*\[/);
    if (!serverArrayMatch || serverArrayMatch.index === undefined) {
        return content;
    }

    const entryStr = `\n      {\n        PackageName: '${entry.PackageName}',\n        StartupExport: '${entry.StartupExport}',\n        AppName: '${entry.AppName}',\n        Enabled: ${entry.Enabled}\n      },`;

    // Find the closing bracket of the server array
    const arrayStart = serverArrayMatch.index + serverArrayMatch[0].length;
    const closingBracket = FindMatchingBracket(content, arrayStart - 1);
    if (closingBracket === -1) {
        return content;
    }

    return content.slice(0, closingBracket) + entryStr + '\n    ' + content.slice(closingBracket);
}

/**
 * Removes all entries with a given appName from the server array.
 */
function RemoveEntriesForApp(content: string, appName: string): string {
    // Match object blocks containing the appName
    const pattern = new RegExp(
        `\\s*\\{[^}]*AppName:\\s*'${EscapeRegex(appName)}'[^}]*\\},?`,
        'g'
    );
    return content.replace(pattern, '');
}

/**
 * Toggles enabled state for all entries with a given appName.
 */
function ToggleEntriesForApp(content: string, appName: string, enabled: boolean): string {
    // Find entries with the given appName and replace enabled value
    const pattern = new RegExp(
        `(AppName:\\s*'${EscapeRegex(appName)}'[^}]*Enabled:\\s*)(?:true|false)`,
        'g'
    );
    return content.replace(pattern, `$1${enabled}`);
}

/**
 * Finds the matching closing bracket for an opening bracket.
 */
function FindMatchingBracket(content: string, openPos: number): number {
    const openChar = content[openPos];
    const closeChar = openChar === '[' ? ']' : '}';
    let depth = 1;
    let pos = openPos + 1;

    while (pos < content.length && depth > 0) {
        if (content[pos] === openChar) depth++;
        if (content[pos] === closeChar) depth--;
        pos++;
    }

    return depth === 0 ? pos - 1 : -1;
}

/**
 * Escapes special regex characters in a string.
 */
function EscapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
