# @memberjunction/dynamic-packages

## 6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

## 6.2.0-edge.0

## 6.1.0

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

## 6.1.0-edge.7

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
