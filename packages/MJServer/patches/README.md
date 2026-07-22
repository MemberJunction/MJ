# MJServer dependency patches (`patch-package`)

Patches in this directory are applied automatically after `npm install` via the
`postinstall` script (`patch-package`) in `packages/MJServer/package.json`, plus a
root-level delegation (`postinstall` in the repo root `package.json`) so it runs on a
top-level `npm install` regardless of npm's workspace-lifecycle behavior.

## `type-graphql+2.0.0-beta.3.patch` — O(N²) → O(N) schema-build scaling

### What it fixes
`buildSchemaSync` (called once at MJAPI boot in `src/index.ts`) is **super-linear in
entity count**. Two O(N²) hotspots inside type-graphql dominate at scale:

1. **`schema/schema-generator.js`** — the per-field config thunk recomputed a
   loop-invariant (`getMetadataStorage().fieldResolvers.filter(...)` + a `.find()` scan)
   once per field × per object type. Replaced with a lazily-built, memoized index on the
   generator instance (`Set` of applicable resolvers + `Map<target, Map<method, meta>>`),
   so the per-field step is an O(1) `Map` lookup.
2. **`metadata/metadata-storage.js`** — `buildClassMetadata` / `buildResolversMetadata` /
   `buildFieldResolverMetadata` / `findFieldRoles` each did
   `this.<array>.filter(x => x.target === … && x.name === …)` **per field and per def**
   over the global `fields` / `params` / `middlewares` / `fieldDirectives` /
   `authorizedFields` arrays. A one-time `_mjBuildIndexes()` (called in `build()`) pre-groups
   each into `target → (name → list)` maps; the hot filters become O(1) lookups.

Both `build/esm/**` and `build/cjs/**` are patched (MJAPI's ESM loader uses the `esm`
build; `cjs` is patched for parity/safety).

### Measured effect (1,380-entity scale environment)

| | `buildSchemaSync` | schema phase | total cold boot |
|---|---:|---:|---:|
| stock type-graphql | 66,261 ms | 23.3 s | 95.6 s |
| **patched** | **1,230 ms** | **2.9 s** | **32.1 s** |

→ **54× faster `buildSchemaSync` (−98.1%)**, total boot **−66%**. The win grows at higher
entity counts (the removed cost is super-linear). It is a **one-time boot cost** — per-request
serving latency is unaffected.

### Why it's safe
Both changes are pure `filter`/`find` → hash-index memoization that preserve output exactly:
grouping keys equal the original filter join-keys, and list/first-match order is preserved.
Verified live on the patched server (introspection off, so via real queries): `AllMJUsers`
returns real non-null rows; `MJUser` correctly reports its required `ID: String!` argument
(field-argument metadata intact). **Worst-case failure mode is inert** — if the patch does not
apply, MJAPI runs stock type-graphql (slower boot), never incorrect behavior.

### Re-verifying / regenerating
- The patch is validated to apply cleanly against a pristine `type-graphql@2.0.0-beta.3`
  (`npm pack type-graphql@2.0.0-beta.3` → `git apply --check`).
- To profile boot after a change, set `MJ_SCHEMA_PROFILE=1` (emits a `[SCHEMA-PROFILE] …`
  line with per-sub-step ms + metadata cardinality) or `MJ_SCHEMA_CPUPROF=1` (writes a
  `.cpuprofile` of just `buildSchemaSync`). Both are no-ops when unset — see `src/index.ts`.

### Upstream
This is a generic type-graphql scaling bug (not MJ-specific). An upstream PR to
`MichalLytek/type-graphql` accompanies this patch; once merged and released, this patch can
be dropped in favor of the version bump.
