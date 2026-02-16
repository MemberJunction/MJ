/**
 * Phase I — Smoke Test
 *
 * Starts MJAPI and Explorer, verifies they respond to HTTP,
 * then lets them terminate. This confirms the install is functional.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner } from '../adapters/ProcessRunner.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

/** How long to wait for MJAPI to start (ms) */
const API_STARTUP_TIMEOUT = 120_000;
/** How long to wait for Explorer to start (ms) */
const EXPLORER_STARTUP_TIMEOUT = 210_000;
/** Interval between HTTP health checks (ms) */
const HEALTH_CHECK_INTERVAL = 5_000;
/** Max retries for HTTP health checks */
const MAX_HEALTH_RETRIES = 24;

export interface SmokeTestContext {
  /** Target directory (repo root) */
  Dir: string;
  /** Current install config */
  Config: PartialInstallConfig;
  Emitter: InstallerEventEmitter;
}

export interface SmokeTestResult {
  /** Whether MJAPI responded */
  ApiRunning: boolean;
  /** Whether Explorer responded */
  ExplorerRunning: boolean;
  /** API URL that was verified */
  ApiUrl: string;
  /** Explorer URL that was verified */
  ExplorerUrl: string;
}

export class SmokeTestPhase {
  private processRunner = new ProcessRunner();
  private fileSystem = new FileSystemAdapter();

  async Run(context: SmokeTestContext): Promise<SmokeTestResult> {
    const { Config: config, Emitter: emitter } = context;
    const apiPort = config.APIPort ?? 4000;
    const explorerPort = config.ExplorerPort ?? 4200;
    const apiUrl = `http://localhost:${apiPort}/`;
    const explorerUrl = `http://localhost:${explorerPort}/`;

    // Pre-check: verify generated entities exist
    await this.preCheck(context.Dir, emitter);

    // Step 1: Start and verify MJAPI
    const apiRunning = await this.verifyService(
      context.Dir,
      'npm',
      ['run', 'start:api'],
      apiUrl,
      apiPort,
      'MJAPI',
      API_STARTUP_TIMEOUT,
      emitter
    );

    // Step 2: Start and verify Explorer
    const explorerRunning = await this.verifyService(
      context.Dir,
      'npm',
      ['run', 'start:explorer'],
      explorerUrl,
      explorerPort,
      'Explorer',
      EXPLORER_STARTUP_TIMEOUT,
      emitter
    );

    // Clean up: kill all processes we started so they don't remain as orphans.
    // On Windows, shell-spawned processes (npm → turbo → node) aren't killed
    // by child.kill() — only the top-level cmd.exe shell dies. Port-based
    // cleanup ensures the actual service processes are terminated.
    this.cleanupServices(apiPort, explorerPort, emitter);

    // Summary
    if (apiRunning && explorerRunning) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Smoke test passed. Services verified:\n  MJAPI:    ${apiUrl}\n  Explorer: ${explorerUrl}`,
      });
    }

    return {
      ApiRunning: apiRunning,
      ExplorerRunning: explorerRunning,
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
      // Also check GeneratedEntities at root
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
  // Service verification
  // ---------------------------------------------------------------------------

  private async verifyService(
    dir: string,
    command: string,
    args: string[],
    url: string,
    port: number,
    label: string,
    timeoutMs: number,
    emitter: InstallerEventEmitter
  ): Promise<boolean> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'smoke_test',
      Message: `Starting ${label}...`,
    });

    // Start the service in the background
    const processPromise = this.processRunner.Run(command, args, {
      Cwd: dir,
      TimeoutMs: timeoutMs,
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'smoke_test',
          Message: `[${label}] ${line.trim()}`,
        });
      },
      OnStderr: (line: string) => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[${label}:stderr] ${line.trim()}`,
        });
      },
    });

    // Wait for the service to become healthy
    const healthy = await this.waitForHealth(url, label, timeoutMs, emitter);

    if (!healthy) {
      // The process may still be running — it will be killed by timeout
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'smoke_test',
        Message: `${label} did not respond to health checks within ${Math.round(timeoutMs / 1000)}s.`,
      });

      // Wait for the process to finish (it will be killed by timeout)
      await processPromise;
      return false;
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `${label} is running at ${url}`,
    });

    // Don't await the process — we've confirmed it's healthy.
    // The process will be killed when the timeout fires or the parent exits.
    // We use a detached approach: we don't need the process to keep running.
    // Let the timeout kill it.
    processPromise.catch(() => {
      // Expected: process killed after smoke test
    });

    return true;
  }

  private async waitForHealth(
    url: string,
    label: string,
    timeoutMs: number,
    emitter: InstallerEventEmitter
  ): Promise<boolean> {
    const maxRetries = Math.min(MAX_HEALTH_RETRIES, Math.floor(timeoutMs / HEALTH_CHECK_INTERVAL));

    // On Windows, "localhost" may resolve to ::1 (IPv6) while the server
    // binds to 0.0.0.0 (IPv4 only). Use 127.0.0.1 for reliable connectivity.
    const healthUrl = url.replace('localhost', '127.0.0.1');

    for (let i = 0; i < maxRetries; i++) {
      await this.sleep(HEALTH_CHECK_INTERVAL);

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'smoke_test',
        Message: `Checking ${label} health (attempt ${i + 1}/${maxRetries})...`,
      });

      try {
        const response = await fetch(healthUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok || response.status < 500) {
          return true;
        }
      } catch {
        // Service not ready yet, continue waiting
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
