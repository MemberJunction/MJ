import { ChildProcess, spawn } from 'node:child_process';
import http from 'node:http';

/**
 * Error thrown when a sidecar responds with a non-2xx status. Carries the HTTP status code and the
 * raw response body so callers can inspect or surface the sidecar's error detail.
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

/** Everything a concrete sidecar client must tell the base about its service. */
export interface ManagedPythonSidecarConfig {
  /** Used verbatim in error messages, so a failure names which sidecar failed. */
  serviceName: string;
  /** Absolute path to the Python launcher script. */
  serverPath: string;
  /** Python executable for managed mode (a bundled venv python, or `python3`). */
  pythonPath: string;
  /**
   * Matches the launcher's port announcement on stdout, capturing the port in group 1. Each
   * sidecar announces under its own variable name so two services can never read each other's.
   */
  portPattern: RegExp;
  /** Base URL of an already-running instance, or null for managed mode. */
  remoteUrl: string | null;
  startupTimeoutMs: number;
  requestTimeoutMs: number;
}

/**
 * The process + transport half of a self-managing Python sidecar client: spawn on an ephemeral
 * port, read the port off stdout, poll `/health` until ready, register cleanup, and speak JSON
 * over HTTP — with a remote mode that connects to an already-running instance instead.
 *
 * Extracted because Predictive Studio runs TWO Python sidecars — the tabular one (scikit-learn,
 * xgboost, lightgbm) and the forecast one (torch + TimesFM) — which are separate processes with
 * separate environments for good reasons, but differ only in their endpoints. Everything here was
 * identical between them; only the request/response methods are not.
 *
 * Subclasses add their endpoints on top of {@link httpPost} / {@link httpGet}, and may override
 * {@link buildSpawnEnv} when their runtime needs environment help.
 */
export abstract class ManagedPythonSidecar {
  private process: ChildProcess | null = null;
  private readonly host = '127.0.0.1';
  private port: number | null = null;
  private stopping = false;
  private cleanupRegistered = false;
  /**
   * In-flight spawn promise, so concurrent `start()` callers await the SAME spawn instead of each
   * racing `IsRunning` (false until the port is announced) and forking a second Python process.
   * Cleared once the spawn settles, so a `start()` after a failure spawns fresh rather than
   * replaying a rejected promise.
   */
  private startPromise: Promise<void> | null = null;

  protected constructor(protected readonly config: ManagedPythonSidecarConfig) {}

  /** Whether this client is in remote (connect-only) mode. */
  public get IsRemote(): boolean {
    return this.config.remoteUrl !== null;
  }

  /** Whether the sidecar is reachable: remote always counts; managed needs a live child. */
  public get IsRunning(): boolean {
    if (this.IsRemote) return true;
    return this.process !== null && this.port !== null && !this.stopping;
  }

  /** The port the managed Python service is listening on, or null (remote / not started). */
  public get Port(): number | null {
    return this.port;
  }

  /**
   * Start the sidecar. Remote mode verifies `/health`; managed mode spawns the Python service and
   * resolves once it is ready. A no-op when already running.
   */
  public async start(): Promise<void> {
    if (this.IsRemote) {
      await this.waitForReady();
      return;
    }
    if (this.IsRunning) return;
    if (this.startPromise) return this.startPromise;
    this.stopping = false;
    this.startPromise = this.spawnManaged().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /** Stop the managed process. Resolves once it has exited; a no-op in remote mode. */
  public async stop(): Promise<void> {
    if (!this.process) return;
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
   * Environment for the spawned process. Override to add what a specific runtime needs; the
   * default is the parent environment unchanged.
   */
  protected buildSpawnEnv(): NodeJS.ProcessEnv {
    return { ...process.env };
  }

  protected assertRunning(): void {
    if (!this.IsRunning) {
      throw new Error(`${this.config.serviceName} is not running. Call start() first.`);
    }
  }

  private async spawnManaged(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.config.pythonPath, [this.config.serverPath, '0'], {
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
          reject(
            new Error(
              `${this.config.serviceName} failed to start within ${this.config.startupTimeoutMs}ms. ` +
                `stderr: ${stderrBuffer.slice(0, 500)}`,
            ),
          );
        }
      }, this.config.startupTimeoutMs);

      proc.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const match = stdoutBuffer.match(this.config.portPattern);
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
          reject(
            new Error(
              `Python process exited with code ${code} before becoming ready. ` +
                `stderr: ${stderrBuffer.slice(0, 500)}`,
            ),
          );
        }
        if (this.process === proc) {
          this.process = null;
          this.port = null;
        }
      });
    });
  }

  /** Poll `/health` until the server accepts requests, bounded by the startup timeout. */
  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + this.config.startupTimeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        await this.httpGet<unknown>('/health');
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await new Promise<void>((r) => setTimeout(r, 50));
      }
    }
    throw new Error(
      `${this.config.serviceName} did not become ready within ${this.config.startupTimeoutMs}ms. last error: ${lastError}`,
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
    if (this.config.remoteUrl) {
      const parsed = new URL(this.config.remoteUrl);
      const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
      const port = parsed.port ? parseInt(parsed.port, 10) : protocol === 'https:' ? 443 : 80;
      return { protocol, hostname: parsed.hostname, port };
    }
    return { protocol: 'http:', hostname: this.host, port: this.port! };
  }

  protected httpPost<TBody, TResult>(reqPath: string, body: TBody): Promise<TResult> {
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
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
          timeout: this.config.requestTimeoutMs,
        },
        (res) => this.collectResponse<TResult>(res, reqPath, resolve, reject),
      );
      this.attachRequestHandlers(req, reqPath, reject);
      req.write(data);
      req.end();
    });
  }

  protected httpGet<T>(reqPath: string): Promise<T> {
    const target = this.requestTarget();
    return new Promise<T>((resolve, reject) => {
      const req = http.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          path: reqPath,
          method: 'GET',
          timeout: this.config.requestTimeoutMs,
        },
        (res) => this.collectResponse<T>(res, reqPath, resolve, reject),
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

  private attachRequestHandlers(req: http.ClientRequest, reqPath: string, reject: (reason: Error) => void): void {
    req.on('error', (err) => {
      reject(new Error(`HTTP request to ${this.config.serviceName} failed: ${err.message}`));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${reqPath} timed out after ${this.config.requestTimeoutMs}ms`));
    });
  }
}
