# `@memberjunction/predictive-studio-truth-suite`

Predictive Studio planted-truth datasets and the harness the containment gate checks use. Repo-local test content (`private: true`); never published.

The gates themselves are MJ Tests in the integration test suite (`packages/TestingFramework/integration-test-suite/src/checks/ps-gate-*.checks.ts`). This package supplies what they run on: seeded datasets whose true data-generating process is known before any model is fit, loaded into an isolated `pstruth` SQL Server schema, and a harness that drives Predictive Studio through MJAPI the way the browser does.

## 1. What the package holds

### Datasets

The catalog (`src/data/catalog.ts`) has 24 entries. With their base seeds that makes 68 datasets.

| Kind | IDs | Base seeds |
|---|---|---|
| Worlds | `W1-signal`, `W3-leak-row`, `W4-pit`, `W5-censor`, `W6-drift`, `W7-small-imbalanced`, `W8-highcard`, `W9-multiclass` | 42, 43, 44 and the fresh seed 9042 (4 each) |
| Worlds | `W2-noise` | 100–119 and the fresh seed 9100 (21) |
| Scenarios | `C2`, `C4`, `D1c`, `D1r`, `D2`, `N1c`, `N1r`, `R1`, `R2p`, `R3`, `T1p`, `T2p`, `T3`, `T4` | one seed each, from the spec file |
| Derived scenario | `T3-lag` (generated from `T3`'s output) | `T3`'s seed |

- World specs are in `fixtures/worlds/` and scenario specs in `fixtures/scenarios/specs/`.
- The generators are in `src/generators/`. `fixtures/golden-hashes.json` pins the `rows.csv` and `truth.csv` of every base seed byte for byte (T3-lag included). The W2-noise seeds s120–s159 that G0.2 also loads have no pin.
- `pnpm run truth:data` generates datasets into the cache (`.data/`, or `$TRUTH_DATA_DIR`). The cache key covers the spec, the generator, the files it reads (the worlds domain `fixtures/worlds-domain/domain.json` for worlds, `make_scenario.ts` for T3-lag), the shared generator modules and the Loom pin.

### Harness

`src/harness/` is the `TruthHarness` the gate checks get from `RunFixtures.HarnessFor(provider, user)`. It does the following:
- loads datasets into `pstruth`, after checking a base seed's generated `rows.csv` and `truth.csv` against `fixtures/golden-hashes.json` (a mismatch throws before anything loads)
- creates pipelines and trains them
- runs the Pipeline Builder and Model Development agents through MJAPI
- promotes and scores models
- runs the `holdout_rebuild` Python judge

It records the ID of every pipeline and model it creates, and the exact names of every agent run's pipelines. `RunFixtures.CleanupRun` looks those names up again (an agent run can create its pipelines after the client call returns), deletes exactly the recorded rows, and closes the harness's database pool.

Training stores model artifacts through an active File Storage Provider. When none is active, the harness switches on the first one by priority, but only on a private database (`MJ_PS_PR<n>_<agent>` or CI's `test`); on any other database it refuses. `CleanupRun` sets the provider's `IsActive` back to what it was.

### Python

`python/truthsuite/judges/holdout_rebuild.py` is the one Python module a gate calls: G0.12 runs it through `h.Judge('holdout_rebuild', ['--model', <artifact>])` to get the always-majority rate of a model's locked holdout. It reads the class counts training recorded in the model's lineage (`LineageJSON` → `lockedHoldoutClassCounts`) and refuses a model without them. Its tests are in `python/tests/test_judges.py`.

## 2. Setup

Your `.env` in the repository root must define `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD`, `GRAPHQL_PORT` and `MJ_API_KEY`. `truth:provision` and `test:db` load that file themselves, whatever the current directory; a variable already exported in your shell wins. The database must be a private one (`MJ_PS_PR<n>_<agent>`, or CI's `test`) with the core schema migrated: `truth:provision` refuses any other name before it runs `mj migrate`, and the scoped CodeGen config refuses it again. There is no override.

```bash
cd packages/AI/PredictiveStudio/TruthSuite
pnpm run build
pnpm run truth:loom        # clone the Loom pin (fixtures/loom.json) under .loom/
pnpm run setup:python      # create .venv from python/requirements.txt
pnpm run truth:provision   # create the pstruth schema, register its entities, push their direct-SQL opt-ins
pnpm run truth:sidecar     # start the single-threaded sidecar; writes its URL to .run/sidecar.url
```

Start MJAPI with `PREDICTIVE_STUDIO_SIDECAR_URL` set to the URL in `.run/sidecar.url`. After `truth:provision`, restart MJAPI so it loads the `pstruth` entities.

## 3. Running the gates

```bash
MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test suite "Predictive Studio Gates — Containment"
```

The suite first loads the 68 datasets (the loader checks each against its golden hash) and checks that MJAPI reads back each table's loaded row count, then runs the nine deterministic PR 2 gates. The separate suite "Predictive Studio Gates — Pending" holds the gates that do not block a merge: G0.2 and G0.3 (owned by PR 4), and G0.6, an LLM judge whose verdict can differ between runs on the same text (it needs `RUN_AGENT_TESTS=1` and `AI_VENDOR_API_KEY__GeminiLLM`).

## 4. Package tests

```bash
pnpm test                    # unit tests
pnpm run test:db             # dataset loading and pstruth isolation against the database
pnpm run test:regeneration   # every base seed, generated into a fresh empty cache, matches fixtures/golden-hashes.json
pnpm run test:python         # pytest, then mypy --strict over python/
```
