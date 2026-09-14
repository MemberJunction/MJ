---
'@memberjunction/metadata-sync': patch
---

5.51.x: `mj sync push` and `mj sync pull` load the host's Open App server packages and generated
entity packages, so records go through their real entity classes.

`mj sync` registered only MJ core's entity classes. Every entity from an installed Open App
(`dynamicPackages.server`) or from the host's own generated packages (`codeGeneration.packages`)
was created as a generic `BaseEntity`: push silently skipped the app's custom `Save()`, validation
and lifecycle hooks, and pull — which keyed records through the missing typed properties — wrote
one record per run with an empty `primaryKey` (#3415, #4199).

- Port of MJ 6.x's dynamic-package loader (PR #4201) into metadata-sync, called only by
  `mj sync push` / `mj sync pull` (process IDs `cli:sync:push` / `cli:sync:pull`). MJAPI and every
  other command are unchanged. `Enabled`, `Processes` / `ExcludeProcesses`,
  `dynamicPackages.policy` and `MJ_DYNAMIC_PACKAGES=none` behave exactly as on 6.x.
- Push (directory and `@lookup` auto-create paths) and pull warn once per entity when its
  subclass is still not registered.
