#!/usr/bin/env node
/**
 * Builds `<mj-tour-host>` as a two-stage embed into `dist/element/`:
 *
 *   mj-tours.js            Stage-1 shell (classic IIFE, <= 25 KB gzip): defines `<mj-tour-host>`,
 *                          exports `RegisterTourElements()`, `MountTours()`, `RegisterAnchor()`, runs
 *                          the lightweight `MutationObserver` anchor registry, and lazy-loads Stage-2.
 *   mj-tours-session.js    Stage-2 Angular session bundle (ESM + Angular Linker + `ngJitMode: false`
 *                          + `keepNames: true`), splitting heavy step renderers (`EmbeddedComponent`,
 *                          `Media`, `AskAgent`) into `chunks/*.js`.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '../../../..');
const searchRoots = [
  packageRoot,
  resolve(repoRoot, 'packages/Angular/Generic/realtime-widget'),
  repoRoot,
];

const resolveImport = async (specifier) =>
  import(pathToFileURL(require.resolve(specifier, { paths: searchRoots })).href);

const { build } = await resolveImport('esbuild');
const { transformAsync } = await resolveImport('@babel/core');
const linkerPlugin = (await resolveImport('@angular/compiler-cli/linker/babel')).default;

const outDir = resolve(packageRoot, 'dist/element');
const shellEntry = resolve(packageRoot, 'dist/shell-entry.js');
const sessionEntry = resolve(packageRoot, 'dist/session-entry.js');

/** Stage-1 shell gzip ceiling (bytes). Fails build if exceeded. */
export const SHELL_GZIP_BUDGET = 25 * 1024;

/** Heavy dependencies strictly forbidden in the Stage-1 shell. */
export const FORBIDDEN_IN_SHELL = [
  /node_modules[\\/]@angular[\\/]/,
  /node_modules[\\/]rxjs[\\/]/,
  /node_modules[\\/]zone\.js[\\/]/,
  /node_modules[\\/]@memberjunction[\\/]/,
  /[\\/]MJ[A-Za-z]+[\\/]dist[\\/]/,
  /[\\/]Tours[\\/]Runtime[\\/]dist[\\/]/,
];

for (const entry of [shellEntry, sessionEntry]) {
  if (!existsSync(entry)) {
    console.error(
      `[build:element] Compiled entry not found at ${entry}. Run \`ngc\` first.`,
    );
    process.exit(1);
  }
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

const hasOwnNodeModules = existsSync(resolve(packageRoot, 'node_modules', '@angular', 'elements'));
const fallbackNodePaths = hasOwnNodeModules
  ? []
  : [
      resolve(repoRoot, 'packages/Angular/Generic/realtime-widget/node_modules'),
      resolve(repoRoot, 'packages/Angular/Generic/base-forms/node_modules'),
      resolve(repoRoot, 'packages/Angular/Generic/react/node_modules'),
      resolve(repoRoot, 'packages/Tours/Runtime/node_modules'),
      resolve(repoRoot, 'node_modules'),
    ];

const preInstallWorkspacePlugin = {
  name: 'pre-install-workspace-aliases',
  setup(buildApi) {
    if (hasOwnNodeModules) {
      return;
    }
    const directMap = {
      '@memberjunction/tours-runtime': resolve(repoRoot, 'packages/Tours/Runtime/dist/index.js'),
      '@memberjunction/ng-base-forms': resolve(repoRoot, 'packages/Angular/Generic/base-forms/dist/public-api.js'),
      '@memberjunction/ng-react': resolve(repoRoot, 'packages/Angular/Generic/react/dist/public-api.js'),
      '@memberjunction/core-entities': resolve(repoRoot, 'packages/MJCoreEntities/dist/index.js'),
      '@memberjunction/graph': resolve(repoRoot, 'packages/Graph/dist/index.js'),
    };
    buildApi.onResolve({ filter: /^@memberjunction\/(tours-runtime|ng-base-forms|ng-react|core-entities|graph)$/ }, (args) => {
      const target = directMap[args.path];
      return target ? { path: target } : undefined;
    });
  },
};

const common = {
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  minify: true,
  keepNames: true,
  sourcemap: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
  absWorkingDir: packageRoot,
  ...(fallbackNodePaths.length > 0 ? { nodePaths: fallbackNodePaths } : {}),
};

// Stage 1: classic IIFE shell
const shell = await build({
  ...common,
  entryPoints: { 'mj-tours': shellEntry },
  outdir: outDir,
  format: 'iife',
  ...(hasOwnNodeModules ? {} : { plugins: [preInstallWorkspacePlugin] }),
});

// Stage 2: ESM session bundle with code-split lazy step chunks
const session = await build({
  ...common,
  entryPoints: { 'mj-tours-session': sessionEntry },
  outdir: outDir,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  define: { ngDevMode: 'false', ngJitMode: 'false' },
  plugins: hasOwnNodeModules ? [angularLinker] : [preInstallWorkspacePlugin, angularLinker],
});

const leaked = Object.keys(shell.metafile.inputs).filter((input) =>
  FORBIDDEN_IN_SHELL.some((pattern) => pattern.test(input)),
);
if (leaked.length > 0) {
  console.error(
    `[build:element] Heavy dependency leaked into Stage-1 shell:\n  ${leaked.slice(0, 10).join('\n  ')}`,
  );
  process.exit(1);
}

const sizes = [];
for (const [metafile, role] of [
  [shell.metafile, 'shell'],
  [session.metafile, 'session'],
]) {
  for (const [path, info] of Object.entries(metafile.outputs)) {
    if (path.endsWith('.map')) {
      continue;
    }
    const absOutputPath = resolve(packageRoot, path);
    const file = relative(outDir, absOutputPath);
    const bytes = readFileSync(absOutputPath);
    const kind =
      role === 'shell'
        ? 'shell'
        : /^mj-tours-session/.test(file)
          ? 'session'
          : /embedded-component-step-renderer/.test(file)
            ? 'embedded-component'
            : /media-step-renderer/.test(file)
              ? 'media'
              : /ask-agent-step-renderer/.test(file)
                ? 'ask-agent'
                : 'shared';
    sizes.push({
      file,
      kind,
      raw: bytes.length,
      gzip: gzipSync(bytes, { level: 9 }).length,
      entry: Boolean(info.entryPoint),
    });
  }
}

writeFileSync(resolve(outDir, 'sizes.json'), JSON.stringify(sizes, null, 2), 'utf8');
writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ shell: shell.metafile, session: session.metafile }), 'utf8');

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log('[build:element] Bundled <mj-tour-host>:');
for (const row of sizes) {
  console.log(
    `  ${row.file.padEnd(54)} ${row.kind.padEnd(20)} ${kb(row.raw).padStart(10)} raw  ${kb(row.gzip).padStart(10)} gzip`,
  );
}

const shellRow = sizes.find((row) => row.kind === 'shell');
if (!shellRow || shellRow.gzip > SHELL_GZIP_BUDGET) {
  console.error(
    `[build:element] Stage-1 shell is ${kb(shellRow?.gzip ?? 0)} gzip; budget is ${kb(SHELL_GZIP_BUDGET)}.`,
  );
  process.exit(1);
}
