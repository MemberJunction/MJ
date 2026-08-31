# Plan: make MemberJunction CI fast and reliable

## Context

MemberJunction's unit test workflow (`.github/workflows/test.yml`) times out at its 30 minute cap on pull requests to `next`. We verified the cause. The job runs a full cold `npm run build` before `npm test`. That build covers all 242 turbo tasks, including MJExplorer's `ng build`, which is an Angular ahead-of-time compile that needs a 16 GB heap. It is the single largest task and it cannot run in parallel. The runner is a 2 vCPU `ubuntu-latest`, and no turbo cache is kept between runs. Only `node_modules` is cached. The same build finishes in seconds on a developer machine because the local turbo cache is warm. In CI every run starts cold.

This cost us during the 5.44.0 release. The unit test check was cancelled twice at 30 minutes, both times still inside `ng build`. We had to merge with an admin override and rely on a local test run as proof.

A separate problem hit the same release. The publish first failed on a wrong 6.0.0 version bump. The package `@memberjunction/ng-test-utils` pinned its `@memberjunction/core` peer dependency to an exact version. When core moved to 5.44.0, that pin fell out of range. Changesets treats an out-of-range peer update as a breaking change, so it applied a major bump, and the `@memberjunction/*` fixed group then raised every package to 6.0.0. The guard that catches this runs only after the merge to `main`, so we found out too late.

This document is the plan. We will open it as a pull request on `next` so the team can discuss it. The open questions near the end are the parts we still need to decide.

### What good looks like

- a pull request that touches a few packages returns unit test results in well under 10 minutes, most of it spent in `npm ci` rather than the build
- a cold run, or a run after a root change, finishes a full build and test inside the timeout with margin to spare
- every merge to `next` still runs the full test suite as a backstop that cannot be cancelled
- the affected-only path never lets through a failure that the full suite would have caught
- a wrong major version bump is caught on every pull request and before the release merge, not after it

## What we found

- Redundant cold builds. The workflows `build.yml` (on push to `next`), `test.yml` (on pull request to `next`), `publish.yml` (on push to `main`) and `docs.yml` (after publish) each run a full build. One change drives a sequence of full cold builds that share no cache.
- The affected-only change already exists but was closed. Pull request 2990 (branch `ci/targeted-unit-tests`, commit `c46a5592e2`) changed only `test.yml`, about 54 lines. It used native turbo filtering (`--filter=...[origin/<base>]`) with a full-suite backstop on push to `next`, a nightly schedule and manual runs. It was closed over two review points from SDesai-BC. Both are fixable, and Phase 1 addresses them.
- Dropping the build is not safe. Most packages have no tsconfig `paths`, so an import of `@memberjunction/x` resolves through the workspace symlink to that package's `main`, which is `dist/index.js`. A few tests import `dist` directly. For example, `packages/Actions/CodeExecution/src/__tests__/bridge.test.ts` needs the compiled `worker.js`. Angular packages need an ahead-of-time build. So we keep `test: {dependsOn:['build']}`. Affected-only builds only the packages that change and the packages that depend on them, and their dependencies build first through `build: {dependsOn:['^build']}`.
- Cache size is not a problem. One build's turbo cache is about 150 to 300 MB, and the largest single artifact is 15 MB. The GitHub Actions cache limit is 10 GB per repository, with least-recently-used eviction. The `.turbo` cache fits many times over.
- MJExplorer has no unit tests. Its `test` script is `echo "No tests configured yet"` and it has no test files. Its only value in CI is proving the app still compiles. Affected-only builds it only when a pull request touches it or something it depends on, so we do not need to exclude it.
- The version guard runs too late. It sits inline in `publish.yml` at about lines 111 to 139 and runs only after the merge to `main`.
- Turbo is version 2.8.3, which supports remote cache and signed artifacts. Branch protection currently requires no status checks on `next` or `main`.

## Phase 1: bring back the affected-only lane

This is the highest-value, lowest-risk change, and it is the one that stops the timeout. It changes `.github/workflows/test.yml`.

On a pull request to `next`, run turbo scoped to the change:

```
git fetch origin "$GITHUB_BASE_REF"
npx turbo run build --filter=...[origin/$GITHUB_BASE_REF]
npx turbo run test  --filter=...[origin/$GITHUB_BASE_REF]
```

The `...[ref]` selector picks the packages that changed since the base, plus every package that depends on them. Because `build` depends on `^build`, turbo builds their dependencies first, so the `dist` that cross-package imports need always exists. No full build is needed.

On a push to `next`, a nightly schedule and a manual run, run the full suite (`npm run build && npm test`) as the backstop.

Fix 1, the concurrency bug raised by SDesai-BC. The original concurrency group used `${{ github.ref }}`, which is the constant `refs/heads/next` for every push. With `cancel-in-progress: true`, one merge cancels the previous merge's backstop while it is still running, which defeats the safety argument. Use the reviewer's fix:

```yaml
concurrency:
  group: unit-tests-${{ github.workflow }}-${{ github.ref }}${{ github.event_name == 'push' && format('-{0}', github.sha) || '' }}
  cancel-in-progress: ${{ github.event_name != 'push' }}
```

Fix 2, root-change detection raised by SDesai-BC. Force the full suite when a root file changes. The original list left out the root `package.json`, where the workspace globs and the root build and test scripts live. Use an anchored pattern so it matches the root file but not the nested `packages/**/package.json` files, which the affected filter already handles:

```
^(package\.json|package-lock\.json|turbo\.json|vitest\.[^/]+|tsconfig[^/]*\.json|\.github/workflows/test\.yml)$
```

We do not exclude MJExplorer. Affected-only builds it only when a pull request touches it or something it depends on. That is exactly when you want the pre-merge signal that it still compiles. Otherwise it is skipped.

## Phase 2: keep the turbo cache between runs

This is high value and low risk, and it makes the cold path, the backstop and repeat pull request runs fast. Start with `test.yml`, then apply the same step to `build.yml`, `publish.yml`, `docs.yml` and `release-test.yml`.

Add a cache step before the build:

```yaml
- uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-node24-${{ hashFiles('package-lock.json') }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-node24-${{ hashFiles('package-lock.json') }}-
      turbo-${{ runner.os }}-node24-
```

Turbo owns the content hashing. It keys each task on its inputs and its dependencies' hashes. The Actions cache is only there to store and restore the `.turbo` directory. The unique key per commit means every run saves a fresh snapshot, and the shared `restore-keys` prefix means every run restores the most recent matching snapshot. The prefix carries the things that invalidate every output regardless of turbo's own hashing: the operating system, the Node major version and the lockfile hash. You can set `TURBO_CACHE_DIR=.turbo/cache` to make the path explicit.

## Phase 3: version-safety guards

These are correctness gates and low risk. There are two new layers, plus the existing guard.

Layer 3a, a peer-pin check. Add a repository-wide vitest test that fails if any `@memberjunction/*` package pins a peer dependency on another `@memberjunction/*` package to an exact version. Peers must use a range (`^`, `~`, `workspace:` or a comparator). This catches the root cause on every pull request. Put it next to `packages/MJGlobal/src/**/UUIDCompliance.test.ts`, which already walks every `package.json`, and reuse that traversal.

Layer 3b, a pre-merge version guard. On the `next` to `main` pull request, reproduce `changeset version` in a scratch checkout and compare the computed `packages/MJServer/package.json` version to the expected version. Fail if it computes a major bump with no major changeset present. This catches a wrong 6.0.0 before the release merge.

Layer 3c, keep the existing post-merge guard in `publish.yml`. Move the shared expected-version logic into `.github/scripts/expected-version.sh` so 3b and 3c cannot drift apart.

## Phase 4: remove the redundant builds

This removes wasted cold builds. It carries medium risk because it changes a gate. It touches `build.yml` and `test.yml`.

With the shared cache from Phase 2, the post-merge build in `build.yml` and the build in `publish.yml` become near-total cache hits, seeded by the pull request run. The redundancy shrinks to a restore and a verify.

The team needs to decide (see open question 6a) whether to keep `build.yml`, with the shared cache, as the whole-repository and MJExplorer build gate, or to retire it and rely on the push-to-next backstop. If we retire it, we first move its provenance checks, `validate-package-repository.sh` and `validate-package-lock-case.sh`.

## Phase 5: turbo remote cache

Do not add this without a decision. It is here to frame the choice.

The local cache from Phase 2 is free, stays inside the repository and covers most of the gain. A remote cache adds one thing the local cache cannot: sharing across branches and across developers. A developer's local build can seed CI, and CI can seed a developer, so even a cold branch starts warm. The cost is an external dependency, a CI token and some operational work. It needs signed artifacts to prevent cache poisoning (`signature: true` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY`). If we adopt it, a self-hosted cache backed by object storage avoids a vendor dependency. Ship Phases 1 to 4, measure, then decide (see open question 6b).

## Phase 6: check the docs build before merge

This prevents the post-publish TypeDoc failures we hit this release, and it is low risk. Add a pull request job, either inside `test.yml` or as a small `docs-check.yml`, that runs `npx typedoc --emit none` over the affected packages and reuses the cache and the affected filter from Phases 1 and 2. It validates only and does not deploy to Pages. Leave `docs.yml` as the deploy path.

## What we will not do, and why

- We will not drop the build or run tests against source. Cross-package imports resolve to `dist`, some tests import compiled artifacts, and Angular needs an ahead-of-time build. Affected-only is the right lever.
- We will not shard the test suite as the main fix. The slow part is the build, not running the tests. Sharding adds cost and orchestration without touching the slow part.
- We will not write our own affected-build script. Turbo already computes the set of changed packages and their dependents, in the right build order, from the real dependency graph. A hand-written script would duplicate that and drift from it.
- We will not rely on the affected-only lane alone for correctness. We keep the full-suite backstop on push to `next`.
- We will not permanently exclude MJExplorer. Affected-only skips it when it is not relevant and builds it, before merge, when a pull request touches it.

## Correctness and safety

The backstop matters because turbo's graph is static. It follows `package.json` edges. MemberJunction wires classes at runtime through `@RegisterClass` and `ClassFactory`, so package B can depend on package A's behaviour with no dependency edge between them. The selector `...[A]` will not pick B. So a change in A can break B's tests, and only the full suite finds it. The full-suite backstop on push to `next`, which cannot be cancelled once Phase 1's per-commit concurrency group is in place, plus the nightly run, are therefore not optional. Pull requests get fast, scoped feedback. The `next` branch gets the whole truth before it becomes the base for the next pull request.

Cache keys need care. Let turbo do the content hashing, and let Actions do the storage. Never key only on the commit hash with no `restore-keys`, because that guarantees a permanent miss.

Turbo `inputs` need an audit. The `test` task `inputs` decide when a cached pass is still valid. If a test reads a file that is not in `inputs`, for example a fixture, a JSON file or a `.sql` file under `src` that the globs miss, turbo can serve a stale pass after that file changes. Audit the `test` inputs for each package family before we trust cached test results (see open question 6d). The `globalDependencies` already invalidate every cache when the shared vitest config changes, so keep that.

## How to check each phase works

Phase 1. Open a pull request that touches one leaf package. The scope step should log a `--filter=...[origin/next]` run, and only that package and its dependents should build and test. Cross-check the set with `turbo run test --filter=...[origin/next] --dry=json`. Open a pull request that touches only the root `package.json`. It should log a full-suite run, which proves Fix 2. Push two commits to `next` in quick succession. Both backstops should finish and neither should be cancelled, which proves Fix 1. A force-push to a pull request should still cancel the superseded run.

Phase 2. Run a job twice with no code change. The second run should log a full cache hit and a line that says the cache was restored. Check the cache size in the Actions cache view. Expect about 150 to 300 MB per snapshot and a total under 10 GB. Use `turbo run ... --summarize` for per-task hit ratios.

Phase 3. Add a temporary exact peer pin. Check 3a fails on the pull request. Add a changeset that would produce a wrong major bump. Check 3b fails the `next` to `main` pull request before merge, and that a correct bump passes. Confirm 3b and 3c share `expected-version.sh`.

Phases 4 and 6. Confirm the post-merge build is a near-total cache hit. Introduce a broken doc comment and confirm the pull request docs check fails without deploying Pages.

## Open questions for the discussion

- 6a, the future of `build.yml`. Keep it, with the shared cache, as the whole-repository and MJExplorer build gate, or retire it onto the backstop. If we retire it, where do the provenance checks move?
- 6b, remote cache. Is cross-developer and cross-branch warmth worth an external dependency? Self-hosted object storage or a vendor? Who owns the token and the signature key rotation?
- 6c, backstop cost. Run the full suite on every push to `next`, or only when a merge touches more than a set number of packages, with the nightly run as the catch-all? This trades cost against how fast a runtime-coupling break shows up.
- 6d, who audits the `test` inputs for each package family before we trust cached results?
- 6e, timeout policy. Once Phases 1 and 2 land, lower the pull request lane timeout, for example to 15 minutes, so a runaway cold build fails fast, and keep 30 minutes on the backstop?
- 6f, adjacent. The idempotency second pass in `pg-migrations.yml` still uses `continue-on-error: true`. Enforce it once the database is clean, as a separate follow-up?

## Files this plan changes

- `.github/workflows/test.yml` for Phases 1, 2 and 6
- `.github/workflows/build.yml`, `publish.yml`, `docs.yml` and `release-test.yml` for Phases 2 and 4
- `turbo.json` for the Phase 2 cache directory, and for `remoteCache` if we adopt Phase 5
- `packages/MJGlobal/src/**/UUIDCompliance.test.ts` as the pattern to copy for the Phase 3a peer-pin check
- a new `.github/scripts/expected-version.sh` for the shared logic in Phases 3b and 3c
- reference: pull request 2990 and branch `ci/targeted-unit-tests` at `c46a5592e2` for the Phase 1 starting diff
