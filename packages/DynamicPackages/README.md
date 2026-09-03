# @memberjunction/dynamic-packages

Process-agnostic loader for packages whose names are only known at runtime:

- Open App server / client packages recorded in `mj.config.cjs` `dynamicPackages.server[]` /
  `dynamicPackages.client[]` by `mj app install`
- a host's own generated packages under `codeGeneration.packages`
- the packages of the Open App whose repository a process is standing in (`mj-app.json`)

Importing one of these packages fires its `@RegisterClass` decorators, so `Metadata.GetEntityObject`
returns the app's entity subclass (validation, `Save()` overrides, lifecycle hooks) instead of a
generic `BaseEntity`. MJAPI has always done this at boot. Every other MJ process — the `mj` CLI
(`sync push`, `app …`, `test`, …), the MCP and A2A servers, the integration-test bootstrap, an ad-hoc
script — needs exactly the same behaviour, and this package is where it lives so each host is one call.

## Usage

```ts
import { LoadDynamicPackages, DiscoverMJConfig } from '@memberjunction/dynamic-packages';

// 1. Discover the RAW mj.config.cjs (Zod-parsed configs usually strip `dynamicPackages`).
const { config, configFilePath } = DiscoverMJConfig();

// 2. Load — BEFORE any database provider is set up, exactly where MJAPI does it.
const report = await LoadDynamicPackages({ processId: 'mcp', config, configFilePath });

report.Loaded;    // [{ Entry, Source, Module, RanStartupExport }]
report.Skipped;   // disabled / process-filter / mode-none / duplicate
report.NotFound;  // not resolvable from any anchor (expected before `npm install`)
report.Failed;    // resolved but threw while loading — its own error, never masked
```

Call it **after** the host's own class-registration manifest (`@memberjunction/server-bootstrap`,
`@memberjunction/server-bootstrap-lite`) has been imported: the ClassFactory's load-order priority
means the app's registrations land last and win.

### Process IDs

Every host names itself with a lowercase, colon-separated ID: `mjapi`, `cli:sync:push`, `mcp`,
`a2a`, `integration-tests`. IDs are hierarchical — a pattern matches an ID when it equals the ID or
names one of its ancestor segments, so `cli:sync` covers `cli:sync:push` and `cli:sync:pull` but not
`cli:migrate`. `CliProcessId('sync push')` builds the CLI form from an oclif command ID.

### Scoping entries per process

`dynamicPackages.server[]` stays the single source of truth that `mj app install` writes. Two optional,
hand-authored fields scope an entry:

```js
dynamicPackages: {
  server: [
    // written by `mj app install` — no Processes = loads wherever the server tier loads
    { PackageName: '@mj-biz-apps/orders-server', StartupExport: 'LoadBizAppsOrdersServer', AppName: 'mj-bizapps-orders', Enabled: true },
    // only when the CLI runs any `mj sync` command
    { PackageName: '@acme/demo-seed-server', StartupExport: 'LoadDemoSeed', Processes: ['cli:sync'] },
    // everywhere except migrations
    { PackageName: '@acme/audit-server', StartupExport: 'LoadAudit', ExcludeProcesses: ['cli:migrate'] },
  ],
  // optional per-process on/off switch; the most specific key wins
  policy: { 'cli:migrate': 'none' },
}
```

### Turning it off for one run

`MJ_DYNAMIC_PACKAGES=none` (also `off`, `skip`, `0`) disables loading for a single invocation.
The `mj` CLI exposes it as the global `--no-app-packages` flag. Precedence, highest first:
env var → programmatic `mode` option → `dynamicPackages.policy` → `'load'`.

Note that this only affects *app* packages. MJ core's own server subclasses still register through
the host's manifest, so a "raw" run is raw for app entities only — which is why the CLI flag is not
called `--raw`.

### Running inside an Open App repository

When `mj-app.json` sits next to the config (or in `appManifestDir`), the loader also imports that
app's `packages.shared` libraries and its `packages.server` / `packages.client` bootstrap packages,
running each `startupExport`. Under pnpm's strict layout nothing at the repo root can
`require.resolve` a workspace member, so the loader finds the package under `code.sourceDirectory`
(default `packages/`) and imports it by path. Dependency apps are **not** walked from the manifest:
installed ones are already in the host's `dynamicPackages`, and dev-linked ones ride the workspace's
env-supplied entries.

### Loading twice in one process

The loader remembers what it has loaded. A second call in the same process (the `mj-ai` bin driven
by `mj`, a test harness booting a server twice) gets the cached module back in `Loaded` so it can
still read `RESOLVER_PATHS` / `MJ_SERVER_EXTENSIONS`, but the `StartupExport` is not run again
(`RanStartupExport: false`).

### Contract for `StartupExport`

The loader runs before any database provider exists. A startup export registers classes and returns —
it must not touch a provider, exactly the contract MJAPI has always imposed.

## API

| Export | Purpose |
|---|---|
| `LoadDynamicPackages(options)` | The loader. Never throws for a package problem; returns a `DynamicPackagesReport`. |
| `DiscoverMJConfig(searchFrom?)` | cosmiconfig discovery of the raw `mj.config.cjs` + its path. |
| `importFromHost`, `resolvePackageJsonFromHost`, `isResolutionFailure` | Host-anchored resolution (moved here from `@memberjunction/server-bootstrap`). |
| `CliProcessId`, `ProcessIdMatches`, `MatchesProcess`, `ResolveMostSpecific` | Process-ID utilities. |
| `ResolveDynamicPackagesMode`, `DYNAMIC_PACKAGES_MODE_ENV_VAR` | Mode precedence. |
| `DiscoverGeneratedPackages`, `DiscoverAppManifestPackages`, `ReadDynamicPackagesConfig` | Discovery primitives. |
