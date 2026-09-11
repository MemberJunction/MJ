# Repo-wide source scanners

Suites here assert about the **whole `packages/` tree**, not about one package. They run as a
plain step in the `Source guards` job of `.github/workflows/test.yml`:

```bash
npx vitest run --config .github/guards/vitest.config.mts
```

## Why they cannot live in a package

Turbo hashes `<pkg>#test` from **that package's own files only** — `test.inputs` in
`turbo.json` are globs resolved relative to the package directory — plus `globalDependencies`,
the root lockfile, and the hashes of the tasks it `dependsOn`. A suite that scans the repo
therefore has a cache key that **cannot contain the code it asserts about**. Turbo replays the
recorded stdout on a hit, so the stale run prints the same `✓` a real one would; the only
difference in the log is one line, `cache hit, replaying logs <hash>`.

That is issue #4369. `UUIDCompliance` and `MultiProviderCompliance` lived in
`packages/MJGlobal/src/__tests__`, and MJGlobal is the **root of the dependency graph** — its
only dependencies are acorn, lodash, rxjs and uuid — so no upstream task hash widened the key
either. The one package whose tests scanned all ~300 packages was the one package guaranteed to
have none of them in its cache key.

Both CI lanes then pointed away from it:

- **PR lane** — `--filter=...[origin/next]` selects changed packages **and their dependents**.
  MetadataSync *depends on* MJGlobal, so MJGlobal is upstream and never selected. The scanner
  that would flag the change was structurally excluded from the run that introduced it.
- **Backstop lane** — push to `next` and the nightly run everything, so the scanner *was* in
  scope, but it hit the cache. The lane that exists to catch what filtering misses was
  neutralized for exactly this class of test.

Nine real MetadataSync violations sat behind a replayed green for two days, until the first PR
that happened to touch MJGlobal itself busted the hash and went red for code it did not touch.

This directory is **not an npm workspace**, so it cannot join the turbo test graph at all —
which is precisely the property these scanners need.

## Adding a scanner

Name it `<thing>.guard.test.ts` and put it here. It runs uncached on every PR, needs no build,
and reports independently of the build and the test shards.

`.github/scripts/check-scanner-placement.mjs` fails the build if a new one is written as a
package test instead.

## The other case: a package test that reads a shared fixture

A suite that legitimately belongs to its package but reads a tree outside it — repo-root
`metadata/`, `migrations/`, `templates/` — stays put. Widen its cache key instead, with a
package-specific task entry in `turbo.json`:

```jsonc
"@memberjunction/sql-converter#test": {
  "dependsOn": ["build"],
  "outputs": ["coverage/**"],
  "inputs": [
    "src/**/*.ts", "src/**/*.tsx", "src/**/__tests__/**",
    "vitest.config.*", "tsconfig.json", "tsconfig.spec.json",
    "$TURBO_ROOT$/migrations/v5/**",
    "$TURBO_ROOT$/migrations-pg/v5/**"
  ],
  "cache": true
}
```

Two things to know:

- A package-specific entry **replaces** the generic `test` entry rather than merging with it,
  so it must repeat `dependsOn`, `outputs`, `cache` and the package-local globs verbatim.
- Keep these scoped per package. Putting those trees in the generic `test.inputs` — or in
  `globalDependencies` — would bust **every** package's test cache on any migration edit.

`turbo.json` is kept as strict JSON (two in-repo guards `JSON.parse` it), which is why that
rationale lives here rather than beside the entries.

Six packages currently need this: `ai-engine-base`, `computer-use`, `codegen-lib`, `cli`,
`sql-converter`, `integration-test-suite`.

Where a test binds a repo-root constant and joins subpaths later, the guard cannot resolve the
real read statically. Those carry an inline annotation naming the covering entry:

```ts
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..'); // scanner-placement-ok: reads templates/claude-pack, declared on @memberjunction/cli#test in turbo.json
```
