/**
 * Bundle the `<mj-comms-preference-center>` Angular Element for GET /comms/preferences/:token.
 * Requires `ngc` to have already emitted dist/lib/comms-preference-center.component.js.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostJs = path.join(pkgRoot, 'dist/lib/comms-preference-center.component.js');
if (!fs.existsSync(hostJs)) {
  console.error('build-element: ngc output missing at', hostJs);
  process.exit(1);
}

// dynamic-import: build-time Angular linker run outside runtime bundle
const babel = await import('@babel/core');
const linkerMod = await import('@angular/compiler-cli/linker/babel');
const linkerPlugin = linkerMod.default ?? linkerMod.createEs2015LinkerPlugin;

function angularLinkerPlugin() {
  return {
    name: 'angular-linker',
    setup(build) {
      build.onLoad({ filter: /[\\/]@angular[\\/].*\.[cm]?js$/ }, async (args) => {
        const source = await fs.promises.readFile(args.path, 'utf8');
        if (!source.includes('ngDeclare')) {
          return null;
        }
        const result = await babel.transformAsync(source, {
          filename: args.path,
          configFile: false,
          babelrc: false,
          compact: false,
          plugins: [linkerPlugin],
        });
        if (!result?.code) {
          return null;
        }
        return { contents: result.code, loader: 'js' };
      });
    },
  };
}

const outdir = path.join(pkgRoot, 'dist/element');
fs.mkdirSync(outdir, { recursive: true });

await esbuild.build({
  absWorkingDir: pkgRoot,
  entryPoints: [path.join(pkgRoot, 'src/element-entry.ts')],
  bundle: true,
  format: 'esm',
  outfile: path.join(outdir, 'main.js'),
  platform: 'browser',
  target: 'es2022',
  sourcemap: process.env.COMMS_ELEMENT_SOURCEMAP === '1',
  legalComments: 'none',
  plugins: [angularLinkerPlugin()],
  logOverride: { 'empty-import-meta': 'silent' },
});

console.log('comms-preference-center-element ->', path.join(outdir, 'main.js'));
