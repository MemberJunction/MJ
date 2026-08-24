# @memberjunction/cli-core

## 6.1.0-edge.3

### Patch Changes

- 64bc5dc: New `mj dev workspace` command set: generates the four parent files of the multi-repo Open App dev workspace (`pnpm-workspace.yaml`, `.npmrc`, `package.json`, `turbo.json`) reproducing the manual setup it replaces, with sibling-repo member detection (+ include/exclude), an opt-out `pnpm install` step, a `status` subcommand, and never-overwrite-silently protection (`--force` writes `.bak` backups). App registration into a running host is deliberately out of scope for this MVP.

  Generation also writes a `.mj-dev-workspace.json` sentinel manifest at the parent — the `generatedBy` marker, the files written, and the member repo names, with no timestamp so regenerating an unchanged workspace is byte-identical. `mj dev workspace clean` uses it as proof of ownership: it removes exactly the workspace residue (the four files, the sentinel, `pnpm-lock.yaml`, `node_modules`) and refuses to touch a parent whose sentinel is missing or not ours unless given `--force`, so a hand-made workspace can't be torn down by accident. `--dry-run` lists what would go without deleting, `.bak` backups are always kept, absent paths are reported as already gone rather than failing, and `status` now reports whether a sentinel is present.

  All three commands bind `--dir` to the `MJ_DEV_WORKSPACE_DIR` environment variable, so a shell that exports it once can drive generate/status/clean without repeating the path; an explicit `--dir` still wins, and `status` reports which of flag, environment, or default supplied the directory it used.

  `mj dev usage` joins the progressive-disclosure surface: `dev` now appears in `mj usage`, and the tier-2 command documents each dev command's flags, examples, and runtime expectations — including the rules an agent would otherwise have to guess (the parent must be a plain directory rather than a git repo root, how members are detected, what the sentinel gates, and that a shell declares its own auth-SDK peers). Because the dev commands are plain oclif commands that must stay bootstrap-free rather than `BaseCLIPlugin` plugins, `@memberjunction/cli-core` gains `CLIPluginRegistry.RegisterUsage()` so a command shipping inside the CLI can declare usage without being plugin-backed; plugin-declared usage still wins on a key collision.

  The generated `.npmrc` carries no `public-hoist-pattern[]` block. The 78-entry hoist set the manual setup carried was written for the npm-hoisted era; an attribution audit of all 78 entries against the monorepo found none that still needs hoisting — every package an MJ library imports is declared by that library, and every third-party peer relationship in the set is satisfied by a real declaration, because pnpm's strict layout forced those fixes during the pnpm conversion. The only residue is the auth SDK family, which MJ correctly exposes as `peerDependencies` of `@memberjunction/ng-auth-services` because the choice of provider belongs to the shell; the command now prints that as guidance instead of hoisting the whole family.

- Updated dependencies [834f8d7]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0

## 5.42.0

### Patch Changes

- 34152e1: Pluggable mj CLI with AI agent and automation friendly output: new cli-core package (BaseCLIPlugin + runtime host), json formatting for machine readable output and two tier progressive disclosure. with per-command runtime/timeout hints, and a fix for sync/push/pull hanging on DB-pool teardown after emitting results
- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
