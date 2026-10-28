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
import { PackageRunsOnTier } from '../manifest/package-platform.js';
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
 * Removes this app's `dynamicPackages` entries whose PackageName is NOT in the supplied manifest —
 * i.e. packages a NEW version of the app no longer ships.
 *
 * The Add* functions are add-only and idempotent, which is correct for install but leaves upgrade
 * converging on the union of every version ever installed: a dropped `startupExport` package keeps
 * its server entry, so the loader tries to import a package that may no longer build. Pair this
 * with {@link AddServerDynamicPackages} / {@link AddClientDynamicPackages} on the upgrade path to
 * make the config match the new manifest exactly.
 *
 * Surviving entries are left byte-identical rather than removed and re-added, so a disabled app's
 * `Enabled: false` state is preserved. Server and client keep-sets are computed per array, so a
 * server-only package is not pruned from `server` just because it is absent from `client`.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param manifest - The NEW (target) manifest the config should converge on
 * @returns Operation result
 */
export function PruneDynamicPackagesNotInManifest(
    repoRoot: string,
    manifest: MJAppManifest,
    serverPackagePath?: string
): ConfigOperationResult {
    return ApplyToConfigs(repoRoot, serverPackagePath, 'prune stale dynamicPackages entries', (content) => {
        let result = PruneEntriesForApp(content, manifest, 'server');
        result = PruneEntriesForApp(result, manifest, 'client');
        result = NormalizeEmptyDynamicArray(result, 'server');
        result = NormalizeEmptyDynamicArray(result, 'client');
        return result;
    });
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
    return /module\.exports\s*=\s*require\s*\(/.test(BlankComments(content));
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

    for (const configPath of configPaths) {
        try {
            const content = readFileSync(configPath, 'utf-8');
            // Re-exports another config in this list — correct to leave alone, so stay quiet.
            if (IsDelegatingConfig(content)) {
                delegated++;
                continue;
            }
            WriteConfigChecked(configPath, edit(content), content);
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
    return { Success: true, Warnings: warnings.length > 0 ? warnings : undefined };
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
function WriteConfigChecked(configPath: string, content: string, original: string): void {
    try {
        compileFunction(content);
    } catch (parseError: unknown) {
        const message = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(
            `the edit would produce invalid JavaScript (${message}); the file was left unchanged. ` +
            `This is a bug in the Open App config editor — please report it with your mj.config.cjs shape.`,
        );
    }
    // A sparse array (`['a', , 'b']`) parses, so the check above cannot see it, yet each hole is
    // read as `undefined` — CodeGen received a null schema name this way (#4547). Compared with
    // the original so a hole the host already had does not block every later install.
    if (CountArrayHoles(content) > CountArrayHoles(original)) {
        throw new Error(
            'the edit would leave an empty slot in an array (e.g. `[\'a\', , \'b\']`), which reads as undefined; ' +
            'the file was left unchanged. This is a bug in the Open App config editor — please report it with your mj.config.cjs shape.',
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
        if (!PackageRunsOnTier(pkg, 'server')) {
            continue;
        }
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
 *
 * Includes `client` and `shared` packages, minus any whose platform excludes the browser — see
 * {@link PackageRunsOnTier}. `shared` says which tiers a package is FOR, not that it can run on
 * all of them: an actions package is shared source that reaches `@google-cloud/storage`, and
 * namespace-importing it into the Angular bundle breaks the host's build (#4428).
 *
 * Unlike server entries, a qualifying package is emitted regardless of startupExport — client
 * entries are side-effect imports and the client bootstrap never calls a startup function.
 */
function GetClientPackagesFromManifest(manifest: MJAppManifest): DynamicPackageEntry[] {
    const entries: DynamicPackageEntry[] = [];
    const clientPkgs = manifest.packages?.client ?? [];
    const sharedPkgs = manifest.packages?.shared ?? [];

    for (const pkg of [...clientPkgs, ...sharedPkgs]) {
        if (!PackageRunsOnTier(pkg, 'client')) {
            continue;
        }
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
    if (/dynamicPackages\s*:/.test(BlankComments(content))) {
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
    const code = BlankComments(content);
    const dynMatch = code.match(/dynamicPackages\s*:\s*\{/);
    if (!dynMatch || dynMatch.index === undefined) {
        throw new Error('dynamicPackages section not found in mj.config.cjs.');
    }
    const openBracePos = dynMatch.index + dynMatch[0].length - 1; // the '{'
    const closeBracePos = FindMatchingBracket(content, openBracePos);
    if (closeBracePos === -1) {
        throw new Error('Could not find the closing brace of the dynamicPackages section in mj.config.cjs.');
    }
    const sectionBody = code.slice(openBracePos, closeBracePos);
    // Already present within THIS section — done.
    if (new RegExp(`${arrayName}\\s*:\\s*\\[`).test(sectionBody)) {
        return content;
    }
    // Insert `    <arrayName>: [],` right after the section's opening brace.
    return content.slice(0, openBracePos + 1) + `\n    ${arrayName}: [],` + content.slice(openBracePos + 1);
}

/**
 * Locates the named `dynamicPackages.<arrayName>` array and returns the offsets of its opening
 * `[` and its matching `]`.
 *
 * Anchored to the dynamicPackages section — NOT the first `<arrayName>: [` anywhere in the file,
 * which could be an unrelated nested config (B8). Returns null when the section, the array, or
 * the array's closing bracket is absent, so callers decide whether that is fatal.
 */
function LocateDynamicArray(
    content: string,
    arrayName: 'server' | 'client'
): { OpenBracketPos: number; ClosePos: number } | null {
    const code = BlankComments(content);
    const dynMatch = code.match(/dynamicPackages\s*:\s*\{/);
    if (!dynMatch || dynMatch.index === undefined) return null;
    const sectionOpen = dynMatch.index + dynMatch[0].length - 1;
    const sectionClose = FindMatchingBracket(content, sectionOpen);
    if (sectionClose === -1) return null;
    // Searched only inside the section, so an unrelated `server: [` after it is never edited.
    const sectionBody = code.slice(sectionOpen, sectionClose);
    const arrayRel = sectionBody.match(new RegExp(`${arrayName}:\\s*\\[`));
    if (!arrayRel || arrayRel.index === undefined) return null;
    const openBracketPos = sectionOpen + arrayRel.index + arrayRel[0].length - 1; // the '['
    const closePos = FindMatchingBracket(content, openBracketPos);
    if (closePos === -1) return null;
    return { OpenBracketPos: openBracketPos, ClosePos: closePos };
}

/**
 * Adds a single entry to the named dynamicPackages array (`server` | `client`) in the
 * config string. Client entries omit the StartupExport line (they are side-effect imports).
 */
function AddEntryToDynamicArray(content: string, entry: DynamicPackageEntry, arrayName: 'server' | 'client'): string {
    const location = LocateDynamicArray(content, arrayName);
    if (!location) {
        throw new Error(`dynamicPackages.${arrayName} array not found in mj.config.cjs when adding a package.`);
    }

    // The idempotency check is scoped to the TARGET array's body, not the whole file. A `shared`
    // package is written to BOTH arrays: matching file-wide meant the server entry written moments
    // earlier satisfied the client check, so the client insert was skipped and the package never
    // reached dynamicPackages.client — its @RegisterClass components were then absent from the
    // bundle with no error raised anywhere.
    const arrayBody = BlankComments(content).slice(location.OpenBracketPos, location.ClosePos);
    const existsPattern = new RegExp(
        `PackageName:\\s*['"]${EscapeRegex(entry.PackageName)}['"][^{}]*AppName:\\s*['"]${EscapeRegex(entry.AppName)}['"]`
    );
    if (existsPattern.test(arrayBody)) {
        return content;
    }

    // JSON.stringify every manifest-sourced value: it emits a quoted, fully-escaped JS string
    // literal, so a value containing quotes/backslashes/newlines can never terminate the literal
    // and inject executable code into mj.config.cjs (which is `require`d — i.e. EXECUTED — by
    // every mj migrate / codegen / build step). String concatenation of single-quoted values was
    // an injection vector for any hostile manifest.
    const startupLine = entry.StartupExport ? `\n        StartupExport: ${JSON.stringify(entry.StartupExport)},` : '';
    const entryStr = `\n      {\n        PackageName: ${JSON.stringify(entry.PackageName)},${startupLine}\n        AppName: ${JSON.stringify(entry.AppName)},\n        Enabled: ${entry.Enabled}\n      },`;

    return content.slice(0, location.ClosePos) + entryStr + '\n    ' + content.slice(location.ClosePos);
}

/**
 * Removes this app's entries from ONE dynamicPackages array when their PackageName is absent from
 * the manifest's set for that array. Scoped to the array's own body via {@link LocateDynamicArray},
 * so pruning `server` can never touch `client`.
 *
 * An entry block whose PackageName cannot be parsed is left in place: this function deletes config
 * the user may have hand-edited, so an unrecognized shape must be a no-op rather than a guess.
 */
/**
 * Points a surviving entry block at the StartupExport the NEW manifest declares.
 *
 * Pruning by PackageName alone is not enough to converge the config: when a version renames its
 * startup export, the package stays in the keep-set, so the block survives byte-identical AND the
 * subsequent Add is skipped by the (PackageName, AppName) idempotency check — leaving the OLD
 * export name in the config forever. ServerBootstrap then reads `mod[StartupExport]`, gets
 * `undefined` for a name the new version no longer exports, skips it because it is not a function,
 * and still logs `(ran <old name>)`. The registrations that export exists to perform never happen,
 * with nothing red anywhere.
 *
 * Only the StartupExport value is touched, so `Enabled: false` and any hand-formatting survive.
 * When the manifest declares no export for this package the block is left alone — dropping a line
 * the operator may have added by hand is a guess, and the entry-removal path already covers a
 * server package that genuinely stopped declaring one.
 */
function RetargetStartupExport(block: string, expectedExport: string | undefined): string {
    if (!expectedExport) return block;

    const existing = block.match(/StartupExport:\s*(['"])(?:[^'"\\]|\\.)*\1/);
    if (existing) {
        // Function form: a `$` in the export name must not be read as a replacement pattern.
        return block.replace(existing[0], () => `StartupExport: ${JSON.stringify(expectedExport)}`);
    }

    // No StartupExport line at all (hand-edited config): add one after PackageName so the entry
    // matches what the manifest asks for.
    const packageLine = block.match(/PackageName:\s*(['"])(?:[^'"\\]|\\.)*\1,?/);
    if (!packageLine) return block;
    return block.replace(packageLine[0], () => `${packageLine[0]}\n        StartupExport: ${JSON.stringify(expectedExport)},`);
}

function PruneEntriesForApp(content: string, manifest: MJAppManifest, arrayName: 'server' | 'client'): string {
    const location = LocateDynamicArray(content, arrayName);
    if (!location) return content;

    const manifestEntries = arrayName === 'server'
        ? GetServerPackagesFromManifest(manifest)
        : GetClientPackagesFromManifest(manifest);
    const keep = new Map(manifestEntries.map((e) => [e.PackageName, e.StartupExport]));

    // Same entry-block shape as RemoveEntriesForApp: [^{}] keeps the match inside a single entry
    // object rather than spanning from the enclosing dynamicPackages brace.
    const entryPattern = new RegExp(
        `\\s*\\{[^{}]*AppName:\\s*['"]${EscapeRegex(manifest.name)}['"][^{}]*\\},?`,
        'g'
    );
    return ReplaceInRange(content, location.OpenBracketPos, location.ClosePos, entryPattern, (block) => {
        const packageMatch = block.match(/PackageName:\s*['"]([^'"]+)['"]/);
        if (!packageMatch) return block;
        if (!keep.has(packageMatch[1])) return '';
        return RetargetStartupExport(block, keep.get(packageMatch[1]));
    });
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
    // Scoped to each dynamicPackages array, so a matching block elsewhere (or in a comment) stays.
    const pattern = new RegExp(
        `\\s*\\{[^{}]*AppName:\\s*['"]${EscapeRegex(appName)}['"][^{}]*\\},?`,
        'g'
    );
    let result = content;
    for (const arrayName of ['server', 'client'] as const) {
        const location = LocateDynamicArray(result, arrayName);
        if (location) {
            result = ReplaceInRange(result, location.OpenBracketPos, location.ClosePos, pattern, () => '');
        }
    }
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
    const location = LocateDynamicArray(content, arrayName);
    if (!location) return content;
    if (content.slice(location.OpenBracketPos + 1, location.ClosePos).trim() === '') {
        return content.slice(0, location.OpenBracketPos) + '[]' + content.slice(location.ClosePos + 1);
    }
    return content;
}

/**
 * Toggles enabled state for all entries with a given appName.
 */
function ToggleEntriesForApp(content: string, appName: string, enabled: boolean): string {
    // Find entries with the given appName and replace enabled value.
    // Uses [^{}]* to prevent matching across nested object boundaries.
    // Scoped to each dynamicPackages array, so text outside them (or in a comment) is never touched.
    const pattern = new RegExp(
        `AppName:\\s*['"]${EscapeRegex(appName)}['"][^{}]*Enabled:\\s*(?:true|false)`,
        'g'
    );
    let result = content;
    for (const arrayName of ['server', 'client'] as const) {
        const location = LocateDynamicArray(result, arrayName);
        if (location) {
            result = ReplaceInRange(result, location.OpenBracketPos, location.ClosePos, pattern,
                (match) => match.replace(/(?:true|false)$/, String(enabled)));
        }
    }
    return result;
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

/** Placeholder written over comment (and, for {@link CountArrayHoles}, string) characters. */
const MASK_CHAR = '#';

/**
 * Returns `content` with every comment character (and, when `maskStrings` is set, every character
 * inside a string literal) replaced by {@link MASK_CHAR}; quotes and newlines are kept. The result
 * has the same length and offsets as `content`. The placeholder is not whitespace, so a `\s*` in a
 * search pattern never runs through a comment. Uses the same string/comment state machine as
 * {@link FindMatchingBracket}.
 */
function MaskSource(content: string, maskStrings: boolean): string {
    const out = content.split('');
    const mask = (i: number): void => {
        if (i < out.length && out[i] !== '\n' && out[i] !== '\r') out[i] = MASK_CHAR;
    };
    let pos = 0;
    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    while (pos < content.length) {
        const ch = content[pos];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            else mask(pos);
            pos++;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && content[pos + 1] === '/') { mask(pos); mask(pos + 1); inBlockComment = false; pos += 2; continue; }
            mask(pos);
            pos++;
            continue;
        }
        if (inString) {
            if (ch === '\\') {
                if (maskStrings) { mask(pos); mask(pos + 1); }
                pos += 2;
                continue;
            }
            if (ch === inString) inString = null;
            else if (maskStrings) mask(pos);
            pos++;
            continue;
        }

        if (ch === '/' && content[pos + 1] === '/') { mask(pos); mask(pos + 1); inLineComment = true; pos += 2; continue; }
        if (ch === '/' && content[pos + 1] === '*') { mask(pos); mask(pos + 1); inBlockComment = true; pos += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') inString = ch;
        pos++;
    }
    return out.join('');
}

/**
 * Returns the config with its comments blanked at the same offsets. Every key and section search
 * in this module runs on this copy and edits the original at the offsets it finds, so text inside
 * a comment — such as the example `module.exports = { ... }` in the stock MJAPI config header — is
 * never taken for config (#3301).
 */
function BlankComments(content: string): string {
    return MaskSource(content, false);
}

/**
 * Counts array holes (`[ , x]`, `[a, , b]`) outside strings and comments. A hole parses as valid
 * JavaScript and evaluates to `undefined`, so the parse check in {@link WriteConfigChecked} cannot
 * see one (#4547).
 */
export function CountArrayHoles(content: string): number {
    return MaskSource(content, true).match(/[[,]\s*,/g)?.length ?? 0;
}

/**
 * Replaces each match of the global `pattern` inside `content[start, end)`. Matches are found on
 * the comment-blanked copy; `replace` receives the original text at the match's offsets, and the
 * result is spliced into the original. Keeps a removal or rewrite inside its target array/object
 * and out of comments.
 */
function ReplaceInRange(
    content: string,
    start: number,
    end: number,
    pattern: RegExp,
    replace: (original: string) => string
): string {
    const region = BlankComments(content).slice(start, end);
    let result = '';
    let last = 0;
    for (const match of region.matchAll(pattern)) {
        const matchStart = match.index ?? 0;
        const matchEnd = matchStart + match[0].length;
        result += content.slice(start + last, start + matchStart) + replace(content.slice(start + matchStart, start + matchEnd));
        last = matchEnd;
    }
    if (last === 0 && result === '') return content;
    return content.slice(0, start) + result + content.slice(start + last);
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
    // Searched on the comment-blanked copy: the stock MJAPI header documents an example
    // `module.exports = { ... }` inside a comment, which a plain first match lands in (#3301).
    const code = BlankComments(content);
    // Try pattern 1: module.exports = { ... }
    const inlineMatch = code.match(/module\.exports\s*=\s*\{/);
    if (inlineMatch && inlineMatch.index !== undefined) {
        const bracePos = code.indexOf('{', inlineMatch.index);
        const closePos = FindMatchingBracket(content, bracePos);
        if (closePos === -1) {
            throw new Error('Could not locate the closing brace of module.exports in mj.config.cjs.');
        }
        const before = EnsureTrailingComma(content.slice(0, closePos), bracePos);
        return before + section + content.slice(closePos);
    }

    // Try pattern 2: module.exports = someVar;
    const varMatch = code.match(/module\.exports\s*=\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*;/);
    if (varMatch && varMatch.index !== undefined) {
        const varName = varMatch[1];
        // Find the variable's object literal: const/let/var varName = { ... }
        const declPattern = new RegExp(`(?:const|let|var)\\s+${EscapeRegex(varName)}\\s*=\\s*\\{`);
        const declMatch = code.match(declPattern);
        if (declMatch && declMatch.index !== undefined) {
            const bracePos = code.indexOf('{', declMatch.index);
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
// NEW USER TEMPLATE (MJAPI userHandling)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets `userHandling.newUserTemplate` in mj.config.cjs, so MJAPI builds every user it creates at
 * first sign-in as a copy of the template user `email` (through the `MJ: Users` clone `preset`).
 * Replaces an existing `newUserTemplate`, adds it to an existing `userHandling` object, or adds a
 * `userHandling` section. Autocreation itself is still `userHandling.autoCreateNewUsers`.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param email - Email of the template user
 * @param preset - MJ: Users clone preset to apply (normally `template`)
 * @param serverPackagePath - Optional server package path for config resolution
 * @returns Operation result
 */
export function SetNewUserTemplate(
    repoRoot: string,
    email: string,
    preset: string,
    serverPackagePath?: string
): ConfigOperationResult {
    return ApplyToConfigs(repoRoot, serverPackagePath, 'set userHandling.newUserTemplate', (content) =>
        UpsertNewUserTemplate(content, email, preset));
}

/** Writes `newUserTemplate: { email, preset }` into the config's `userHandling`, creating what is missing. */
function UpsertNewUserTemplate(content: string, email: string, preset: string): string {
    const literal = `{ email: ${JSON.stringify(email)}, preset: ${JSON.stringify(preset)} }`;
    const code = BlankComments(content);
    const existing = /newUserTemplate\s*:\s*\{/.exec(code);
    if (existing) {
        const open = code.indexOf('{', existing.index);
        const close = FindMatchingBracket(content, open);
        if (close === -1) {
            throw new Error('Could not locate the end of userHandling.newUserTemplate in mj.config.cjs.');
        }
        return content.slice(0, open) + literal + content.slice(close + 1);
    }
    const handling = /userHandling\s*:\s*\{/.exec(code);
    if (handling) {
        const open = code.indexOf('{', handling.index);
        return content.slice(0, open + 1) + `\n    newUserTemplate: ${literal},` + content.slice(open + 1);
    }
    return InsertBeforeModuleExportsClose(content, `\n  userHandling: {\n    newUserTemplate: ${literal},\n  },\n`);
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
 * Ensures the config file has an excludeSchemas array.
 * If it doesn't exist, adds one inside the module.exports object.
 */
function EnsureExcludeSchemasSection(content: string): string {
    // `excludeSchemas_append` (concatenated onto the defaults by the config merger) counts as the
    // section too; missing it wrote a second `excludeSchemas: []` into the file (#3301).
    if (/\bexcludeSchemas(?:_append)?\s*:/.test(BlankComments(content))) {
        return content;
    }

    const section = `\n  excludeSchemas: [],\n`;
    return InsertBeforeModuleExportsClose(content, section);
}

/** An `excludeSchemas` or `excludeSchemas_append` array: its key and bracket offsets. */
interface ExcludeArrayLocation {
    Key: string;
    OpenBracketPos: number;
    ClosePos: number;
}

/** Finds every `excludeSchemas` / `excludeSchemas_append` array outside comments, in file order. */
function LocateExcludeArrays(content: string): ExcludeArrayLocation[] {
    const locations: ExcludeArrayLocation[] = [];
    for (const match of BlankComments(content).matchAll(/\b(excludeSchemas(?:_append)?)\s*:\s*\[/g)) {
        const openBracketPos = (match.index ?? 0) + match[0].length - 1;
        const closePos = FindMatchingBracket(content, openBracketPos);
        if (closePos !== -1) {
            locations.push({ Key: match[1], OpenBracketPos: openBracketPos, ClosePos: closePos });
        }
    }
    return locations;
}

/**
 * Adds a schema name to the host's exclusion array if no exclusion array already lists it.
 * Writes to `excludeSchemas_append` when the host uses that key, otherwise to the first
 * `excludeSchemas` array.
 */
function AddSchemaToExcludeArray(content: string, schemaName: string): string {
    const arrays = LocateExcludeArrays(content);
    const code = BlankComments(content);
    // Already listed in any exclusion array (case-insensitive)? A commented-out entry does not count.
    const listed = new RegExp(`['"]${EscapeRegex(schemaName)}['"]`, 'i');
    if (arrays.some((a) => listed.test(code.slice(a.OpenBracketPos, a.ClosePos)))) {
        return content;
    }

    const target = arrays.find((a) => a.Key === 'excludeSchemas_append') ?? arrays[0];
    if (!target) {
        return content;
    }

    // JSON.stringify: quoted + escaped literal, so the value can't break out of the string
    // and inject code into the executed config (see AddEntryToDynamicArray).
    const value = JSON.stringify(schemaName);
    const lastIdx = LastSignificantCharIndex(content, target.ClosePos);
    if (lastIdx <= target.OpenBracketPos) {
        // Empty array.
        return content.slice(0, target.ClosePos) + value + content.slice(target.ClosePos);
    }
    // Insert right after the last element. When it already carries a trailing comma, keep that
    // style instead of adding a second comma, which would leave a hole (#4547).
    const entry = content[lastIdx] === ',' ? ` ${value},` : `, ${value}`;
    return content.slice(0, lastIdx + 1) + entry + content.slice(lastIdx + 1);
}

/**
 * Removes a schema name from every `excludeSchemas` / `excludeSchemas_append` array in the config.
 * Each removal is scoped to its array, so the same name elsewhere in the file (or in a comment)
 * is left alone.
 */
function RemoveSchemaFromExcludeArray(content: string, schemaName: string): string {
    // Remove the schema entry (with optional leading comma+space or trailing comma+space).
    // Both quote styles accepted: AddSchemaToExcludeArray now writes JSON.stringify (double
    // quotes), while pre-existing configs hold single-quoted entries.
    const patterns = [
        // Entry with leading comma: , 'schemaName'
        new RegExp(`,\\s*['"]${EscapeRegex(schemaName)}['"]`, 'gi'),
        // Entry with trailing comma (first in array): 'schemaName',
        new RegExp(`['"]${EscapeRegex(schemaName)}['"]\\s*,\\s*`, 'gi'),
        // Sole entry: 'schemaName'
        new RegExp(`['"]${EscapeRegex(schemaName)}['"]`, 'gi'),
    ];

    let result = content;
    // Last array first, so an edit never shifts the offsets of an array still to be edited.
    for (const location of LocateExcludeArrays(content).reverse()) {
        const region = BlankComments(result).slice(location.OpenBracketPos + 1, location.ClosePos);
        const pattern = patterns.find((p) => region.match(p) !== null);
        if (pattern) {
            result = ReplaceInRange(result, location.OpenBracketPos + 1, location.ClosePos, pattern, () => '');
        }
    }
    return result;
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
    const code = BlankComments(content);
    const recordMatch = code.match(/entityPackageName\s*:\s*\{/);
    if (recordMatch) {
        return content; // Already a Record — nothing to do
    }

    // Check if entityPackageName exists as a string
    const stringMatch = code.match(/entityPackageName\s*:\s*['"]([^'"]*)['"]\s*,?/);
    if (stringMatch && stringMatch.index !== undefined) {
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
        return content.slice(0, stringMatch.index) + replacement + content.slice(stringMatch.index + stringMatch[0].length);
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
    const code = BlankComments(content);
    const recordMatch = code.match(/entityPackageName\s*:\s*\{/);
    if (!recordMatch || recordMatch.index === undefined) {
        throw new Error('entityPackageName record not found in mj.config.cjs when adding a schema mapping.');
    }

    const bracePos = code.indexOf('{', recordMatch.index);
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
    const code = BlankComments(content);
    const recordMatch = code.match(/entityPackageName\s*:\s*\{/);
    if (!recordMatch || recordMatch.index === undefined) {
        return content;
    }
    const bracePos = code.indexOf('{', recordMatch.index);
    const closePos = FindMatchingBracket(content, bracePos);
    if (closePos === -1) {
        return content;
    }
    // Accept a single-quoted, double-quoted or bare key, and either quote style for the value
    // (B7). A bare key (`__mj_X: '...'`) needs no quotes in JS; missing it made every install
    // add a second, quoted copy (#4548).
    const name = EscapeRegex(schemaName);
    const pattern = new RegExp(
        `\\s*(?:(['"])${name}\\1|(?<![\\w$])${name}(?![\\w$]))\\s*:\\s*['"][^'"]*['"]\\s*,?`,
        'g'
    );
    return ReplaceInRange(content, bracePos + 1, closePos, pattern, () => '');
}

/**
 * Escapes special regex characters in a string.
 */
function EscapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
