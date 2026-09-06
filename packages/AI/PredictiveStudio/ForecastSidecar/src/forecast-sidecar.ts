import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ForecastRequest,
  ForecastResponse,
  ForecastHealthResponse,
} from '@memberjunction/predictive-studio-core';
import { ManagedPythonSidecar } from '@memberjunction/predictive-studio-sidecar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Constructor options for {@link ForecastSidecar}. */
export interface ForecastSidecarOptions {
  /**
   * Base URL of an already-running forecast sidecar. When provided — or when
   * `PREDICTIVE_STUDIO_FORECAST_URL` is set — the client runs in **remote mode**: it connects only
   * and never spawns a child process. This is the mode for population-scale work, where the model
   * wants a long-lived process with the weights already resident.
   */
  url?: string;
  /**
   * Python executable for **managed mode**. Defaults to this package's bundled venv python, which
   * is where torch and timesfm are installed — the tabular sidecar's venv deliberately has neither.
   */
  pythonPath?: string;
  /**
   * Startup timeout in ms. Generous by default: a cold start loads ~800MB of weights, and on a
   * host that has not staged them it downloads first.
   */
  startupTimeoutMs?: number;
  /** Per-request timeout in ms. */
  requestTimeoutMs?: number;
}

/** Locate `server.py`, whether running from `dist/` or from `src/` under vitest/tsx. */
function resolveServerPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'src', 'python', 'server.py'),
    path.resolve(__dirname, 'python', 'server.py'),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

/** Locate this package's own venv python — the one that has torch and timesfm. */
function resolveBundledPython(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', '.venv', 'bin', 'python'),
    path.resolve(__dirname, '..', '.venv', 'bin', 'python'),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

const DEFAULT_SERVER_PATH = resolveServerPath();

/**
 * Client for the forecast sidecar: quantile forecasts for a batch of series.
 *
 * There is no `train()`. TimesFM is zero-shot — MJ calls it, it does not learn from client data —
 * which is why a forecast is an `MJ: AI Models` capability rather than an `MJ: ML Models` row.
 *
 * @example
 * ```ts
 * const fc = new ForecastSidecar();
 * await fc.start();
 * const out = await fc.forecast({ Series: [{ Key: 'm1', Context: history }], Horizon: 12 });
 * await fc.stop();
 * ```
 */
export class ForecastSidecar extends ManagedPythonSidecar {
  /** Cold start loads (and may download) ~800MB of weights, so this is deliberately generous. */
  public static readonly DefaultStartupTimeoutMs = 300_000;
  /** A batch of series on CPU runs seconds-per-series, not milliseconds. */
  public static readonly DefaultRequestTimeoutMs = 600_000;

  constructor(options?: ForecastSidecarOptions) {
    const url = options?.url ?? process.env.PREDICTIVE_STUDIO_FORECAST_URL?.trim();
    super({
      serviceName: 'predictive-studio-forecast-sidecar',
      serverPath: DEFAULT_SERVER_PATH,
      pythonPath: options?.pythonPath ?? resolveBundledPython() ?? 'python3',
      // Its own variable name, so two sidecars spawned side by side can never read each other's port.
      portPattern: /PREDICTIVE_STUDIO_FORECAST_PORT=(\d+)/,
      remoteUrl: url && url.length > 0 ? url.replace(/\/+$/, '') : null,
      startupTimeoutMs: options?.startupTimeoutMs ?? ForecastSidecar.DefaultStartupTimeoutMs,
      requestTimeoutMs: options?.requestTimeoutMs ?? ForecastSidecar.DefaultRequestTimeoutMs,
    });
  }

  /**
   * Forecast a batch of series.
   *
   * A series the model should not be asked about comes back with `Refused` set and null values —
   * the caller decides what that means for its feature rather than receiving an invented band.
   */
  public async forecast(req: ForecastRequest): Promise<ForecastResponse> {
    this.assertRunning();
    return this.httpPost<ForecastRequest, ForecastResponse>('/forecast', req);
  }

  /** Liveness, plus whether this process can actually load the model. */
  public async health(): Promise<ForecastHealthResponse> {
    this.assertRunning();
    return this.httpGet<ForecastHealthResponse>('/health');
  }
}
