---
"@memberjunction/open-app-engine": patch
---

`mj app install` and `mj app upgrade` check every declared app package against the npm registry (`npm view`) before any database or file change, and stop with a clear message on an npm authentication failure (run `npm login`) or an unpublished package. Skipped for the `workspace` version strategy and inside an `mj dev workspace`. `AddAppPackages` restores the package.json files it already wrote when a later target fails.
