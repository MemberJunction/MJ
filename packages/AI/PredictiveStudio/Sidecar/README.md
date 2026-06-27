# @memberjunction/predictive-studio-sidecar

> A self-managing TypeScript wrapper for Predictive Studio's **Python ML sidecar** — `new MLSidecar(); await s.start()` and you have a live training/inference service. **No Docker required.**

**What** — `MLSidecar`, a TypeScript class fronting a CPU-only FastAPI service (bundled in `src/python/`) that **trains** and **serves** tabular ML models over the contract defined in [`@memberjunction/predictive-studio-core`](../Core/src/sidecar-contract.ts).

**Why** — Node is poor at ML training; Python is excellent. So MJ (TypeScript) assembles the feature matrix and orchestrates, and this sidecar does the CPU-bound **fitting** (`/train`) and **inference** (`/predict`). Keeping it self-managing means a developer needs zero infrastructure to train a model locally.

**How it fits** — it follows the [`@memberjunction/sqlglot-ts`](../../../SQLGlotTS) pattern: the Python microservice is **bundled** and `MLSidecar` spawns it as a child process on demand. **Managed spawn is the default and needs no Docker** — it just works once the bundled venv exists (`npm run setup:python`). A remote/containerized topology is opt-in, not a prerequisite.

For the full architecture, read the
**[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)** (§2 covers this package); for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Two topologies

| Mode | When | What `start()` does |
|------|------|---------------------|
| **Managed** (default) | nothing configured | Spawns the bundled FastAPI service on `127.0.0.1` with an **ephemeral port**, reads `PREDICTIVE_STUDIO_SIDECAR_PORT=<n>` from its stdout, polls `/health` until ready, registers SIGINT/SIGTERM/exit cleanup. |
| **Remote** | `url` option **or** `PREDICTIVE_STUDIO_SIDECAR_URL` env set | Connects only — no child process — and just verifies `/health`. Use for a containerized/scaled sidecar. |

## Quick start (managed mode)

```ts
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

const s = new MLSidecar();          // managed mode by default
await s.start();                    // spawns the bundled Python service

const trained = await s.train({
  algorithm: 'xgboost',
  problem_type: 'classification',
  hyperparameters: {},
  validation: { strategy: 'train_test_split', test_size: 0.25 },
  feature_schema: [{ Name: 'x0', Kind: 'numeric' }, { Name: 'x1', Kind: 'numeric' }],
  preprocessing: [{ op: 'standardize', cols: ['x0', 'x1'] }],
  target: 'label',
  data: { columns: ['x0', 'x1', 'label'], rows: [/* ... */] },
});

const { predictions } = await s.predict({
  artifact_b64: trained.artifact_b64,
  fitted_preprocessing: trained.fitted_preprocessing,
  feature_schema: [{ Name: 'x0', Kind: 'numeric' }, { Name: 'x1', Kind: 'numeric' }],
  rows: [{ x0: 1.2, x1: -0.4 }],
});

await s.stop();                     // shut the child down
```

### Remote mode

```ts
const s = new MLSidecar({ url: 'http://predictive-studio-sidecar:8000' });
await s.start();                    // just verifies /health — no spawn
// ... train / predict / health ...
// stop() is a no-op (this client never owned the process)
```

## `MLSidecar` API

```ts
new MLSidecar(options?: {
  url?: string;                 // remote-mode base URL (also via PREDICTIVE_STUDIO_SIDECAR_URL)
  pythonPath?: string;          // managed-mode interpreter; defaults to bundled .venv python, else python3
  startupTimeoutMs?: number;    // default 30000
  requestTimeoutMs?: number;    // default 300000 (training can be slow)
});

await s.start(): Promise<void>;                       // spawn (managed) or verify /health (remote)
await s.stop(): Promise<void>;                        // SIGTERM the child (no-op in remote mode)
await s.train(req: TrainRequest): Promise<TrainResponse>;
await s.predict(req: PredictRequest): Promise<PredictResponse>;
await s.health(): Promise<SidecarHealthResponse>;

s.IsRunning: boolean;   // remote always true; managed needs a live child
s.IsRemote:  boolean;
s.Port:      number | null;   // ephemeral port in managed mode, null in remote
```

`TrainRequest` / `TrainResponse` / `PredictRequest` / `PredictResponse` are imported
from `@memberjunction/predictive-studio-core` — import them from there, not from this
package.

## Setting up the bundled Python environment

The managed mode spawns a Python interpreter. Create the bundled venv + install the
pinned requirements once:

```bash
cd packages/AI/PredictiveStudio/Sidecar
npm run setup:python      # creates .venv and pip-installs src/python/requirements.txt
```

**macOS:** xgboost / lightgbm need an OpenMP runtime. Install it once:

```bash
brew install libomp
```

`MLSidecar` automatically appends `DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib`
to the spawn environment on `darwin`, so the venv finds libomp at runtime. On Linux
the OpenMP runtime is `libgomp1` (install via your distro's package manager).

If you prefer your own interpreter, pass `pythonPath` or set
`PREDICTIVE_STUDIO_SIDECAR_URL` and run the service yourself.

## Running the Python tests

```bash
npm run setup:python
npm run test:python       # runs pytest (19 tests) against the bundled venv
```

## The anti-skew core (why this exists)

Stateful transforms — `impute`, `standardize`, `onehot`, `bin` — are **fit once** at
`/train` and returned as `fitted_preprocessing`; `/predict` only **applies** those
frozen parameters, never re-fits. This fit-once / apply-everywhere split prevents
train/serve skew and is locked down by `src/python/tests/test_preprocessing_golden.py`.

## Remote / scaled deployment (optional)

Managed in-process spawn is the default and needs no extra infrastructure. For a
scaled or isolated deployment, run the bundled service yourself (any process
manager / host) and point MJAPI at it via `PREDICTIVE_STUDIO_SIDECAR_URL` — then
`MLSidecar` connects to that URL instead of spawning a child process.

## Tests

* `src/python/tests/test_train_predict.py` — trains + predicts **each algorithm** on
  a synthetic `make_classification` / `make_regression` fixture, asserts sane metrics,
  and round-trips `/predict` via both the artifact and the warm-cache `model_id`.
* `src/python/tests/test_preprocessing_golden.py` — the anti-skew golden tests.
* `src/__tests__/ml-sidecar.test.ts` — TypeScript unit tests (spawn + HTTP mocked, no
  live process).

## How it fits the whole

```
predictive-studio-core  → the /train + /predict contract (TrainRequest, PredictRequest, …)
        │ implemented by
this package (MLSidecar) → TS wrapper + bundled Python FastAPI service (app/main.py)
        │ used by
predictive-studio (Engine) → MJSidecarTrainer (training) · MJSidecarPredictor (scoring)
```

MJ (TypeScript) assembles the feature matrix and orchestrates; this sidecar does the
CPU-bound **fitting** (`/train`) and **inference** (`/predict`). The fit-once
preprocessing (§ "The anti-skew core" above) and the warm LRU model cache are what let
the engine train in seconds-to-minutes and serve interactive single-record scores fast.
