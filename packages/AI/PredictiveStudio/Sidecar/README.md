# @memberjunction/predictive-studio-sidecar

> A self-managing TypeScript wrapper for Predictive Studio's **Python ML sidecar** — `new MLSidecar(); await s.Start()` and you have a live training/inference service. **No Docker required.**

**What** — `MLSidecar`, a TypeScript class fronting a CPU-only FastAPI service (bundled in `src/python/`) that **trains** and **serves** tabular ML models over the contract defined in [`@memberjunction/predictive-studio-core`](../Core/src/sidecar-contract.ts).

**Why** — Node is poor at ML training; Python is excellent. So MJ (TypeScript) assembles the feature matrix and orchestrates, and this sidecar does the CPU-bound protocol-driven **training** (`/trainer`) and **inference** (`/predict`). Keeping it self-managing means a developer needs zero infrastructure to train a model locally.

**How it fits** — in the four-layer Predictive Studio architecture (data → feature → **model** → inference) this is the *model/inference compute* tier. It follows the [`@memberjunction/sqlglot-ts`](../../../SQLGlotTS) **bundled-microservice** pattern: the Python service ships *inside* this npm package (`src/python/`) and `MLSidecar` spawns it as a child process on demand. **Managed spawn is the default and needs no Docker** — it just works once the bundled venv exists (`pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python`). A remote/containerized topology is opt-in, not a prerequisite.

For the full architecture, read the
**[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)** (§2 covers this package); for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Two topologies

| Mode | When | What `Start()` does |
|------|------|---------------------|
| **Managed** (default) | nothing configured | Spawns the bundled FastAPI service on `127.0.0.1` with an **ephemeral port**, reads `PREDICTIVE_STUDIO_SIDECAR_PORT=<n>` from its stdout, polls `/health` until ready, registers SIGINT/SIGTERM/exit cleanup. |
| **Remote** | `url` option **or** `PREDICTIVE_STUDIO_SIDECAR_URL` env set | Connects only — no child process — and just verifies `/health`. Use for a containerized/scaled sidecar. |

## Quick start (managed mode)

```ts
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

const s = new MLSidecar();          // managed mode by default
await s.Start();                    // spawns the bundled Python service

// Training: one protocol-driven run over a frozen Training Snapshot. TrainingEngine builds the TrainerRequest for you;
// the snapshot's matrix and row manifest travel as pre-authorised downloads.
const result = await s.RunTrainer(trainerRequest);   // TrainerRequest from @memberjunction/predictive-studio-core
if (result.status !== 'completed') throw new Error(`${result.stage}: ${result.message}`);
const artifact = result.artifacts[0];                // { candidate, bytesBase64, sha256, … }

const { predictions } = await s.Predict({
  artifact_b64: artifact.bytesBase64,
  fitted_preprocessing: {},                          // a ps-predictor/v2 artifact carries its own encoding
  feature_schema: [],
  rows: [{ x0: 1.2, x1: -0.4 }],
});

await s.Stop();                     // shut the child down
```

### Remote mode

```ts
const s = new MLSidecar({ url: 'http://predictive-studio-sidecar:8000' });
await s.Start();                    // just verifies /health — no spawn
// ... trainer / predict / health ...
// Stop() is a no-op (this client never owned the process)
```

## `MLSidecar` API

```ts
new MLSidecar(options?: {
  url?: string;                 // remote-mode base URL (also via PREDICTIVE_STUDIO_SIDECAR_URL)
  pythonPath?: string;          // managed-mode interpreter; defaults to bundled .venv python, else python3
  startupTimeoutMs?: number;    // default 30000
  requestTimeoutMs?: number;    // default 300000 (training can be slow)
});

await s.Start(): Promise<void>;                       // spawn (managed) or verify /health (remote)
await s.Stop(): Promise<void>;                        // SIGTERM the child (no-op in remote mode)
await s.RunTrainer(req: TrainerRequest): Promise<TrainerResult>;  // POST /trainer; transport timeout = req.timeoutSeconds + 60 s
await s.Predict(req: PredictRequest): Promise<PredictResponse>;
await s.Health(): Promise<SidecarHealthResponse>;

s.IsRunning: boolean;   // remote always true; managed needs a live child
s.IsRemote:  boolean;
s.Port:      number | null;   // ephemeral port in managed mode, null in remote
```

`PredictRequest` / `PredictResponse` / `TrainerRequest` / `TrainerResult` are imported
from `@memberjunction/predictive-studio-core` — import them from there, not from this
package. (`RunTrainer` throws `TrainerResultMalformedError` when a 2xx answer is not a `TrainerResult`; the retired `/train` route and `MLSidecar.Train` no longer exist.)

## Setting up the bundled Python environment

**One-time setup (fresh clone).** Predictive Studio's packages depend on other workspace packages, so build them
together, never one by one (a per-package `tsc` on a fresh clone fails with `TS2307 Cannot find module
'@memberjunction/core'`):

    pnpm install                                                      # repo root
    npx turbo run build --filter=@memberjunction/predictive-studio...  # PS + everything it depends on
    pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python

`setup:python` needs CPython 3.11 or 3.12 (numpy 1.26.4 has no wheels for 3.13+); it tries `python3.11`, `python3.12`,
`python3`, `python` and stops with the list it probed if none fits. Pass `--python <path>` to choose one. On macOS
also `brew install libomp` (XGBoost/LightGBM). To run the sidecar or its tests on another interpreter, set
`PREDICTIVE_STUDIO_PYTHON=<path to python>`.

`MLSidecar` automatically appends `DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib`
to the spawn environment on `darwin`, so the venv finds libomp at runtime. On Linux
the OpenMP runtime is `libgomp1` (install via your distro's package manager).

If you prefer your own interpreter, pass `pythonPath` or set
`PREDICTIVE_STUDIO_SIDECAR_URL` and run the service yourself.

## Running the Python tests

```bash
pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python
pnpm --filter @memberjunction/predictive-studio-sidecar run test:python   # runs the pytest suite against the bundled venv
```

## The anti-skew core (why this exists)

Training encodes inside every fit. `app/encoding.py` turns the snapshot's per-column encodings into one *unfitted*
`ColumnTransformer` that is always placed inside one sklearn `Pipeline` with the estimator, so every fit — each inner
fold, the calibration fold, the finalist refit, each baseline — learns its imputers, scalers, vocabularies and target
encodings from that fit's own training rows only. The whole fitted predictor is the `ps-predictor/v2` artifact, and
`/predict` only **applies** it, never re-fits. That fit-inside / apply-everywhere split prevents train/serve skew and is
locked down by `src/python/tests/test_encoding.py`.

Models trained before Prediction Units keep scoring through the earlier fit-once split: `impute`, `standardize`,
`onehot` and `bin` were fit once at the retired `/train` route and returned as `fitted_preprocessing`, and `/predict`
applies those frozen parameters (`src/python/tests/test_preprocessing_golden.py`).

## Remote / scaled deployment (optional)

Managed in-process spawn is the default and needs no extra infrastructure. For a
scaled or isolated deployment, run the bundled service yourself (any process
manager / host) and point MJAPI at it via `PREDICTIVE_STUDIO_SIDECAR_URL` — then
`MLSidecar` connects to that URL instead of spawning a child process.

## Tests

* `src/python/tests/test_trainer_route.py`, `test_trainer_contract.py` and `test_trainer_algorithms.py` — the `/trainer`
  route, its request/response contract and each algorithm through the trainer.
* `src/python/tests/test_train_predict.py` — `/predict` over legacy envelopes for **each algorithm** (built from a
  synthetic `make_classification` / `make_regression` fixture), via both the artifact and the warm-cache `model_id`.
* `src/python/tests/test_encoding.py` and `test_preprocessing_golden.py` — the anti-skew tests (in-fold encoding;
  fit-once preprocessing of models trained before Prediction Units).
* `src/__tests__/ml-sidecar.test.ts` — TypeScript unit tests (spawn + HTTP mocked, no
  live process).

## How it fits the whole

```
predictive-studio-core  → the /trainer + /predict contract (TrainerRequest, PredictRequest, …)
        │ implemented by
this package (MLSidecar) → TS wrapper + bundled Python FastAPI service (app/main.py)
        │ used by
predictive-studio (Engine) → MJSidecarTrainer (training) · MJSidecarPredictor (scoring)
```

MJ (TypeScript) assembles the feature matrix and orchestrates; this sidecar does the
CPU-bound protocol-driven **training** (`/trainer`) and **inference** (`/predict`). The
in-fold encoding (§ "The anti-skew core" above) and the warm LRU model cache are what let
the engine train in seconds-to-minutes and serve interactive single-record scores fast.
