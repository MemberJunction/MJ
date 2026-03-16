/**
 * Configuration manager for MJ Open Apps.
 *
 * Manages the `dynamicPackages.server` section in the MJ config file,
 * adding/removing/toggling entries for installed app server packages.
 *
 * Operates on the standard mj.config.cjs file using string-based manipulation
 * to preserve formatting and comments.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

/** Config file name. All MJ projects use mj.config.cjs. */
const CONFIG_FILE_NAME = 'mj.config.cjs';

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
    const configPath = resolveConfigPath(repoRoot);
    if (!configPath) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}. Expected: ${CONFIG_FILE_NAME}` };
    }
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
    const configPath = resolveConfigPath(repoRoot);
    if (!configPath) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}` };
    }

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
    const configPath = resolveConfigPath(repoRoot);
    if (!configPath) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}` };
    }

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
 * Resolves the path to the MJ config file.
 * Returns the absolute path if it exists, or undefined if not found.
 */
function resolveConfigPath(repoRoot: string): string | undefined {
    const candidate = resolve(repoRoot, CONFIG_FILE_NAME);
    return existsSync(candidate) ? candidate : undefined;
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
    // Match entry-level object blocks containing the appName.
    // Uses [^{}]* instead of [^}]* to prevent matching across nested object boundaries
    // (e.g., matching from the outer dynamicPackages { instead of just the entry {).
    const pattern = new RegExp(
        `\\s*\\{[^{}]*AppName:\\s*'${EscapeRegex(appName)}'[^{}]*\\},?`,
        'g'
    );
    return content.replace(pattern, '');
}

/**
 * Toggles enabled state for all entries with a given appName.
 */
function ToggleEntriesForApp(content: string, appName: string, enabled: boolean): string {
    // Find entries with the given appName and replace enabled value.
    // Uses [^{}]* to prevent matching across nested object boundaries.
    const pattern = new RegExp(
        `(AppName:\\s*'${EscapeRegex(appName)}'[^{}]*Enabled:\\s*)(?:true|false)`,
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

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY PACKAGE NAME MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds an entityPackageName mapping to mj.config.cjs for an installed app.
 *
 * CodeGen uses `entityPackageName` to resolve per-schema entity imports.
 * When it's a Record<schemaName, packageName>, each schema's entities are
 * imported from the correct npm package.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param manifest - The app's validated manifest
 * @returns Operation result
 */
export function AddEntityPackageMapping(
    repoRoot: string,
    manifest: MJAppManifest
): ConfigOperationResult {
    const schemaName = manifest.schema?.name;
    if (!schemaName) {
        return { Success: true }; // No schema → nothing to map
    }

    const entityPkg = ResolveEntityPackageFromManifest(manifest);
    if (!entityPkg) {
        return { Success: true }; // No entities package found → nothing to map
    }

    const configPath = resolveConfigPath(repoRoot);
    if (!configPath) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}. Expected: ${CONFIG_FILE_NAME}` };
    }

    try {
        let content = readFileSync(configPath, 'utf-8');
        content = EnsureEntityPackageNameSection(content);
        content = AddEntityPackageEntry(content, schemaName, entityPkg);
        writeFileSync(configPath, content, 'utf-8');
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to update entityPackageName config: ${message}` };
    }
}

/**
 * Removes an entityPackageName mapping for an app's schema from mj.config.cjs.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param schemaName - The schema name to remove the mapping for
 * @returns Operation result
 */
export function RemoveEntityPackageMapping(
    repoRoot: string,
    schemaName: string
): ConfigOperationResult {
    if (!schemaName) {
        return { Success: true };
    }

    const configPath = resolveConfigPath(repoRoot);
    if (!configPath) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}` };
    }

    try {
        let content = readFileSync(configPath, 'utf-8');
        content = RemoveEntityPackageEntry(content, schemaName);
        writeFileSync(configPath, content, 'utf-8');
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to remove entityPackageName mapping: ${message}` };
    }
}

/**
 * Resolves the entity package name from a manifest.
 *
 * Priority:
 * 1. Explicit `schema.entityPackage` field
 * 2. First `library`-role package in `packages.shared` whose name contains "entities"
 */
function ResolveEntityPackageFromManifest(manifest: MJAppManifest): string | undefined {
    // Explicit declaration takes priority
    if (manifest.schema?.entityPackage) {
        return manifest.schema.entityPackage;
    }

    // Auto-detect from shared packages
    const sharedPkgs = manifest.packages?.shared ?? [];
    const entitiesPkg = sharedPkgs.find(
        (pkg) => pkg.role === 'library' && pkg.name.toLowerCase().includes('entities')
    );
    return entitiesPkg?.name;
}

/**
 * Ensures entityPackageName exists as a Record in the config.
 * If it exists as a string, converts it to a Record with the string as a fallback comment.
 * If it doesn't exist, adds an empty Record section.
 */
function EnsureEntityPackageNameSection(content: string): string {
    // Check if entityPackageName already exists as a Record (has opening brace)
    const recordMatch = content.match(/entityPackageName\s*:\s*\{/);
    if (recordMatch) {
        return content; // Already a Record — nothing to do
    }

    // Check if entityPackageName exists as a string
    const stringMatch = content.match(/entityPackageName\s*:\s*['"]([^'"]*)['"]\s*,?/);
    if (stringMatch) {
        // Convert string to Record, preserving the old value as a comment
        const oldValue = stringMatch[1];
        const replacement = `entityPackageName: {\n    // Converted from string value '${oldValue}' by mj app install\n  },`;
        return content.replace(stringMatch[0], replacement);
    }

    // entityPackageName doesn't exist at all — insert before the closing };
    const insertionPoint = content.lastIndexOf('};');
    if (insertionPoint === -1) {
        return content;
    }

    const section = `\n  entityPackageName: {\n  },\n`;
    return content.slice(0, insertionPoint) + section + content.slice(insertionPoint);
}

/**
 * Adds a single schema→package entry to the entityPackageName Record.
 * If the schema already has a mapping, it is replaced.
 */
function AddEntityPackageEntry(content: string, schemaName: string, packageName: string): string {
    // First remove any existing entry for this schema to avoid duplicates
    content = RemoveEntityPackageEntry(content, schemaName);

    // Find the entityPackageName Record opening brace
    const recordMatch = content.match(/entityPackageName\s*:\s*\{/);
    if (!recordMatch || recordMatch.index === undefined) {
        return content;
    }

    const bracePos = content.indexOf('{', recordMatch.index);
    const entryStr = `\n    '${schemaName}': '${packageName}',`;

    // Insert right after the opening brace
    return content.slice(0, bracePos + 1) + entryStr + content.slice(bracePos + 1);
}

/**
 * Removes a schema entry from the entityPackageName Record.
 */
function RemoveEntityPackageEntry(content: string, schemaName: string): string {
    // Match a line like: 'schemaName': 'package-name',
    const pattern = new RegExp(
        `\\s*'${EscapeRegex(schemaName)}'\\s*:\\s*'[^']*'\\s*,?`,
        'g'
    );
    return content.replace(pattern, '');
}

/**
 * Escapes special regex characters in a string.
 */
function EscapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
