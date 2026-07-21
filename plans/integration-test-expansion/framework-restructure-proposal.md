# Proposal — Integration Testing as a Proper Framework

**Status:** ✅ **EXECUTED 2026-07-20**
**Author:** drafted overnight 2026-07-20, for review in the AM

## As-built deviations from the proposal below

The split shipped as proposed (§3.1: framework-only `@memberjunction/testing-integration`,
private `@memberjunction/integration-test-suite` at `packages/TestingFramework/integration-test-suite/`),
with four deliberate deviations:

1. **Single entry path — no dev runner** (Amith's call). §3.2's proposed `npm run it <bundle>`
   dev runner and the run-all move were dropped: the tsx dispatchers AND `run-all.ts` are simply
   gone. `mj test` is the only way to invoke the catalog (`npm run test:integration` =
   `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`; per-bundle loop =
   `mj test run --name "<IT record name>"`).
2. **The loading seam is config, not dependency**: the published CLI side-effect-imports the
   private suite package at `mj test` startup via `mj.config.cjs`
   `testing: { checkModules: ['@memberjunction/integration-test-suite'] }` (ad-hoc:
   `--checks-module`). External adopters point `checkModules` at their own check packages —
   which also covers §3.3's "deployment extension point" without embedded JS.
3. **The special rigs** (cross-server, agent-memory, runview-matrix, the ten `ps-*` flows —
   answering open question §5.2 — plus `lib/harness.ts` / `lib/ai-bootstrap.ts`) moved to
   `packages/TestingFramework/integration-test-suite/rigs/` as standalone tsx scripts, NOT
   catalog entry paths.
4. **Sibling parity is two-way** as §3.2 anticipated (bundle ↔ IT record + suite membership),
   but the run-all-membership assertion became a **checkModules config assertion** (run-all no
   longer exists) — `sibling-parity.test.ts` fails the build if `mj.config.cjs` stops loading
   the suite package.

`metadata-optional/integration-test/` remains load-bearing: every environment must seed the IT
records once (`npx mj sync push --dir=metadata-optional/integration-test`) or `mj test` has
nothing to dispatch.

---

*Original proposal follows, unchanged.*

---

## 1. The problem, stated precisely

Integration testing currently lives in **three** places, and one of them ships to customers.

```
packages/TestingFramework/testing-integration/src/checks/     29 bundles — THE LOGIC
packages/MJServer/integration-test-scripts/                   42 files   — tsx dispatchers + run-all
metadata-optional/integration-test/                           29 IT records + suite membership
```

Two concrete defects, not preferences:

**(a) MJ's entire test suite ships to every customer.**
`@memberjunction/testing-integration` is **published** (`private: false`, v5.48.0) and is a runtime **`dependency`** of `@memberjunction/server-bootstrap` — a core package every install pulls.

The coupling is a single class. `server-bootstrap`'s generated manifest needs `IntegrationTestDriver` registered, and imports it from the package **barrel**:

```ts
// packages/ServerBootstrap/src/generated/mj-class-registrations.ts
import { IntegrationTestDriver } from '@memberjunction/testing-integration';
```

The barrel re-exports all 29 check bundles, which import `record-set-processor`, `ai-engine-base`, `mssql`, and more. **One class registration drags the whole suite into production dependency trees** — including code that creates and deletes `MJ: User Settings` rows.

This is the same barrel-transitivity failure as B32 (client dispatchers loading server packages), with a wider blast radius.

**(b) `MJServer/integration-test-scripts/` is a runtime package hosting 42 test files.**
Acknowledged as a stopgap from when integration testing was spun up quickly. The 42 files are ~40-line dispatchers that bootstrap a provider, pull a bundle from the registry, and run it — plus `run-all.ts` and the `ps-*` flow scripts. They contain no test logic.

---

## 2. What is actually *right* today (worth preserving)

The current design already separates concerns correctly; only the **packaging** is wrong.

- **Check logic lives exactly once**, in registry bundles. Both front ends consume the same `IntegrationCheckRegistry`, so they cannot drift.
- **Metadata already owns composition** — which tests, which suite, which tier, what config. `metadata-optional` correctly keeps it out of the default push.
- **Three-way consistency is enforced**, not hoped for: `sibling-parity.test.ts` fails the build if a bundle lacks either sibling, or if a sibling points at a non-existent bundle.
- **Two front ends earn their keep**: the `tsx` dispatchers give a fast dev loop with no DB metadata required; the metadata records let tests be composed, scheduled, and reported through MJ's own test infrastructure.

The restructure should keep all four properties.

---

## 3. Recommendation

### 3.1 Split the framework from the content

| Package | Contains | Ships? |
|---|---|---|
| `@memberjunction/testing-integration` *(existing, slimmed)* | `IntegrationTestDriver`, `IntegrationCheckRegistry`, the `NamedCheck`/`BundleLifecycle` contracts, bootstraps, `TestRunner`, tiers, config | **Yes** — small, and legitimately a runtime dep since the driver must be ClassFactory-registerable |
| `@memberjunction/integration-test-suite` *(new)* | all 29 check bundles — MJ's own test content, first-class TypeScript | **No** — `private: true`, devDependency only |

This alone fixes (a). `server-bootstrap` keeps depending on the framework for the one class it needs; the suite stops shipping.

**Why not embedded JS in metadata for MJ's own suite:** metadata is excellent at *composition* and poor at *implementation*. The checks use `MJUserSettingEntity`, `RunViewParams`, `CompositeKey`, `UUIDsEqual` — all compile-checked. This session alone, that type safety caught a wrong `SetRunViewResult` argument order at build time, and the repo's `UUIDsEqual` compliance gate caught `===` on UUIDs across four files by scanning typed source. Embedded JS forfeits type checking, refactor safety, IDE navigation, and readable stack traces — and adds a code-execution-from-data surface (the reason RO-4's AI-authored operations need `CodeApprovalStatus` gating).

### 3.2 Delete `MJServer/integration-test-scripts/`

The dispatchers are boilerplate around "bootstrap → pull bundle → run", which `IntegrationTestDriver` already does. Replace with:

- **`mj test run <bundle>`** / **`mj test suite <name>`** — the generic CLI path, already the metadata-driven front end
- **one** dev runner in the new suite package for the fast loop (`npm run it <bundle>`), replacing 30 near-identical files
- `run-all.ts` moves to the suite package as its aggregate entry point

`sibling-parity` then enforces **two** siblings (bundle ↔ IT record) instead of three, and gains a run-all-membership assertion — which would have caught H6, where `cross-server-invalidation-tests.ts` documented that run-all included it while the inclusion never existed.

### 3.3 Keep metadata as the composition layer — and make it the extension point

Metadata continues to define *which* tests exist, how they compose into suites, tier, and per-check config.

**Where embedded JS genuinely earns its place:** letting a *deployment* add its own integration tests without forking a package. That is a real gap, and it is the right home for the idea — gated like RO-4 (`CodeApprovalStatus`, declared `Libraries`, an ambient `ctx` contract). MJ's own suite stays compiled; consumers get an escape hatch.

---

## 4. Migration plan

| # | Step | Risk | Verification |
|---|---|---|---|
| 1 | Create `integration-test-suite` (`private: true`); move the 29 `*.checks.ts` + their tests | Low — file moves | `sibling-parity` green; full suite green |
| 2 | Slim `testing-integration` to framework-only; verify `server-bootstrap` still resolves `IntegrationTestDriver` | **Medium** — touches the shipped manifest | `npm run mj:manifest`; ServerBootstrap builds; grep the manifest for suite packages |
| 3 | Add the dev runner; delete the 30 dispatchers | Low | every bundle runnable via the new runner |
| 4 | Move `run-all.ts`; add run-all-membership to `sibling-parity` | Low | suite green; membership assertion fails when a bundle is omitted |
| 5 | Decide the `ps-*` flow scripts (standalone, not registry bundles) | — | **open question, see §5** |

Each step is independently revertible and independently verifiable.

---

## 5. Open questions for you

1. **Package name** — `@memberjunction/integration-test-suite`? Or nest under `packages/TestingFramework/`?
2. **The `ps-*` Predictive Studio scripts** — 10 standalone flow scripts, not registry bundles. Convert to bundles, or keep as scripts in the new package?
3. **`client-cache-tests.ts` registration** is blocked on **B40** (`CacheLocal` drops aggregates). Fix B40 first, or register it with a known-red?
4. **Consumer-authored tests via embedded JS** — in scope for this phase, or a later one once the packaging is clean? My recommendation: later. Ship the split first.

---

## 6. What this does *not* change

- Check logic still lives exactly once
- Metadata still owns composition
- Both front ends still consume one registry
- Parity still enforced by a build-failing test

The change is **packaging and hosting**, not architecture. That is precisely why it is low-risk: no test logic is rewritten, and each step is verifiable by the suite that already exists.
