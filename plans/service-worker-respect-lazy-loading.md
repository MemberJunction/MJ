# MemberJunction Explorer — Service Worker: Respect Lazy Loading

**Status**: 🟡 **Draft — for team review**
**Author**: Claude (review session, May 2026)
**Target**: `@memberjunction/ng-explorer-service-worker` — `ngsw-config.json`
**Last updated**: 2026-05-02
**Builds on**: [`service-worker-app-shell.md`](./service-worker-app-shell.md) (PR #2512, merged)

> **Problem in one line**: PR #2512 ships a service worker that prefetches **every** root-level `.js` file at install time — including all lazy chunks emitted by MJExplorer's lazy-loading system — which silently undoes the bandwidth savings the lazy-loading architecture was built to deliver.
>
> **Proposed fix in one line**: Split the SW asset groups so eager bundles stay prefetched (warm-load win preserved) and lazy chunks become `installMode: lazy` / `updateMode: prefetch` (cached on first use, refreshed eagerly when a new version ships).

---

## TL;DR

The current `ngsw-config.json` uses a single `app-shell` asset group with `/*.js` and `installMode: prefetch`. Because Angular's `application` builder (ESBuild) emits **all** JS — entry, polyfills, vendor splits, **and lazy chunks** — flat at the output root, that one glob sweeps up every chunk. They're all downloaded at SW install and re-downloaded on every update, regardless of whether the user ever navigates into the feature that owns them.

This contradicts the explicit lazy-loading investment in MJExplorer (`LAZY_FEATURE_CONFIG`, subpath exports, `ClassFactory.CreateInstanceAsync`). For a fully-loaded MJ install with ~15 dashboard modules and dozens of resource components, the SW install pulls down megabytes of code the user may never touch.

The proposed change is a small, mechanical edit to one config file: **split** the eager bundles (recognizable by stable Angular naming: `main-*`, `polyfills-*`, root `styles-*`) into the prefetched `app-shell` group, and route lazy chunks (`chunk-*.js`) to a new `lazy-chunks` group with `installMode: lazy` / `updateMode: prefetch`. Both navigation latency on warm load (because cached lazy chunks stay cached) and bandwidth on first install / update (because uncached lazy chunks aren't preemptively fetched) get the right behavior.

The headline risk is **filename-pattern brittleness**: if a future Angular version changes its emitted filename templates (e.g., goes back to numeric chunk names), the globs silently mis-classify. Mitigation: a one-shot CI check that fails the build if an unrecognized JS filename appears at the dist root.

---

## Background

### How the current config behaves

The merged config ([`packages/Angular/Explorer/service-worker/ngsw-config.json`](../packages/Angular/Explorer/service-worker/ngsw-config.json)) is:

```json
{
  "assetGroups": [
    {
      "name": "app-shell",
      "installMode": "prefetch",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/manifest.webmanifest",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "lazy-assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/assets/**",
          "/*.(svg|cur|jpg|jpeg|png|apng|webp|avif|gif|otf|ttf|woff|woff2|ico)"
        ]
      }
    }
  ],
  "navigationUrls": [
    "/**",
    "!/**/graphql",
    "!/**/graphql-ws",
    "!/api/**",
    "!/auth/**",
    "!/**/?msal*",
    "!/**/*__*"
  ]
}
```

`/*.js` in `app-shell` has `installMode: prefetch`, which tells the Angular SW to download **every match** at install time as part of the cache-priming phase.

### Why every lazy chunk is captured by `/*.js`

Angular's `application` builder (powered by ESBuild) emits all chunks as flat, hashed JavaScript files at the **root** of the build output. With `outputHashing: "all"` and `namedChunks: false` (MJExplorer's production defaults), the emitted shape for a typical production build is:

| File family | Shape | What it is |
|---|---|---|
| Entry | `main-<HASH>.js` | Initial bundle including bootstrap manifest and all eager `@RegisterClass` registrations |
| Polyfills | `polyfills-<HASH>.js` | Zone.js + locale polyfills |
| Eager styles | `styles-<HASH>.css` | Compiled global styles |
| Component styles | `<HASH>.css` (small) | Per-component compiled styles emitted as separate files when injected |
| **Shared/vendor splits** | **`chunk-<HASH>.js`** | Code-split shared chunks — most large vendor deps land here |
| **Lazy chunks** | **`chunk-<HASH>.js`** | Each `import('@memberjunction/ng-dashboards/...module')` produces one |
| CSS-imported assets | `media/<HASH>.<ext>` | Fonts and images referenced from `url()` in stylesheets |

**Critical observation**: shared/vendor splits and lazy chunks are **indistinguishable by filename** in the default configuration. Both come out as `chunk-<HASH>.js`. The current `/*.js` glob sweeps them all into `app-shell`, prefetched.

### Why this matters

MJExplorer made an explicit architectural investment in lazy loading (see [`guides/LAZY_LOADING_GUIDE.md`](../guides/LAZY_LOADING_GUIDE.md)):

- Every dashboard package declares **subpath exports** in `package.json` so each feature module becomes a separately-loadable chunk
- `mj codegen manifest --lazy-config` walks the dependency tree and generates `LAZY_FEATURE_CONFIG`, mapping `BaseClassName::Key` compound keys to dynamic `import()` calls
- `ClassFactory.RegisterLazyLoader()` wires those imports to runtime class resolution, so a dashboard's chunk is only fetched when the user navigates into it

The point of all of this is: **don't ship the user code they aren't using yet**. Today's SW config inverts that promise — the user gets every chunk at SW install time, in the background, whether they need it or not.

### Concrete impact

Order-of-magnitude estimates for an MJ install with the standard set of dashboard packages enabled (numbers depend on which packages are installed and bundle-analysis output, not measured here — recommended next step is to run `npx esbuild-bundle-analyzer` against a production build):

| Scenario | Today | After fix |
|---|---|---|
| First-ever visit | Same (SW not yet active) | Same |
| Background prefetch after first install | All chunks (multi-MB) | Eager bundles only |
| Update download payload (any chunk hash change) | All changed chunks regardless of usage | Only eager bundle changes + lazy chunks user actually visited |
| Navigation latency (warm, into a feature visited before) | Instant (cached) | Instant (cached on first use, still cached) |
| Navigation latency (warm, into a feature **never** visited) | Instant (was prefetched) | Network fetch (~normal lazy load, ~100–300ms) |
| Mobile data usage on metered connection | Large background spike | Pay-as-you-go |

**The only behavioral regression is the last row**: a user navigating into a feature they've never opened pays a normal lazy-load cost on first visit. That's *exactly the same cost* they'd pay without the SW at all — i.e., the SW is no longer artificially optimizing a path that lazy loading was specifically designed to defer.

---

## Filename-pattern reference

Empirical confirmation of Angular's emitted naming under the configurations MJExplorer uses (`outputHashing: "all"`, default `namedChunks: false` in production):

- **Entry**: `main-<HASH>.js`
- **Polyfills**: `polyfills-<HASH>.js`
- **Eager root style bundle**: `styles-<HASH>.css`
- **Component-extracted styles**: `<HASH>.css` (no prefix; small per-component sheets when style extraction is on)
- **Lazy / shared chunks**: `chunk-<HASH>.js`
- **CSS-imported media**: `media/<HASH>.<ext>`

Hashes are 8-character uppercase alphanumeric.

> **Verification step before merging the SW config change**: run a clean production build (`cd packages/MJExplorer && npm run build`), `ls dist/MJExplorer/browser/`, and confirm that **every** root-level `.js` file matches one of: `main-*.js`, `polyfills-*.js`, or `chunk-*.js`. If any other shape appears (e.g., a numeric chunk like `123-<HASH>.js` or a named chunk because someone added `namedChunks: true`), add it to the appropriate group before merging.

A regression-safe way to enforce this going forward is described under [Verification](#verification--rollout) below.

---

## Proposed change

### Diff against the current `ngsw-config.json`

```diff
 {
   "$schema": "../../../../node_modules/@angular/service-worker/config/schema.json",
   "index": "/index.html",
   "assetGroups": [
     {
       "name": "app-shell",
       "installMode": "prefetch",
       "updateMode": "prefetch",
       "resources": {
         "files": [
           "/favicon.ico",
           "/index.html",
           "/manifest.webmanifest",
-          "/*.css",
-          "/*.js"
+          "/main-*.js",
+          "/polyfills-*.js",
+          "/styles-*.css"
         ]
       }
     },
+    {
+      "name": "lazy-chunks",
+      "installMode": "lazy",
+      "updateMode": "prefetch",
+      "resources": {
+        "files": [
+          "/chunk-*.js"
+        ]
+      }
+    },
     {
       "name": "lazy-assets",
       "installMode": "lazy",
       "updateMode": "prefetch",
       "resources": {
         "files": [
           "/assets/**",
+          "/media/**",
           "/*.(svg|cur|jpg|jpeg|png|apng|webp|avif|gif|otf|ttf|woff|woff2|ico)"
         ]
       }
     }
   ],
   "navigationUrls": [
     "/**",
     "!/**/graphql",
     "!/**/graphql-ws",
     "!/api/**",
     "!/auth/**",
     "!/**/?msal*",
     "!/**/*__*"
   ]
 }
```

### What each change does

| Change | Behavior |
|---|---|
| `app-shell` narrowed to `/main-*.js`, `/polyfills-*.js`, `/styles-*.css` | Only the bundles required for the initial paint are prefetched at SW install. This is the entire warm-load critical path. |
| New `lazy-chunks` group with `/chunk-*.js`, `installMode: lazy`, `updateMode: prefetch` | Chunks are cached when the user navigates into the feature that needs them (preserving lazy-loading semantics). Once cached, they stay cached and refresh in the background when a new version ships, so subsequent navigation into a previously-visited feature stays instant. |
| `lazy-assets` gains `/media/**` | Picks up CSS-imported fonts and images that Angular emits to `dist/MJExplorer/browser/media/` — currently uncached entirely. Lazy-loaded with prefetch-on-update, same rationale as `lazy-chunks`. |
| Component-extracted root `<HASH>.css` files (no prefix) — **not currently caught** | These are not prefetched even today (the existing `/*.css` happens to match them, but small ones are typically inlined and large ones are imported by the chunks that need them, so they tend to load alongside the chunk). After the change, they're not in any group either. **Open question**: does Angular emit any of these as separately-fetched root-level CSS files in the MJExplorer prod build? If yes, we need a fourth pattern (`/<8-char-hex>.css` or similar). The verification build should reveal this. |

### Two non-changes I considered and rejected

1. **Don't add `/runtime-*.js`**: ESBuild's application builder doesn't emit a separate runtime/manifest chunk the way Webpack did. Anything Webpack-era runtime-equivalent is folded into `main-*.js`. If a future Angular release re-introduces one, the verification CI gate (below) will catch it.
2. **Don't switch `lazy-chunks` to `updateMode: lazy`**: that would also defer the *update* fetch to next-use, which means the user could end up running the cached old version of `main` against the new version of a freshly-fetched lazy chunk on first navigation. `updateMode: prefetch` keeps eager-update-on-version-change semantics, which is the correctness-safe choice. The bandwidth tradeoff is: a chunk hash change does re-download in the background, but only for chunks the user has actually visited, which is the small subset that matters.

---

## Trade-offs

### What we gain

- **Honest lazy loading at the SW layer** — the architecture of subpath exports and `LAZY_FEATURE_CONFIG` finally has the runtime behavior it was designed for.
- **Lighter SW install** — first-ever SW install only fetches the eager bundles, same network shape as today's no-SW behavior. Subsequent prefetch happens off the critical path *only* for what's been visited.
- **Lighter update payload** — when a new MJ version ships and most chunk hashes change, the SW only re-fetches eager bundles + lazy chunks the user has actually used. For a user who lives in two dashboards, that's potentially 5–10× less bandwidth on update.
- **Mobile/metered-connection friendliness** — meaningful for any offsite or field admin scenarios.
- **Operational telemetry alignment** — measured "SW install time" and "update download time" become representative of what users actually consume, instead of an upper bound.

### What we lose

- **Cold first-visit-into-a-never-used-feature is a network fetch.** This is identical to no-SW behavior, but in the current shipping config it would have been instant (because everything was prefetched). Some users might perceive a regression on first navigation into a new feature after a SW update. Mitigation: this matches normal lazy-loading expectations and is the intended UX of the lazy-loading system — calling out for transparency, not a real concern.
- **Slightly more complex config** — three asset groups instead of two. Marginal cost.
- **Filename-pattern coupling** — the globs depend on Angular's output naming. Addressed below.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Future Angular release changes chunk filename pattern (e.g., `chunk-*` → numeric or per-name) | Medium (Angular has shipped this option as `namedChunks` and there's an open issue for `chunkNames` customization — pattern *could* change) | High — uncategorized chunks fall through and don't get cached at all, breaking warm-load perf silently | CI gate: build production, list root `.js` files, fail if any name doesn't match `main-*.js`, `polyfills-*.js`, or `chunk-*.js`. (Implementation sketch in [Verification](#verification--rollout).) |
| Someone adds `namedChunks: true` to production config | Low (production config in `angular.json` is rarely edited) | Same as above (named chunks no longer match `chunk-*`) | Same CI gate catches it. |
| New asset-emitting build feature lands (e.g., Web Workers as separate `worker-*.js`) | Low | Worker chunk uncached → fetched per session | Same CI gate flags it; we add a pattern. |
| Component-extracted CSS files (small `<HASH>.css` at root) become uncached | Unknown until verified | Likely small (Angular inlines critical CSS, extracts only large component sheets) | Verification build reveals the actual file shape; if present, add a glob. |
| `lazy-chunks` cache grows unbounded over a user's lifetime | Low | Browser quota; eventually evicted by OS, not a correctness issue | Default Angular SW eviction policies handle this. Worth a note in the runbook. |

The first risk is the only one that needs an active mitigation. The CI gate is cheap and we should add it as part of this work.

---

## Verification & rollout

### Pre-merge verification

1. **Clean production build**: `cd packages/MJExplorer && rm -rf dist && npm run build`.
2. **Inspect `dist/MJExplorer/browser/`**:
   ```bash
   ls dist/MJExplorer/browser/*.js | sort
   ls dist/MJExplorer/browser/*.css | sort
   ls dist/MJExplorer/browser/media 2>/dev/null | wc -l
   ```
3. **Confirm**: every `.js` matches `main-*.js`, `polyfills-*.js`, or `chunk-*.js`. Every CSS at the root matches `styles-*.css` or fits the component-extracted `<HASH>.css` pattern.
4. **Compare bundle sizes**: note total bytes of `main-*.js + polyfills-*.js` (the new app-shell footprint) vs. total bytes of all `.js` files (the current app-shell footprint). The delta is the install-time bandwidth savings.

### Build-time CI gate (recommended)

Add a small post-build check in `packages/MJExplorer/scripts/verify-sw-cache-shape.js` that runs after every production build (e.g., as a `postbuild` script):

```js
// Sketch — actual implementation should include sensible error messages
const fs = require('fs');
const path = require('path');

const ALLOWED_JS = /^(main|polyfills|chunk)-[A-Z0-9]{8,}\.js$/;
const ALLOWED_CSS_ROOT = /^(styles-[A-Z0-9]{8,}\.css|[a-f0-9]{8,}\.css)$/;

const dir = path.resolve(__dirname, '../dist/MJExplorer/browser');
const offenders = fs
    .readdirSync(dir)
    .filter(f => /\.(js|css)$/.test(f))
    .filter(f => !ALLOWED_JS.test(f) && !ALLOWED_CSS_ROOT.test(f));

if (offenders.length > 0) {
    console.error('SW cache-shape verification failed. Unrecognized root-level files:');
    offenders.forEach(f => console.error('  ' + f));
    console.error('\nUpdate ngsw-config.json globs in @memberjunction/ng-explorer-service-worker.');
    process.exit(1);
}
```

This single gate catches every variant of risk in the table above before a bad SW config ships.

### Local SW behavior verification

After applying the config change, redo PR #2512's verification matrix at minimum:

- ✅ SW registers, activates, no console errors
- ✅ Application → Cache Storage in DevTools shows three caches (`app-shell`, `lazy-chunks`, `lazy-assets`)
- ✅ On first load, `app-shell` is fully populated; `lazy-chunks` is empty
- ✅ Navigate into a dashboard → its `chunk-*.js` becomes cached in `lazy-chunks`
- ✅ Reload → that dashboard's chunk is served from cache (Network tab shows `(ServiceWorker)` source)
- ✅ Trigger a fake "update" (rebuild and refresh) → `app-shell` re-prefetches; previously-cached lazy chunks re-download in background; never-visited lazy chunks stay uncached
- ✅ Existing kill switch (`enableServiceWorker: false`) works identically

### Production rollout

This is a config-only change inside `@memberjunction/ng-explorer-service-worker`. No consumer changes required (the package version bump alone is sufficient). Recommended sequencing:

1. Merge the change into `next` along with verification CI gate.
2. Cut a patch release of `@memberjunction/ng-explorer-service-worker`.
3. Bump the dep in `@memberjunction/ng-explorer-app` and re-publish.
4. MJExplorer picks it up via normal dependency update.
5. Watch for telemetry / support-ticket signals around stuck-cache or unexpected-fetch reports during the next few release cycles.

The kill switch (`enableServiceWorker: false`) remains the recovery path for any unexpected behavior — same blast radius as PR #2512.

---

## Implementation steps

In order, and small enough to keep the diff reviewable:

1. **Verification build** in a clean checkout of `next`. Capture actual `dist/MJExplorer/browser/` listing in this PR's notes for the team.
2. **Edit `ngsw-config.json`** with the diff above. No other files in the SW package change.
3. **Add CI gate** at `packages/MJExplorer/scripts/verify-sw-cache-shape.js` and wire it into MJExplorer's `postbuild` step. Single-file change, ~30 lines.
4. **Update unit tests** in `packages/Angular/Explorer/service-worker/src/__tests__/`. The 11 existing tests don't test the config file shape, but if any of them assert against the cache topology, refresh assertions. Likely no test changes needed.
5. **Update the package README** to document the three-group topology and the filename-pattern coupling.
6. **Update `service-worker-app-shell.md`** with a "Phase 2" section linking to this plan and noting the change as a refinement.
7. **Update `guides/CACHING_AND_PUBSUB_GUIDE.md`** if there's relevant guidance about the SW's interaction with the GraphQL/IDB cache (probably one paragraph).
8. **Cut a changeset** for `@memberjunction/ng-explorer-service-worker` (patch).
9. **Manual SW behavior verification** matrix per [Verification](#verification--rollout).
10. **Open PR**, get team review, merge to `next`.

Total estimated work: half a day, including verification.

---

## Open questions for team review

1. **Component-extracted CSS files**: does the production build actually emit any small `<HASH>.css` files at the dist root? The verification build will tell us. If yes, do we want them in `app-shell` (eager) or `lazy-assets` (on-demand)? Recommendation: `lazy-assets`, because by definition Angular only extracts them when they're not on the critical path.

2. **Should we strengthen `lazy-chunks` updateMode to `lazy` for very large chunks**? Tradeoff is correctness (could you serve old `main` against new `chunk-A` and crash?) vs. update-bandwidth efficiency. **Recommendation**: keep `prefetch`. Angular SW guarantees consistency by versioning the entire manifest atomically — but only as long as all related assets are fetched and cached before activation. `prefetch` is the safe default; `lazy` introduces subtle staleness windows.

3. **Should we precompute and ship a "hot path" hint?** Some SW frameworks let you declare "these specific lazy chunks are hot — prefetch them anyway" (e.g., the home dashboard). Angular SW doesn't natively support this, but we could put `home-dashboard-*.js` in `app-shell` if we used `namedChunks: true` for that one feature. **Recommendation**: skip for now. It complicates the build and the perceived-perf benefit on home is already covered by `main-*.js` being prefetched.

4. **What about MJExplorer's `serve` configuration**? Dev builds use `namedChunks: true`, which will produce names like `core-dashboards.module-<HASH>.js`. The SW only runs in production builds (`production` config in `angular.json`), so dev builds don't hit this codepath. No change needed, but worth confirming during verification.

5. **Are the existing `navigationUrls` exclusions correct?** Out of scope for this plan, but worth a follow-up:
    - `!/**/?msal*` — the `?` glob char matches any single path character, not a query-string delimiter. MSAL redirect URLs typically have `?code=...` query strings, but `navigationUrls` is matched against pathname only. This pattern likely never fires. Action: verify with a real MSAL login flow.
    - `!/**/*__*` — what's the intent here? MJ's `__mj_` columns? `__webpack_hmr__`? Worth a comment in the file or an explicit owner-known reason.

---

## References

- Original SW plan: [`plans/service-worker-app-shell.md`](./service-worker-app-shell.md)
- PR #2512: <https://github.com/MemberJunction/MJ/pull/2512>
- Lazy loading guide: [`guides/LAZY_LOADING_GUIDE.md`](../guides/LAZY_LOADING_GUIDE.md)
- Angular SW config schema: <https://angular.dev/ecosystem/service-workers/config>
- Angular `application` builder: <https://angular.dev/cli/build>
- Class registration manifest design: [`packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md`](../packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md)
