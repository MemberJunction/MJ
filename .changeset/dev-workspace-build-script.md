---
"@memberjunction/cli": patch
---

`mj dev workspace`: the parent package.json gets a `build` script (`pnpm -r --workspace-concurrency=1 run build`) and no member's turbo.json is copied to the parent any more; a turbo.json an earlier version wrote is moved to `.bak` on regenerate and removed by `clean` (#4913). Lockfile pins count votes only from importers the workspace includes, so an excluded app shell no longer decides them (#4129).
