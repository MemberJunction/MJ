---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

fix(open-app): detect the workspace layout and write config to every file a consumer loads (#3270, #3271)

`mj app install` could complete — or report success — while leaving an app that never actually loads. Two causes, both in the install's `[Packages]` / `[Config]` steps.

**#3270 — workspace layout.** The installer defaulted to the monorepo paths (`packages/MJAPI`, `packages/MJExplorer`), but `mj install` scaffolds a distribution under `apps/`. Installing onto a host created by MJ's own installer failed with `Could not read package.json at <root>/packages/MJAPI/package.json: ENOENT`, and it failed *after* schema creation and migrations had committed, leaving the app recorded with `Status='Error'`. Both paths are now probed (`packages/…`, then `apps/…`) via a shared `workspace-paths` module, so a plain `mj app install` works on either layout with no configuration; an explicit `openApps.serverPackagePath` / `clientPackagePath` still wins.

**#3271 — config write target.** Config edits went to a single file: the server workspace's `mj.config.cjs` when present, else the repo root. But the `dynamicPackages.client` array is consumed by `mj codegen manifest --open-app-client-bootstrap`, which resolves config from the *client* workspace and so never sees a server-workspace config; and a container / App Service deployment that ships only the root config never sees the `server` entry. Either way the miss is silent: the client bootstrap reports `0 client packages wired` so the app's `@RegisterClass` decorators never fire, and a deployed API loads no server package at all — its GraphQL schema lacks every one of the app's types while `__mj.OpenApp` still reports the app `Active`. All config writes (`dynamicPackages`, `entityPackageName`, `excludeSchemas`) now target **every** `mj.config.cjs` a consumer may load. Entry insertion is idempotent, so a config that already has the entry is unchanged.

A file that genuinely cannot be edited — most commonly the distribution's `module.exports = require('../../mj.config.cjs')` re-export, which has no object literal to insert into — is now reported as a warning instead of failing the install, since it re-exports the root config that *did* get written. The install fails only when no config could be updated. `ConfigOperationResult` gains an optional `Warnings` field and the orchestrator surfaces them via `OnWarn`.
