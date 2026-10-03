/**
 * Bundles `<mj-realtime-widget>` into one self-contained, browser-loadable IIFE:
 * `dist/element/mj-realtime-widget.js` (plus a sourcemap and the esbuild metafile).
 *
 * Why this is a script and not an `esbuild` flag list: the Angular Linker runs as an esbuild `onLoad` step,
 * which the CLI cannot express. The pattern is the one the Orders checkout element and the Caliber widget
 * already ship (`createApplication` + `createCustomElement`, linker bundle, no `unsafe-eval`), with the same
 * reasons — repeated here because each is load-bearing and each fails quietly:
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
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const entryPoint = resolve(packageRoot, 'dist/element-entry.js');
const outFile = resolve(packageRoot, 'dist/element/mj-realtime-widget.js');

if (!existsSync(entryPoint)) {
    console.error(
        `[build:element] Compiled entry not found at ${entryPoint}.\n` +
            `  This script bundles ngc OUTPUT and does not compile TypeScript. Run \`pnpm run build\`\n` +
            `  (which is \`ngc && node scripts/build-element.mjs\`) rather than this script alone.`,
    );
    process.exit(1);
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

mkdirSync(dirname(outFile), { recursive: true });
const result = await build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    // See the header: string-based @RegisterClass lookups break silently without this.
    keepNames: true,
    sourcemap: true,
    legalComments: 'none',
    define: { ngDevMode: 'false', ngJitMode: 'false' },
    plugins: [angularLinker],
    metafile: true,
    logLevel: 'info',
});

writeFileSync(resolve(packageRoot, 'dist/element/meta.json'), JSON.stringify(result.metafile), 'utf8');
const out = Object.entries(result.metafile.outputs).find(([name]) => name.endsWith('mj-realtime-widget.js'));
const bytes = out ? out[1].bytes : 0;
console.log(`[build:element] Bundled <mj-realtime-widget> → ${outFile} (${(bytes / 1048576).toFixed(2)} MB)`);
