import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SqlGlotClientOptions,
  TranspileOptions,
  TranspileResult,
  ParseOptions,
  ParseResult,
  HealthStatus,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the Python server script path.
 * When running from dist/ the path is ../src/python/server.py
 * When running from src/ (e.g. vitest) the path is ./python/server.py
 */
function resolveServerPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'src', 'python', 'server.py'),  // from dist/
    path.resolve(__dirname, 'python', 'server.py'),                // from src/ (vitest)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]; // fallback; will fail at spawn time with a clear error
}

const DEFAULT_SERVER_PATH = resolveServerPath();

/**
 * TypeScript client for the sqlglot Python microservice.
 *
 * Spawns a Python FastAPI process on 127.0.0.1 with an ephemeral port,
 * then communicates via HTTP. The lifecycle methods `start()` and `stop()`
 * manage the child process. Cleanup handlers are registered for SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * const client = new SqlGlotClient();
 * await client.start();
 *
 * const result = await client.transpile({
 *   sql: "SELECT ISNULL(col, 0) FROM [dbo].[MyTable]",
 *   fromDialect: 'tsql',
 *   toDialect: 'postgres',
 * });
 * console.log(result.sql);
 *
 * await client.stop();
 * ```
 */
export class SqlGlotClient {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private readonly pythonPath: string;
  private readonly serverPath: string;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private stopping = false;
  private cleanupRegistered = false;

  constructor(options?: SqlGlotClientOptions) {
    this.pythonPath = options?.pythonPath ?? 'python3';
    this.serverPath = options?.serverPath ?? DEFAULT_SERVER_PATH;
    this.startupTimeoutMs = options?.startupTimeoutMs ?? 30000;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 60000;
  }

  /** Whether the Python microservice is currently running */
  get IsRunning(): boolean {
    return this.process !== null && this.port !== null && !this.stopping;
  }

  /** The port the Python microservice is listening on, or null if not running */
  get Port(): number | null {
    return this.port;
  }

  /**
   * Start the Python microservice. Resolves once the server is ready.
   * If already running, this is a no-op.
   */
  async start(): Promise<void> {
    if (this.IsRunning) {
      return;
    }
    this.stopping = false;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.serverPath, '0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill('SIGKILL');
          reject(new Error(
            `sqlglot-ts server failed to start within ${this.startupTimeoutMs}ms. ` +
            `stderr: ${stderrBuffer.slice(0, 500)}`
          ));
        }
      }, this.startupTimeoutMs);

      proc.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const match = stdoutBuffer.match(/SQLGLOT_PORT=(\d+)/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.port = parseInt(match[1], 10);
          this.process = proc;
          this.registerCleanup();
          // Wait for the server to be ready before resolving
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
        // If we were running and the process dies unexpectedly, clean up
        if (this.process === proc) {
          this.process = null;
          this.port = null;
        }
      });
    });
  }

  /**
   * Stop the Python microservice. Resolves once the process has exited.
   * If not running, this is a no-op.
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
   * Transpile SQL from one dialect to another.
   * All statements are transpiled together as a batch.
   */
  async transpile(sql: string, options: TranspileOptions): Promise<TranspileResult> {
    this.assertRunning();
    return this.httpPost<TranspileResult>('/transpile', {
      sql,
      from_dialect: options.fromDialect,
      to_dialect: options.toDialect,
      pretty: options.pretty ?? true,
      error_level: options.errorLevel ?? 'WARN',
    });
  }

  /**
   * Transpile SQL statement-by-statement.
   * Each statement is transpiled individually, so one failure doesn't block others.
   */
  async transpileStatements(sql: string, options: TranspileOptions): Promise<TranspileResult> {
    this.assertRunning();
    return this.httpPost<TranspileResult>('/transpile-statements', {
      sql,
      from_dialect: options.fromDialect,
      to_dialect: options.toDialect,
      pretty: options.pretty ?? true,
      error_level: options.errorLevel ?? 'WARN',
    });
  }

  /**
   * Parse SQL and return the AST as JSON.
   */
  async parse(sql: string, options: ParseOptions): Promise<ParseResult> {
    this.assertRunning();
    return this.httpPost<ParseResult>('/parse', {
      sql,
      dialect: options.dialect,
    });
  }

  /**
   * List all supported SQL dialects.
   */
  async getDialects(): Promise<string[]> {
    this.assertRunning();
    const result = await this.httpGet<{ dialects: string[] }>('/dialects');
    return result.dialects;
  }

  /**
   * Check server health and return status information.
   */
  async health(): Promise<HealthStatus> {
    this.assertRunning();
    const result = await this.httpGet<{
      status: string;
      sqlglot_version: string;
      service: string;
    }>('/health');
    return {
      status: result.status,
      sqlglotVersion: result.sqlglot_version,
      service: result.service,
      port: this.port!,
    };
  }

  private assertRunning(): void {
    if (!this.IsRunning) {
      throw new Error(
        'SqlGlotClient is not running. Call start() first.'
      );
    }
  }

  /**
   * Poll the health endpoint until the server is accepting requests.
   * Uses short intervals with an overall timeout from startupTimeoutMs.
   */
  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    const interval = 50;
    while (Date.now() < deadline) {
      try {
        await this.httpGet<{ status: string }>('/health');
        return; // Server is ready
      } catch {
        await new Promise<void>((r) => setTimeout(r, interval));
      }
    }
    throw new Error(`sqlglot-ts server did not become ready within ${this.startupTimeoutMs}ms`);
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

  private httpPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port!,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
          timeout: this.requestTimeoutMs,
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk: Buffer) => {
            responseBody += chunk.toString();
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(responseBody) as T;
              resolve(parsed);
            } catch {
              reject(new Error(`Failed to parse response: ${responseBody.slice(0, 200)}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new Error(`HTTP request to sqlglot server failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request to ${path} timed out after ${this.requestTimeoutMs}ms`));
      });

      req.write(data);
      req.end();
    });
  }

  private httpGet<T>(path: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port!,
          path,
          method: 'GET',
          timeout: this.requestTimeoutMs,
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk: Buffer) => {
            responseBody += chunk.toString();
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(responseBody) as T;
              resolve(parsed);
            } catch {
              reject(new Error(`Failed to parse response: ${responseBody.slice(0, 200)}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new Error(`HTTP request to sqlglot server failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request to ${path} timed out after ${this.requestTimeoutMs}ms`));
      });

      req.end();
    });
  }
}
