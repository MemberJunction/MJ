/**
 * Phase A — Preflight
 *
 * Catches predictable failures before downloading or modifying anything.
 * Checks: Node version, npm, disk space, ports, SQL connectivity, OS, write perms.
 */

import os from 'node:os';
import net from 'node:net';
import type { InstallerEventEmitter, DiagnosticEvent } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner } from '../adapters/ProcessRunner.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { SqlServerAdapter } from '../adapters/SqlServerAdapter.js';
import { Diagnostics, type DiagnosticCheck, type EnvironmentInfo } from '../models/Diagnostics.js';

/** Hard minimum Node version. Change this constant when MJ raises the floor. */
const MIN_NODE_VERSION = 22;
/** Recommended Node version (emits info diagnostic if not met). */
const RECOMMENDED_NODE_VERSION = 24;
/** Minimum free disk space in bytes (2 GB). */
const MIN_DISK_SPACE_BYTES = 2 * 1024 * 1024 * 1024;

export interface PreflightContext {
  TargetDir: string;
  Config: PartialInstallConfig;
  SkipDB: boolean;
  Emitter: InstallerEventEmitter;
}

export interface PreflightResult {
  Passed: boolean;
  Diagnostics: Diagnostics;
  DetectedOS: 'windows' | 'macos' | 'linux' | 'other';
}

export class PreflightPhase {
  private processRunner = new ProcessRunner();
  private fileSystem = new FileSystemAdapter();
  private sqlAdapter = new SqlServerAdapter();

  async Run(context: PreflightContext): Promise<PreflightResult> {
    const { Emitter: emitter } = context;
    const hardFailures: string[] = [];

    // Gather environment info
    const environment = await this.gatherEnvironment();
    const diagnostics = new Diagnostics(environment);
    const detectedOS = this.detectOS();

    // Run all checks
    emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking Node.js version...' });
    const nodeCheck = await this.checkNodeVersion(environment.NodeVersion);
    diagnostics.AddCheck(nodeCheck);
    this.emitDiagnostic(emitter, nodeCheck);
    if (nodeCheck.Status === 'fail') hardFailures.push(nodeCheck.Message);

    emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking npm...' });
    const npmCheck = await this.checkNpm(environment.NpmVersion);
    diagnostics.AddCheck(npmCheck);
    this.emitDiagnostic(emitter, npmCheck);
    if (npmCheck.Status === 'fail') hardFailures.push(npmCheck.Message);

    emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking disk space...' });
    const diskCheck = await this.checkDiskSpace(context.TargetDir);
    diagnostics.AddCheck(diskCheck);
    this.emitDiagnostic(emitter, diskCheck);
    if (diskCheck.Status === 'fail') hardFailures.push(diskCheck.Message);

    emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking port availability...' });
    const apiPort = context.Config.APIPort ?? 4000;
    const explorerPort = context.Config.ExplorerPort ?? 4200;
    const apiPortCheck = await this.checkPort(apiPort, 'API');
    const explorerPortCheck = await this.checkPort(explorerPort, 'Explorer');
    diagnostics.AddCheck(apiPortCheck);
    diagnostics.AddCheck(explorerPortCheck);
    this.emitDiagnostic(emitter, apiPortCheck);
    this.emitDiagnostic(emitter, explorerPortCheck);

    if (!context.SkipDB) {
      emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking SQL Server connectivity...' });
      const sqlCheck = await this.checkSqlConnectivity(context.Config);
      diagnostics.AddCheck(sqlCheck);
      this.emitDiagnostic(emitter, sqlCheck);
      if (sqlCheck.Status === 'fail') hardFailures.push(sqlCheck.Message);
    }

    emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking OS...' });
    const osCheck = this.checkOS(detectedOS);
    diagnostics.AddCheck(osCheck);
    this.emitDiagnostic(emitter, osCheck);

    emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'preflight', Message: 'Checking write permissions...' });
    const writeCheck = await this.checkWritePermissions(context.TargetDir);
    diagnostics.AddCheck(writeCheck);
    this.emitDiagnostic(emitter, writeCheck);
    if (writeCheck.Status === 'fail') hardFailures.push(writeCheck.Message);

    // Node 24 recommendation (informational)
    const nodeRecommendation = this.checkNodeRecommendation(environment.NodeVersion);
    if (nodeRecommendation) {
      diagnostics.AddCheck(nodeRecommendation);
      this.emitDiagnostic(emitter, nodeRecommendation);
    }

    return {
      Passed: hardFailures.length === 0,
      Diagnostics: diagnostics,
      DetectedOS: detectedOS,
    };
  }

  /**
   * Run diagnostics only (for mj doctor). Same checks but no hard failures.
   */
  async RunDiagnostics(targetDir: string, config: PartialInstallConfig, emitter: InstallerEventEmitter): Promise<Diagnostics> {
    const result = await this.Run({
      TargetDir: targetDir,
      Config: config,
      SkipDB: false,
      Emitter: emitter,
    });

    // Additional doctor-only checks
    await this.checkConfigFiles(targetDir, result.Diagnostics, emitter);
    await this.checkCodeGenArtifacts(targetDir, result.Diagnostics, emitter);

    return result.Diagnostics;
  }

  // ---------------------------------------------------------------------------
  // Individual checks
  // ---------------------------------------------------------------------------

  private async gatherEnvironment(): Promise<EnvironmentInfo> {
    let nodeVersion = process.version;
    let npmVersion = 'unknown';

    try {
      npmVersion = await this.processRunner.RunSimple('npm', ['--version']);
    } catch {
      npmVersion = 'not found';
    }

    return {
      OS: `${os.platform()} ${os.release()} (${os.arch()})`,
      NodeVersion: nodeVersion,
      NpmVersion: npmVersion,
      Architecture: os.arch(),
    };
  }

  private async checkNodeVersion(versionString: string): Promise<DiagnosticCheck> {
    const match = versionString.match(/^v?(\d+)/);
    const majorVersion = match ? parseInt(match[1], 10) : 0;

    if (majorVersion >= MIN_NODE_VERSION) {
      return {
        Name: 'Node.js version',
        Status: 'pass',
        Message: `Node.js ${versionString} (>= ${MIN_NODE_VERSION} required)`,
      };
    }

    return {
      Name: 'Node.js version',
      Status: 'fail',
      Message: `Node.js ${versionString} found, but >= ${MIN_NODE_VERSION} is required (${RECOMMENDED_NODE_VERSION} recommended)`,
      SuggestedFix: `Download Node.js ${MIN_NODE_VERSION} LTS (or ${RECOMMENDED_NODE_VERSION}) from https://nodejs.org`,
    };
  }

  private checkNodeRecommendation(versionString: string): DiagnosticCheck | null {
    const match = versionString.match(/^v?(\d+)/);
    const majorVersion = match ? parseInt(match[1], 10) : 0;

    if (majorVersion >= MIN_NODE_VERSION && majorVersion < RECOMMENDED_NODE_VERSION) {
      return {
        Name: 'Node.js recommendation',
        Status: 'info',
        Message: `Node.js ${RECOMMENDED_NODE_VERSION} is recommended for best performance and compatibility`,
      };
    }
    return null;
  }

  private async checkNpm(npmVersion: string): Promise<DiagnosticCheck> {
    if (npmVersion === 'not found') {
      return {
        Name: 'npm',
        Status: 'fail',
        Message: 'npm not found on PATH',
        SuggestedFix: 'npm is included with Node.js. Reinstall Node.js from https://nodejs.org',
      };
    }

    return {
      Name: 'npm',
      Status: 'pass',
      Message: `npm ${npmVersion}`,
    };
  }

  private async checkDiskSpace(targetDir: string): Promise<DiagnosticCheck> {
    try {
      const freeBytes = await this.fileSystem.GetFreeDiskSpace(targetDir);
      const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);

      if (freeBytes >= MIN_DISK_SPACE_BYTES) {
        return {
          Name: 'Disk space',
          Status: 'pass',
          Message: `${freeGB} GB available`,
        };
      }

      return {
        Name: 'Disk space',
        Status: 'fail',
        Message: `Only ${freeGB} GB free. At least 2 GB required.`,
        SuggestedFix: 'Free up disk space or choose a different target directory',
      };
    } catch (err) {
      return {
        Name: 'Disk space',
        Status: 'warn',
        Message: `Could not determine free disk space: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async checkPort(port: number, label: string): Promise<DiagnosticCheck> {
    const inUse = await this.isPortInUse(port);

    if (!inUse) {
      return {
        Name: `Port ${port} (${label})`,
        Status: 'pass',
        Message: `Port ${port} available`,
      };
    }

    return {
      Name: `Port ${port} (${label})`,
      Status: 'warn',
      Message: `Port ${port} is in use. ${label} will not be able to start on this port.`,
      SuggestedFix: `Stop the process using port ${port}, or configure a different port`,
    };
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close(() => resolve(false));
      });

      server.listen(port, '127.0.0.1');
    });
  }

  private async checkSqlConnectivity(config: PartialInstallConfig): Promise<DiagnosticCheck> {
    const host = config.DatabaseHost ?? 'localhost';
    const port = config.DatabasePort ?? 1433;

    const result = await this.sqlAdapter.CheckConnectivity(host, port);

    if (result.Reachable) {
      return {
        Name: 'SQL Server connectivity',
        Status: 'pass',
        Message: `SQL Server reachable at ${host}:${port} (${result.LatencyMs}ms)`,
      };
    }

    return {
      Name: 'SQL Server connectivity',
      Status: 'fail',
      Message: result.ErrorMessage ?? `Cannot reach SQL Server at ${host}:${port}`,
      SuggestedFix: `Ensure SQL Server is running and accessible at ${host}:${port}. Use --skip-db to skip database checks.`,
    };
  }

  private detectOS(): 'windows' | 'macos' | 'linux' | 'other' {
    switch (process.platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'macos';
      case 'linux': return 'linux';
      default: return 'other';
    }
  }

  private checkOS(detectedOS: string): DiagnosticCheck {
    const osNames: Record<string, string> = {
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
      other: process.platform,
    };

    return {
      Name: 'Operating system',
      Status: 'info',
      Message: `OS: ${osNames[detectedOS] ?? detectedOS} (${os.arch()})`,
    };
  }

  private async checkWritePermissions(targetDir: string): Promise<DiagnosticCheck> {
    const canWrite = await this.fileSystem.CanWrite(targetDir);

    if (canWrite) {
      return {
        Name: 'Write permissions',
        Status: 'pass',
        Message: `Target directory is writable`,
      };
    }

    return {
      Name: 'Write permissions',
      Status: 'fail',
      Message: `Cannot write to target directory: ${targetDir}`,
      SuggestedFix: 'Check directory permissions or choose a different target directory',
    };
  }

  // ---------------------------------------------------------------------------
  // Doctor-only checks (not used during install preflight)
  // ---------------------------------------------------------------------------

  private async checkConfigFiles(targetDir: string, diagnostics: Diagnostics, emitter: InstallerEventEmitter): Promise<void> {
    // .env file
    const envExists = await this.fileSystem.FileExists(`${targetDir}/.env`);
    const envCheck: DiagnosticCheck = envExists
      ? { Name: '.env file', Status: 'pass', Message: '.env file exists' }
      : { Name: '.env file', Status: 'warn', Message: '.env file not found', SuggestedFix: 'Run "mj install" to generate configuration files' };
    diagnostics.AddCheck(envCheck);
    this.emitDiagnostic(emitter, envCheck);

    // mj.config.cjs
    const configCjsExists = await this.fileSystem.FileExists(`${targetDir}/mj.config.cjs`);
    const configCjsCheck: DiagnosticCheck = configCjsExists
      ? { Name: 'mj.config.cjs', Status: 'pass', Message: 'mj.config.cjs file exists' }
      : { Name: 'mj.config.cjs', Status: 'warn', Message: 'mj.config.cjs not found', SuggestedFix: 'Run "mj install" to generate configuration files' };
    diagnostics.AddCheck(configCjsCheck);
    this.emitDiagnostic(emitter, configCjsCheck);

    // Check for incorrect mj.config.js (common doc-driven mistake)
    const configJsExists = await this.fileSystem.FileExists(`${targetDir}/mj.config.js`);
    if (configJsExists) {
      const wrongFileCheck: DiagnosticCheck = {
        Name: 'mj.config.js (wrong filename)',
        Status: 'warn',
        Message: 'Found mj.config.js — the correct filename is mj.config.cjs',
        SuggestedFix: 'Rename mj.config.js to mj.config.cjs',
      };
      diagnostics.AddCheck(wrongFileCheck);
      this.emitDiagnostic(emitter, wrongFileCheck);
    }
  }

  private async checkCodeGenArtifacts(targetDir: string, diagnostics: Diagnostics, emitter: InstallerEventEmitter): Promise<void> {
    const genEntitiesPath = `${targetDir}/node_modules/mj_generatedentities`;
    const exists = await this.fileSystem.DirectoryExists(genEntitiesPath);

    const check: DiagnosticCheck = exists
      ? { Name: 'CodeGen artifacts', Status: 'pass', Message: 'mj_generatedentities found' }
      : {
          Name: 'CodeGen artifacts',
          Status: 'fail',
          Message: 'mj_generatedentities not found in node_modules',
          SuggestedFix: 'Run "mj codegen" to generate entity artifacts',
        };
    diagnostics.AddCheck(check);
    this.emitDiagnostic(emitter, check);
  }

  private emitDiagnostic(emitter: InstallerEventEmitter, check: DiagnosticCheck): void {
    emitter.Emit('diagnostic', {
      Type: 'diagnostic',
      Check: check.Name,
      Status: check.Status,
      Message: check.Message,
      SuggestedFix: check.SuggestedFix,
    });
  }
}
