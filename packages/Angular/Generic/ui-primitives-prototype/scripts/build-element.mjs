import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const cssPath = resolve(packageRoot, 'src/lib/styles/primitives-prototype.css');
const generatedCssTsPath = resolve(packageRoot, 'src/lib/styles/prototype-css.generated.ts');
const distEntry = resolve(packageRoot, 'dist/element-entry.js');
const outDir = resolve(packageRoot, 'dist/element');

// 1. Ensure prototype-css.generated.ts is in sync if running standalone after ngc,
//    or fail loudly if dist/element-entry.js is missing.
if (!existsSync(distEntry)) {
  console.error(
    `[build-element] Missing ${distEntry}. Run \`pnpm run build\` (ngc && node scripts/build-element.mjs).`
  );
  process.exit(1);
}

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

await build({
  entryPoints: [distEntry],
  outfile: resolve(outDir, 'mj-wave0-prototype.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: false,
  keepNames: true,
  define: {
    ngDevMode: 'false',
    ngJitMode: 'false',
  },
  plugins: [angularLinker],
});

// Also copy raw CSS into dist/element/ for CSP hosts that prefer <link rel="stylesheet">.
writeFileSync(resolve(outDir, 'mj-wave0-prototype.css'), readFileSync(cssPath, 'utf8'), 'utf8');
console.log('[build-element] Built dist/element/mj-wave0-prototype.js and mj-wave0-prototype.css');
