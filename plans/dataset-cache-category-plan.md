# The dataset cache category: what was wrong, what changed, and what the numbers were

Companion to `plans/dataset-cache-category-jumpstart.md` (the brief). This is the record: the
decision taken, the one rejected, what the evidence actually showed, and the test counts.

---

## 1. The defect, confirmed

Six functions on `ProviderBase` touch the dataset cache. Before this branch, exactly one named a
category:

| Function | Category before | Category now |
|---|---|---|
| `GetAndCacheDatasetByName` — the warm read | `'DatasetCache'` | `DatasetCacheCategory` |
| `CacheDataset` — the write | none → `default` | `DatasetCacheCategory` |
| `GetCachedDataset` | none → `default` | `DatasetCacheCategory` |
| `GetLocalDatasetTimestamp` | none → `default` | `DatasetCacheCategory` |
| `IsDatasetCached` | none → `default` | `DatasetCacheCategory` |
| `ClearDatasetCache` | none → `default` | `DatasetCacheCategory` |

Every storage provider isolates by category — Redis `{prefix}:{category}:{key}`, browser
localStorage `[mj]:[category]:[key]`, IndexedDB a dedicated object store per category, the in-memory
providers a nested `Map<category, Map<key, value>>` — so the warm read looked in a namespace nothing
ever wrote to and missed on every transport, browsers included.

**The cause is sharper than "a category was added to one call."** Verified with
`git log -L` on the call site: before `987a126aab` (2026-05-02, *"perf(cache): batched IDB reads via
GetItems<T> + dataset double-read fix"*), the warm path *delegated* to `IsDatasetCached` →
`IsDatasetCacheUpToDate` → `GetCachedDataset`, all three category-less, so it was self-consistent.
That commit inlined the read into a single batched `GetItems` and gave only that copy a category. The
fallback is correct — a miss refetches and rewrites — so five months of this was slow, never wrong,
and nothing failed.

### Two things the brief did not have, found while verifying it

1. **The IndexedDB provider already declares a dedicated `mj:DatasetCache` object store**, in both
   `KNOWN_OBJECT_STORES` and the `MJMetadataDB` schema interface. It is versioned, it is wiped and
   recreated on schema bumps, and nothing had ever written a byte to it. That decided §3 — see below.

2. **Three of the brief's definition-of-done items referenced code that is not on `origin/next`.**
   `mj cache clear` (`packages/MJCLI/src/commands/cache/`), `SharedCacheClear.ts` /
   `removeMetadataSnapshot`, and `SHARED_CACHE_WRITE_CATEGORIES` exist only on the unmerged
   `engine-cache-architecture` branch (PR #4956). On `origin/next` there is no `mj cache clear`
   command at all. This branch was therefore fast-forwarded onto `engine-cache-architecture` (a clean
   fast-forward: it had zero unique commits) so those items are reachable. **Consequence: this branch
   cannot merge until #4956 does.**

### A third, which changed the shape of the fix

`IT07`'s existing checks **cannot detect this defect or its repair.** DS1's warm assertion is
`warm.Results.length === cold.Results.length`, which holds whether the warm call was served from
cache or silently refetched from the server. DS2 and DS3 assert cache *state*, not *serving*. The
bundle's own header comment even documented `CacheDataset → SetItem with no category` as a known
fact. That blind spot is why five months passed. DS4 (below) closes it.

---

## 2. The decision: everything uses `DatasetCache` (direction (a))

**Chosen.** `ProviderBase.DatasetCacheCategory` is declared once and used by all six call sites.

Reasons, in the order they carried weight:

- **A declared, versioned IndexedDB object store existed for exactly this purpose and was dead.**
  Direction (b) would have left it permanently unused while multi-MB dataset blobs continued to sit
  in `mj:default` beside the metadata snapshot.
- **It makes `ClearCategory('DatasetCache')` a real operation**, which is what
  `mj cache clear --category DatasetCache` calls. That command reported a successful clear of 0 keys
  before; it now reports and removes what is there.
- **It does not change expiry.** The Redis provider resolves a write's TTL as
  `explicit ?? categoryTTL[category] ?? default`, and `CacheDataset` already passes explicit TTLs
  (`DatasetCacheTTLSeconds = 3600`, `DatasetDateCacheTTLSeconds = 3300`). Moving the category leaves
  both lifetimes and their deliberate ordering — the proxy expiring before the blob it vouches for —
  exactly as #4956 set them. Only the *rationale* in the doc comment needed rewriting, since it
  justified the explicit TTL by datasets sharing `default` with never-expiring proxy keys.
- **Legacy keys clean themselves up.** `removeMetadataSnapshot` scans `default` for keys containing
  `___MJCore_Metadata`, and dataset keys contain that marker because `GetDatasetCacheKey` builds on
  the same root. Dataset keys an older build left in `default` are therefore still swept by a full
  `mj cache clear`. No migration step, no orphan-cleanup script. The scan is deliberately **not**
  narrowed to the snapshot's own suffixes, and now says so in a comment.

**Rejected: direction (b), the warm read uses `default` like the other five.** It is a one-word
change with no key migration and no orphans, and the CLI clear would keep working exactly as it does.
It was rejected because it entrenches the dead IDB store, keeps multi-MB blobs in the category that
holds the metadata snapshot's proxy keys (the growth problem #4956 had to bound with a TTL), and
gives up the ability to clear datasets independently of everything else — which would then have
forced `DatasetCache` to be deleted from `SHARED_CACHE_WRITE_CATEGORIES` or documented as reserved,
making the CLI's own category list a lie in the other direction.

---

## 3. The freshness comparison, and a latent crash the fix would have exposed

Fixing the category **switches on a comparison that had not executed since May**, so its bugs had been
masked. One was live:

`GetAndCacheDatasetByName` and `IsDatasetCacheUpToDate` each carried their own copy of the row-count
comparison, and they had drifted. `IsDatasetCacheUpToDate` guarded the blob
(`localDataset?.Results?.find`, the plan §24 fix); the warm path did not
(`cachedDataset.Results.find`). A cached blob without `Results` therefore **threw**
`TypeError: Cannot read properties of undefined (reading 'find')` out of `GetAndCacheDatasetByName` —
and that call sits on the metadata bootstrap path, where a throw replaces a server refetch with a
failure to load metadata. Unreachable while the category was broken; reachable the moment it was
fixed.

Both now call one `protected DatasetRowCountsMatch(cachedDataset, status)`. Two behaviours are
load-bearing and are pinned by tests:

- **No counts to compare** → `true`. A status with no `EntityUpdateDates` never touches the blob and
  is judged on its timestamp alone. Returning `false` here looks strictly safer and is not: it makes
  such a dataset permanently stale, reloading on every check (plan §24.1 — the `dataset-cache.DS2`
  regression).
- **A count to compare but no blob** → `false`, refetch. The blob and its `_date` proxy expire
  independently and a clear removes them in order, so the date can outlive the blob (plan §16.3 #3).
  A blob present but missing `Results` now answers `false` for the same reason instead of throwing.

### One public signature widened

`CacheDataset`'s `itemFilters` was declared required while every sibling declares it optional and the
implementation explicitly handles a falsy value (`ConvertItemFiltersToUniqueKey` tests `if
(itemFilters)`); `ProviderBase` itself passes `null` internally. It is now
`DatasetItemFilterType[] | undefined` on `ProviderBase`, `Metadata` and `IMetadataProvider`. Purely
widening — every existing caller still compiles — and it removes the need for a cast in DS4.

---

## 4. Tests

### Verified against the un-fixed code

Each regression pin below was watched to fail with the fix reverted, and the message kept. The revert
was applied in two separate passes so each failure is attributable: **Revert A** restored the
pre-fix category state (only the warm read names a category, the unified helper kept); **Revert B**
restored the warm path's own unguarded copy of the comparison, with the category fix kept.

| Test | Revert | Failure message |
|---|---|---|
| `serves the second call from cache instead of going back to the server` | A | `expected 2 to be 1` |
| `writes the blob and its _date proxy into the DatasetCache category, not default` | A | `expected [] to have a length of 2 but got +0` |
| `ClearCategory(DatasetCache) actually removes a cached dataset` | A | `expected true to be false` |
| `refetches rather than throwing when a cached blob has no Results` | B | `TypeError: Cannot read properties of undefined (reading 'find')` |
| `serves B from A's cache rather than going to the database` (cross-server) | A | `expected 1 to be +0` |
| `ClearSharedCacheCategories(DatasetCache) finds the keys and actually removes them` | A | `expected 0 to be greater than or equal to 2` |
| `keeps the dataset keys under the DatasetCache category in the shared keyspace` | A | `expected [] to have a length of 2 but got +0` |
| `dataset-cache.DS4` (integration tier, live server) | A | `the warm fetch must be SERVED from the dataset cache … expected "ds4-served-from-cache-1790889467034", got ""` |

The `ClearSharedCacheCategories` message is the brief's second symptom reproduced exactly: the CLI's
clear path finding **0** keys in `DatasetCache` while the dataset sat untouched in `default`.

**The DS4 run is the most complete piece of evidence on the branch.** Against the reverted code, on a
real MJAPI against a real database and Redis, `DS1`, `DS2` and `DS3` all **passed** while `DS4`
failed. That is the blind spot and the defect demonstrated in one run: the three existing checks could
not see a five-month-dead warm path, and the new one can.

Under Revert A one further case failed — `reports not-up-to-date when a count must be compared but
the blob is gone`. It is **not** counted as a pin: the assertion that broke was its precondition
(`IsDatasetCached`, reading a different category than the test's setup wrote), not the behaviour under
test. It is an invariant pin.

**Honest labels for the rest.** These cannot be made to fail by reverting and are invariant pins, not
regression pins — they exist to stop a future change from quietly altering the behaviour:

- `judges a dataset with no per-entity counts on its timestamp alone` (plan §24.1)
- `reports not-up-to-date when a count must be compared but the blob is gone` (plan §16.3 #3)
- `every reader sees what CacheDataset wrote` — the four readers agreed with each other before the
  fix; only the warm path dissented, so this passes either way
- the three `BrowserIndexedDBStorageProvider — the DatasetCache category` cases: the provider was
  always correct, it was its caller that disagreed
- the three cross-server cases that hold under both (`lets server B read the dataset server A
  cached`, and the two stale-serve cases — under the revert server A refetches on every call, so it
  cannot serve anything stale)

### New coverage

- `packages/MJCore/src/__tests__/providerBase.datasetCacheCategory.test.ts` — 14 cases: category
  routing, the clear, filter keying, and the freshness matrix (no counts, absent blob, malformed
  blob, pure delete, newer timestamp, unknown entity, no status).
- `packages/RedisProvider/src/__tests__/integration-dataset-cache-cross-server.test.ts` — 6 cases,
  two `ProviderBase` servers with separate Redis connections over one keyspace and one shared mock
  database. Gated on `REDIS_URL` like its sibling two-server test.
- `packages/GraphQLDataProvider/src/__tests__/storage-providers.test.ts` — 3 added cases pinning the
  batched blob + `_date` round trip through `mj:DatasetCache` on the browser transport.
- `dataset-cache.DS4` — the integration check that distinguishes *served* from *refetched*, by
  writing a sentinel into the cached blob's `Status` and requiring the warm call to return it. The
  sentinel leaves every per-entity row count untouched, so freshness still holds and the check proves
  serving rather than invalidation; the cache is cleared in a `finally` so no sentinel survives.

### Updated for the change

`providerBase.expiredSnapshotClaim.test.ts` asserted dataset keys land in `'default'` and evicted the
blob with a category-less `Remove`. Both now name the dataset category — without the second, the
`Remove` would delete nothing and the blob would survive, which is the condition those cases
simulate. This was real drift caused by this change, found by running the full package suite rather
than only the new file.

### Counts

| Suite | Result |
|---|---|
| `packages/MJCore` | **2947 passed / 0 failed / 0 skipped** (206 files) |
| `packages/RedisProvider` (with `REDIS_URL`) | **126 passed / 0 failed / 0 skipped** (4 files) |
| `packages/RedisProvider` (without) | 99 passed / 0 failed / 21 skipped — the integration files gate on `REDIS_URL` |
| `packages/GraphQLDataProvider` | **520 passed / 0 failed / 0 skipped** (26 files) |
| `packages/MJCLI` | **913 passed / 0 failed / 0 skipped** (49 files) |
| `npm run check:naming` | **0 errors** (11 897 pre-existing warnings repo-wide) |
| `turbo build` closure | **161 packages, all successful** |

A note worth keeping: on a fresh worktree, `GraphQLDataProvider` first reported *11 failed files /
382 passed* and `MJCLI` *19 failed files / 17 failed tests*. Every one was an unbuilt-dependency
module-resolution error, not an assertion. Building each package's dependency closure cleared them
all. A fresh-worktree failure that looks catastrophic is usually this.

**One flake, reported because it happened.** One `packages/MJCore` run reported `1 failed | 2946
passed`. The run only captured the tally, not the test's name, so it cannot be attributed. Five
subsequent full runs of that suite — four of them consecutive and deliberately for this purpose — were
`2947 passed / 0 failed`, exit 0. It is recorded here rather than quietly dropped, but nothing in it
points at this change: no dataset-cache or freshness case has ever failed with the fix in place.

---

## 5. The integration tier

Run against a **from-scratch `mj_test`** built in this session — the database was empty, so this is a
clean-room result, not a run on an accumulated dev database.

| Step | Result |
|---|---|
| `mj migrate` | 108 applied + baseline, **0 failed**, 394 entities / 396 tables |
| `mj codegen --skipfiles` | success, 394 entities |
| `mj sync push --dir=metadata --ci` | created 94, updated 127, unchanged 14 290, deleted 4, **0 errors** |
| `mj codegen --skipdb` | success, 394 entities |
| `pnpm run build` | **exit code 0**, 289 packages |
| `mj sync push --dir=integration-test` | created 330, **0 errors** |
| `mj test run "IT07 …"` | **DS1–DS4 all pass** |
| `mj test suite "Integration Tests — Deterministic"` | **80 passed / 1 skipped / 0 failed** — 670 oracle checks, 0 failed |

The single skip is `IT52 - Unified Search Seams`, gated on `RUN_SEARCH_TESTS` — the expected one.

**Two things about the environment, stated plainly because the environment is part of the result:**

1. **Credentials were `sa`, not `MJ_CodeGen`.** `MJ_CodeGen`'s password was not available (it is not in
   `mj.config.cjs`, which sources everything from the environment), and resetting it was refused on
   purpose: another session is actively using that login against `mj_test_2`. `sa` is strictly more
   permissive, so it cannot have masked a permission failure into a pass — but it is a difference from
   the documented environment and a `MJ_CodeGen` run would be a stronger statement.
2. **A first tier run reported 59/81 with 21 failures, every one of them
   `Bootstrap failed: MJ_API_KEY is not set`** — the client-first transport bundles. Minting a
   throwaway `MJ_API_KEY` and giving it to both the server and the runner took it to 80/81. Worth
   recording because 21 failures looks alarming and was one missing variable; the brief's "a wrong
   environment is not a weaker run, it is a different one" is exactly right.

The clean-room build also produced a result worth keeping: **CodeGen regenerated no TypeScript
differences at all.** The only new file was a `CodeGen_Run_*.sql` carrying routine search-flag hygiene
unrelated to this change, deleted rather than committed since this change has no schema DDL. The repo's
migrations and metadata reproduce the committed generated code exactly.

---

## 6. Still outstanding

- **This branch depends on PR #4956** and cannot merge before it. `engine-cache-architecture` moved
  from `6e4ab468d8` to `3d7c0aa857` *during* this session — another session is committing to it — so
  re-sync before pushing.
- A `MJ_CodeGen`-credentialed tier run, if that difference matters to the reviewer.
- The compose file header still points at `packages/MJServer/integration-test-scripts/` for the
  cross-server example script, which now lives under
  `packages/TestingFramework/integration-test-suite/rigs/`. Not corrected here — it is unrelated to
  this change and belongs in whatever touches that file next.
