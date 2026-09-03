---
"@memberjunction/dynamic-packages": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/cli": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/a2aserver": patch
"@memberjunction/component-registry-server": patch
"@memberjunction/testing-integration": patch
"@memberjunction/ai-cli": patch
"@memberjunction/testing-cli": patch
---

Load Open App server packages in every MJ process, not only MJAPI (#4199).

`mj sync push` (and `mj app …`, `mj test`, the MCP/A2A servers, the integration-test bootstrap)
never imported an installed app's server package, so `Metadata.GetEntityObject` handed back a
generic `BaseEntity` for the app's entities and every custom `Save()`, validation rule and
lifecycle hook was silently skipped — while MJ core's own server subclasses, loaded through the
lite manifest, did run. New `@memberjunction/dynamic-packages` extracts the loader (and the
host-anchored import) out of `server-bootstrap` into a package with no MJ runtime dependencies,
and each host is now one `LoadDynamicPackages({ processId })` call. ServerBootstrap consumes it
with no behaviour change beyond no longer attempting to import the Angular forms package into Node.

`dynamicPackages.server[]` stays the single list `mj app install` writes. Entries gain optional
`Processes` / `ExcludeProcesses` (process IDs or prefixes: `cli`, `cli:sync`, `cli:sync:push`,
`mjapi`, `mcp`, …) and the section gains an optional `policy` map, so a package can be scoped to
just `mj sync` or switched off for `mj migrate`. `MJ_DYNAMIC_PACKAGES=none` and the global CLI
flag `--no-app-packages` disable loading for one run. `mj sync push` now warns, once per entity,
when it is about to write with a `BaseEntity` because no subclass is registered.
