# CI gates for the shared-cache work

Branch `engine-cache-ci-gates`, cut from `c7a30c7c03`. Split out of `engine-cache-architecture` at
the owner's request, the way `engine-related-record-collections` was, so the defect fixes can merge
without waiting on CI plumbing.

## Why this exists

The review of `engine-cache-architecture` (plan §16, verified in §17) found ten must-fix defects in
work that had reported green everywhere. The reason none of the testing caught them is structural,
not incidental:

- **The Redis-gated suites never ran in CI.** `packages/RedisProvider/src/__tests__/integration-*.test.ts`
  are `describe.skipIf(!REDIS_URL)`, and no workflow provides a Redis. They execute-and-skip, which
  reads in the summary exactly like a pass. Everything they pin — index-group pruning, per-key TTL,
  the cross-process key lock, leases — had zero CI coverage.
- **The fleet rig asserts nothing.** `rigs/cache-fleet-baseline.ts` measures and prints, then exits 0
  whatever it found. Six measurements quoted in the changeset rest on a script that cannot fail.
- **Cross-process behaviour has no gate at all.** Every bug in the review's top five is invisible to
  a single process: a peer's slot never invalidated, a proxy key outliving its payload, a sweep
  clobbering a peer's locked write.

## What is in this branch

### 1. Redis service on the unit-test shards (done, standalone)

`.github/workflows/test.yml`: the `test` job gains a `redis:7-alpine` service, `REDIS_URL` and a
per-run `REDIS_KEY_PREFIX`. Shards that do not draw the Redis provider ignore it.

`.github/scripts/check-redis-suites-ran.mjs`: runs after the shard's tests when it drew
`@memberjunction/redis-provider`, re-runs the two gated files with the JSON reporter, and fails if
anything skipped or nothing passed. **A skipped suite is not a passing suite** — without this the
gate can silently revert to dormant the next time the service is dropped or renamed.

This part works against any base and does not depend on the parent branch.

### 2. `cache-shared` deterministic bundle (to do — needs the parent branch)

A check bundle that gets cross-process semantics into the PR gate **from a single process**, using
the foreign-`SourceServerId` replay the wire rig already uses: build a `CacheChangedEvent` as though
a peer had published it and hand it to `LocalCacheManager.DispatchCacheChange` / the provider's
subscriber. Bundle skips-as-pass without `REDIS_URL`, so it is safe in every tier.

Checks to write, each pinning a defect the review found:

| Check | Pins |
|---|---|
| A slot whose key expired, then a save on that entity → a `removed` is published and the peer's index no longer lists it | §16.3 #2, F9 |
| `GetIndexGroupKeys` with the pipeline reply forced null/short → every member kept, nothing pruned | §16.3 #2 |
| A key written to the `default` category carries no expiry while a RunView slot does | §16.3 #3 |
| Snapshot removal deletes the timestamps key **last**, and a load that finds timestamps with no payload does not claim to be current | §16.3 #3 |
| A lock the provider cannot take → the entry is invalidated, never written unlocked | §16.3 #6, #12 |
| A foreign lease holder blocks `TryAcquireLease` for its TTL | 3.1 |
| A `group_invalidated` / user-cache stamp notice → the engine and the user cache reload | §15 |
| A RunView `category_cleared` → engines and the user cache reload; other categories do not | §15, §16.3 #23 |

### 3. Rig assertions and a nightly cross-process job (to do — needs the parent branch)

- Give `cache-fleet-baseline.ts` expectations per phase and a non-zero exit when they fail: boot
  convergence identical, propagation under a bound, `users` phase propagating and the control not,
  `cli-ops` reader failures zero.
- Run `boot --stagger`, `race`, `burst`, `users` in the nightly cross-server job, which already has
  a Redis service and two MJAPI processes.

## Sequencing

1. **Part 1 lands first, and has** — PR #4908, merged 2026-09-30. It is independent of the engine
   work, and until it was in, every real-Redis test pinning those fixes was `skipIf`-skipped in CI,
   so that branch would have merged with its own regression net switched off.
2. `engine-cache-architecture` merges (defect fixes + its own unit tests).
3. Rebase parts 2 and 3 onto it — they reference `InvalidateIndexGroup`, the user-cache stamp key,
   `BaseEngineSweeper` and the rig, none of which exist on `next` yet.

## Status

- **Part 1: merged** (PR #4908). In that PR's CI run, shard 3 reported
  `Redis-gated suites: 6 passed, 0 skipped`. The reviewer independently confirmed the gate rejects a
  skipped run: without `REDIS_URL`, vitest's JSON report shows `numPendingTests: 6` and
  `success: true`, which the script refuses.
- **Follow-up (this branch):** four items the reviewer raised on #4908.
  - `REDIS_URL` declared on the `test` task in `turbo.json`. Turbo 2.x runs tasks in strict env
    mode, so it was stripping the variable before vitest started: the main test step skipped the
    suites and only the gate ran them for real. Declaring it also puts it in the task's cache key,
    so turbo cannot replay a result produced without Redis.
  - `.github/scripts/check-redis-suites-ran.mjs` added to `test.yml`'s `paths:` triggers, so a PR
    that edits only the gate still runs the workflow — the other guard scripts are listed for the
    same reason.
  - `REDIS_KEY_PREFIX` removed from the job: nothing reads it. The gated suites set their own
    prefix (`test-integration`), and each job has its own Redis container, so there is no keyspace
    to share.
  - Comments corrected: "two integration files" (there is one on `next`; the guard discovers them by
    convention anyway), and the script's citation of "plan §16.7", which lives in a plan that is not
    in this repo.
- **Parts 2 and 3: specified above, not written.**
