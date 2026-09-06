import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  TrainRequest,
  TrainResponse,
  PredictRequest,
  PredictResponse,
  DescribeRequest,
  DescribeResponse,
} from '@memberjunction/predictive-studio-core';
import { ManagedPythonSidecar, SidecarError } from './managed-python-sidecar.js';

// The process/transport machinery lives in ManagedPythonSidecar — it is shared verbatim with the
// forecast sidecar, which is a separate Python environment for the same reasons this one is.
export { SidecarError };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Health-check response shape returned by the sidecar's `GET /health` endpoint.
 */
export interface SidecarHealthResponse {
  /** Liveness/readiness status reported by the sidecar (e.g. `ok`). */
  status: string;
  /** Registered algorithm driver keys (present in the managed Python service). */
  algorithms?: string[];
  /** Warm model-cache depth (present in the managed Python service). */
  cached_models?: number;
}

/**
 * Constructor options for {@link MLSidecar}.
 */
export interface MLSidecarOptions {
  /**
   * Base URL of an already-running sidecar (e.g. `http://localhost:8000`). When
   * provided — or when `PREDICTIVE_STUDIO_SIDECAR_URL` is set — the client runs
   * in **remote mode**: it connects only and never spawns a child process.
   */
  url?: string;
  /**
   * Path to the Python executable used in **managed mode**. Defaults to the
   * package's bundled venv python (`…/Sidecar/.venv/bin/python`) when present,
   * otherwise `python3`.
   */
  pythonPath?: string;
  /** Startup timeout in ms (default: 30000). */
  startupTimeoutMs?: number;
  /** Per-request timeout in ms (default: 300000 — training can be slow). */
  requestTimeoutMs?: number;
}

/**
 * Resolve the Python launcher (`server.py`) path.
 * When running from dist/ the path is ../src/python/server.py
 * When running from src/ (e.g. vitest) the path is ./python/server.py
 */
function resolveServerPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'src', 'python', 'server.py'), // from dist/
    path.resolve(__dirname, 'python', 'server.py'),               // from src/ (vitest)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]; // fallback; fails at spawn time with a clear error
}

/**
 * Resolve the bundled venv python created by `npm run setup:python`, if it
 * exists. Both dist/ and src/ run from `…/Sidecar/{dist|src}/...`, so the venv
 * sits two directories up from this file's parent.
 */
function resolveBundledPython(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', '.venv', 'bin', 'python'), // from dist/ml-sidecar.js or src/ml-sidecar.ts
    path.resolve(__dirname, '..', '.venv', 'bin', 'python'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const DEFAULT_SERVER_PATH = resolveServerPath();

/**
 * Self-managing TypeScript client for the Predictive Studio Python ML sidecar.
 *
 * Two topologies, chosen automatically:
 *
 * - **Managed mode (default):** {@link start} spawns the bundled FastAPI service
 *   (`src/python/server.py`) on 127.0.0.1 with an ephemeral port, reads
 *   `PREDICTIVE_STUDIO_SIDECAR_PORT=<n>` from its stdout, polls `/health` until
 *   ready, and registers SIGINT/SIGTERM/exit cleanup. On macOS it injects
 *   `DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib` so xgboost/lightgbm load.
 * - **Remote mode:** when a `url` option is given OR
 *   `PREDICTIVE_STUDIO_SIDECAR_URL` is set, it connects only — no child process
 *   is spawned — and {@link start} just verifies `/health`.
 *
 * The request/response contract is owned by
 * `@memberjunction/predictive-studio-core`; this client adds no business logic.
 *
 * @example
 * ```ts
 * const s = new MLSidecar();
 * await s.start();
 * const trained = await s.train(trainRequest);
 * const predictions = await s.predict(predictRequest);
 * await s.stop();
 * ```
 */
export class MLSidecar extends ManagedPythonSidecar {
  /** Default per-request timeout (ms) — training can be slow. */
  public static readonly DefaultRequestTimeoutMs = 300_000;
  /** Default startup timeout (ms) for the managed Python process. */
  public static readonly DefaultStartupTimeoutMs = 30_000;

  constructor(options?: MLSidecarOptions) {
    const url = options?.url ?? process.env.PREDICTIVE_STUDIO_SIDECAR_URL?.trim();
    super({
      serviceName: 'predictive-studio-sidecar',
      serverPath: DEFAULT_SERVER_PATH,
      pythonPath: options?.pythonPath ?? resolveBundledPython() ?? 'python3',
      portPattern: /PREDICTIVE_STUDIO_SIDECAR_PORT=(\d+)/,
      remoteUrl: url && url.length > 0 ? url.replace(/\/+$/, '') : null,
      startupTimeoutMs: options?.startupTimeoutMs ?? MLSidecar.DefaultStartupTimeoutMs,
      requestTimeoutMs: options?.requestTimeoutMs ?? MLSidecar.DefaultRequestTimeoutMs,
    });
  }

  /**
   * Build the spawn environment. On macOS, append libomp to `DYLD_LIBRARY_PATH`
   * so xgboost/lightgbm's OpenMP runtime loads from the keg-only Homebrew install.
   */
  protected override buildSpawnEnv(): NodeJS.ProcessEnv {
    const env = super.buildSpawnEnv();
    if (process.platform === 'darwin') {
      const libompPath = '/opt/homebrew/opt/libomp/lib';
      env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${libompPath}:${env.DYLD_LIBRARY_PATH}` : libompPath;
    }
    return env;
  }

  /**
   * Train a model by POSTing the assembled feature matrix to `/train`.
   * @throws {SidecarError} when the sidecar responds with a non-2xx status
   */
  async train(req: TrainRequest): Promise<TrainResponse> {
    this.assertRunning();
    return this.httpPost<TrainRequest, TrainResponse>('/train', req);
  }

  /**
   * Score rows via `/predict`, applying the model's frozen preprocessing.
   * @throws {SidecarError} when the sidecar responds with a non-2xx status
   */
  async predict(req: PredictRequest): Promise<PredictResponse> {
    this.assertRunning();
    return this.httpPost<PredictRequest, PredictResponse>('/predict', req);
  }

  /**
   * Describe the training partition via `/describe` — the read-only statistics
   * pre-pass. Fits nothing and returns no artifact.
   * @throws {SidecarError} when the sidecar responds with a non-2xx status
   */
  async describe(req: DescribeRequest): Promise<DescribeResponse> {
    this.assertRunning();
    return this.httpPost<DescribeRequest, DescribeResponse>('/describe', req);
  }

  /**
   * Check sidecar liveness via `GET /health`.
   * @throws {SidecarError} when the sidecar responds with a non-2xx status
   */
  async health(): Promise<SidecarHealthResponse> {
    this.assertRunning();
    return this.httpGet<SidecarHealthResponse>('/health');
  }
}
