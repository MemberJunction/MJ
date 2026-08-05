---
"@memberjunction/open-app-engine": patch
---

fix(open-app): anchor every `mj.config.cjs` edit to the live, top-level key it targets.

The schema-array editors in `config-manager.ts` located their target with a bare
`content.match(/excludeSchemas\s*:\s*\[/)` and, on removal, fell back to a global
`['"]<schema>['"]` replace across the whole file. Three independent failures came out of that, all
reproduced against the built package on real config files:

- **The removal ate unrelated config.** The bare fallback matches the schema name anywhere. Because
  `HandleServerConfig` writes the `entityPackageName` key moments before, removal deleted that key
  and produced `: "@pkg/x"` — invalid JavaScript. `WriteConfigChecked` caught it and refused the
  write, but a root-config failure is fatal, so `mj app install` aborted on a **fresh host** and
  `mj app upgrade` aborted on every run after the first. It also silently emptied an unrelated
  `includeSchemas` array and mangled comments, returning `Success: true`.
- **Comments were treated as configuration.** `distribution.config.cjs` ships `excludeSchemas`
  commented out. The editors wrote *into the comment* and reported success while the evaluated
  config had no `excludeSchemas` at all — so the exclusion silently never took effect.
- **A nested key could win.** `excludeSchemas` also exists under `dbSchemaJSONOutput` and inside
  `bundles[]`. Whichever appeared first in the file was edited, so a host who lists
  `dbSchemaJSONOutput` above the top-level key had the wrong array written and their real exclusions
  left untouched.

All three now resolve through one `FindTopLevelConfigArray` helper that skips strings and comments
and tracks brace depth, so only a live, top-level array is ever edited — the same hardening
`RemoveEntityPackageEntry` already carried.

`ConfigOperationResult` also gains `Changed`, because `Success` alone could not distinguish a
successful no-op from a successful destructive edit. That ambiguity is what let the failures above
pass for working behavior, and it is what now lets the installer warn a host when config they wrote
by hand has been removed.

Tests for this area use real temporary config files rather than a mocked `node:fs` — a mocked
filesystem cannot observe any of these defects.
