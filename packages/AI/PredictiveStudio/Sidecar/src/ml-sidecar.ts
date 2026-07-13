import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  TrainRequest,
  TrainResponse,
  PredictRequest,
  PredictResponse,
} from '@memberjunction/predictive-studio-core';

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
 * Error thrown when the sidecar responds with a non-2xx status. Carries the HTTP
 * status code and the raw response body so callers can inspect or surface the
 * sidecar's error detail.
 */
export class SidecarError extends Error {
  /** HTTP status code returned by the sidecar. */
  public readonly Status: number;
  /** Raw response body text (may be JSON or plain text). */
  public readonly Body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `Sidecar request failed with status ${status}: ${body}`);
    this.name = 'SidecarError';
    this.Status = status;
    this.Body = body;
  }
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
export class MLSidecar {
  /** Default per-request timeout (ms) — training can be slow. */
  public static readonly DefaultRequestTimeoutMs = 300_000;
  /** Default startup timeout (ms) for the managed Python process. */
  public static readonly DefaultStartupTimeoutMs = 30_000;

  private process: ChildProcess | null = null;
  private host = '127.0.0.1';
  private port: number | null = null;
  private readonly remoteUrl: string | null;
  private readonly pythonPath: string;
  private readonly serverPath: string;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private stopping = false;
  private cleanupRegistered = false;

  constructor(options?: MLSidecarOptions) {
    const url = options?.url ?? process.env.PREDICTIVE_STUDIO_SIDECAR_URL?.trim();
    this.remoteUrl = url && url.length > 0 ? url.replace(/\/+$/, '') : null;

    this.pythonPath = options?.pythonPath ?? resolveBundledPython() ?? 'python3';
    this.serverPath = DEFAULT_SERVER_PATH;
    this.startupTimeoutMs = options?.startupTimeoutMs ?? MLSidecar.DefaultStartupTimeoutMs;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? MLSidecar.DefaultRequestTimeoutMs;
  }

  /** Whether this client is in remote (connect-only) mode. */
  get IsRemote(): boolean {
    return this.remoteUrl !== null;
  }

  /** Whether the sidecar is reachable: remote always counts; managed needs a live child. */
  get IsRunning(): boolean {
    if (this.IsRemote) {
      return true;
    }
    return this.process !== null && this.port !== null && !this.stopping;
  }

  /** The port the managed Python service is listening on, or null (remote / not started). */
  get Port(): number | null {
    return this.port;
  }

  /**
   * Start the sidecar.
   * - Remote mode: verifies `/health` against the configured URL.
   * - Managed mode: spawns the Python service and resolves once it is ready.
   *
   * If already running, this is a no-op.
   */
  async start(): Promise<void> {
    if (this.IsRemote) {
      await this.waitForReady();
      return;
    }
    if (this.IsRunning) {
      return;
    }
    this.stopping = false;
    await this.spawnManaged();
  }

  private async spawnManaged(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.serverPath, '0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.buildSpawnEnv(),
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill('SIGKILL');
          reject(new Error(
            `predictive-studio-sidecar failed to start within ${this.startupTimeoutMs}ms. ` +
            `stderr: ${stderrBuffer.slice(0, 500)}`
          ));
        }
      }, this.startupTimeoutMs);

      proc.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const match = stdoutBuffer.match(/PREDICTIVE_STUDIO_SIDECAR_PORT=(\d+)/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.port = parseInt(match[1], 10);
          this.process = proc;
          this.registerCleanup();
          this.waitForReady()
            .then(() => resolve())
            .catch((err) => reject(err));
        }
      });

      proc.stderr!.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Failed to spawn Python process: ${err.message}`));
        }
      });

      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(
            `Python process exited with code ${code} before becoming ready. ` +
            `stderr: ${stderrBuffer.slice(0, 500)}`
          ));
        }
        if (this.process === proc) {
          this.process = null;
          this.port = null;
        }
      });
    });
  }

  /**
   * Build the spawn environment. On macOS, append libomp to `DYLD_LIBRARY_PATH`
   * so xgboost/lightgbm's OpenMP runtime loads from the keg-only Homebrew install.
   */
  private buildSpawnEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (process.platform === 'darwin') {
      const libompPath = '/opt/homebrew/opt/libomp/lib';
      env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
        ? `${libompPath}:${env.DYLD_LIBRARY_PATH}`
        : libompPath;
    }
    return env;
  }

  /**
   * Stop the managed Python service. Resolves once the process has exited. In
   * remote mode this is a no-op (the client never owned the process).
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }
    this.stopping = true;
    const proc = this.process;
    this.process = null;
    this.port = null;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill('SIGTERM');
    });
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
   * Score 1..N rows by POSTing the artifact + frozen preprocessing to `/predict`.
   * @throws {SidecarError} when the sidecar responds with a non-2xx status
   */
  async predict(req: PredictRequest): Promise<PredictResponse> {
    this.assertRunning();
    return this.httpPost<PredictRequest, PredictResponse>('/predict', req);
  }

  /**
   * Check sidecar liveness via `GET /health`.
   * @throws {SidecarError} when the sidecar responds with a non-2xx status
   */
  async health(): Promise<SidecarHealthResponse> {
    this.assertRunning();
    return this.httpGet<SidecarHealthResponse>('/health');
  }

  private assertRunning(): void {
    if (!this.IsRunning) {
      throw new Error('MLSidecar is not running. Call start() first.');
    }
  }

  /**
   * Poll `/health` until the server accepts requests, bounded by startupTimeoutMs.
   */
  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    const interval = 50;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        await this.httpGet<SidecarHealthResponse>('/health');
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await new Promise<void>((r) => setTimeout(r, interval));
      }
    }
    throw new Error(
      `predictive-studio-sidecar did not become ready within ${this.startupTimeoutMs}ms. ` +
      `last error: ${lastError}`
    );
  }

  private registerCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => {
      if (this.process) {
        this.process.kill('SIGTERM');
        this.process = null;
        this.port = null;
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  /** Resolve the request target — remote URL parts, or the managed host/port. */
  private requestTarget(): { protocol: 'http:' | 'https:'; hostname: string; port: number } {
    if (this.remoteUrl) {
      const parsed = new URL(this.remoteUrl);
      const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
      const port = parsed.port ? parseInt(parsed.port, 10) : protocol === 'https:' ? 443 : 80;
      return { protocol, hostname: parsed.hostname, port };
    }
    return { protocol: 'http:', hostname: this.host, port: this.port! };
  }

  private httpPost<TBody, TResult>(reqPath: string, body: TBody): Promise<TResult> {
    const data = JSON.stringify(body);
    const target = this.requestTarget();
    return new Promise<TResult>((resolve, reject) => {
      const req = http.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          path: reqPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
          timeout: this.requestTimeoutMs,
        },
        (res) => this.collectResponse<TResult>(res, reqPath, resolve, reject)
      );
      this.attachRequestHandlers(req, reqPath, reject);
      req.write(data);
      req.end();
    });
  }

  private httpGet<T>(reqPath: string): Promise<T> {
    const target = this.requestTarget();
    return new Promise<T>((resolve, reject) => {
      const req = http.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          path: reqPath,
          method: 'GET',
          timeout: this.requestTimeoutMs,
        },
        (res) => this.collectResponse<T>(res, reqPath, resolve, reject)
      );
      this.attachRequestHandlers(req, reqPath, reject);
      req.end();
    });
  }

  /** Buffer the response, mapping non-2xx to {@link SidecarError} and parsing JSON. */
  private collectResponse<T>(
    res: http.IncomingMessage,
    reqPath: string,
    resolve: (value: T) => void,
    reject: (reason: Error) => void,
  ): void {
    const status = res.statusCode ?? 0;
    let responseBody = '';
    res.on('data', (chunk: Buffer) => {
      responseBody += chunk.toString();
    });
    res.on('end', () => {
      if (status < 200 || status >= 300) {
        reject(new SidecarError(status, responseBody));
        return;
      }
      try {
        resolve(JSON.parse(responseBody) as T);
      } catch {
        reject(new Error(`Failed to parse response from ${reqPath}: ${responseBody.slice(0, 200)}`));
      }
    });
  }

  private attachRequestHandlers(
    req: http.ClientRequest,
    reqPath: string,
    reject: (reason: Error) => void,
  ): void {
    req.on('error', (err) => {
      reject(new Error(`HTTP request to predictive-studio-sidecar failed: ${err.message}`));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${reqPath} timed out after ${this.requestTimeoutMs}ms`));
    });
  }
}
