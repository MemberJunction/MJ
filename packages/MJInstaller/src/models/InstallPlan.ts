/**
 * Install plan model for the MJ installer engine.
 *
 * An {@link InstallPlan} describes what the engine will do — which phases
 * to run, which to skip, and what configuration to use. Plans are created
 * by {@link InstallerEngine.CreatePlan} and can be inspected (dry-run)
 * before execution via {@link InstallPlan.Summarize}.
 *
 * @module models/InstallPlan
 *
 * @example
 * ```typescript
 * const engine = new InstallerEngine();
 * const plan = await engine.CreatePlan({
 *   Tag: 'v5.1.0',
 *   Dir: '/path/to/install',
 *   SkipDB: true,
 *   Fast: true,
 * });
 * console.log(plan.Summarize());
 * const result = await engine.Run(plan, { Yes: true });
 * ```
 */

import type { PhaseId } from '../errors/InstallerError.js';
import type { PartialInstallConfig } from './InstallConfig.js';

/**
 * Metadata for a single phase within an install plan.
 *
 * @see InstallPlan.Phases — the ordered list of phase info objects.
 */
export interface PhaseInfo {
  /** Phase identifier (e.g., `'preflight'`, `'scaffold'`). */
  Id: PhaseId;
  /** Human-readable description of what the phase does. */
  Description: string;
  /** Whether this phase will be skipped during execution. */
  Skipped: boolean;
}

/**
 * Input parameters for {@link InstallerEngine.CreatePlan}.
 *
 * Controls which version to install, where to install it, and which
 * phases to skip. Missing fields are filled with defaults or prompted
 * for interactively during execution.
 *
 * @example
 * ```typescript
 * const input: CreatePlanInput = {
 *   Tag: 'v5.1.0',
 *   Dir: './my-mj-install',
 *   SkipDB: true,
 *   Fast: true,
 * };
 * ```
 */
export interface CreatePlanInput {
  /** Release tag, e.g. `"v5.1.0"`. If omitted, version selection is interactive. */
  Tag?: string;
  /** Target directory for the install (absolute or relative). */
  Dir: string;
  /** Pre-filled configuration (fields not present will be prompted for). */
  Config?: PartialInstallConfig;
  /** Skip the database provisioning phase (`--skip-db`). */
  SkipDB?: boolean;
  /** Skip the smoke test phase (`--skip-start`). */
  SkipStart?: boolean;
  /** Skip the codegen phase (`--skip-codegen`). */
  SkipCodeGen?: boolean;
  /**
   * Fast mode: automatically skips the smoke test and optimizes post-codegen
   * steps by quick-checking manifests before rebuilding (`--fast`).
   */
  Fast?: boolean;
}

/**
 * Runtime options passed to {@link InstallerEngine.Run}.
 *
 * These options control execution behavior (non-interactive mode, verbosity,
 * resume behavior) rather than what gets installed.
 */
export interface RunOptions {
  /** Non-interactive mode — auto-answer prompts with defaults or config values. */
  Yes?: boolean;
  /** Show plan without executing (dry-run). */
  DryRun?: boolean;
  /** Enable verbose logging (emits `'verbose'` level log events). */
  Verbose?: boolean;
  /** Ignore existing checkpoint state file and start fresh (`--no-resume`). */
  NoResume?: boolean;
  /** Pre-filled configuration for auto-answering prompts in `--yes` mode. */
  Config?: PartialInstallConfig;
  /**
   * Path to a JSON config file with install settings.
   * Values from the file override environment variables and defaults,
   * but are overridden by {@link Config} (programmatic overrides).
   */
  ConfigFile?: string;
  /**
   * Fast mode: skip smoke test and optimize post-codegen steps by
   * quick-checking manifests before running the full rebuild cycle.
   */
  Fast?: boolean;
}

/**
 * Options for {@link InstallerEngine.Doctor}.
 */
export interface DoctorOptions {
  /** Show detailed diagnostic output. */
  Verbose?: boolean;
}

/**
 * Final result returned by {@link InstallerEngine.Run} after all phases
 * have been executed (or after a failure stops execution).
 *
 * @example
 * ```typescript
 * const result = await engine.Run(plan, { Yes: true });
 * if (result.Success) {
 *   console.log(`Install completed in ${Math.round(result.DurationMs / 1000)}s`);
 * } else {
 *   console.error(`Failed phases: ${result.PhasesFailed.join(', ')}`);
 * }
 * ```
 */
export interface InstallResult {
  /** Whether all phases completed successfully. */
  Success: boolean;
  /** Total elapsed time in milliseconds. */
  DurationMs: number;
  /** Non-fatal warnings collected across all phases. */
  Warnings: string[];
  /** Phase IDs that completed successfully (in execution order). */
  PhasesCompleted: PhaseId[];
  /** Phase IDs that failed (typically contains at most one entry, since execution stops on failure). */
  PhasesFailed: PhaseId[];
}

/**
 * Human-readable descriptions for each installer phase.
 * Used by {@link InstallPlan.Summarize} and the CLI progress display.
 */
const PhaseDescriptions: Record<PhaseId, string> = {
  preflight: 'Check prerequisites (Node, npm, disk, ports, DB)',
  scaffold: 'Download and extract release',
  database: 'Generate and validate database scripts',
  migrate: 'Run database migrations',
  configure: 'Generate configuration files',
  platform: 'Cross-platform compatibility checks',
  dependencies: 'Install and build dependencies',
  codegen: 'Run CodeGen and validate artifacts',
  smoke_test: 'Start services and run smoke tests',
};

/**
 * An install plan that describes the full sequence of phases the engine
 * will execute, including which phases to skip.
 *
 * Created by {@link InstallerEngine.CreatePlan} and passed to
 * {@link InstallerEngine.Run} for execution. Can also be inspected
 * via {@link Summarize} for dry-run display.
 *
 * @example
 * ```typescript
 * const plan = new InstallPlan('v5.1.0', '/path/to/install', config, new Set(['smoke_test']));
 * console.log(plan.Summarize());
 * // Install Plan
 * // ────────────
 * //   Tag:       v5.1.0
 * //   Directory: /path/to/install
 * //   ...
 * //   Phases:
 * //          preflight      Check prerequisites (Node, npm, disk, ports, DB)
 * //     (skip) smoke_test     Start services and run smoke tests
 * ```
 */
export class InstallPlan {
  /** Git tag of the version to install (e.g., `"v5.1.0"` or `"latest"`). */
  Tag: string;

  /** Absolute path to the target install directory. */
  Dir: string;

  /** Merged configuration (defaults + user-supplied + prompted values). */
  Config: PartialInstallConfig;

  /** Ordered list of phases with skip flags and descriptions. */
  Phases: PhaseInfo[];

  /** Timestamp when this plan was created. */
  CreatedAt: Date;

  /**
   * Create a new install plan.
   *
   * @param tag - Git tag to install (e.g., `"v5.1.0"` or `"latest"`).
   * @param dir - Target install directory.
   * @param config - Merged configuration values.
   * @param skipPhases - Set of phase IDs to skip during execution.
   */
  constructor(tag: string, dir: string, config: PartialInstallConfig, skipPhases: Set<PhaseId> = new Set()) {
    this.Tag = tag;
    this.Dir = dir;
    this.Config = config;
    this.CreatedAt = new Date();

    const allPhases: PhaseId[] = [
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

    this.Phases = allPhases.map((id) => ({
      Id: id,
      Description: PhaseDescriptions[id],
      Skipped: skipPhases.has(id),
    }));
  }

  /**
   * Generate a human-readable summary of the install plan.
   *
   * Used for dry-run display and CLI output. Shows the tag, directory,
   * creation timestamp, and each phase with its skip status.
   *
   * @returns Multi-line string suitable for terminal display.
   */
  Summarize(): string {
    const lines: string[] = [
      `Install Plan`,
      `────────────`,
      `  Tag:       ${this.Tag}`,
      `  Directory: ${this.Dir}`,
      `  Created:   ${this.CreatedAt.toISOString()}`,
      ``,
      `  Phases:`,
    ];

    for (const phase of this.Phases) {
      const status = phase.Skipped ? '(skip)' : '     ';
      lines.push(`    ${status} ${phase.Id.padEnd(14)} ${phase.Description}`);
    }

    return lines.join('\n');
  }
}
