---
"@memberjunction/cli": patch
---

New `mj dev workspace` command set: generates the four parent files of the multi-repo Open App dev workspace (`pnpm-workspace.yaml`, `.npmrc`, `package.json`, `turbo.json`) from the proven hand recipe, with sibling-repo member detection (+ include/exclude), an opt-out `pnpm install` step, a `status` subcommand, and never-overwrite-silently protection (`--force` writes `.bak` backups). App registration into a running host is deliberately out of scope for this MVP.

The generated `.npmrc` carries no `public-hoist-pattern[]` block. The hand recipe's 78-entry hoist set was written for the npm-hoisted era; an attribution audit of all 78 entries against the monorepo found none that still needs hoisting — every package an MJ library imports is declared by that library, and every third-party peer relationship in the set is satisfied by a real declaration, because pnpm's strict layout forced those fixes during the pnpm conversion. The only residue is the auth SDK family, which MJ correctly exposes as `peerDependencies` of `@memberjunction/ng-auth-services` because the choice of provider belongs to the shell; the command now prints that as guidance instead of hoisting the whole family.
