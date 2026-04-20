# Debugging MJExplorer with VSCode + Chrome DevTools

## Prerequisites

- Angular 21 with ESBuild `application` builder
- Vite dev server (automatic with `application` builder)
- Chrome browser

## Quick Start

1. Start the dev server: `npm start` (runs on port 4201)
2. In VSCode, launch the **"MJExplorer"** debug config from `.vscode/launch.json`
3. Set breakpoints in VSCode or Chrome DevTools

## Key Configuration

### angular.json — Source Map Settings

Both `development` and `local_modules` configs need vendor source maps enabled:

```json
"sourceMap": {
  "scripts": true,
  "styles": true,
  "vendor": true
}
```

- **`vendor: true`** is critical — without it, source maps only map to compiled JS, not original TypeScript
- **`preserveSymlinks`** should NOT be set (defaults to `false`) — this makes ESBuild resolve symlinked `@memberjunction/*` packages to their real paths under `packages/`, which is essential for source map path alignment

### .vscode/launch.json — MJExplorer Debug Config

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "MJExplorer",
  "url": "http://localhost:4201",
  "webRoot": "${workspaceFolder}",
  "sourceMaps": true,
  "sourceMapPathOverrides": {
    "/@fs/*": "/*",
    "./src/*": "${workspaceFolder}/packages/MJExplorer/src/*"
  },
  "resolveSourceMapLocations": [
    "${workspaceFolder}/**",
    "${workspaceFolder}/node_modules/@memberjunction/**"
  ],
  "skipFiles": ["<node_internals>/**", "**/zone/**"]
}
```

Key settings explained:

| Setting | Purpose |
|---------|---------|
| `webRoot` | Set to workspace root so relative paths resolve correctly |
| `/@fs/*` → `/*` | Vite serves files outside project root via `/@fs/` prefix — this strips it |
| `./src/*` override | Maps app source files to the MJExplorer `src/` directory |
| `resolveSourceMapLocations` | Whitelist `@memberjunction` packages for source map resolution |
| `skipFiles` | Skip Node internals and zone.js for cleaner stepping |

### Debugging Tip: Trace Mode

Add `"trace": true` to the launch config to generate detailed debug adapter logs. Trace files appear at:
```
~/Library/Application Support/Code/logs/<session>/window1/exthost/ms-vscode.js-debug/
```

These JSON files show exactly how source maps are resolved and why breakpoints may fail.

## How It Works

### Source Map Chain

1. Each `@memberjunction` Angular package compiles TS → JS with `.js.map` files in `dist/`
2. ESBuild bundles everything into `main.js` with an inline source map
3. The inline source map chains back through vendor `.js.map` files to original `.ts` sources
4. With `vendor: true`, Angular enables this full chain (without it, you only get compiled JS)

### Symlink Resolution

The monorepo uses npm workspace symlinks:
```
node_modules/@memberjunction/ng-explorer-core → ../../packages/Angular/Explorer/explorer-core
```

With `preserveSymlinks: false` (the default), ESBuild resolves these to real paths. This means source maps point to `packages/Angular/Explorer/...` instead of `node_modules/@memberjunction/...`, which aligns with the workspace file structure.

### Chrome DevTools Source Tree

With this config, Chrome DevTools Sources panel shows:
- `@fs/Users/.../develop/` — resolved package sources with full directory structure
  - `Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`
  - `MJCore/src/...`
  - `src/` — app's own source files

You can set breakpoints directly in Chrome DevTools on these `.ts` files.

## Troubleshooting

### I see .js files instead of .ts in Chrome
- Check that `vendor: true` is set in angular.json sourceMap config
- Clear Angular cache: `rm -rf packages/MJExplorer/.angular/cache`

### Source files show under node_modules instead of packages
- Ensure `preserveSymlinks` is NOT set (or set to `false`) in angular.json
- Clear Angular cache after changing this setting

### Hot reload not working for library changes
- Verify `hmr: true` is set in angular.json serve options
- The `prebundle.exclude: ["@memberjunction/*"]` ensures library changes aren't cached

### Build fails after removing preserveSymlinks
- This can happen if packages have duplicate dependency instances
- In npm workspaces with hoisted deps, this should not occur
- If it does, add `preserveSymlinks: true` back and use `node_modules/` path overrides instead
