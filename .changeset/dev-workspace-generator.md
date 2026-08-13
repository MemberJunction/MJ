---
"@memberjunction/cli": minor
---

New `mj dev workspace` command set: generates the four parent files of the multi-repo Open App dev workspace (`pnpm-workspace.yaml`, `.npmrc`, `package.json`, `turbo.json`) from the proven hand recipe, with sibling-repo member detection (+ include/exclude), an opt-out `pnpm install` step, a `status` subcommand, and never-overwrite-silently protection (`--force` writes `.bak` backups). App registration into a running host is deliberately out of scope for this MVP.
