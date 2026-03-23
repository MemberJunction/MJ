/**
 * Phase G — Dependencies (Install + Build)
 *
 * Runs `npm install` at the repo root to install all workspace dependencies,
 * then `npm run build` to compile all ~170 packages in the monorepo.
 *
 * Key behaviors:
 * - **ERESOLVE retry**: If `npm install` fails with peer dependency conflicts,
 *   automatically retries with `--legacy-peer-deps`.
 * - **Partial build tolerance**: Build failures in codegen-managed packages
 *   (entity forms, bootstrap) are treated as partial success since CodeGen
 *   will regenerate their source and rebuild in a later phase.
 * - **Audit warnings**: npm vulnerability reports are logged as informational
 *   warnings — users are explicitly told NOT to run `npm audit fix --force`.
 *
 * @module phases/DependencyPhase
 * @see CodeGenPhase — handles rebuilding codegen-managed packages after code generation.
 * @see PlatformCompatPhase — patches scripts before this phase runs.
 */

import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner, type ProcessResult } from '../adapters/ProcessRunner.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import path from 'node:path';

/**
 * Packages that contain generated code managed by CodeGen.
 *
 * Build failures in **only** these packages are treated as partial success.
 * CodeGen will regenerate their stale source code and rebuild them in the
 * codegen phase. If any package outside this list fails, the build is a
 * hard error.
 */
const CODEGEN_MANAGED_PACKAGES = [
  'mj_generatedentities',
  'mj_generatedactions',
  'ng-core-entity-forms',
  'server-bootstrap-lite',
  'server-bootstrap',
  'ng-bootstrap',
];

/**
 * Input context for the dependency phase.
 *
 * @see DependencyPhase.Run
 */
export interface DependencyContext {
  /** Absolute path to the repo root (where `npm install` and `npm run build` are executed). */
  Dir: string;
  /** MemberJunction version tag (e.g., `"v5.9.0"`) — used to pin the CLI dependency version. */
  Tag: string;
  /** Event emitter for progress, warn, and log events. */
  Emitter: InstallerEventEmitter;
}

/**
 * Result of the dependency phase.
 *
 * @see DependencyPhase.Run
 */
export interface DependencyResult {
  /** Whether `npm install` completed successfully. */
  InstallSuccess: boolean;
  /** Whether `npm run build` completed fully (`false` if partial). */
  BuildSuccess: boolean;
  /**
   * Whether the build was partial — codegen-managed packages failed
   * but all other packages succeeded. CodeGen will fix these.
   */
  BuildPartial: boolean;
  /** Non-fatal warnings collected during install and build (e.g., npm audit advisories). */
  Warnings: string[];
}

/**
 * Phase G — Installs npm dependencies and builds all workspace packages.
 *
 * @example
 * ```typescript
 * const deps = new DependencyPhase();
 * const result = await deps.Run({ Dir: '/path/to/install', Emitter: emitter });
 * if (result.BuildPartial) {
 *   console.log('Partial build — CodeGen will fix remaining packages');
 * }
 * ```
 */
export class DependencyPhase {
  private processRunner = new ProcessRunner();
  private fileSystem = new FileSystemAdapter();

  /**
   * Execute the dependency phase: `npm install` then `npm run build`.
   *
   * @param context - Dependency input with directory and emitter.
   * @returns Install/build status and collected warnings.
   * @throws {InstallerError} With code `NPM_INSTALL_FAILED` or `NPM_INSTALL_TIMEOUT` on install failure.
   * @throws {InstallerError} With code `BUILD_FAILED` or `BUILD_TIMEOUT` on non-codegen build failure.
   */
  async Run(context: DependencyContext): Promise<DependencyResult> {
    const { Emitter: emitter } = context;
    const warnings: string[] = [];

    // Step 0a: Ensure @memberjunction/cli is a dependency so `mj` in npm scripts
    // resolves to the correct version (not a stale global install)
    await this.ensureCliDependency(context.Dir, context.Tag, emitter);

    // Step 0b: Ensure packages that must be hoisted to root node_modules are listed
    // as root dependencies. Without this, npm may nest them under workspace packages
    // due to peer-dep conflicts, causing duplicate class instances and Angular DI failures.
    await this.ensureHoistedDependencies(context.Dir, context.Tag, emitter);

    // Step 1: npm install
    await this.runNpmInstall(context.Dir, emitter, warnings);

    // Step 2: npm run build
    const buildPartial = await this.runNpmBuild(context.Dir, emitter, warnings);

    return {
      InstallSuccess: true,
      BuildSuccess: !buildPartial,
      BuildPartial: buildPartial,
      Warnings: warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // npm install
  // ---------------------------------------------------------------------------

  /**
   * Run `npm install`, retrying with `--legacy-peer-deps` on ERESOLVE errors.
   * Collects vulnerability warnings into the supplied array.
   */
  private async runNpmInstall(
    dir: string,
    emitter: InstallerEventEmitter,
    warnings: string[]
  ): Promise<void> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'dependencies',
      Message: 'Running npm install (this may take several minutes)...',
    });

    let result = await this.runNpmInstallOnce(dir, emitter, []);

    if (result.TimedOut) {
      throw new InstallerError(
        'dependencies',
        'NPM_INSTALL_TIMEOUT',
        'npm install timed out after 10 minutes.',
        'Run "npm install" manually at the repo root. Check network connectivity.'
      );
    }

    // If npm install failed due to peer dependency conflicts, retry with --legacy-peer-deps
    if (result.ExitCode !== 0 && this.isEresolveError(result.Stderr)) {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'dependencies',
        Message: 'Peer dependency conflict detected. Retrying with --legacy-peer-deps...',
      });

      result = await this.runNpmInstallOnce(dir, emitter, ['--legacy-peer-deps']);

      if (result.TimedOut) {
        throw new InstallerError(
          'dependencies',
          'NPM_INSTALL_TIMEOUT',
          'npm install --legacy-peer-deps timed out after 10 minutes.',
          'Run "npm install --legacy-peer-deps" manually at the repo root.'
        );
      }

      if (result.ExitCode === 0) {
        warnings.push(
          'npm install required --legacy-peer-deps due to peer dependency conflicts in the release. ' +
          'This is safe but indicates a minor version skew in the release packages.'
        );
      }
    }

    if (result.ExitCode !== 0) {
      const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
      throw new InstallerError(
        'dependencies',
        'NPM_INSTALL_FAILED',
        `npm install failed (exit code ${result.ExitCode}):\n${lastLines}`,
        'Run "npm install" manually at the repo root to see full error output.'
      );
    }

    // Check for audit vulnerabilities (informational only)
    if (result.Stderr.includes('vulnerabilit')) {
      warnings.push(
        'npm reports vulnerabilities in dependencies. This is common in large workspaces. ' +
        'Do NOT run "npm audit fix --force" — it can break the workspace.'
      );
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'dependencies',
        Message: 'npm reports dependency vulnerabilities (informational). Do not run "npm audit fix --force".',
      });
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: 'npm install completed successfully.',
    });
  }

  // ---------------------------------------------------------------------------
  // npm run build
  // ---------------------------------------------------------------------------

  /**
   * Runs npm run build. Returns true if the build was "partial" (only codegen-managed
   * packages failed), false if it fully succeeded. Throws on hard failures.
   */
  private async runNpmBuild(dir: string, emitter: InstallerEventEmitter, warnings: string[]): Promise<boolean> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'dependencies',
      Message: 'Running npm run build (first-time builds can take 15-20 minutes for 170 packages)...',
    });

    const result = await this.processRunner.Run('npm', ['run', 'build'], {
      Cwd: dir,
      TimeoutMs: 1_800_000, // 30 minutes — first-time full workspace build of 170 packages can take 17+ min
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'dependencies',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[build:stderr] ${line.trim()}`,
        });
      },
    });

    if (result.TimedOut) {
      throw new InstallerError(
        'dependencies',
        'BUILD_TIMEOUT',
        'npm run build timed out after 30 minutes.',
        'Run "npm run build" manually at the repo root to see full output. First-time builds of 170 packages can take 15-20 minutes.'
      );
    }

    if (result.ExitCode === 0) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Build completed successfully.',
      });
      return false;
    }

    // Build failed — check if failures are only in codegen-managed packages.
    // These packages contain generated code that may be stale in the release.
    // CodeGen will regenerate them and rebuild in a later phase.
    // Note: turbo outputs the "Failed:" summary to stdout, not stderr.
    const combinedOutput = result.Stdout + '\n' + result.Stderr;
    const failedPackages = this.extractFailedTurboPackages(combinedOutput);
    const onlyCodegenFailures = failedPackages.length > 0
      && failedPackages.every(pkg => CODEGEN_MANAGED_PACKAGES.some(pattern => pkg.includes(pattern)));

    if (onlyCodegenFailures) {
      const failList = failedPackages.join(', ');
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'dependencies',
        Message: `Build partially succeeded. Failed packages (${failList}) contain generated code that will be regenerated by CodeGen.`,
      });
      warnings.push(
        `Build partially succeeded. The following packages failed due to stale generated code and will be fixed by CodeGen: ${failList}`
      );
      return true;
    }

    // Non-codegen failures — hard error
    const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
    throw new InstallerError(
      'dependencies',
      'BUILD_FAILED',
      `Build failed (exit code ${result.ExitCode}):\n${lastLines}`,
      'Run "npm run build" manually at the repo root to see full error output.'
    );
  }

  // ---------------------------------------------------------------------------
  // Turbo output parsing
  // ---------------------------------------------------------------------------

  /**
   * Extract failed package names from turbo's output.
   *
   * Turbo outputs lines like:
   * - `"Failed:    @memberjunction/ng-core-entity-forms#build"` (scoped)
   * - `"Failed:    mj_generatedactions#build"` (unscoped)
   *
   * @param output - Combined stdout + stderr from turbo.
   * @returns Deduplicated list of failed package names.
   */
  private extractFailedTurboPackages(output: string): string[] {
    const packages: string[] = [];
    const failedPattern = /Failed:\s+([@\w][^#\s]*)#build/g;
    let match: RegExpExecArray | null;
    while ((match = failedPattern.exec(output)) !== null) {
      packages.push(match[1]);
    }
    return [...new Set(packages)];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Execute a single `npm install` invocation with optional extra arguments.
   * Streams stdout/stderr to the emitter for real-time progress.
   */
  private async runNpmInstallOnce(
    dir: string,
    emitter: InstallerEventEmitter,
    extraArgs: string[]
  ): Promise<ProcessResult> {
    const args = ['install', ...extraArgs];
    return this.processRunner.Run('npm', args, {
      Cwd: dir,
      TimeoutMs: 600_000, // 10 minutes
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'dependencies',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        if (line.includes('WARN') || line.includes('warn')) {
          emitter.Emit('log', {
            Type: 'log',
            Level: 'verbose',
            Message: `[npm] ${line.trim()}`,
          });
        }
      },
    });
  }

  /** Check whether npm stderr output indicates an ERESOLVE peer-dependency conflict. */
  private isEresolveError(stderr: string): boolean {
    return stderr.includes('ERESOLVE') || stderr.includes('unable to resolve dependency tree');
  }

  /** Return the last `n` lines of a multi-line string. */
  private lastNLines(text: string, n: number): string {
    const lines = text.split('\n');
    return lines.slice(-n).join('\n');
  }

  // ---------------------------------------------------------------------------
  // CLI dependency injection
  // ---------------------------------------------------------------------------

  /**
   * Ensure `@memberjunction/cli` is in the root `package.json` devDependencies.
   *
   * The bootstrap distribution's scripts (`mj:migrate`, `mj:codegen`) and the
   * apps' `prestart` scripts (`mj codegen manifest`) require the `mj` binary.
   * Without an explicit dependency, `mj` resolves to whatever is on the system
   * PATH (often a stale version or nothing at all in the distribution).
   */
  private async ensureCliDependency(
    dir: string,
    tag: string,
    emitter: InstallerEventEmitter
  ): Promise<void> {
    const pkgPath = path.join(dir, 'package.json');
    const pkg = await this.fileSystem.ReadJSON<Record<string, Record<string, string>>>(pkgPath);

    const npmVersion = tag.startsWith('v') ? tag.slice(1) : tag;

    if (!pkg['devDependencies']) {
      pkg['devDependencies'] = {};
    }

    const existing = pkg['devDependencies']['@memberjunction/cli'];
    if (existing === npmVersion) {
      return;
    }

    pkg['devDependencies']['@memberjunction/cli'] = npmVersion;
    await this.fileSystem.WriteJSON(pkgPath, pkg);

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'dependencies',
      Message: `Added @memberjunction/cli@${npmVersion} to devDependencies`,
    });
  }

  // ---------------------------------------------------------------------------
  // Dependency hoisting
  // ---------------------------------------------------------------------------

  /**
   * Packages that must be hoisted to the root `node_modules` to avoid duplicate-
   * instance problems with Angular's DI system and MJ's ClassFactory.
   */
  private static readonly HOISTED_PACKAGES: ReadonlyArray<{
    Name: string;
    Section: 'dependencies' | 'devDependencies';
  }> = [
    { Name: '@memberjunction/ng-auth-services', Section: 'dependencies' },
  ];

  /**
   * Ensure packages that require hoisting are listed in the root package.json
   * so npm places a single copy at root `node_modules`.
   */
  private async ensureHoistedDependencies(
    dir: string,
    tag: string,
    emitter: InstallerEventEmitter
  ): Promise<void> {
    const pkgPath = path.join(dir, 'package.json');
    const pkg = await this.fileSystem.ReadJSON<Record<string, Record<string, string>>>(pkgPath);
    const npmVersion = tag.startsWith('v') ? tag.slice(1) : tag;

    let modified = false;

    for (const { Name, Section } of DependencyPhase.HOISTED_PACKAGES) {
      if (!pkg[Section]) {
        pkg[Section] = {};
      }

      const existing = pkg[Section][Name];
      if (existing === npmVersion) {
        continue;
      }

      pkg[Section][Name] = npmVersion;
      modified = true;

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'dependencies',
        Message: `Added ${Name}@${npmVersion} to ${Section} (hoisting fix)`,
      });
    }

    if (modified) {
      await this.fileSystem.WriteJSON(pkgPath, pkg);
    }
  }
}
