/**
 * Configuration manager for MJ Open Apps.
 *
 * Manages the `dynamicPackages.server` and `dynamicPackages.client` sections in the
 * MJ config file, adding/removing/toggling entries for an installed app's packages.
 * The `server` array is loaded at MJAPI boot by @memberjunction/server-bootstrap (B1);
 * the `client` array is consumed by `mj codegen manifest --open-app-client-bootstrap`,
 * which appends a side-effect import per entry to MJExplorer's class-registrations
 * manifest — so the client load mechanism lives in distributed npm packages (the CLI +
 * the generated manifest MJExplorer already imports) rather than a bespoke MJExplorer file.
 *
 * Operates on the standard mj.config.cjs file using string-based manipulation
 * to preserve formatting and comments.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileFunction } from 'node:vm';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

/** Config file name. All MJ projects use mj.config.cjs. */
const CONFIG_FILE_NAME = 'mj.config.cjs';

/**
 * A single entry in the dynamicPackages.server array.
 */
export interface DynamicPackageEntry {
    /** npm package name */
    PackageName: string;
    /** Named export to call after import (server entries only; client entries are side-effect imports) */
    StartupExport?: string;
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
        content = EnsureDynamicArrayPresent(content, 'server');

        for (const entry of serverPackages) {
            content = AddEntryToDynamicArray(content, entry, 'server');
        }

        WriteConfigChecked(configPath, content);
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to update config: ${message}` };
    }
}

/**
 * Adds client dynamic package entries to mj.config.cjs for an installed app.
 *
 * Mirrors {@link AddServerDynamicPackages} but targets the `dynamicPackages.client`
 * array. Client entries are pure side-effect imports (no StartupExport): the
 * `mj codegen manifest --open-app-client-bootstrap` command turns each into an
 * `import '<PackageName>';` line in MJExplorer's class-registrations manifest so the
 * app's @RegisterClass decorators fire when the client bundle loads.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param manifest - The app's validated manifest
 * @returns Operation result
 */
export function AddClientDynamicPackages(
    repoRoot: string,
    manifest: MJAppManifest
): ConfigOperationResult {
    const configPath = resolveConfigPath(repoRoot);
    if (!configPath) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}. Expected: ${CONFIG_FILE_NAME}` };
    }
    const clientPackages = GetClientPackagesFromManifest(manifest);

    if (clientPackages.length === 0) {
        return { Success: true };
    }

    try {
        let content = readFileSync(configPath, 'utf-8');
        content = EnsureDynamicPackagesSection(content);
        content = EnsureDynamicArrayPresent(content, 'client');

        for (const entry of clientPackages) {
            content = AddEntryToDynamicArray(content, entry, 'client');
        }

        WriteConfigChecked(configPath, content);
        return { Success: true };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to update config: ${message}` };
    }
}

/**
 * Removes all server and client dynamic package entries for an app from mj.config.cjs.
 * Entry removal is keyed by AppName and is array-agnostic — it sweeps both the
 * `server` and `client` arrays in one pass.
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
        WriteConfigChecked(configPath, content);
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
        WriteConfigChecked(configPath, content);
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
 * Writes updated mj.config.cjs content, but ONLY after verifying it still parses as valid
 * JavaScript. Every edit in this module is string surgery; this post-write parse guard turns a
 * malformed edit — from this code OR any future change, including config shapes the brace/comment
 * scanner can't perfectly handle (e.g. regex literals containing braces) — into a LOUD failure
 * that leaves the file UNTOUCHED, instead of silently shipping a broken config that breaks the
 * next `require('mj.config.cjs')` (the mj migrate / codegen / build steps an install runs) — #2975.
 *
 * `compileFunction` parses the content (throwing SyntaxError on malformed JS) WITHOUT executing
 * it, so the `require(...)` / `process.env` references in a real config never run. It throws on
 * failure so the caller's existing try/catch surfaces it as `{ Success: false, ErrorMessage }`.
 */
function WriteConfigChecked(configPath: string, content: string): void {
    try {
        compileFunction(content);
    } catch (parseError: unknown) {
        const message = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(
            `the edit would produce invalid JavaScript (${message}); the file was left unchanged. ` +
            `This is a bug in the Open App config editor — please report it with your mj.config.cjs shape.`,
        );
    }
    writeFileSync(configPath, content, 'utf-8');
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
 * Extracts client package entries from a manifest's packages section.
 * Includes `client` and `shared` packages (shared packages run in both the server
 * and client bundles). Unlike server entries, every client/shared package is emitted
 * regardless of startupExport — client entries are side-effect imports.
 */
function GetClientPackagesFromManifest(manifest: MJAppManifest): DynamicPackageEntry[] {
    const entries: DynamicPackageEntry[] = [];
    const clientPkgs = manifest.packages?.client ?? [];
    const sharedPkgs = manifest.packages?.shared ?? [];

    for (const pkg of [...clientPkgs, ...sharedPkgs]) {
        entries.push({
            PackageName: pkg.name,
            AppName: manifest.name,
            Enabled: true
        });
    }

    return entries;
}

/**
 * Ensures the config file has a dynamicPackages section.
 * If it doesn't exist, adds one (with empty server + client arrays) before
 * module.exports closing.
 */
function EnsureDynamicPackagesSection(content: string): string {
    // Match the actual `dynamicPackages:` key. A bare substring check (`includes`)
    // false-matches a comment or unrelated text mentioning the word, which would
    // skip section creation and silently drop the entry (B6).
    if (/dynamicPackages\s*:/.test(content)) {
        return content;
    }

    // Insert the section before the closing brace of the module.exports object literal.
    // Anchored to module.exports (not the file's last `};`) so trailing code can't put the
    // section in the wrong block (B4). Fails loudly if module.exports isn't an object
    // literal (B10).
    const section = `\n  dynamicPackages: {\n    server: [],\n    client: []\n  },\n`;
    return InsertBeforeModuleExportsClose(content, section);
}

/**
 * Ensures the named array (`server` | `client`) exists inside an already-present
 * dynamicPackages section. Configs created before the `client` array existed have only
 * `server`, so the array must be injected before its first entry is added.
 */
function EnsureDynamicArrayPresent(content: string, arrayName: 'server' | 'client'): string {
    const dynMatch = content.match(/dynamicPackages\s*:\s*\{/);
    if (!dynMatch || dynMatch.index === undefined) {
        throw new Error('dynamicPackages section not found in mj.config.cjs.');
    }
    const openBracePos = dynMatch.index + dynMatch[0].length - 1; // the '{'
    const closeBracePos = FindMatchingBracket(content, openBracePos);
    if (closeBracePos === -1) {
        throw new Error('Could not find the closing brace of the dynamicPackages section in mj.config.cjs.');
    }
    const sectionBody = content.slice(openBracePos, closeBracePos);
    // Already present within THIS section — done.
    if (new RegExp(`${arrayName}\\s*:\\s*\\[`).test(sectionBody)) {
        return content;
    }
    // Insert `    <arrayName>: [],` right after the section's opening brace.
    return content.slice(0, openBracePos + 1) + `\n    ${arrayName}: [],` + content.slice(openBracePos + 1);
}

/**
 * Adds a single entry to the named dynamicPackages array (`server` | `client`) in the
 * config string. Client entries omit the StartupExport line (they are side-effect imports).
 */
function AddEntryToDynamicArray(content: string, entry: DynamicPackageEntry, arrayName: 'server' | 'client'): string {
    // Skip if an entry with the same PackageName and AppName already exists
    const existsPattern = new RegExp(
        `PackageName:\\s*['"]${EscapeRegex(entry.PackageName)}['"][^{}]*AppName:\\s*['"]${EscapeRegex(entry.AppName)}['"]`
    );
    if (existsPattern.test(content)) {
        return content;
    }

    // Anchor the target array to the dynamicPackages section — NOT the first
    // `<arrayName>: [` anywhere in the file (which could be an unrelated nested config) — B8.
    const dynMatch = content.match(/dynamicPackages\s*:\s*\{/);
    if (!dynMatch || dynMatch.index === undefined) {
        throw new Error(`dynamicPackages section not found in mj.config.cjs when adding a ${arrayName} package.`);
    }
    const afterDyn = content.slice(dynMatch.index);
    const arrayRel = afterDyn.match(new RegExp(`${arrayName}:\\s*\\[`));
    if (!arrayRel || arrayRel.index === undefined) {
        throw new Error(`dynamicPackages.${arrayName} array not found in mj.config.cjs.`);
    }
    const arrayIndex = dynMatch.index + arrayRel.index;

    const startupLine = entry.StartupExport ? `\n        StartupExport: '${entry.StartupExport}',` : '';
    const entryStr = `\n      {\n        PackageName: '${entry.PackageName}',${startupLine}\n        AppName: '${entry.AppName}',\n        Enabled: ${entry.Enabled}\n      },`;

    // Find the closing bracket of the target array
    const arrayStart = arrayIndex + arrayRel[0].length;
    const closingBracket = FindMatchingBracket(content, arrayStart - 1);
    if (closingBracket === -1) {
        throw new Error(`Could not find the closing bracket of dynamicPackages.${arrayName} in mj.config.cjs.`);
    }

    return content.slice(0, closingBracket) + entryStr + '\n    ' + content.slice(closingBracket);
}

/**
 * Removes all entries with a given appName from both the server and client arrays.
 * The entry-block match is keyed by AppName only, so a single pass sweeps whichever
 * array(s) the app's packages landed in.
 */
function RemoveEntriesForApp(content: string, appName: string): string {
    // Match entry-level object blocks containing the appName.
    // Uses [^{}]* instead of [^}]* to prevent matching across nested object boundaries
    // (e.g., matching from the outer dynamicPackages { instead of just the entry {).
    const pattern = new RegExp(
        `\\s*\\{[^{}]*AppName:\\s*['"]${EscapeRegex(appName)}['"][^{}]*\\},?`,
        'g'
    );
    let result = content.replace(pattern, '');
    result = NormalizeEmptyDynamicArray(result, 'server');
    result = NormalizeEmptyDynamicArray(result, 'client');
    return result;
}

/**
 * Collapses a now-empty (whitespace-only) `dynamicPackages.<arrayName>` array to `[]`.
 * After the last entry is removed, the array is otherwise left as `<arrayName>: [\n    ]`,
 * which is functionally identical but not byte-idempotent with a never-populated config.
 * Anchored to that specific array (via FindMatchingBracket) so no other array in the
 * file is touched (B12).
 */
function NormalizeEmptyDynamicArray(content: string, arrayName: 'server' | 'client'): string {
    const dynMatch = content.match(/dynamicPackages\s*:\s*\{/);
    if (!dynMatch || dynMatch.index === undefined) return content;
    const afterDyn = content.slice(dynMatch.index);
    const arrayRel = afterDyn.match(new RegExp(`${arrayName}:\\s*\\[`));
    if (!arrayRel || arrayRel.index === undefined) return content;
    const openBracketPos = dynMatch.index + arrayRel.index + arrayRel[0].length - 1; // the '['
    const closePos = FindMatchingBracket(content, openBracketPos);
    if (closePos === -1) return content;
    if (content.slice(openBracketPos + 1, closePos).trim() === '') {
        return content.slice(0, openBracketPos) + '[]' + content.slice(closePos + 1);
    }
    return content;
}

/**
 * Toggles enabled state for all entries with a given appName.
 */
function ToggleEntriesForApp(content: string, appName: string, enabled: boolean): string {
    // Find entries with the given appName and replace enabled value.
    // Uses [^{}]* to prevent matching across nested object boundaries.
    const pattern = new RegExp(
        `(AppName:\\s*['"]${EscapeRegex(appName)}['"][^{}]*Enabled:\\s*)(?:true|false)`,
        'g'
    );
    return content.replace(pattern, `$1${enabled}`);
}

/**
 * Finds the matching closing bracket for an opening bracket.
 *
 * Skips brackets that appear inside string literals (single/double/backtick) and inside
 * line/block comments, so a brace or bracket in a value or comment can't throw off the
 * depth count and mis-match the close (B11). Without this, e.g. a `description: 'a } b'`
 * or `// closes the } here` inside the scanned object corrupts the result.
 */
function FindMatchingBracket(content: string, openPos: number): number {
    const openChar = content[openPos];
    const closeChar = openChar === '[' ? ']' : '}';
    let depth = 1;
    let pos = openPos + 1;
    let inString: string | null = null; // the quote char currently open, or null
    let inLineComment = false;
    let inBlockComment = false;

    while (pos < content.length && depth > 0) {
        const ch = content[pos];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            pos++;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && content[pos + 1] === '/') {
                inBlockComment = false;
                pos += 2;
                continue;
            }
            pos++;
            continue;
        }
        if (inString) {
            if (ch === '\\') { pos += 2; continue; } // skip escaped char
            if (ch === inString) inString = null;
            pos++;
            continue;
        }

        // Not currently in a string or comment.
        if (ch === '/' && content[pos + 1] === '/') { inLineComment = true; pos += 2; continue; }
        if (ch === '/' && content[pos + 1] === '*') { inBlockComment = true; pos += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inString = ch; pos++; continue; }

        if (ch === openChar) depth++;
        else if (ch === closeChar) depth--;
        pos++;
    }

    return depth === 0 ? pos - 1 : -1;
}

/**
 * Returns the index of the last *significant* character (not whitespace, not inside a string
 * literal, and not inside a `//` line or block comment) within `content[0, end)`, or -1 if
 * there is none. Mirrors {@link FindMatchingBracket}'s string/comment state machine so a `//`
 * inside a value like `'http://x'`, or a brace/quote inside a string, is never miscounted.
 */
function LastSignificantCharIndex(content: string, end: number): number {
    let pos = 0;
    let last = -1;
    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    while (pos < end) {
        const ch = content[pos];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            pos++;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && content[pos + 1] === '/') { inBlockComment = false; pos += 2; continue; }
            pos++;
            continue;
        }
        if (inString) {
            if (ch === '\\') { pos += 2; continue; } // skip escaped char
            if (ch === inString) { inString = null; last = pos; } // the closing quote is significant
            pos++;
            continue;
        }

        if (ch === '/' && content[pos + 1] === '/') { inLineComment = true; pos += 2; continue; }
        if (ch === '/' && content[pos + 1] === '*') { inBlockComment = true; pos += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inString = ch; last = pos; pos++; continue; }

        if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') {
            last = pos;
        }
        pos++;
    }
    return last;
}

/**
 * Ensures the object body in `before` (the text up to — but excluding — an object's closing
 * brace) is comma-terminated, so a new property spliced in right after it is a valid sibling
 * (#2975). No-op when the preceding token is already a comma, or when the body is empty.
 * `openBracePos` is the index of the object's own opening `{`; the inserted section carries
 * its own trailing comma, so an otherwise-empty literal stays valid.
 */
function EnsureTrailingComma(before: string, openBracePos: number): string {
    const idx = LastSignificantCharIndex(before, before.length);
    if (idx <= openBracePos || before[idx] === ',') {
        return before;
    }
    return before.slice(0, idx + 1) + ',' + before.slice(idx + 1);
}

/**
 * Inserts a section just before the closing brace of the `module.exports = { ... }` object
 * literal. Anchoring to that brace (via FindMatchingBracket) is correct even when the file
 * has trailing code or a later `};` — unlike `lastIndexOf('};')`, which lands in the wrong
 * block for `module.exports = { ... }; function helper() { ... };` and corrupts the config
 * (B4). Throws (rather than silently corrupting) when module.exports is not a direct object
 * literal — e.g. `module.exports = config;` — so the caller fails loudly.
 */
function InsertBeforeModuleExportsClose(content: string, section: string): string {
    const exportMatch = content.match(/module\.exports\s*=\s*\{/);
    if (!exportMatch || exportMatch.index === undefined) {
        throw new Error(
            'Could not find a `module.exports = { ... }` object literal in mj.config.cjs to insert into. ' +
            'If module.exports references a variable (e.g. `module.exports = config;`), add the section manually.',
        );
    }
    const bracePos = content.indexOf('{', exportMatch.index);
    const closePos = FindMatchingBracket(content, bracePos);
    if (closePos === -1) {
        throw new Error('Could not locate the closing brace of module.exports in mj.config.cjs.');
    }
    // Comma-terminate the property immediately before the insertion point so the new section
    // is a valid sibling rather than a syntax error (#2975). Without this, a config whose last
    // top-level property is a brace-terminated block (e.g. `openApps: { ... }` with no trailing
    // comma) becomes `}\n  dynamicPackages: { ... }` — invalid JS that breaks every later
    // `require('mj.config.cjs')`, including the mj migrate / codegen / build steps an install runs.
    const before = EnsureTrailingComma(content.slice(0, closePos), bracePos);
    return before + section + content.slice(closePos);
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
        WriteConfigChecked(configPath, content);
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
        WriteConfigChecked(configPath, content);
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
 * If it exists as a string, converts it to a Record (only when safe — see B9).
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
        const oldValue = stringMatch[1];
        // CodeGen's resolveEntityPackageName treats a STRING entityPackageName as "every
        // non-core schema resolves to <oldValue>", but a RECORD falls back to
        // 'mj_generatedentities' for any unlisted schema. So converting a string to an
        // (initially empty) Record silently changes which package every OTHER schema
        // resolves to — UNLESS the string is already the default ('' / 'mj_generatedentities'),
        // in which case the Record fallback is identical and the conversion is lossless.
        // The previous code dropped the value into a comment and produced an empty Record
        // regardless, silently degrading custom defaults to 'mj_generatedentities' (B9).
        const isDefaultString = oldValue === '' || oldValue === 'mj_generatedentities';
        if (!isDefaultString) {
            throw new Error(
                `mj.config.cjs sets entityPackageName: '${oldValue}' (a string that applies to ALL non-core schemas). ` +
                `Installing an app needs a per-schema Record, but auto-converting would silently change other schemas ` +
                `to 'mj_generatedentities' (a Record's fallback), not '${oldValue}'. Manually convert entityPackageName ` +
                `to a Record that preserves '${oldValue}' for your existing schemas, then re-run the install.`,
            );
        }
        // Safe: a default string is equivalent to an empty Record (same resolution).
        const replacement = `entityPackageName: {\n  },`;
        return content.replace(stringMatch[0], replacement);
    }

    // entityPackageName doesn't exist at all — insert into the module.exports object literal
    // (anchored, not at the file's last `};`) — B4.
    const section = `\n  entityPackageName: {\n  },\n`;
    return InsertBeforeModuleExportsClose(content, section);
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
        throw new Error('entityPackageName record not found in mj.config.cjs when adding a schema mapping.');
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
    // Anchor the removal to the entityPackageName record block ONLY. A global
    // replace would delete an identically-named key ANYWHERE else in the config
    // (e.g. a `'crm': 'CRM Agent'` entry under serverExtensions.SlashCommands) — B5.
    const recordMatch = content.match(/entityPackageName\s*:\s*\{/);
    if (!recordMatch || recordMatch.index === undefined) {
        return content;
    }
    const bracePos = content.indexOf('{', recordMatch.index);
    const closePos = FindMatchingBracket(content, bracePos);
    if (closePos === -1) {
        return content;
    }
    // Accept both quote styles for key and value (B7).
    const pattern = new RegExp(
        `\\s*['"]${EscapeRegex(schemaName)}['"]\\s*:\\s*['"][^'"]*['"]\\s*,?`,
        'g'
    );
    const inner = content.slice(bracePos + 1, closePos).replace(pattern, '');
    return content.slice(0, bracePos + 1) + inner + content.slice(closePos);
}

/**
 * Escapes special regex characters in a string.
 */
function EscapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
