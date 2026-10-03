/**
 * Builds `<mj-realtime-widget>` as a SMALL SHELL plus a lazily loaded CALL CHUNK, into `dist/element/`:
 *
 *   mj-realtime-widget.js            the shell: a classic <script> (IIFE) that defines the element, renders the
 *                                    start button / consent / status, and loads the call on demand.
 *   mj-realtime-widget-session.js    the call: an ES module (Angular, the realtime overlay, runtime, drivers, the
 *                                    GraphQL client, and the built-in channels) fetched by `import()` on start.
 *   chunks/*.js                      code the call shares with the lazy Interactive Component channel, and that
 *                                    channel itself (React runtime + component host), fetched only when a session
 *                                    could use it.
 *
 * Why two builds and not one with splitting: the shell must stay a classic script (it works in a CMS snippet and
 * needs no CORS headers on its own file), and ES-module code splitting needs ES-module output. So the shell is its
 * own IIFE and the call is its own split ES-module build. The shell finds the call by its own URL, so a CDN path
 * needs no configuration. A guard FAILS this build if anything heavy leaks into the shell.
 *
 * Why this is a script and not an `esbuild` flag list: the Angular Linker runs as an esbuild `onLoad` step, which
 * the CLI cannot express. The reasons below are load-bearing and each fails quietly:
 *
 * ── WHY THE LINKER ────────────────────────────────────────────────────────────────────────────
 * Published `@angular/*` packages ship PARTIALLY compiled (`ɵɵngDeclare*`). esbuild does not run the Angular
 * Linker, so without it those declarations reach the browser un-linked and Angular falls back to its JIT
 * compiler to finish them. Running the linker here converts them to full AOT at build time, which is what
 * makes two things safe — and they are only safe TOGETHER:
 *   • no `@angular/compiler` import in the entry, and
 *   • `ngJitMode: false`, which strips the JIT code paths.
 * ⚠️ Taking `ngJitMode: false` WITHOUT the linker builds clean and dies in the browser. And a page whose CSP
 * forbids `unsafe-eval` cannot run the JIT compiler at all, so "no JIT" is what lets the widget load there.
 *
 * ── WHY `keepNames` IS NOT OPTIONAL ───────────────────────────────────────────────────────────
 * MJ's class factory resolves registrations by STRING at runtime (`@RegisterClass`). A minifier that renames
 * a class breaks that lookup with no build error and no console error — the channel or driver simply never
 * appears. `src/__tests__/element-bundle.test.ts` asserts the registration keys survive; `keepNames` is what
 * lets it pass. Do not drop it to save bytes.
 *
 * Consumes ngc output and compiles no TypeScript itself, so it requires a prior `ngc` — which is why `build`
 * is `ngc && node scripts/build-element.mjs`, and why running this standalone fails loudly rather than
 * bundling something stale.
 */
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const outDir = resolve(packageRoot, 'dist/element');
const shellEntry = resolve(packageRoot, 'dist/shell-entry.js');
const sessionEntry = resolve(packageRoot, 'dist/session-entry.js');

/** The shell's gzip budget (bytes). It is a ceiling, not a target: the build fails if the shell grows past it. */
const SHELL_GZIP_BUDGET = 40 * 1024;
/** Anything matching these in the shell's inputs means a heavy dependency leaked into the part every page pays for. */
const FORBIDDEN_IN_SHELL = [/node_modules[\\/]@angular[\\/]/, /node_modules[\\/]rxjs[\\/]/, /node_modules[\\/]zone\.js[\\/]/, /node_modules[\\/]@memberjunction[\\/]/, /[\\/]MJ[A-Za-z]+[\\/]dist[\\/]/, /conversations[\\/]dist[\\/]/];

for (const entry of [shellEntry, sessionEntry]) {
    if (!existsSync(entry)) {
        console.error(
            `[build:element] Compiled entry not found at ${entry}.\n` +
                `  This script bundles ngc OUTPUT and does not compile TypeScript. Run \`pnpm run build\`\n` +
                `  (which is \`ngc && node scripts/build-element.mjs\`) rather than this script alone.`,
        );
        process.exit(1);
    }
}

/**
 * Run the Angular Linker over every partially-compiled module in the bundle.
 *
 * THE GATE IS THE CONTENT, NOT THE PACKAGE NAME. Any library published with the Angular Package Format ships
 * partial declarations — `angular-split` and `@angular/cdk` among them — and an unlinked one in a bundle built
 * with `ngJitMode: false` dies on load with "JIT compiler unavailable". The `ngDeclare` substring check is what
 * keeps this affordable: it skips the overwhelming majority of modules with a scan instead of a Babel pass.
 */
const angularLinker = {
    name: 'angular-linker',
    setup(buildApi) {
        buildApi.onLoad({ filter: /\.m?js$/ }, async (args) => {
            const source = readFileSync(args.path, 'utf8');
            if (!source.includes('ngDeclare')) {
                return { contents: source, loader: 'js' };
            }
            const result = await transformAsync(source, {
                filename: args.path,
                configFile: false,
                babelrc: false,
                compact: false,
                sourceMaps: false,
                plugins: [linkerPlugin.default ?? linkerPlugin],
            });
            return { contents: result?.code ?? source, loader: 'js' };
        });
    },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const common = { bundle: true, platform: 'browser', target: 'es2022', minify: true, keepNames: true, sourcemap: true, legalComments: 'none', metafile: true, logLevel: 'warning' };

// ── The shell: a classic script, nothing heavy ───────────────────────────────────────────────────
const shell = await build({
    ...common,
    entryPoints: { 'mj-realtime-widget': shellEntry },
    outdir: outDir,
    format: 'iife',
    // The one dynamic import() in the shell takes a run-time URL; esbuild leaves it as a native import().
});

// ── The call: an ES module graph, split so the Interactive Component channel is its own file ─────
const session = await build({
    ...common,
    entryPoints: { 'mj-realtime-widget-session': sessionEntry },
    outdir: outDir,
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    define: { ngDevMode: 'false', ngJitMode: 'false' },
    plugins: [angularLinker],
});

// ── Guard and report ─────────────────────────────────────────────────────────────────────────────
const leaked = Object.keys(shell.metafile.inputs).filter((input) => FORBIDDEN_IN_SHELL.some((pattern) => pattern.test(input)));
if (leaked.length > 0) {
    console.error(`[build:element] A heavy dependency leaked into the shell:\n  ${leaked.slice(0, 10).join('\n  ')}`);
    process.exit(1);
}

const sizes = [];
for (const [metafile, role] of [[shell.metafile, 'shell'], [session.metafile, 'call']]) {
    for (const [path, info] of Object.entries(metafile.outputs)) {
        if (path.endsWith('.map')) {
            continue;
        }
        const file = relative(outDir, resolve(packageRoot, path));
        const bytes = readFileSync(resolve(packageRoot, path));
        const kind = role === 'shell' ? 'shell' : /^mj-realtime-widget-session/.test(file) ? 'session' : /interactive-chunk-entry/.test(file) ? 'interactive-component' : 'shared';
        sizes.push({ file, kind, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, entry: Boolean(info.entryPoint) });
    }
}
writeFileSync(resolve(outDir, 'sizes.json'), JSON.stringify(sizes, null, 2), 'utf8');
writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ shell: shell.metafile, session: session.metafile }), 'utf8');

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log('[build:element] Bundled <mj-realtime-widget>:');
for (const row of sizes) {
    console.log(`  ${row.file.padEnd(58)} ${row.kind.padEnd(22)} ${kb(row.raw).padStart(10)} raw  ${kb(row.gzip).padStart(10)} gzip`);
}
const shellRow = sizes.find((row) => row.kind === 'shell');
if (!shellRow || shellRow.gzip > SHELL_GZIP_BUDGET) {
    console.error(`[build:element] The shell is ${kb(shellRow?.gzip ?? 0)} gzip; its budget is ${kb(SHELL_GZIP_BUDGET)}. Something heavy got in.`);
    process.exit(1);
}
