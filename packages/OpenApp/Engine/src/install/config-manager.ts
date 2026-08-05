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
import { ResolveServerPackagePath } from './workspace-paths.js';

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
    /**
     * Non-fatal per-file problems from a multi-config write: at least one config was updated,
     * but another could not be (e.g. a re-export config with no object literal to insert into).
     * Present only when the operation succeeded overall.
     */
    Warnings?: string[];
    /**
     * Whether the edit actually altered any config file. `Success` alone cannot express this — a
     * successful no-op and a successful destructive edit look identical — which leaves callers
     * unable to warn a host that config they wrote by hand was just removed, and lets a silently
     * ineffective edit pass for a working one.
     */
    Changed?: boolean;
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
    manifest: MJAppManifest,
    serverPackagePath?: string
): ConfigOperationResult {
    const serverPackages = GetServerPackagesFromManifest(manifest);

    if (serverPackages.length === 0) {
        return { Success: true };
    }

    return ApplyToConfigs(repoRoot, serverPackagePath, 'update dynamicPackages.server', (input) => {
        let content = EnsureDynamicPackagesSection(input);
        content = EnsureDynamicArrayPresent(content, 'server');

        for (const entry of serverPackages) {
            content = AddEntryToDynamicArray(content, entry, 'server');
        }
        return content;
    });
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
    manifest: MJAppManifest,
    serverPackagePath?: string
): ConfigOperationResult {
    const clientPackages = GetClientPackagesFromManifest(manifest);

    if (clientPackages.length === 0) {
        return { Success: true };
    }

    return ApplyToConfigs(repoRoot, serverPackagePath, 'update dynamicPackages.client', (input) => {
        let content = EnsureDynamicPackagesSection(input);
        content = EnsureDynamicArrayPresent(content, 'client');

        for (const entry of clientPackages) {
            content = AddEntryToDynamicArray(content, entry, 'client');
        }
        return content;
    });
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
    appName: string,
    serverPackagePath?: string
): ConfigOperationResult {
    return ApplyToConfigs(repoRoot, serverPackagePath, 'remove dynamicPackages entries', (content) => RemoveEntriesForApp(content, appName));
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
    enabled: boolean,
    serverPackagePath?: string
): ConfigOperationResult {
    return ApplyToConfigs(repoRoot, serverPackagePath, 'toggle dynamicPackages entries', (content) => ToggleEntriesForApp(content, appName, enabled));
}

/**
 * Resolves EVERY MJ config file that a consumer of `dynamicPackages` may load, nearest first:
 *   1. ServerPackagePath (e.g. apps/MJAPI/mj.config.cjs) — what MJAPI loads when started from
 *      its own workspace (`npm run start --workspace=apps/MJAPI` sets cwd there).
 *   2. Repo root (mj.config.cjs) — what `mj codegen manifest --open-app-client-bootstrap`
 *      loads (it resolves from the CLIENT workspace, so it never sees a server-workspace
 *      config), and what a container / App Service deploy loads when only the root config
 *      ships in the artifact.
 *
 * Writing to ONE of these is not enough (#3271). A server-workspace-only write leaves the
 * client bootstrap manifest with `0 client packages wired` — the app's @RegisterClass
 * decorators never fire — and leaves a root-config deployment loading no server package at
 * all, so the API's GraphQL schema silently lacks every one of the app's types while
 * `__mj.OpenApp` still reports the app Active. Both entries therefore go to every config a
 * consumer might read; a duplicate entry is harmless (AddEntryToDynamicArray is idempotent),
 * whereas a missing one fails silently and is very hard to diagnose from the symptoms.
 */
function resolveConfigPaths(repoRoot: string, serverPackagePath?: string): string[] {
    const paths: string[] = [];
    // Detect the layout when it isn't configured, so an unconfigured host still gets the
    // server-workspace config written and not just the root one (#3270 + #3271).
    const effectiveServerPath = ResolveServerPackagePath(repoRoot, serverPackagePath);
    const serverConfig = resolve(repoRoot, effectiveServerPath, CONFIG_FILE_NAME);
    if (existsSync(serverConfig)) paths.push(serverConfig);
    const rootConfig = resolve(repoRoot, CONFIG_FILE_NAME);
    if (existsSync(rootConfig) && !paths.includes(rootConfig)) paths.push(rootConfig);
    return paths;
}

/**
 * True when a config has no object literal of its own and simply re-exports another config:
 *
 *     module.exports = require('../../mj.config.cjs');
 *
 * This is what `packages/MJAPI/mj.config.cjs` ships as — in the monorepo AND in an `mj install`
 * distribution. There is nothing to inject into it, and nothing SHOULD be: it re-exports the root
 * config, which is itself a target in {@link resolveConfigPaths} and does get written. Recognising
 * the shape keeps the expected case a silent no-op instead of a "skipped a config file" warning on
 * every install, while a genuinely malformed or unsupported config still surfaces as one.
 *
 * Note `module.exports = { ...require('../../mj.config.cjs') }` deliberately does NOT match — that
 * spread form HAS an object literal, so it is editable and inserting into it is correct.
 */
function IsDelegatingConfig(content: string): boolean {
    return /module\.exports\s*=\s*require\s*\(/.test(content);
}

/**
 * Applies `edit` to every config returned by {@link resolveConfigPaths}.
 *
 * Two asymmetries matter here:
 *
 * 1. The ROOT config is load-bearing for two of the three consumers — the client bootstrap
 *    manifest step (which resolves from the CLIENT workspace and so only ever sees root) and any
 *    container / App Service deploy that ships only the root config. Failing to write root while
 *    some other target succeeded would report success and silently re-create #3271, so a root
 *    write failure is FATAL even when another config was updated.
 * 2. A non-root target may legitimately be un-editable, and is collected as a warning. The only
 *    such shape in practice is a delegating config, which {@link IsDelegatingConfig} skips
 *    silently before we ever try to edit it.
 *
 * `operation` names the caller's intent so a failure keeps the diagnostic specificity these
 * messages had before they were funnelled through one helper (e.g. "update excludeSchemas").
 */
function ApplyToConfigs(
    repoRoot: string,
    serverPackagePath: string | undefined,
    operation: string,
    edit: (content: string) => string
): ConfigOperationResult {
    const rootConfig = resolve(repoRoot, CONFIG_FILE_NAME);
    const configPaths = resolveConfigPaths(repoRoot, serverPackagePath);
    if (configPaths.length === 0) {
        return { Success: false, ErrorMessage: `No MJ config file found in ${repoRoot}. Expected: ${CONFIG_FILE_NAME}` };
    }

    const warnings: string[] = [];
    let updated = 0;
    let delegated = 0;
    let changed = false;

    for (const configPath of configPaths) {
        try {
            const content = readFileSync(configPath, 'utf-8');
            // Re-exports another config in this list — correct to leave alone, so stay quiet.
            if (IsDelegatingConfig(content)) {
                delegated++;
                continue;
            }
            const edited = edit(content);
            if (edited !== content) {
                changed = true;
            }
            WriteConfigChecked(configPath, edited);
            updated++;
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (configPath === rootConfig) {
                // Fatal: see asymmetry (1) above.
                return { Success: false, ErrorMessage: `Failed to ${operation} in ${configPath}: ${message}` };
            }
            warnings.push(`${configPath}: ${message}`);
        }
    }

    if (updated === 0) {
        const detail = warnings.length > 0
            ? warnings.join('; ')
            : delegated > 0
                ? `every candidate config only re-exports another config, so there was nowhere to write. Expected an object literal in ${rootConfig}.`
                : 'no candidate config had an injectable config object.';
        return { Success: false, ErrorMessage: `Failed to ${operation}: ${detail}` };
    }
    return { Success: true, Changed: changed, Warnings: warnings.length > 0 ? warnings : undefined };
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

    // JSON.stringify every manifest-sourced value: it emits a quoted, fully-escaped JS string
    // literal, so a value containing quotes/backslashes/newlines can never terminate the literal
    // and inject executable code into mj.config.cjs (which is `require`d — i.e. EXECUTED — by
    // every mj migrate / codegen / build step). String concatenation of single-quoted values was
    // an injection vector for any hostile manifest.
    const startupLine = entry.StartupExport ? `\n        StartupExport: ${JSON.stringify(entry.StartupExport)},` : '';
    const entryStr = `\n      {\n        PackageName: ${JSON.stringify(entry.PackageName)},${startupLine}\n        AppName: ${JSON.stringify(entry.AppName)},\n        Enabled: ${entry.Enabled}\n      },`;

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
 * Inserts a section just before the closing brace of the config object exported by
 * `module.exports`. Supports two patterns:
 *
 *   1. `module.exports = { ... }` — inline object literal (insert before its closing `}`)
 *   2. `module.exports = config;` — variable reference (find the variable's object literal
 *      declaration and insert before ITS closing `}`)
 *
 * Anchoring to the correct closing brace (via FindMatchingBracket) is correct even when the
 * file has trailing code — unlike `lastIndexOf('};')`, which lands in the wrong block (B4).
 */
function InsertBeforeModuleExportsClose(content: string, section: string): string {
    // Try pattern 1: module.exports = { ... }
    const inlineMatch = content.match(/module\.exports\s*=\s*\{/);
    if (inlineMatch && inlineMatch.index !== undefined) {
        const bracePos = content.indexOf('{', inlineMatch.index);
        const closePos = FindMatchingBracket(content, bracePos);
        if (closePos === -1) {
            throw new Error('Could not locate the closing brace of module.exports in mj.config.cjs.');
        }
        const before = EnsureTrailingComma(content.slice(0, closePos), bracePos);
        return before + section + content.slice(closePos);
    }

    // Try pattern 2: module.exports = someVar;
    const varMatch = content.match(/module\.exports\s*=\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*;/);
    if (varMatch && varMatch.index !== undefined) {
        const varName = varMatch[1];
        // Find the variable's object literal: const/let/var varName = { ... }
        const declPattern = new RegExp(`(?:const|let|var)\\s+${EscapeRegex(varName)}\\s*=\\s*\\{`);
        const declMatch = content.match(declPattern);
        if (declMatch && declMatch.index !== undefined) {
            const bracePos = content.indexOf('{', declMatch.index);
            const closePos = FindMatchingBracket(content, bracePos);
            if (closePos === -1) {
                throw new Error(`Could not locate the closing brace of '${varName}' object in mj.config.cjs.`);
            }
            const before = EnsureTrailingComma(content.slice(0, closePos), bracePos);
            return before + section + content.slice(closePos);
        }
    }

    throw new Error(
        'Could not find a config object in mj.config.cjs to insert into. ' +
        'Expected either `module.exports = { ... }` or `module.exports = <variable>;` where the variable is declared as an object literal.',
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCLUDE SCHEMAS (CodeGen)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds an app's schema to the `excludeSchemas` array in mj.config.cjs.
 *
 * CodeGen uses `excludeSchemas` to skip entity discovery, view generation,
 * and Angular component generation for schemas owned by external apps.
 * Without this, CodeGen will pick up app-owned tables (e.g. flyway_schema_history)
 * and create unwanted entity metadata.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param schemaName - The schema name to exclude
 * @param serverPackagePath - Optional server package path for config resolution
 * @returns Operation result
 */
export function AddExcludeSchema(
    repoRoot: string,
    schemaName: string,
    serverPackagePath?: string
): ConfigOperationResult {
    if (!schemaName) {
        return { Success: true };
    }

    return ApplyToConfigs(repoRoot, serverPackagePath, 'update excludeSchemas', (input) =>
        AddSchemaToExcludeArray(EnsureExcludeSchemasSection(input), schemaName));
}

/**
 * Removes an app's schema from the `excludeSchemas` array in mj.config.cjs.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param schemaName - The schema name to remove from exclusion
 * @param serverPackagePath - Optional server package path for config resolution
 * @returns Operation result
 */
export function RemoveExcludeSchema(
    repoRoot: string,
    schemaName: string,
    serverPackagePath?: string
): ConfigOperationResult {
    if (!schemaName) {
        return { Success: true };
    }

    return ApplyToConfigs(repoRoot, serverPackagePath, 'remove schema from excludeSchemas', (content) =>
        RemoveSchemaFromExcludeArray(content, schemaName));
}

/**
 * Adds an app's schema to the host's `includeSchemas` positive scope, when — and ONLY when — the
 * host already runs one.
 *
 * `includeSchemas` is opt-in: CodeGen resolves it into `excludeSchemas` by excluding every schema
 * in the database that it does not name. On such a host, clearing `excludeSchemas` is not enough to
 * make an installed app's schema discoverable; absent from the include list, it is re-excluded and
 * the app registers zero entities — the exact failure #3457 is about, one layer up.
 *
 * The guard matters more than the write. An absent or empty `includeSchemas` means "no positive
 * scope, every schema is in play", and CodeGen no-ops on it. Creating one, or populating an empty
 * one, would suddenly scope CodeGen to this single schema and silently drop every other schema the
 * host owns. So this never creates the key and never writes into an empty list.
 *
 * @returns a result whose `Changed` is false when no live, non-empty include list was present
 */
export function AddIncludeSchema(
    repoRoot: string,
    schemaName: string,
    serverPackagePath?: string
): ConfigOperationResult {
    if (!schemaName) {
        return { Success: true, Changed: false };
    }
    return ApplyToConfigs(repoRoot, serverPackagePath, 'update includeSchemas', (content) =>
        AddSchemaToIncludeArray(content, schemaName));
}

/**
 * Removes an app's schema from the host's `includeSchemas` positive scope — the inverse of
 * {@link AddIncludeSchema}, used when an app declares it manages its own metadata and when the app
 * is removed.
 */
export function RemoveIncludeSchema(
    repoRoot: string,
    schemaName: string,
    serverPackagePath?: string
): ConfigOperationResult {
    if (!schemaName) {
        return { Success: true, Changed: false };
    }
    return ApplyToConfigs(repoRoot, serverPackagePath, 'remove schema from includeSchemas', (content) =>
        RemoveSchemaFromArrayRegion(content, 'includeSchemas', schemaName));
}

/** Appends to a LIVE, NON-EMPTY top-level `includeSchemas`; otherwise leaves the config untouched. */
function AddSchemaToIncludeArray(content: string, schemaName: string): string {
    const region = FindTopLevelConfigArray(content, 'includeSchemas');
    if (!region) {
        return content; // no positive scope in force — creating one would shrink CodeGen's world
    }
    const inner = content.slice(region.openPos + 1, region.closePos);
    if (inner.trim().length === 0) {
        return content; // empty list means the same thing as absent; populating it would impose a scope
    }
    if (new RegExp(`['"]${EscapeRegex(schemaName)}['"]`, 'i').test(inner)) {
        return content; // already in scope
    }
    return content.slice(0, region.closePos) + `, ${JSON.stringify(schemaName)}` + content.slice(region.closePos);
}

/**
 * Ensures the config file has an excludeSchemas array.
 * If it doesn't exist, adds one inside the module.exports object.
 */
function EnsureExcludeSchemasSection(content: string): string {
    // A COMMENTED-OUT `excludeSchemas` does not count — distribution.config.cjs ships one, and a
    // plain `/excludeSchemas\s*:/` test treats it as present. The editors would then write into the
    // comment and report success while CodeGen sees no exclusions at all.
    if (FindTopLevelConfigArray(content, 'excludeSchemas')) {
        return content;
    }

    const section = `\n  excludeSchemas: [],\n`;
    return InsertBeforeModuleExportsClose(content, section);
}

/**
 * Locates a TOP-LEVEL, LIVE array-valued key in the exported config object.
 *
 * "Top-level" because `excludeSchemas` also exists under `dbSchemaJSONOutput` and inside
 * `bundles[]`, and those are different settings — only the top-level array gates CodeGen's entity
 * discovery. A plain `content.match(/excludeSchemas\s*:\s*\[/)` binds to whichever appears first in
 * the file, so a host who lists `dbSchemaJSONOutput` above it gets their nested array edited instead.
 *
 * "Live" because a match inside a comment or a string is not configuration. Writing there succeeds
 * silently and changes nothing that Node will evaluate.
 *
 * @returns the positions of the array's `[` and its matching `]`, or null when there is no such key
 */
function FindTopLevelConfigArray(content: string, key: string): { openPos: number; closePos: number } | null {
    const objectStart = FindExportedObjectBrace(content);
    if (objectStart === -1) {
        return null;
    }
    const objectEnd = FindMatchingBracket(content, objectStart);
    if (objectEnd === -1) {
        return null;
    }

    let depth = 0; // nesting relative to the exported object — we only want its direct properties
    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    for (let pos = objectStart + 1; pos < objectEnd; pos++) {
        const ch = content[pos];
        const next = content[pos + 1];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') { inBlockComment = false; pos++; }
            continue;
        }
        if (inString) {
            if (ch === '\\') { pos++; continue; }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '/' && next === '/') { inLineComment = true; pos++; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; pos++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
        if (ch === '{' || ch === '[') { depth++; continue; }
        if (ch === '}' || ch === ']') { depth--; continue; }
        if (depth !== 0 || !content.startsWith(key, pos)) {
            continue;
        }
        // Reject a substring hit inside a longer identifier (e.g. `dbSchemaExcludeSchemas`).
        const prev = content[pos - 1];
        if (prev && /[A-Za-z0-9_$]/.test(prev)) {
            continue;
        }
        const opener = content.slice(pos + key.length).match(/^\s*:\s*\[/);
        if (!opener) {
            continue;
        }
        const openPos = pos + key.length + opener[0].length - 1;
        const closePos = FindMatchingBracket(content, openPos);
        if (closePos !== -1) {
            return { openPos, closePos };
        }
    }
    return null;
}

/**
 * Returns the position of the `{` opening the object assigned to `module.exports`, handling both
 * `module.exports = { ... }` and `module.exports = someVar` where `someVar` is an object literal.
 * Mirrors the resolution {@link InsertBeforeModuleExportsClose} performs.
 */
function FindExportedObjectBrace(content: string): number {
    const inlineMatch = content.match(/module\.exports\s*=\s*\{/);
    if (inlineMatch && inlineMatch.index !== undefined) {
        return content.indexOf('{', inlineMatch.index);
    }
    const varMatch = content.match(/module\.exports\s*=\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*;/);
    if (varMatch && varMatch.index !== undefined) {
        const declPattern = new RegExp(`(?:const|let|var)\\s+${EscapeRegex(varMatch[1])}\\s*=\\s*\\{`);
        const declMatch = content.match(declPattern);
        if (declMatch && declMatch.index !== undefined) {
            return content.indexOf('{', declMatch.index);
        }
    }
    return -1;
}

/**
 * Adds a schema name to the first excludeSchemas array if not already present.
 */
function AddSchemaToExcludeArray(content: string, schemaName: string): string {
    const region = FindTopLevelConfigArray(content, 'excludeSchemas');
    if (!region) {
        return content;
    }
    const { openPos: openBracketPos, closePos: closingBracket } = region;

    // Already present (case-insensitive)? Scoped to THIS array, so an identically-named entry in a
    // nested excludeSchemas can't make us skip a write the top-level array still needs.
    const alreadyExists = new RegExp(`['"]${EscapeRegex(schemaName)}['"]`, 'i');
    if (alreadyExists.test(content.slice(openBracketPos + 1, closingBracket))) {
        return content;
    }

    // Check if the array has existing entries to determine formatting.
    // JSON.stringify: quoted + escaped literal, so the value can't break out of the string
    // and inject code into the executed config (see AddEntryToDynamicArray).
    const arrayContent = content.slice(openBracketPos + 1, closingBracket).trim();
    const entry = arrayContent.length > 0
        ? `, ${JSON.stringify(schemaName)}`
        : JSON.stringify(schemaName);

    return content.slice(0, closingBracket) + entry + content.slice(closingBracket);
}

/**
 * Removes a schema name from all excludeSchemas arrays in the config.
 */
function RemoveSchemaFromExcludeArray(content: string, schemaName: string): string {
    return RemoveSchemaFromArrayRegion(content, 'excludeSchemas', schemaName);
}

/**
 * Removes a quoted schema name from a top-level string-array config key, editing ONLY the bytes
 * inside that array.
 *
 * The scoping is the whole point. The patterns below degrade to a BARE quoted name, so run across
 * the file they match the schema anywhere — the `entityPackageName` key `HandleServerConfig` writes
 * moments earlier (leaving `: "@pkg/x"`, invalid JavaScript), an `includeSchemas` entry (silently
 * inverting that positive scope), an `excludeTables` schema field, even a comment. That was
 * survivable while the only caller was app-remove, which drops the colliding key first; the #3457
 * install/upgrade caller has it guaranteed present.
 */
function RemoveSchemaFromArrayRegion(content: string, key: string, schemaName: string): string {
    const region = FindTopLevelConfigArray(content, key);
    if (!region) {
        return content; // no live top-level array to remove from
    }
    const { openPos, closePos } = region;

    // Both quote styles accepted: the Add helpers write JSON.stringify (double quotes), while
    // pre-existing configs hold single-quoted entries. Ordered so that an entry with a leading
    // comma is consumed with its comma, then one with a trailing comma, then a sole entry.
    const patterns = [
        new RegExp(`,\\s*['"]${EscapeRegex(schemaName)}['"]`, 'gi'),
        new RegExp(`['"]${EscapeRegex(schemaName)}['"]\\s*,\\s*`, 'gi'),
        new RegExp(`['"]${EscapeRegex(schemaName)}['"]`, 'gi'),
    ];

    const inner = content.slice(openPos + 1, closePos);
    for (const pattern of patterns) {
        if (pattern.test(inner)) {
            return content.slice(0, openPos + 1) + inner.replace(pattern, '') + content.slice(closePos);
        }
    }
    return content;
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
    manifest: MJAppManifest,
    serverPackagePath?: string
): ConfigOperationResult {
    const schemaName = manifest.schema?.name;
    if (!schemaName) {
        return { Success: true }; // No schema → nothing to map
    }

    const entityPkg = ResolveEntityPackageFromManifest(manifest);
    if (!entityPkg) {
        return { Success: true }; // No entities package found → nothing to map
    }

    return ApplyToConfigs(repoRoot, serverPackagePath, 'update entityPackageName', (input) =>
        AddEntityPackageEntry(EnsureEntityPackageNameSection(input), schemaName, entityPkg));
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
    schemaName: string,
    serverPackagePath?: string
): ConfigOperationResult {
    if (!schemaName) {
        return { Success: true };
    }

    return ApplyToConfigs(repoRoot, serverPackagePath, 'remove entityPackageName mapping', (content) =>
        RemoveEntityPackageEntry(content, schemaName));
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
    // JSON.stringify both key and value — quoted + escaped, so neither can break out of its
    // string literal and inject code into the executed config (see AddEntryToDynamicArray).
    const entryStr = `\n    ${JSON.stringify(schemaName)}: ${JSON.stringify(packageName)},`;

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
