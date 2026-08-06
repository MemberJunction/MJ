# MemberJunction Testing Guidelines

This is the **router document** for testing in the MJ monorepo: the current state, the gate, and
where the detailed guidance lives. It deliberately does not duplicate the deep-dive docs — follow
the links. *(Numbers last verified 2026-08-06.)*

## Current state

- **~2,000 Vitest test files** (`src/__tests__/*.test.ts`, plus ~365 Angular `*.dom.test.ts`
  specs) across **295 of 307 packages**.
- **Vitest is the only unit-test framework.** Jest is deprecated and fully migrated away — the
  lone remaining `jest.config.js` is in the `packages/React/test-harness/react-test-example`
  sample app.
- Two shared presets at the repo root: [`vitest.shared.ts`](vitest.shared.ts) (node tier) and
  [`vitest.dom.shared.ts`](vitest.dom.shared.ts) (jsdom + TestBed DOM tier for Angular).
- Shared mock infrastructure: **`@memberjunction/unit-testing`**
  ([`packages/UnitTesting`](packages/UnitTesting)) — singleton reset, mock entities, mock
  `RunView`, custom matchers; a new AI test harness is being added.
- The historical strategy proposal that launched all of this is
  [`UNIT_TESTING_STRATEGY.md`](UNIT_TESTING_STRATEGY.md) (kept for rationale; its "current
  state" is superseded by this document).

## The gate (Definition of Done)

From the root [`CLAUDE.md`](CLAUDE.md): **a change is not done until both test tiers pass.**

```bash
cd packages/PackageName && pnpm test     # 1) unit tests of every package you touched
pnpm run test:integration                # 2) deterministic integration tier (headless)
```

If tests fail because of your change, update them; if they fail for another reason, fix them.
Never leave broken tests behind.

## Running tests

```bash
pnpm test                                # all packages from repo root (Turborepo, cached)
cd packages/PackageName && pnpm test     # one package
cd packages/PackageName && pnpm run test:watch
pnpm run test:coverage                   # root vitest project list with V8 coverage
pnpm run test:integration                # deterministic integration suite (real DB + GraphQL)
pnpm run test:e2e                        # Playwright browser tier (needs running MJAPI + Explorer)
npx turbo run test --filter=...[HEAD~1]  # only packages affected by your changes
```

## The tiers, and where each is documented

| Tier | What / where | Doc |
|---|---|---|
| **Unit (node)** | `src/__tests__/*.test.ts`, Vitest, no DB, mock externals | [`.claude/rules/testing.md`](.claude/rules/testing.md) |
| **Unit (Angular DOM)** | `*.dom.test.ts` **next to the component** (never in `__tests__/`), jsdom + TestBed via `vitest.dom.shared.ts` | [`guides/ANGULAR_TESTING_GUIDE.md`](guides/ANGULAR_TESTING_GUIDE.md) |
| **Integration** | `mj test suite` bundles against a real SQL Server + GraphQL; deterministic tier is the PR gate | [`guides/INTEGRATION_TESTING_QUICKSTART.md`](guides/INTEGRATION_TESTING_QUICKSTART.md) |
| **E2E (Playwright)** | `e2e/specs/*.spec.ts` against a running MJExplorer with a signed-in profile | [`e2e/README.md`](e2e/README.md) |

Adding tests to a package that has none? Use the scaffold — it emits the vitest config, test
directory, a starter test, and the `package.json` scripts (add `--dom` for the Angular DOM preset):

```bash
node scripts/scaffold-tests.mjs packages/YourPackage
```

## CI landscape

| Workflow | What it runs |
|---|---|
| [`test.yml`](.github/workflows/test.yml) (Unit Tests) | PR gate on `next`: affected-package unit tests, plus the DOM gates below, the class-registration manifest freshness gate, and the native-ESM import guard. Merges to `next` and a nightly cron run the **full suite** as a backstop (red backstops auto-file an issue). A separate **nightly coverage job** publishes a V8 coverage report (report-only, no thresholds yet). |
| [`integration.yml`](.github/workflows/integration.yml) (Integration Tier) | The deterministic suite against a fresh SQL Server on every PR. Nightly cron re-runs it with the **mutation tier** armed plus the **cross-server invalidation rig**; a weekly Sunday cron runs the **live-model** lane. |
| [`eds-integration.yml`](.github/workflows/eds-integration.yml) | External Data Source drivers against real PostgreSQL, MongoDB, SQL Server, MySQL, and Oracle containers. |
| [`installer-platform-test.yml`](.github/workflows/installer-platform-test.yml) | MJInstaller tests across an ubuntu / macos / windows matrix. |
| [`release-test.yml`](.github/workflows/release-test.yml) (Release Validation Suite) | The lane between "green on `next`" and an npm publish: the full unit suite as a callable publish gate, plus a nightly Playwright e2e lane (omnibar + chat-drafts) when the `E2E_PW_PROFILE_B64` secret is configured — it skips visibly otherwise. |

### Quality gates (run locally before you push)

```bash
node scripts/check-dom-spec-placement.mjs        # *.dom.test.ts must NOT sit in __tests__/ (it would silently never run)
node scripts/check-spec-antipatterns.mjs packages   # test-theater lint: vacuous asserts, skips, NO_ERRORS_SCHEMA, `any`
node scripts/classify-explorer-components.mjs --min 85   # Explorer in-scope DOM coverage gate (--register regenerates plans/testing/phase-3-explorer-deferral-register.md)
node scripts/dom-test-report.mjs packages/Angular/Generic --max-none=137   # per-component DOM coverage report + ratchet (Bootstrap gate: --max-none=0)
```

All four run in `test.yml`, so CI catches what you skipped.

## Conventions (the short version — details in [`.claude/rules/testing.md`](.claude/rules/testing.md))

- Tests live in `src/__tests__/` with a `.test.ts` extension (node tier); Angular DOM specs are
  the exception — `*.dom.test.ts` next to the component.
- One test file per source file; descriptive names that read as specifications; `describe` per
  class/method, `it` per behavior.
- No database connections in unit tests — mock externals with `@memberjunction/unit-testing`.
  Real-DB coverage belongs in the integration tier.
- Deterministic and fast (< 5s per file).
- Generated code (CodeGen output) is not unit-tested directly — it churns on every regen.
