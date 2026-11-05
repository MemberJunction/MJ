/**
 * Runs when `mj codegen manifest` fails during MJExplorer's prebuild.
 *
 * The manifest is where installed Open Apps' client packages get wired into the bundle (the
 * generator's `--open-app-client-bootstrap` block). If the generator cannot run, the build would
 * go on with whatever manifest is on disk, and a host with Open Apps installed would ship without
 * their screens and no error. So:
 *
 * - mj.config lists an enabled `dynamicPackages.client` entry: print which apps would be missing
 *   and exit 1, failing the build.
 * - otherwise (MJ's own monorepo, filtered CI builds where the CLI is not built yet, hosts with no
 *   Open Apps): the stale manifest misses nothing, so warn and exit 0 as before. If there is no
 *   manifest file at all (fresh checkout), write the empty one, as MJAPI's ensure-manifest does.
 *
 * Usage: node ./scripts/manifest-fallback.mjs [--output <manifest path>]
 * The config is looked up from the current directory upward, like the CLI does.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT = './src/app/generated/class-registrations-manifest.ts';

/** Config files the CLI's `cosmiconfig('mj')` lookup reads that can be loaded synchronously here. */
const CONFIG_FILES = ['.mjrc', '.mjrc.json', '.mjrc.js', '.mjrc.cjs', 'mj.config.js', 'mj.config.cjs'];

const EMPTY_MANIFEST = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Written by scripts/manifest-fallback.mjs because 'mj codegen manifest' could not run
 * and no Open App client packages are configured. A later real run overwrites this file.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Runtime references to every @RegisterClass decorated class.
 * This array creates a static code path the bundler cannot tree-shake.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CLASS_REGISTRATIONS: any[] = [
];

/** Marker constant indicating the manifest has been loaded. */
export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;

/** Total @RegisterClass decorated classes discovered in dependency tree */
export const CLASS_REGISTRATIONS_COUNT = 0;
`;

/**
 * Finds and loads the nearest mj config from `startDir` upward.
 * @returns the config object and its path, or null when none is found.
 */
export function LoadMJConfig(startDir) {
    let dir = resolve(startDir);
    for (;;) {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            if (pkg.mj && typeof pkg.mj === 'object') {
                return { config: pkg.mj, path: pkgPath };
            }
        }
        for (const name of CONFIG_FILES) {
            const file = join(dir, name);
            if (existsSync(file)) {
                return { config: readConfigFile(file), path: file };
            }
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

function readConfigFile(file) {
    if (file.endsWith('.js') || file.endsWith('.cjs')) {
        const loaded = createRequire(file)(file);
        return loaded?.default ?? loaded;
    }
    return JSON.parse(readFileSync(file, 'utf8'));
}

/** The `dynamicPackages.client` entries that are enabled (`Enabled` defaults to true). */
export function EnabledClientPackages(config) {
    const entries = config?.dynamicPackages?.client;
    if (!Array.isArray(entries)) {
        return [];
    }
    return entries.filter((e) => e && typeof e.PackageName === 'string' && e.Enabled !== false);
}

function writeEmptyManifestIfMissing(output) {
    mkdirSync(dirname(output), { recursive: true });
    try {
        // 'wx' creates the file only if it does not exist, so a real manifest is never clobbered.
        writeFileSync(output, EMPTY_MANIFEST, { encoding: 'utf8', flag: 'wx' });
        console.log('[manifest-fallback] wrote the empty class-registrations manifest (generator unavailable).');
    } catch (error) {
        if (error?.code !== 'EEXIST') {
            throw error;
        }
    }
}

function outputArg(argv) {
    const i = argv.indexOf('--output');
    return i >= 0 && argv[i + 1] ? argv[i + 1] : DEFAULT_OUTPUT;
}

/** Runs the fallback. @returns the process exit code. */
export function Run(cwd, argv) {
    const found = LoadMJConfig(cwd);
    const enabled = found ? EnabledClientPackages(found.config) : [];
    if (enabled.length > 0) {
        const list = enabled.map((e) => `  - ${e.PackageName}${e.AppName ? ` (${e.AppName})` : ''}`).join('\n');
        console.error(
            `\n[MJExplorer] 'mj codegen manifest' failed, and ${found.path} lists ${enabled.length} Open App client ` +
            `package${enabled.length === 1 ? '' : 's'}:\n${list}\n\n` +
            'Building with the existing manifest would ship without these apps\' screens. Fix the error above ' +
            '(or build @memberjunction/cli) and build again.\n'
        );
        return 1;
    }
    console.warn('Warning: mj codegen manifest not available, using existing manifest (no Open App client packages configured)');
    writeEmptyManifestIfMissing(resolve(cwd, outputArg(argv)));
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = Run(process.cwd(), process.argv.slice(2));
}
