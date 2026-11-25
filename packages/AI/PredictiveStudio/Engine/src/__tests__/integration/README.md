# Predictive Studio — Live End-to-End Integration Test

`live-train-score.integration.test.ts` is an **evergreen, opt-in** integration test that trains a Prediction Unit
pipeline under its Evaluation Protocol through the **real** Python sidecar trainer — nothing about the ML is mocked:

```
generated yearly membership rows (in-memory table data access)
  → REAL unit row reader + as-of assembly + Training Snapshot (in-memory file store)
  → REAL TrainingEngine → REAL MJSidecarTrainer → REAL MLSidecar /trainer (managed spawn of the bundled Python)
  → the gate decision decided in TypeScript, the shipped artifact stored, the model row created
```

The **only** things faked are the persistence seams (entity factory, record loader, artifact and snapshot stores), so
the test needs **no database**.

## Running it

It requires the Sidecar's bundled Python venv:

```bash
# 1) Build the venv once (on macOS also needs Homebrew libomp for xgboost)
cd packages/AI/PredictiveStudio/Sidecar
npm run setup:python

# 2) Run the integration suite
cd ../Engine
npm run test:integration
```

`npm run test:integration` uses a dedicated config (`vitest.integration.config.ts`) that scopes the run to
`src/**/integration/**/*.integration.test.ts` and sets `PS_INTEGRATION=1`. The normal `npm run test` excludes this
folder entirely.

## Safety / graceful skip

- The suite is gated behind `PS_INTEGRATION=1` (the integration config sets it).
- If the venv (or `PREDICTIVE_STUDIO_PYTHON`) is missing, it skips with a console note rather than failing.
- It is **DB-free** and uses **no secrets**.

## What it asserts

| Test | Assertion |
|------|-----------|
| unit pipeline under its protocol | the run completes; it stores a gate decision measured on the 400-row 2025 holdout; a shipping decision creates the model row from the shipped `ps-predictor/v2` artifact, and no-signal ships none |
