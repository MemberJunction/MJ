import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const distEntry = resolve(packageRoot, 'dist/element-entry.js');
const outDir = resolve(packageRoot, 'dist/element');

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

console.log('[build-element] Built dist/element/mj-wave0-prototype.js');
