# Predictive Studio — Live End-to-End Integration Test

`live-train-score.integration.test.ts` is an **evergreen, opt-in** integration
test that proves the **entire** Predictive Studio stack works for real — nothing
about the ML is mocked:

```
synthetic dataset (in-memory, deterministic)
  → REAL FeatureAssemblyExecutor      (synthetic rows via the in-memory IFeatureDataAccess seam)
  → REAL TrainingEngine
      → REAL MLSidecar                (managed spawn of the bundled Python: xgboost / logistic / ridge)
  → in-memory ML Model artifact       (persistence seams faked — training itself is REAL)
  → REAL MLModelInferenceProcessor
      → REAL MLSidecar /predict        (scores held-out rows)
```

The **only** things faked are the persistence seams (entity factory, record
loader, artifact store/loader) so the test needs **no database**. The sidecar,
FeatureAssembly, TrainingEngine, and the inference processor are all the real
production code paths. Because it's self-contained (synthetic data, no demo
schema), it can live in the repo and re-run in CI/dev forever.

## Running it

It requires the Sidecar's bundled Python venv (xgboost, scikit-learn, FastAPI):

```bash
# 1) Build the venv once (Python 3.9+; on macOS also needs Homebrew libomp for xgboost)
cd packages/AI/PredictiveStudio/Sidecar
npm run setup:python

# 2) Run the integration suite
cd ../Engine
npm run test:integration
```

`npm run test:integration` uses a dedicated config (`vitest.integration.config.ts`)
that scopes the run to `src/**/integration/**/*.integration.test.ts` and sets
`PS_INTEGRATION=1`. The normal `npm run test` (fast, sidecar-free, CI-safe)
**excludes** this folder entirely, so it is unaffected.

## Safety / graceful skip

- The suite is gated behind `PS_INTEGRATION=1` (the integration config sets it).
- If the venv (or Python) is missing, it **skips gracefully** with a clear console
  note rather than hard-failing — so an environment without Python is never broken
  by this test.
- It is **DB-free** and uses **no secrets**. (No DB credentials are needed; if a
  future DB-backed variant needs them, read from the repo-root `.env` via
  `process.env` — never hardcode.)

## What it asserts (real numbers, not canned)

| Test | Assertion |
|------|-----------|
| xgboost classifier | Draft model produced; FittedPreprocessing + FeatureSchema + FeatureImportance populated; **holdout AUC ≥ 0.7**; strong-positive scores higher than strong-negative and gets the right class; held-out batch beats coin-flip |
| logistic_regression classifier | **holdout AUC ≥ 0.7**; strong-positive > strong-negative |
| ridge regressor | **holdout R² ≥ 0.4**; higher-engagement row predicts higher value; no class label (regression) |

Representative metrics on a dev machine (Python 3.9, ~420 synthetic rows):
xgboost holdout AUC ≈ 0.73, logistic holdout AUC ≈ 0.80, ridge holdout R² ≈ 0.87.
The whole suite runs in ~2 s once the sidecar is warm.

## Note on the holdout

The production `MJSidecarTrainer` doesn't yet wire holdout scoring into the
Python `/train` path (it carves the locked holdout in TS for provenance only —
see `ISidecarTrainer`). To assert an **honest locked-holdout** metric, this test
injects a small `LiveHoldoutSidecarTrainer` that sets `validation.holdout_size`
on the request, so the Python sidecar carves and scores a holdout **exactly
once** and returns genuine `holdout_metrics`.
