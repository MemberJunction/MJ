/**
 * InstallerEngine — the core orchestrator for MemberJunction installs.
 *
 * This class is **headless and event-driven**. It never writes to stdout directly.
 * Frontends (CLI, VSCode extension, Docker/CI) subscribe to typed events to
 * render progress, handle interactive prompts, and display diagnostics.
 *
 * **Architecture**:
 * - 9 ordered phases executed sequentially: preflight → scaffold → configure →
 *   database → platform → dependencies → migrate → codegen → smoke_test.
 * - Checkpoint/resume via `.mj-install-state.json` — if a phase fails, the user
 *   can re-run `mj install` and it resumes from the last incomplete phase.
 * - Each phase is a standalone class with its own context/result types, making
 *   them independently testable and composable.
 *
 * **Public API**:
 * - {@link InstallerEngine.On | On}/{@link InstallerEngine.Off | Off} — subscribe/unsubscribe to events.
 * - {@link InstallerEngine.ListVersions | ListVersions} — fetch available MJ releases from GitHub.
 * - {@link InstallerEngine.CreatePlan | CreatePlan} — build an install plan (dry-run safe).
 * - {@link InstallerEngine.Run | Run} — execute a plan, emitting events throughout.
 * - {@link InstallerEngine.Doctor | Doctor} — run diagnostics on an existing install.
 * - {@link InstallerEngine.Resume | Resume} — resume from a checkpoint state file.
 *
 * @module InstallerEngine
 * @see InstallerEventEmitter — the typed event system used for all communication.
 * @see InstallPlan — the plan object returned by {@link InstallerEngine.CreatePlan}.
 * @see InstallState — checkpoint/resume persistence.
 * @see InstallerError — structured errors thrown by phases.
 */

import { InstallerEventEmitter, type InstallerEventMap } from './events/InstallerEvents.js';
import { InstallerError, type PhaseId } from './errors/InstallerError.js';
import { GitHubReleaseProvider } from './adapters/GitHubReleaseProvider.js';
import { PreflightPhase } from './phases/PreflightPhase.js';
import { ScaffoldPhase } from './phases/ScaffoldPhase.js';
import { ConfigurePhase } from './phases/ConfigurePhase.js';
import { DatabaseProvisionPhase } from './phases/DatabaseProvisionPhase.js';
import { MigratePhase } from './phases/MigratePhase.js';
import { PlatformCompatPhase } from './phases/PlatformCompatPhase.js';
import { DependencyPhase } from './phases/DependencyPhase.js';
import { CodeGenPhase } from './phases/CodeGenPhase.js';
import { SmokeTestPhase } from './phases/SmokeTestPhase.js';
import { InstallPlan, type CreatePlanInput, type RunOptions, type DoctorOptions, type InstallResult } from './models/InstallPlan.js';
import { InstallState } from './models/InstallState.js';
import { InstallConfigDefaults, resolveFromEnvironment, loadConfigFile, mergeConfigs, type PartialInstallConfig } from './models/InstallConfig.js';
import { EventLogger } from './logging/EventLogger.js';
import { ReportGenerator, type ReportData, type ServiceLogCapture } from './logging/ReportGenerator.js';
import { FileSystemAdapter } from './adapters/FileSystemAdapter.js';
import { ProcessRunner } from './adapters/ProcessRunner.js';
import type { VersionInfo } from './models/VersionInfo.js';
import type { Diagnostics } from './models/Diagnostics.js';
import path from 'node:path';

/**
 * Ordered list of all install phases in execution order.
 *
 * Used internally for plan generation and checkpoint/resume logic.
 * The order is significant — each phase may depend on outputs from
 * earlier phases (e.g., `codegen` requires `dependencies` and `migrate`
 * to have completed first).
 */
const ALL_PHASES: PhaseId[] = [
  'preflight',
  'scaffold',
  'configure',
  'database',
  'platform',
  'dependencies',
  'migrate',
  'codegen',
  'smoke_test',
];

/**
 * Core orchestrator for MemberJunction installs.
 *
 * Headless and event-driven — never writes to stdout. Frontends subscribe to
 * typed events via {@link InstallerEngine.On} to render progress, handle prompts,
 * and display diagnostics. Supports checkpoint/resume for long-running installs.
 *
 * @example
 * ```typescript
 * const engine = new InstallerEngine();
 *
 * // Subscribe to events
 * engine.On('phase:start', (e) => console.log(`Phase: ${e.Phase}`));
 * engine.On('step:progress', (e) => console.log(`  ${e.Message}`));
 * engine.On('error', (e) => console.error(e.Error.message));
 *
 * // Create and execute a plan
 * const plan = await engine.CreatePlan({ Dir: '/app', Tag: 'v5.1.0' });
 * const result = await engine.Run(plan, { Verbose: true, Yes: true });
 * ```
 */
export class InstallerEngine {
  private emitter = new InstallerEventEmitter();
  private github = new GitHubReleaseProvider();
  private preflight = new PreflightPhase();
  private scaffold = new ScaffoldPhase();
  private configure = new ConfigurePhase();
  private databaseProvision = new DatabaseProvisionPhase();
  private migrate = new MigratePhase();
  private platformCompat = new PlatformCompatPhase();
  private dependency = new DependencyPhase();
  private codeGen = new CodeGenPhase();
  private smokeTest = new SmokeTestPhase();

  /** Event logger that captures all events for diagnostic reports. */
  private eventLogger = new EventLogger();

  /** Report generator for producing diagnostic markdown files. */
  private reportGenerator = new ReportGenerator();

  /**
   * Resolved config accumulator — populated incrementally by the configure phase,
   * then consumed by all subsequent phases (database, migrate, smoke test, etc.).
   */
  private resolvedConfig: PartialInstallConfig = {};

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Subscribe to installer events.
   *
   * @typeParam K - The event name (e.g., `'phase:start'`, `'step:progress'`, `'error'`).
   * @param event - The event to listen for.
   * @param handler - Callback invoked with the event payload.
   *
   * @example
   * ```typescript
   * engine.On('phase:end', (e) => {
   *   console.log(`${e.Phase} ${e.Status} in ${e.DurationMs}ms`);
   * });
   * ```
   */
  On<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.On(event, handler);
  }

  /**
   * Unsubscribe from installer events.
   *
   * @typeParam K - The event name.
   * @param event - The event to stop listening for.
   * @param handler - The same handler reference passed to {@link On}.
   */
  Off<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.Off(event, handler);
  }

  /**
   * List available MemberJunction release versions from GitHub.
   *
   * Fetches releases from the MemberJunction GitHub repository using the
   * unauthenticated REST API (60 requests/hour rate limit).
   *
   * @param includePrerelease - Whether to include pre-release tags (default: `false`).
   * @returns Array of available versions sorted by publish date (newest first).
   */
  async ListVersions(includePrerelease: boolean = false): Promise<VersionInfo[]> {
    return this.github.ListReleases(includePrerelease);
  }

  /**
   * Build an install plan (dry-run friendly — no side effects).
   *
   * The plan describes which phases will run, which will be skipped, and
   * with what configuration. It can be inspected before execution (e.g.,
   * with `plan.Summarize()`) or passed directly to {@link Run}.
   *
   * @param input - Plan inputs including target directory, tag, skip flags, and config overrides.
   * @returns A new {@link InstallPlan} ready for execution or inspection.
   */
  async CreatePlan(input: CreatePlanInput): Promise<InstallPlan> {
    const config: PartialInstallConfig = {
      ...InstallConfigDefaults,
      ...input.Config,
    };

    const skipPhases = new Set<PhaseId>();
    if (input.SkipDB) {
      skipPhases.add('database');
    }
    if (input.SkipStart || input.Fast) {
      skipPhases.add('smoke_test');
    }
    if (input.SkipCodeGen) {
      skipPhases.add('codegen');
    }

    const tag = input.Tag ?? 'latest';
    return new InstallPlan(tag, input.Dir, config, skipPhases);
  }

  /**
   * Execute an install plan, emitting events throughout.
   *
   * Iterates through plan phases in order. Supports checkpoint/resume — if a
   * previous install left a `.mj-install-state.json`, completed phases are
   * skipped automatically. Pass `NoResume: true` in options to force a fresh start.
   *
   * Stops on the first phase failure and returns partial results. The state file
   * is updated after each phase, so re-running resumes from the failed phase.
   *
   * @param plan - The install plan from {@link CreatePlan}.
   * @param options - Runtime options (verbose, yes, fast, no-resume, config overrides).
   * @returns Install result with success status, duration, warnings, and phase lists.
   */
  async Run(plan: InstallPlan, options?: RunOptions): Promise<InstallResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const phasesCompleted: PhaseId[] = [];
    const phasesFailed: PhaseId[] = [];
    const verbose = options?.Verbose ?? false;
    const yes = options?.Yes ?? false;
    const fast = options?.Fast ?? false;

    // Attach event logger for diagnostic capture
    this.eventLogger.Clear();
    this.eventLogger.Attach(this.emitter);

    // Dry-run: the plan itself is the output, so Run is a no-op
    if (options?.DryRun) {
      this.eventLogger.Detach();
      return {
        Success: true,
        DurationMs: 0,
        Warnings: [],
        PhasesCompleted: [],
        PhasesFailed: [],
      };
    }

    // ── Config chain: Defaults → Env vars → Config file → Plan → RunOptions ──
    const configSources: PartialInstallConfig[] = [plan.Config];

    const envConfig = resolveFromEnvironment();
    if (Object.keys(envConfig).length > 0) {
      configSources.push(envConfig);
      this.emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Config: loaded ${Object.keys(envConfig).length} value(s) from MJ_INSTALL_* environment variables`,
      });
    }

    if (options?.ConfigFile) {
      const fileConfig = await loadConfigFile(options.ConfigFile);
      configSources.push(fileConfig);
      this.emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Config: loaded ${Object.keys(fileConfig).length} value(s) from ${options.ConfigFile}`,
      });
    }

    if (options?.Config) {
      configSources.push(options.Config);
    }

    const config = mergeConfigs(...configSources);

    // ── Prompt safety net (non-interactive mode) ──────────────────────────
    // In --yes mode, install a catch-all listener that auto-resolves any
    // unexpected prompt with its default value. This prevents indefinite
    // hangs in Docker/CI if a prompt is emitted that wasn't short-circuited.
    if (yes) {
      this.emitter.On('prompt', (event) => {
        this.emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'configure',
          Message: `Auto-resolving prompt '${event.PromptId}' with default '${event.Default ?? ''}' (non-interactive mode)`,
        });
        event.Resolve(event.Default ?? '');
      });
    }

    // Reset resolved config — will be populated by the configure phase
    this.resolvedConfig = { ...config };

    // Check for existing state file (resume)
    let state: InstallState | null = null;
    if (!options?.NoResume) {
      state = await InstallState.Load(plan.Dir);
      if (state) {
        this.emitter.Emit('log', {
          Type: 'log',
          Level: 'info',
          Message: `Resuming install from checkpoint (tag: ${state.Tag})`,
        });
      }
    }

    if (!state) {
      state = new InstallState(plan.Dir, plan.Tag);
    }

    // Iterate through phases
    for (const phaseInfo of plan.Phases) {
      // Skip phases marked as skipped in the plan
      if (phaseInfo.Skipped) {
        state.MarkSkipped(phaseInfo.Id);
        await state.Save();
        continue;
      }

      // Skip already completed phases (resume)
      const currentStatus = state.GetPhaseStatus(phaseInfo.Id);
      if (currentStatus === 'completed' || currentStatus === 'skipped') {
        if (verbose) {
          this.emitter.Emit('log', {
            Type: 'log',
            Level: 'verbose',
            Message: `Skipping ${phaseInfo.Id} (already ${currentStatus})`,
          });
        }
        phasesCompleted.push(phaseInfo.Id);
        continue;
      }

      // Execute the phase
      const phaseStart = Date.now();
      this.emitter.Emit('phase:start', {
        Type: 'phase:start',
        Phase: phaseInfo.Id,
        Description: phaseInfo.Description,
      });

      try {
        const result = await this.executePhase(phaseInfo.Id, plan, config, yes, fast);

        // Collect warnings
        if (result.Warnings) {
          warnings.push(...result.Warnings);
        }

        state.MarkCompleted(phaseInfo.Id);
        await state.Save();
        phasesCompleted.push(phaseInfo.Id);

        this.emitter.Emit('phase:end', {
          Type: 'phase:end',
          Phase: phaseInfo.Id,
          Status: 'completed',
          DurationMs: Date.now() - phaseStart,
        });
      } catch (err) {
        const installerError = err instanceof InstallerError
          ? err
          : new InstallerError(
              phaseInfo.Id,
              'UNEXPECTED_ERROR',
              err instanceof Error ? err.message : String(err),
              'Check the error details and try again.'
            );

        state.MarkFailed(phaseInfo.Id, installerError.message);
        await state.Save();
        phasesFailed.push(phaseInfo.Id);

        this.emitter.Emit('phase:end', {
          Type: 'phase:end',
          Phase: phaseInfo.Id,
          Status: 'failed',
          DurationMs: Date.now() - phaseStart,
          Error: installerError,
        });

        this.emitter.Emit('error', {
          Type: 'error',
          Phase: phaseInfo.Id,
          Error: installerError,
        });

        // Stop on failure — auto-generate diagnostic report
        const failResult: InstallResult = {
          Success: false,
          DurationMs: Date.now() - startTime,
          Warnings: warnings,
          PhasesCompleted: phasesCompleted,
          PhasesFailed: phasesFailed,
        };

        await this.generateFailureReport(plan.Dir, state, failResult, config);
        this.eventLogger.Detach();
        return failResult;
      }
    }

    const successResult: InstallResult = {
      Success: true,
      DurationMs: Date.now() - startTime,
      Warnings: warnings,
      PhasesCompleted: phasesCompleted,
      PhasesFailed: phasesFailed,
    };

    this.eventLogger.Detach();
    return successResult;
  }

  /**
   * Run diagnostics on an existing or target install directory.
   *
   * Performs preflight checks (Node version, disk space, SQL connectivity, etc.)
   * and known-issue detection. Does **not** modify any files. Results are
   * returned as a {@link Diagnostics} object and also emitted as `diagnostic` events.
   *
   * @param targetDir - Absolute path to the directory to diagnose.
   * @param options - Optional doctor options (currently reserved for future use).
   * @returns Diagnostics with environment info, check results, and last install info.
   */
  async Doctor(targetDir: string, options?: DoctorOptions): Promise<Diagnostics> {
    const config: PartialInstallConfig = { ...InstallConfigDefaults };

    // ReportExtended implies Report
    const extended = options?.ReportExtended ?? false;
    const generateReport = extended || (options?.Report ?? false);
    if (generateReport) {
      this.eventLogger.Clear();
      this.eventLogger.Attach(this.emitter);
    }

    const diagnostics = await this.preflight.RunDiagnostics(targetDir, config, this.emitter);

    // Check for install state file
    const state = await InstallState.Load(targetDir);
    if (state) {
      diagnostics.LastInstall = {
        Tag: state.Tag,
        Timestamp: state.StartedAt,
      };

      this.emitter.Emit('diagnostic', {
        Type: 'diagnostic',
        Check: 'Last install',
        Status: 'info',
        Message: `Last install: ${state.Tag} (${state.StartedAt})`,
      });
    }

    // Run known-issue checks (source-level bugs that the installer auto-patches)
    const knownIssueResults = await this.codeGen.RunKnownIssueChecks(targetDir, this.emitter);
    for (const result of knownIssueResults) {
      if (result.Status === 'needs_patch') {
        diagnostics.AddCheck({
          Name: `Known issue: ${result.Id}`,
          Status: 'warn',
          Message: result.Description,
          SuggestedFix: `Run "mj install" to auto-patch, or manually edit ${result.RelativePath}`,
        });
      } else if (result.Status === 'ok') {
        diagnostics.AddCheck({
          Name: `Known issue: ${result.Id}`,
          Status: 'pass',
          Message: `${result.Id}: not present or already patched`,
        });
      }
    }

    // Run auth configuration validation checks (fast — always runs)
    await this.runAuthValidationChecks(targetDir, diagnostics);

    // Generate diagnostic report if requested
    if (generateReport) {
      const reportPath = await this.generateDoctorReport(targetDir, state, diagnostics, config, extended);
      this.eventLogger.Detach();

      this.emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Diagnostic report saved to: ${reportPath}`,
      });
    }

    return diagnostics;
  }

  /**
   * Resume a previously interrupted install from a checkpoint state file.
   *
   * Loads the `.mj-install-state.json` from the given directory, reconstructs
   * a plan from the saved tag, and calls {@link Run} with resume enabled.
   *
   * @param stateFileDir - Directory containing the `.mj-install-state.json` file.
   * @param options - Runtime options forwarded to {@link Run}.
   * @returns Install result from the resumed execution.
   * @throws {InstallerError} With code `NO_STATE_FILE` if no checkpoint exists.
   */
  async Resume(stateFileDir: string, options?: RunOptions): Promise<InstallResult> {
    const state = await InstallState.Load(stateFileDir);
    if (!state) {
      throw new InstallerError(
        'preflight',
        'NO_STATE_FILE',
        'No install state file found. Cannot resume.',
        'Start a new install with "mj install -t <tag>".'
      );
    }

    // Build a plan from the state
    const plan = new InstallPlan(state.Tag, stateFileDir, options?.Config ?? {});
    return this.Run(plan, { ...options, NoResume: false });
  }

  // -------------------------------------------------------------------------
  // Phase execution dispatch
  // -------------------------------------------------------------------------

  /**
   * Dispatch a single phase to its corresponding execute method.
   *
   * @param phaseId - Which phase to execute.
   * @param plan - The current install plan.
   * @param config - Resolved config (may include overrides from options).
   * @param yes - Non-interactive mode — skips all user prompts.
   * @param fast - Fast mode — enables optimistic skipping in codegen.
   * @returns Phase-specific result containing any warnings to bubble up.
   */
  private async executePhase(
    phaseId: PhaseId,
    plan: InstallPlan,
    config: PartialInstallConfig,
    yes: boolean,
    fast: boolean
  ): Promise<PhaseExecutionResult> {
    switch (phaseId) {
      case 'preflight':
        return this.executePreflight(plan, config);
      case 'scaffold':
        return this.executeScaffold(plan, config, yes);
      case 'configure':
        return this.executeConfigure(plan, config, yes);
      case 'database':
        return this.executeDatabase(plan, yes);
      case 'migrate':
        return this.executeMigrate(plan);
      case 'platform':
        return this.executePlatform(plan);
      case 'dependencies':
        return this.executeDependencies(plan);
      case 'codegen':
        return this.executeCodeGen(plan, fast);
      case 'smoke_test':
        return this.executeSmokeTest(plan);
    }
  }

  /** Run preflight checks (Node version, disk space, ports, SQL connectivity). */
  private async executePreflight(
    plan: InstallPlan,
    config: PartialInstallConfig
  ): Promise<PhaseExecutionResult> {
    const result = await this.preflight.Run({
      TargetDir: plan.Dir,
      Config: config,
      SkipDB: plan.Phases.find((p) => p.Id === 'database')?.Skipped ?? false,
      Emitter: this.emitter,
    });

    if (!result.Passed) {
      const failures = result.Diagnostics.Failures;
      const firstFailure = failures[0];
      throw new InstallerError(
        'preflight',
        'PREFLIGHT_FAILED',
        `Preflight checks failed: ${failures.map((f) => f.Message).join('; ')}`,
        firstFailure?.SuggestedFix ?? 'Resolve the issues above and try again.'
      );
    }

    const warningMessages = result.Diagnostics.Warnings.map((w) => w.Message);
    return { Warnings: warningMessages };
  }

  /** Download and extract the selected MemberJunction release from GitHub. */
  private async executeScaffold(
    plan: InstallPlan,
    config: PartialInstallConfig,
    yes: boolean
  ): Promise<PhaseExecutionResult> {
    const tag = plan.Tag === 'latest' ? undefined : plan.Tag;

    const result = await this.scaffold.Run({
      Tag: tag,
      Dir: plan.Dir,
      Yes: yes,
      Emitter: this.emitter,
    });

    this.emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Installed ${result.Version.Tag} to ${result.ExtractedDir}`,
    });

    return { Warnings: [] };
  }

  /** Gather config values (prompts or defaults) and generate `.env`, `mj.config.cjs`, and environment files. */
  private async executeConfigure(
    plan: InstallPlan,
    config: PartialInstallConfig,
    yes: boolean
  ): Promise<PhaseExecutionResult> {
    const result = await this.configure.Run({
      Dir: plan.Dir,
      Config: { ...this.resolvedConfig, ...config },
      Yes: yes,
      Emitter: this.emitter,
    });

    // Store resolved config for subsequent phases
    this.resolvedConfig = { ...this.resolvedConfig, ...result.Config };

    return { Warnings: [] };
  }

  /** Generate SQL setup/validation scripts and optionally validate database connectivity. */
  private async executeDatabase(
    plan: InstallPlan,
    yes: boolean
  ): Promise<PhaseExecutionResult> {
    const result = await this.databaseProvision.Run({
      Dir: plan.Dir,
      Config: this.resolvedConfig,
      Yes: yes,
      Emitter: this.emitter,
    });

    const warnings: string[] = [];
    if (!result.ValidationPassed) {
      warnings.push('Database validation did not pass. You may need to run the setup script manually.');
    }

    return { Warnings: warnings };
  }

  /** Run Flyway database migrations to create/update the `__mj` schema. */
  private async executeMigrate(plan: InstallPlan): Promise<PhaseExecutionResult> {
    await this.migrate.Run({
      Dir: plan.Dir,
      Config: this.resolvedConfig,
      Emitter: this.emitter,
      VersionTag: plan.Tag,
    });

    return { Warnings: [] };
  }

  /** Patch npm scripts for OS compatibility (e.g. `cross-env` on Windows). */
  private async executePlatform(plan: InstallPlan): Promise<PhaseExecutionResult> {
    const result = await this.platformCompat.Run({
      Dir: plan.Dir,
      DetectedOS: this.detectOS(),
      Emitter: this.emitter,
    });

    const warnings: string[] = [];
    if (result.CrossEnvNeeded) {
      warnings.push('cross-env was added as a dependency. It will be installed in the dependencies phase.');
    }

    return { Warnings: warnings };
  }

  /** Run `npm install` and `npm run build` to install and compile all packages. */
  private async executeDependencies(plan: InstallPlan): Promise<PhaseExecutionResult> {
    const result = await this.dependency.Run({
      Dir: plan.Dir,
      Tag: plan.Tag,
      Emitter: this.emitter,
    });

    return { Warnings: result.Warnings };
  }

  /** Run `mj codegen` to generate entities, manifests, and apply known-issue patches. */
  private async executeCodeGen(plan: InstallPlan, fast: boolean): Promise<PhaseExecutionResult> {
    const result = await this.codeGen.Run({
      Dir: plan.Dir,
      Emitter: this.emitter,
      Fast: fast,
      VersionTag: plan.Tag,
    });

    const warnings: string[] = [];
    if (result.RetryUsed) {
      warnings.push('Code generation required a retry to produce all artifacts.');
    }

    return { Warnings: warnings };
  }

  /** Start MJAPI and Explorer, verify they launch, then shut them down. */
  private async executeSmokeTest(plan: InstallPlan): Promise<PhaseExecutionResult> {
    const result = await this.smokeTest.Run({
      Dir: plan.Dir,
      Config: this.resolvedConfig,
      Emitter: this.emitter,
    });

    const warnings: string[] = [];
    if (!result.ApiRunning) {
      warnings.push('MJAPI did not respond to health checks. Check the API logs.');
    }
    if (!result.ExplorerRunning) {
      warnings.push('Explorer did not respond to health checks. Check the Explorer logs.');
    }

    return { Warnings: warnings };
  }

  // -------------------------------------------------------------------------
  // Diagnostic report generation
  // -------------------------------------------------------------------------

  /**
   * Auto-generate a diagnostic report after an install failure.
   *
   * Collects environment info, install state, sanitized config, and the
   * full event log into a markdown file in the install directory.
   *
   * @param targetDir - Install directory where the report is saved.
   * @param state - Current install checkpoint state.
   * @param result - The install result with failure details.
   * @param config - Resolved config (passwords will be redacted).
   */
  private async generateFailureReport(
    targetDir: string,
    state: InstallState,
    result: InstallResult,
    config: PartialInstallConfig
  ): Promise<void> {
    try {
      const reportData: ReportData = {
        TargetDir: targetDir,
        Trigger: 'install-failure',
        InstallState: state.ToJSON(),
        InstallResult: result,
        Config: config,
        EventLog: this.eventLogger.Entries,
      };

      // Try to get environment info from a quick preflight diagnostic
      try {
        const diagnostics = await this.preflight.RunDiagnostics(targetDir, config, this.emitter);
        reportData.Environment = diagnostics.Environment;
        reportData.Diagnostics = diagnostics;
      } catch {
        // Preflight may fail — that's fine, we generate what we can
      }

      const reportPath = await this.reportGenerator.Generate(reportData);
      this.emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Diagnostic report saved to: ${reportPath}`,
      });
      this.emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Share this report when requesting installation support.',
      });
    } catch {
      // Report generation is best-effort — don't fail the install flow
    }
  }

  /**
   * Generate a diagnostic report for `mj doctor --report`.
   *
   * Collects config file snapshots, service startup logs, key file checks,
   * and all other diagnostic data into a comprehensive markdown report.
   *
   * @param targetDir - Directory being diagnosed.
   * @param state - Install state from checkpoint (if available).
   * @param diagnostics - Completed diagnostic results.
   * @param config - Current config (passwords will be redacted).
   * @returns Absolute path to the generated report file.
   */
  private async generateDoctorReport(
    targetDir: string,
    state: InstallState | null,
    diagnostics: Diagnostics,
    config: PartialInstallConfig,
    extended: boolean = false
  ): Promise<string> {
    // Check key files (fast — always included)
    const keyFiles = await this.reportGenerator.CheckKeyFiles(targetDir);

    const reportData: ReportData = {
      TargetDir: targetDir,
      Trigger: 'doctor-report',
      Environment: diagnostics.Environment,
      Diagnostics: diagnostics,
      Config: config,
      EventLog: this.eventLogger.Entries,
    };

    if (state) {
      reportData.InstallState = state.ToJSON();
    }

    // Extended report: add config file snapshots and service startup logs
    if (extended) {
      this.emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'preflight',
        Message: 'Collecting configuration files...',
      });
      reportData.ConfigFiles = await this.reportGenerator.SnapshotConfigFiles(targetDir);

      this.emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'preflight',
        Message: 'Capturing service startup logs (this may take up to 3 minutes)...',
      });
      reportData.ServiceLogs = await this.captureServiceLogs(targetDir, config);
    }

    // Generate the base report, then inject key files section
    let markdown = this.reportGenerator.Render(reportData);

    // Replace placeholder key files section with actual results
    const keyFilesSection = this.renderKeyFilesSection(keyFiles);
    markdown = markdown.replace(
      /## Key Files\n\n_File existence checks will be populated when the report is generated with a target directory._/,
      keyFilesSection
    );

    // Write final report
    const fsModule = await import('node:fs/promises');
    const filename = extended ? 'mj-diagnostic-report-extended.md' : 'mj-diagnostic-report.md';
    const finalPath = path.join(targetDir, filename);
    await fsModule.writeFile(finalPath, markdown, 'utf-8');

    return finalPath;
  }

  /**
   * Render the key files section with actual existence check results.
   *
   * @param keyFiles - Results from checking key file existence.
   * @returns Markdown section string.
   */
  private renderKeyFilesSection(
    keyFiles: Array<{ Path: string; Description: string; Exists: boolean }>
  ): string {
    const lines = [
      '## Key Files',
      '',
      '| File | Description | Status |',
      '|------|-------------|--------|',
    ];
    for (const file of keyFiles) {
      const status = file.Exists ? 'Found' : '**MISSING**';
      lines.push(`| ${file.Path} | ${file.Description} | ${status} |`);
    }
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Auth validation checks
  // -------------------------------------------------------------------------

  /**
   * Validate authentication configuration across all config files.
   *
   * Checks for common misconfiguration patterns like AUTH_TYPE='msal' with
   * empty CLIENT_ID, or .env and environment.ts having conflicting auth settings.
   *
   * @param targetDir - Install directory to check.
   * @param diagnostics - Diagnostics object to add checks to.
   */
  private async runAuthValidationChecks(
    targetDir: string,
    diagnostics: Diagnostics
  ): Promise<void> {
    const fs = new FileSystemAdapter();

    // Find and parse Explorer environment.ts
    const envTsCandidates = [
      path.join(targetDir, 'apps', 'MJExplorer', 'src', 'environments', 'environment.ts'),
      path.join(targetDir, 'packages', 'MJExplorer', 'src', 'environments', 'environment.ts'),
    ];

    let authType = '';
    let clientId = '';
    let tenantId = '';
    let auth0Domain = '';
    let auth0ClientId = '';
    let envTsFound = false;

    for (const candidate of envTsCandidates) {
      if (await fs.FileExists(candidate)) {
        envTsFound = true;
        const content = await fs.ReadText(candidate);

        // Extract auth values from TypeScript (keys may be quoted or unquoted)
        const authTypeMatch = content.match(/["']?AUTH_TYPE["']?\s*:\s*['"]([^'"]*)['"]/);
        const clientIdMatch = content.match(/["']?CLIENT_ID["']?\s*:\s*['"]([^'"]*)['"]/);
        const tenantIdMatch = content.match(/["']?TENANT_ID["']?\s*:\s*['"]([^'"]*)['"]/);
        const auth0DomainMatch = content.match(/["']?AUTH0_DOMAIN["']?\s*:\s*['"]([^'"]*)['"]/);
        const auth0ClientIdMatch = content.match(/["']?AUTH0_CLIENTID["']?\s*:\s*['"]([^'"]*)['"]/);

        authType = authTypeMatch?.[1] ?? '';
        clientId = clientIdMatch?.[1] ?? '';
        tenantId = tenantIdMatch?.[1] ?? '';
        auth0Domain = auth0DomainMatch?.[1] ?? '';
        auth0ClientId = auth0ClientIdMatch?.[1] ?? '';
        break;
      }
    }

    if (!envTsFound) {
      diagnostics.AddCheck({
        Name: 'Explorer environment.ts',
        Status: 'warn',
        Message: 'Explorer environment.ts not found. MJExplorer may not be installed.',
        SuggestedFix: 'Run "mj install" to generate environment files.',
      });
      this.emitDiagnostic('Explorer environment.ts', 'warn', 'Explorer environment.ts not found.');
      return;
    }

    // Check AUTH_TYPE is set
    if (!authType) {
      diagnostics.AddCheck({
        Name: 'Auth configuration',
        Status: 'warn',
        Message: 'AUTH_TYPE is not set in environment.ts.',
        SuggestedFix: 'Set AUTH_TYPE to "msal" or "auth0" in environment.ts.',
      });
      this.emitDiagnostic('Auth configuration', 'warn', 'AUTH_TYPE is not set in environment.ts.');
      return;
    }

    // MSAL auth checks
    if (authType === 'msal') {
      if (!clientId) {
        diagnostics.AddCheck({
          Name: 'MSAL CLIENT_ID',
          Status: 'fail',
          Message: 'AUTH_TYPE is "msal" but CLIENT_ID is empty. Browser will show Azure login errors.',
          SuggestedFix: 'Set CLIENT_ID in environment.ts to your Azure AD Application (client) ID.',
        });
        this.emitDiagnostic('MSAL CLIENT_ID', 'fail', 'AUTH_TYPE is "msal" but CLIENT_ID is empty.');
      } else {
        diagnostics.AddCheck({ Name: 'MSAL CLIENT_ID', Status: 'pass', Message: `CLIENT_ID is set (${clientId.slice(0, 8)}...)` });
        this.emitDiagnostic('MSAL CLIENT_ID', 'pass', 'CLIENT_ID is configured.');
      }

      if (!tenantId) {
        diagnostics.AddCheck({
          Name: 'MSAL TENANT_ID',
          Status: 'fail',
          Message: 'AUTH_TYPE is "msal" but TENANT_ID is empty. Browser will show Azure login errors.',
          SuggestedFix: 'Set TENANT_ID in environment.ts to your Azure AD Directory (tenant) ID.',
        });
        this.emitDiagnostic('MSAL TENANT_ID', 'fail', 'AUTH_TYPE is "msal" but TENANT_ID is empty.');
      } else {
        diagnostics.AddCheck({ Name: 'MSAL TENANT_ID', Status: 'pass', Message: `TENANT_ID is set (${tenantId.slice(0, 8)}...)` });
        this.emitDiagnostic('MSAL TENANT_ID', 'pass', 'TENANT_ID is configured.');
      }
    }

    // Auth0 checks
    if (authType === 'auth0') {
      if (!auth0Domain) {
        diagnostics.AddCheck({
          Name: 'Auth0 Domain',
          Status: 'fail',
          Message: 'AUTH_TYPE is "auth0" but AUTH0_DOMAIN is empty.',
          SuggestedFix: 'Set AUTH0_DOMAIN in environment.ts (e.g., "your-tenant.us.auth0.com").',
        });
        this.emitDiagnostic('Auth0 Domain', 'fail', 'AUTH_TYPE is "auth0" but AUTH0_DOMAIN is empty.');
      } else {
        diagnostics.AddCheck({ Name: 'Auth0 Domain', Status: 'pass', Message: `AUTH0_DOMAIN is set (${auth0Domain})` });
        this.emitDiagnostic('Auth0 Domain', 'pass', 'AUTH0_DOMAIN is configured.');
      }

      if (!auth0ClientId) {
        diagnostics.AddCheck({
          Name: 'Auth0 Client ID',
          Status: 'fail',
          Message: 'AUTH_TYPE is "auth0" but AUTH0_CLIENTID is empty.',
          SuggestedFix: 'Set AUTH0_CLIENTID in environment.ts.',
        });
        this.emitDiagnostic('Auth0 Client ID', 'fail', 'AUTH_TYPE is "auth0" but AUTH0_CLIENTID is empty.');
      } else {
        diagnostics.AddCheck({ Name: 'Auth0 Client ID', Status: 'pass', Message: 'AUTH0_CLIENTID is set.' });
        this.emitDiagnostic('Auth0 Client ID', 'pass', 'AUTH0_CLIENTID is configured.');
      }
    }

    // Cross-file consistency: check MJAPI .env has matching auth values
    await this.checkApiAuthConsistency(targetDir, authType, fs, diagnostics);
  }

  /**
   * Verify MJAPI .env has auth values consistent with Explorer's environment.ts.
   */
  private async checkApiAuthConsistency(
    targetDir: string,
    explorerAuthType: string,
    fs: FileSystemAdapter,
    diagnostics: Diagnostics
  ): Promise<void> {
    const envCandidates = [
      path.join(targetDir, 'apps', 'MJAPI', '.env'),
      path.join(targetDir, 'packages', 'MJAPI', '.env'),
      path.join(targetDir, '.env'),
    ];

    for (const envPath of envCandidates) {
      if (!(await fs.FileExists(envPath))) continue;

      const content = await fs.ReadText(envPath);

      if (explorerAuthType === 'msal') {
        const hasTenantId = /^TENANT_ID\s*=\s*\S+/m.test(content);
        const hasClientId = /^WEB_CLIENT_ID\s*=\s*\S+/m.test(content);
        if (!hasTenantId || !hasClientId) {
          diagnostics.AddCheck({
            Name: 'MJAPI auth consistency',
            Status: 'warn',
            Message: `Explorer uses MSAL but MJAPI .env (${path.basename(path.dirname(envPath))}) is missing TENANT_ID or WEB_CLIENT_ID.`,
            SuggestedFix: 'Add TENANT_ID and WEB_CLIENT_ID to the MJAPI .env file with the same values as environment.ts.',
          });
          this.emitDiagnostic('MJAPI auth consistency', 'warn', 'MJAPI .env missing MSAL credentials.');
        } else {
          diagnostics.AddCheck({ Name: 'MJAPI auth consistency', Status: 'pass', Message: 'MJAPI .env has MSAL credentials matching Explorer auth type.' });
          this.emitDiagnostic('MJAPI auth consistency', 'pass', 'MJAPI .env MSAL credentials present.');
        }
      }

      if (explorerAuthType === 'auth0') {
        const hasDomain = /^AUTH0_DOMAIN\s*=\s*\S+/m.test(content);
        const hasClientId = /^AUTH0_CLIENT_ID\s*=\s*\S+/m.test(content);
        if (!hasDomain || !hasClientId) {
          diagnostics.AddCheck({
            Name: 'MJAPI auth consistency',
            Status: 'warn',
            Message: `Explorer uses Auth0 but MJAPI .env is missing AUTH0_DOMAIN or AUTH0_CLIENT_ID.`,
            SuggestedFix: 'Add Auth0 credentials to the MJAPI .env file.',
          });
          this.emitDiagnostic('MJAPI auth consistency', 'warn', 'MJAPI .env missing Auth0 credentials.');
        } else {
          diagnostics.AddCheck({ Name: 'MJAPI auth consistency', Status: 'pass', Message: 'MJAPI .env has Auth0 credentials.' });
          this.emitDiagnostic('MJAPI auth consistency', 'pass', 'MJAPI .env Auth0 credentials present.');
        }
      }

      return; // Only check first found .env
    }
  }

  /** Emit a diagnostic event with the given parameters. */
  private emitDiagnostic(check: string, status: 'pass' | 'fail' | 'warn' | 'info', message: string, suggestedFix?: string): void {
    this.emitter.Emit('diagnostic', {
      Type: 'diagnostic',
      Check: check,
      Status: status,
      Message: message,
      SuggestedFix: suggestedFix,
    });
  }

  // -------------------------------------------------------------------------
  // Service log capture
  // -------------------------------------------------------------------------

  /** Readiness patterns for MJAPI startup detection. */
  private static readonly API_READY_PATTERNS: RegExp[] = [/Server ready at/i];

  /** Readiness patterns for Explorer startup detection. */
  private static readonly EXPLORER_READY_PATTERNS: RegExp[] = [
    /Compiled successfully/i,
    /Application bundle generation complete/i,
    /Local:\s+http/i,
  ];

  /** Patterns indicating fatal startup errors. */
  private static readonly FATAL_PATTERNS: RegExp[] = [
    /EADDRINUSE/i,
    /Cannot find module/i,
    /FATAL ERROR/i,
    /Error: listen/i,
    /Missing required environment variable/i,
  ];

  /**
   * Briefly start MJAPI and Explorer to capture their startup output.
   *
   * Starts each service for up to 30 seconds, capturing stdout/stderr.
   * Kills processes after capture. Used by `mj doctor --report` to detect
   * runtime errors like missing modules, auth failures, or DB connectivity.
   *
   * @param targetDir - Install directory where `npm run start:api` is valid.
   * @param config - Current config (for port detection).
   * @returns Array of service log captures.
   */
  private async captureServiceLogs(
    targetDir: string,
    config: PartialInstallConfig
  ): Promise<ServiceLogCapture[]> {
    const results: ServiceLogCapture[] = [];
    const runner = new ProcessRunner();

    // Only attempt if package.json exists (indicates a valid install)
    const fsAdapter = new FileSystemAdapter();
    const pkgJsonPath = path.join(targetDir, 'package.json');
    if (!(await fsAdapter.FileExists(pkgJsonPath))) {
      return results;
    }

    // Capture MJAPI startup
    results.push(await this.captureServiceStartup(
      runner, targetDir, 'MJAPI', ['run', 'start:api'],
      InstallerEngine.API_READY_PATTERNS,
      config.APIPort ?? 4000
    ));

    // Capture Explorer startup
    results.push(await this.captureServiceStartup(
      runner, targetDir, 'Explorer', ['run', 'start:explorer'],
      InstallerEngine.EXPLORER_READY_PATTERNS,
      config.ExplorerPort ?? 4200
    ));

    return results;
  }

  /**
   * Start a single service, capture output for up to 30 seconds, then kill it.
   */
  private async captureServiceStartup(
    runner: ProcessRunner,
    dir: string,
    label: string,
    args: string[],
    readyPatterns: RegExp[],
    port: number
  ): Promise<ServiceLogCapture> {
    const output: string[] = [];
    const startTime = Date.now();
    let started = false;
    let failureReason: string | undefined;
    const captureTimeoutMs = 90_000; // 90 seconds max — MJAPI needs time for DB + metadata bootstrap

    this.emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'preflight',
      Message: `Starting ${label} for log capture...`,
    });

    try {
      // Create a promise that resolves when we detect readiness, fatal error, or timeout
      let resolveCapture: () => void;
      const capturePromise = new Promise<void>((resolve) => { resolveCapture = resolve; });
      const timer = setTimeout(() => resolveCapture!(), captureTimeoutMs);
      let childPid: number | undefined;

      const processPromise = runner.Run('npm', args, {
        Cwd: dir,
        TimeoutMs: captureTimeoutMs + 10_000, // Process timeout slightly longer than capture
        OnSpawn: (pid: number) => { childPid = pid; },
        OnStdout: (line: string) => {
          output.push(line.trimEnd());
          // Check for readiness
          if (readyPatterns.some((p) => p.test(line))) {
            started = true;
            resolveCapture!();
          }
          // Check for fatal errors
          if (InstallerEngine.FATAL_PATTERNS.some((p) => p.test(line))) {
            failureReason = line.trim();
            resolveCapture!();
          }
        },
        OnStderr: (line: string) => {
          output.push(`[stderr] ${line.trimEnd()}`);
          if (InstallerEngine.FATAL_PATTERNS.some((p) => p.test(line))) {
            failureReason = line.trim();
            resolveCapture!();
          }
        },
      });

      // Wait for capture to complete (readiness, fatal error, or timeout)
      await capturePromise;
      clearTimeout(timer);

      // Kill the server process on the port, then kill the entire spawned
      // process tree (npm → turbo → node). Both are needed because killByPort
      // targets the listening server while killTree targets the parent wrapper.
      runner.killByPort(port);
      runner.killTree(childPid);
      // Suppress the expected rejection from killing
      processPromise.catch(() => {});

    } catch {
      // Process failed to start — capture the error
      failureReason = failureReason ?? 'Process failed to start';
    }

    this.emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'preflight',
      Message: `${label} capture complete (${output.length} lines, ${started ? 'started' : 'did not start'}).`,
    });

    return {
      Service: label,
      Started: started,
      Output: output,
      DurationMs: Date.now() - startTime,
      FailureReason: failureReason,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Detect the current operating system from `process.platform`.
   *
   * @returns Normalized OS identifier used by {@link PlatformCompatPhase}.
   */
  private detectOS(): 'windows' | 'macos' | 'linux' | 'other' {
    switch (process.platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'macos';
      case 'linux': return 'linux';
      default: return 'other';
    }
  }
}

/**
 * Internal result from executing a single phase.
 *
 * Each `execute*` method returns this to bubble up non-fatal warnings
 * collected during the phase. Fatal errors are thrown as {@link InstallerError}.
 */
interface PhaseExecutionResult {
  /** Non-fatal warnings collected during the phase. */
  Warnings: string[];
}
