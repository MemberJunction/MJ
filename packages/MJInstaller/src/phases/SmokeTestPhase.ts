/**
 * Phase I — Smoke Test
 *
 * The final phase in the install pipeline. Starts MJAPI and Explorer as
 * background processes, verifies they become ready, then cleans up.
 * This confirms the install is functional end-to-end.
 *
 * Key behaviors:
 * - **Pre-check**: Verifies `mj_generatedentities` exists (MJAPI can't start without it).
 * - **Port detection**: Reads actual port numbers from project files (`.env`, `package.json`)
 *   rather than trusting installer config defaults.
 * - **Stdout-based readiness**: Watches process stdout for service-specific readiness markers
 *   (e.g., "Server ready at" for MJAPI, "Compiled successfully" for Explorer). Falls back to
 *   a single HTTP health check as confirmation.
 * - **Parallel startup**: Both services are started concurrently to minimize total wait time.
 * - **Error reporting**: On failure, the last 20 lines of captured output are included in the
 *   warning so users can diagnose what went wrong.
 * - **Port-based cleanup**: Kills processes by port number after verification, since
 *   on Windows `child.kill()` only terminates the shell, not turbo/node grandchildren.
 *
 * This phase is automatically skipped in `--fast` mode.
 *
 * @module phases/SmokeTestPhase
 * @see ProcessRunner — handles process spawning and port-based cleanup.
 * @see CodeGenPhase — produces the generated entities required by the pre-check.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner } from '../adapters/ProcessRunner.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

// ---------------------------------------------------------------------------
// Timeout constants
// ---------------------------------------------------------------------------

/** Maximum time to wait for MJAPI stdout readiness marker (ms). */
const API_READINESS_TIMEOUT = 120_000;
/** Maximum time to keep the MJAPI process alive — readiness + 30s buffer (ms). */
const API_PROCESS_TIMEOUT = 150_000;
/** Maximum time to wait for Explorer stdout readiness marker (ms). */
const EXPLORER_READINESS_TIMEOUT = 240_000;
/** Maximum time to keep the Explorer process alive — readiness + 30s buffer (ms). */
const EXPLORER_PROCESS_TIMEOUT = 270_000;

// ---------------------------------------------------------------------------
// Readiness patterns (from MJServer/src/index.ts and Angular CLI output)
// ---------------------------------------------------------------------------

/** Stdout patterns indicating MJAPI is ready. */
const API_READY_PATTERNS: RegExp[] = [/Server ready at/i];

/** Stdout patterns indicating Explorer dev server is ready. */
const EXPLORER_READY_PATTERNS: RegExp[] = [
  /Compiled successfully/i,
  /Application bundle generation complete/i,
  /Local:\s+http/i,
];

/** Stdout/stderr patterns indicating a fatal startup error (no point waiting). */
const FATAL_ERROR_PATTERNS: RegExp[] = [
  /EADDRINUSE/i,
  /Cannot find module/i,
  /FATAL ERROR/i,
  /Error: listen/i,
];

/** Maximum output lines to keep in the ring buffer for error reporting. */
const MAX_CAPTURED_LINES = 50;
/** Maximum output lines to include in failure diagnostics. */
const MAX_DIAGNOSTIC_LINES = 20;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * Input context for the smoke test phase.
 *
 * @see SmokeTestPhase.Run
 */
export interface SmokeTestContext {
  /** Absolute path to the repo root. */
  Dir: string;
  /** Current install config (used for API/Explorer port numbers). */
  Config: PartialInstallConfig;
  /** Event emitter for progress, warn, and log events. */
  Emitter: InstallerEventEmitter;
}

/**
 * Result of the smoke test phase.
 *
 * @see SmokeTestPhase.Run
 */
export interface SmokeTestResult {
  /** Whether MJAPI became ready within the timeout. */
  ApiRunning: boolean;
  /** Whether Explorer became ready within the timeout. */
  ExplorerRunning: boolean;
  /** The API URL that was verified (e.g., `"http://localhost:4000/"`). */
  ApiUrl: string;
  /** The Explorer URL that was verified (e.g., `"http://localhost:4201/"`). */
  ExplorerUrl: string;
}

// ---------------------------------------------------------------------------
// Internal interfaces
// ---------------------------------------------------------------------------

/** Result of readiness detection for a single service. */
interface ReadinessResult {
  Ready: boolean;
  Reason?: string;
  Output: string[];
}

/** Result of a single service verification. */
interface ServiceVerificationResult {
  Running: boolean;
  Output: string[];
  Reason?: string;
}

/** Detected port numbers from project files. */
interface DetectedPorts {
  ApiPort: number;
  ExplorerPort: number;
}

// ---------------------------------------------------------------------------
// ReadinessWatcher
// ---------------------------------------------------------------------------

/**
 * Watches process stdout/stderr for readiness or fatal-error patterns.
 *
 * Resolves its {@link Promise} with `{ Ready: true }` when a readiness pattern
 * matches, or `{ Ready: false, Reason }` when a fatal error is detected, the
 * process exits prematurely, or the timeout expires.
 */
class ReadinessWatcher {
  private resolvePromise!: (result: ReadinessResult) => void;
  readonly Promise: Promise<ReadinessResult>;
  private settled = false;
  private capturedOutput: string[] = [];
  private readonly timeoutMs: number;

  constructor(
    private readyPatterns: RegExp[],
    private fatalPatterns: RegExp[],
    timeoutMs: number
  ) {
    this.timeoutMs = timeoutMs;
    this.Promise = new Promise<ReadinessResult>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  /** Feed a line of stdout to check against readiness/fatal patterns. */
  OnStdout(line: string): void {
    this.pushLine(line);
    if (this.settled) return;

    if (this.matchesAny(line, this.readyPatterns)) {
      this.settle({ Ready: true, Output: this.capturedOutput });
      return;
    }
    this.checkFatal(line);
  }

  /** Feed a line of stderr. */
  OnStderr(line: string): void {
    this.pushLine(`[stderr] ${line}`);
    if (this.settled) return;
    this.checkFatal(line);
  }

  /** Called when the process exits before readiness is detected. */
  OnProcessExit(exitCode: number): void {
    if (this.settled) return;
    this.settle({
      Ready: false,
      Reason: `Process exited with code ${exitCode} before becoming ready`,
      Output: this.capturedOutput,
    });
  }

  /** Called when the readiness timeout expires. */
  OnTimeout(): void {
    if (this.settled) return;
    this.settle({
      Ready: false,
      Reason: `Readiness timeout (${Math.round(this.timeoutMs / 1000)}s) expired`,
      Output: this.capturedOutput,
    });
  }

  /** Get a copy of all captured output. */
  GetCapturedOutput(): string[] {
    return [...this.capturedOutput];
  }

  private settle(result: ReadinessResult): void {
    this.settled = true;
    this.resolvePromise(result);
  }

  private pushLine(line: string): void {
    this.capturedOutput.push(line);
    if (this.capturedOutput.length > MAX_CAPTURED_LINES) {
      this.capturedOutput.shift();
    }
  }

  private checkFatal(line: string): void {
    if (this.matchesAny(line, this.fatalPatterns)) {
      this.settle({
        Ready: false,
        Reason: `Fatal error detected: ${line.trim()}`,
        Output: this.capturedOutput,
      });
    }
  }

  private matchesAny(line: string, patterns: RegExp[]): boolean {
    return patterns.some((p) => p.test(line));
  }
}

// ---------------------------------------------------------------------------
// SmokeTestPhase
// ---------------------------------------------------------------------------

/**
 * Phase I — Starts MJAPI and Explorer in parallel, detects readiness via
 * stdout markers, confirms with HTTP, then cleans up.
 *
 * @example
 * ```typescript
 * const smokeTest = new SmokeTestPhase();
 * const result = await smokeTest.Run({
 *   Dir: '/path/to/install',
 *   Config: { APIPort: 4000, ExplorerPort: 4200 },
 *   Emitter: emitter,
 * });
 * if (result.ApiRunning && result.ExplorerRunning) {
 *   console.log('Smoke test passed!');
 * }
 * ```
 */
export class SmokeTestPhase {
  private processRunner = new ProcessRunner();
  private fileSystem = new FileSystemAdapter();

  /**
   * Execute the smoke test phase: pre-check, detect ports, start services
   * in parallel, verify readiness, clean up.
   *
   * @param context - Smoke test input with directory, config, and emitter.
   * @returns Health check results for MJAPI and Explorer.
   * @throws {InstallerError} With code `MISSING_GENERATED_ENTITIES` if the pre-check fails.
   */
  async Run(context: SmokeTestContext): Promise<SmokeTestResult> {
    const { Config: config, Emitter: emitter } = context;

    // Pre-check: verify generated entities exist
    await this.preCheck(context.Dir, emitter);

    // Detect actual ports from project files
    const ports = await this.detectServicePorts(context.Dir, config, emitter);
    const apiUrl = `http://localhost:${ports.ApiPort}/`;
    const explorerUrl = `http://localhost:${ports.ExplorerPort}/`;

    // Start both services in parallel
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'smoke_test',
      Message: 'Starting MJAPI and Explorer in parallel...',
    });

    const [apiResult, explorerResult] = await Promise.all([
      this.verifyService(
        context.Dir, 'npm', ['run', 'start:api'],
        apiUrl, 'MJAPI',
        API_READINESS_TIMEOUT, API_PROCESS_TIMEOUT,
        API_READY_PATTERNS, emitter
      ),
      this.verifyService(
        context.Dir, 'npm', ['run', 'start:explorer'],
        explorerUrl, 'Explorer',
        EXPLORER_READINESS_TIMEOUT, EXPLORER_PROCESS_TIMEOUT,
        EXPLORER_READY_PATTERNS, emitter
      ),
    ]);

    // Report failures with diagnostic output
    if (!apiResult.Running) {
      this.reportServiceFailure('MJAPI', apiResult, emitter);
    }
    if (!explorerResult.Running) {
      this.reportServiceFailure('Explorer', explorerResult, emitter);
    }

    // Clean up all processes by port
    this.cleanupServices(ports.ApiPort, ports.ExplorerPort, emitter);

    // Summary
    if (apiResult.Running && explorerResult.Running) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Smoke test passed. Services verified:\n  MJAPI:    ${apiUrl}\n  Explorer: ${explorerUrl}`,
      });
    }

    return {
      ApiRunning: apiResult.Running,
      ExplorerRunning: explorerResult.Running,
      ApiUrl: apiUrl,
      ExplorerUrl: explorerUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // Pre-check
  // ---------------------------------------------------------------------------

  private async preCheck(dir: string, emitter: InstallerEventEmitter): Promise<void> {
    const genEntitiesPath = path.join(dir, 'node_modules', 'mj_generatedentities');
    const exists = await this.fileSystem.DirectoryExists(genEntitiesPath);

    if (!exists) {
      const altPath = path.join(dir, 'GeneratedEntities');
      const altExists = await this.fileSystem.DirectoryExists(altPath);

      if (!altExists) {
        throw new InstallerError(
          'smoke_test',
          'MISSING_GENERATED_ENTITIES',
          'mj_generatedentities not found. MJAPI cannot start without generated entities.',
          'Run "mj codegen" to generate entity artifacts, then re-run the installer.'
        );
      }
    }

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'smoke_test',
      Message: 'Pre-check passed: generated entities found.',
    });
  }

  // ---------------------------------------------------------------------------
  // Port detection
  // ---------------------------------------------------------------------------

  /**
   * Detect actual service ports by reading project files.
   *
   * - MJAPI: reads `.env` for `GRAPHQL_PORT` (primary), `PORT` (fallback).
   * - Explorer: reads `MJExplorer/package.json` start script for `--port`.
   * - Falls back to config values, then hardcoded defaults.
   */
  private async detectServicePorts(
    dir: string,
    config: PartialInstallConfig,
    emitter: InstallerEventEmitter
  ): Promise<DetectedPorts> {
    const apiPort = await this.detectApiPort(dir, config);
    const explorerPort = await this.detectExplorerPort(dir, config);

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Detected ports — MJAPI: ${apiPort}, Explorer: ${explorerPort}`,
    });

    return { ApiPort: apiPort, ExplorerPort: explorerPort };
  }

  private async detectApiPort(dir: string, config: PartialInstallConfig): Promise<number> {
    const envPaths = [
      path.join(dir, 'packages', 'MJAPI', '.env'),
      path.join(dir, '.env'),
    ];

    for (const envPath of envPaths) {
      try {
        if (await this.fileSystem.FileExists(envPath)) {
          const content = await this.fileSystem.ReadText(envPath);

          // Primary: GRAPHQL_PORT (what MJServer actually reads)
          const graphqlMatch = content.match(/^GRAPHQL_PORT\s*=\s*(\d+)/m);
          if (graphqlMatch) return parseInt(graphqlMatch[1], 10);

          // Fallback: PORT (legacy variable name)
          const portMatch = content.match(/^PORT\s*=\s*(\d+)/m);
          if (portMatch) return parseInt(portMatch[1], 10);
        }
      } catch {
        // File read failed, try next path
      }
    }

    return config.APIPort ?? 4000;
  }

  private async detectExplorerPort(dir: string, config: PartialInstallConfig): Promise<number> {
    const pkgJsonPath = path.join(dir, 'packages', 'MJExplorer', 'package.json');
    try {
      if (await this.fileSystem.FileExists(pkgJsonPath)) {
        const content = await this.fileSystem.ReadText(pkgJsonPath);
        const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
        const startScript = pkg.scripts?.start ?? '';
        const match = startScript.match(/--port\s+(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    } catch {
      // File read or parse failed, fall through
    }

    return config.ExplorerPort ?? 4200;
  }

  // ---------------------------------------------------------------------------
  // Service verification
  // ---------------------------------------------------------------------------

  private async verifyService(
    dir: string,
    command: string,
    args: string[],
    url: string,
    label: string,
    readinessTimeoutMs: number,
    processTimeoutMs: number,
    readyPatterns: RegExp[],
    emitter: InstallerEventEmitter
  ): Promise<ServiceVerificationResult> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'smoke_test',
      Message: `Starting ${label}...`,
    });

    const watcher = new ReadinessWatcher(readyPatterns, FATAL_ERROR_PATTERNS, readinessTimeoutMs);

    // Readiness timeout — separate from process lifetime timeout
    const readinessTimer = setTimeout(() => watcher.OnTimeout(), readinessTimeoutMs);

    // Start the service in the background
    const processPromise = this.processRunner.Run(command, args, {
      Cwd: dir,
      TimeoutMs: processTimeoutMs,
      OnStdout: (line: string) => {
        watcher.OnStdout(line);
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'smoke_test',
          Message: `[${label}] ${line.trim()}`,
        });
      },
      OnStderr: (line: string) => {
        watcher.OnStderr(line);
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[${label}:stderr] ${line.trim()}`,
        });
      },
    });

    // When the process exits, notify the watcher (handles early crashes)
    processPromise
      .then((result) => watcher.OnProcessExit(result.ExitCode))
      .catch(() => watcher.OnProcessExit(1));

    // Wait for readiness via stdout
    const readinessResult = await watcher.Promise;
    clearTimeout(readinessTimer);

    if (readinessResult.Ready) {
      // Confirm with a single HTTP health check
      const httpOk = await this.singleHealthCheck(url);
      if (httpOk) {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'info',
          Message: `${label} is ready at ${url} (stdout + HTTP confirmed).`,
        });
      } else {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'info',
          Message: `${label} stdout indicates ready but HTTP not responding. Treating as ready.`,
        });
      }

      // Suppress unhandled rejection from the background process
      processPromise.catch(() => { /* expected: process killed after smoke test */ });

      return { Running: true, Output: watcher.GetCapturedOutput() };
    }

    // Not ready — wait for the process to finish before returning
    processPromise.catch(() => { /* suppress */ });

    return {
      Running: false,
      Output: watcher.GetCapturedOutput(),
      Reason: readinessResult.Reason,
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP health check (single attempt, not polling)
  // ---------------------------------------------------------------------------

  /**
   * Single HTTP health check. Uses `127.0.0.1` instead of `localhost` to
   * avoid IPv6 resolution issues on Windows.
   */
  private async singleHealthCheck(url: string): Promise<boolean> {
    const healthUrl = url.replace('localhost', '127.0.0.1');
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status < 500;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Error reporting
  // ---------------------------------------------------------------------------

  private reportServiceFailure(
    label: string,
    result: ServiceVerificationResult,
    emitter: InstallerEventEmitter
  ): void {
    const tailLines = result.Output.slice(-MAX_DIAGNOSTIC_LINES);
    const outputSnippet = tailLines.length > 0
      ? `\nLast ${tailLines.length} lines of output:\n${tailLines.map((l) => `  ${l.trim()}`).join('\n')}`
      : '\n(No output captured)';

    emitter.Emit('warn', {
      Type: 'warn',
      Phase: 'smoke_test',
      Message: `${label} failed to start.${result.Reason ? ` Reason: ${result.Reason}` : ''}${outputSnippet}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Kill any processes still listening on the smoke test ports.
   * Without this, turbo/node processes survive the parent shell being killed
   * and block future starts with EADDRINUSE.
   */
  private cleanupServices(apiPort: number, explorerPort: number, emitter: InstallerEventEmitter): void {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'smoke_test',
      Message: 'Cleaning up smoke test processes...',
    });

    this.processRunner.killByPort(apiPort);
    this.processRunner.killByPort(explorerPort);
  }
}
