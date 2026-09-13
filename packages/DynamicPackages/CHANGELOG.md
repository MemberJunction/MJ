# @memberjunction/dynamic-packages

## 6.1.0-edge.6

### Patch Changes

- 41b0d28: Load Open App server packages in every MJ process, not only MJAPI (#4199).

  `mj sync push` (and `mj app …`, `mj test`, the MCP/A2A servers, the integration-test bootstrap)
  never imported an installed app's server package, so `Metadata.GetEntityObject` handed back a
  generic `BaseEntity` for the app's entities and every custom `Save()`, validation rule and
  lifecycle hook was silently skipped — while MJ core's own server subclasses, loaded through the
  lite manifest, did run. New `@memberjunction/dynamic-packages` extracts the loader (and the
  host-anchored import) out of `server-bootstrap` into a package with no MJ runtime dependencies,
  and each host is now one `LoadDynamicPackages({ processId })` call. ServerBootstrap consumes it
  with two deliberate behaviour changes: it no longer attempts to import the Angular forms package
  into Node, and when an `mj-app.json` sits beside its `mj.config.cjs` (an Open App repo running its
  own dev host) it now loads that app's server packages and resolver paths too.

  `dynamicPackages.server[]` stays the single list `mj app install` writes; when both it and an
  `mj-app.json` name a package, the config entry decides `Enabled` and scoping while the manifest's
  on-disk location remains the resolution fallback. Entries gain optional
  `Processes` / `ExcludeProcesses` (process IDs or prefixes: `cli`, `cli:sync`, `cli:sync:push`,
  `mjapi`, `mcp`, …) and the section gains an optional `policy` map, so a package can be scoped to
  just `mj sync` or switched off for `mj migrate`. `MJ_DYNAMIC_PACKAGES=none` and the global CLI
  flag `--no-app-packages` (declared in `--help`) disable loading for one run — for app packages AND the
  host's own generated packages; MJ core's classes still load from the manifest. The `mj` prerun hook
  publishes its process id through `MJ_DYNAMIC_PACKAGES_PROCESS` so the nested `ai-cli` /
  `testing-cli` bootstraps apply the same scoping and policy. A package already loaded in the process
  is handed back from cache without re-running its startup export. New guide:
  `guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md`. `mj sync push` now warns, once per entity,
  when it is about to write with a `BaseEntity` because no subclass is registered.

- fd0a019: Follow-ups to the dynamic-package loader (#4199) from testing it end to end:
  - The `mj` CLI's config schema no longer requires `AppName` on hand-authored `dynamicPackages.server[]` entries and accepts every `policy` value the loader accepts, so the README's own examples no longer make `mj migrate` / `mj clean` / `mj app check-updates` abort with a misleading "Database credentials are missing" error.
  - A workspace member found on disk via `mj-app.json` but not yet built is reported as not-found (with the missing entry file named) instead of as a load failure that warned on every command.
  - The standalone `mj-ai` / `mj-testing` provider bootstraps log through a new `StderrDynamicPackagesLogger`, so `--format=json` / `--output=json` stdout is no longer prefixed with loader progress lines.
  - README: scoping examples use `cli:codegen` instead of `cli:migrate` (migrate is a light command that never loads app packages), and mode `none` is documented as skipping the host's generated packages too.
