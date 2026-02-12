/**
 * InstallerEngine — the core orchestrator for MemberJunction installs.
 *
 * This class is headless and event-driven. It never writes to stdout directly.
 * Frontends (CLI, VSCode, Docker) subscribe to events to render progress,
 * handle prompts, and display diagnostics.
 */

import { InstallerEventEmitter, type InstallerEventMap } from './events/InstallerEvents.js';
import { InstallerError, type PhaseId } from './errors/InstallerError.js';
import { GitHubReleaseProvider } from './adapters/GitHubReleaseProvider.js';
import { PreflightPhase } from './phases/PreflightPhase.js';
import { ScaffoldPhase } from './phases/ScaffoldPhase.js';
import { InstallPlan, type CreatePlanInput, type RunOptions, type DoctorOptions, type InstallResult } from './models/InstallPlan.js';
import { InstallState } from './models/InstallState.js';
import { InstallConfigDefaults, type PartialInstallConfig } from './models/InstallConfig.js';
import type { VersionInfo } from './models/VersionInfo.js';
import type { Diagnostics } from './models/Diagnostics.js';

/**
 * Ordered list of all install phases. Used for plan generation and
 * checkpoint/resume logic.
 */
const ALL_PHASES: PhaseId[] = [
  'preflight',
  'scaffold',
  'database',
  'migrate',
  'configure',
  'platform',
  'dependencies',
  'codegen',
  'smoke_test',
];

export class InstallerEngine {
  private emitter = new InstallerEventEmitter();
  private github = new GitHubReleaseProvider();
  private preflight = new PreflightPhase();
  private scaffold = new ScaffoldPhase();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Subscribe to installer events.
   */
  On<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.On(event, handler);
  }

  /**
   * Unsubscribe from installer events.
   */
  Off<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.Off(event, handler);
  }

  /**
   * List available MemberJunction release versions from GitHub.
   */
  async ListVersions(includePrerelease: boolean = false): Promise<VersionInfo[]> {
    return this.github.ListReleases(includePrerelease);
  }

  /**
   * Build an install plan (dry-run friendly — no side effects).
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
    if (input.SkipStart) {
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
   * Currently implements Milestone 1 phases (preflight + scaffold).
   * Later milestones will add remaining phases.
   */
  async Run(plan: InstallPlan, options?: RunOptions): Promise<InstallResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const phasesCompleted: PhaseId[] = [];
    const phasesFailed: PhaseId[] = [];
    const verbose = options?.Verbose ?? false;
    const yes = options?.Yes ?? false;
    const config: PartialInstallConfig = {
      ...plan.Config,
      ...options?.Config,
    };

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
        const result = await this.executePhase(phaseInfo.Id, plan, config, yes);

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

        // Stop on failure
        return {
          Success: false,
          DurationMs: Date.now() - startTime,
          Warnings: warnings,
          PhasesCompleted: phasesCompleted,
          PhasesFailed: phasesFailed,
        };
      }
    }

    return {
      Success: true,
      DurationMs: Date.now() - startTime,
      Warnings: warnings,
      PhasesCompleted: phasesCompleted,
      PhasesFailed: phasesFailed,
    };
  }

  /**
   * Run diagnostics on an existing or target install directory.
   */
  async Doctor(targetDir: string, options?: DoctorOptions): Promise<Diagnostics> {
    const config: PartialInstallConfig = { ...InstallConfigDefaults };

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

    return diagnostics;
  }

  /**
   * Resume a previously interrupted install from a state file.
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

  private async executePhase(
    phaseId: PhaseId,
    plan: InstallPlan,
    config: PartialInstallConfig,
    yes: boolean
  ): Promise<PhaseExecutionResult> {
    switch (phaseId) {
      case 'preflight':
        return this.executePreflight(plan, config);

      case 'scaffold':
        return this.executeScaffold(plan, config, yes);

      // Remaining phases will be implemented in Milestones 2 & 3
      case 'database':
      case 'migrate':
      case 'configure':
      case 'platform':
      case 'dependencies':
      case 'codegen':
      case 'smoke_test':
        this.emitter.Emit('warn', {
          Type: 'warn',
          Phase: phaseId,
          Message: `Phase "${phaseId}" is not yet implemented (coming in Milestone 2/3).`,
        });
        return { Warnings: [`Phase "${phaseId}" not yet implemented`] };
    }
  }

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
}

interface PhaseExecutionResult {
  Warnings: string[];
}
