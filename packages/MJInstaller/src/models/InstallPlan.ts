/**
 * An install plan describes what the engine will do. It is created by
 * CreatePlan() and can be inspected (dry-run) before execution.
 */

import type { PhaseId } from '../errors/InstallerError.js';
import type { PartialInstallConfig } from './InstallConfig.js';

export interface PhaseInfo {
  Id: PhaseId;
  Description: string;
  Skipped: boolean;
}

export interface CreatePlanInput {
  /** Release tag, e.g. "v4.1.0". If omitted, version selection is interactive. */
  Tag?: string;
  /** Target directory for the install */
  Dir: string;
  /** Pre-filled configuration (fields not present will be prompted) */
  Config?: PartialInstallConfig;
  /** Skip database provisioning */
  SkipDB?: boolean;
  /** Skip MJAPI / Explorer startup */
  SkipStart?: boolean;
  /** Skip CodeGen */
  SkipCodeGen?: boolean;
  /** Fast mode: skip smoke test and optimize post-codegen steps */
  Fast?: boolean;
}

export interface RunOptions {
  /** Non-interactive mode — auto-answer prompts with defaults or config values */
  Yes?: boolean;
  /** Show plan without executing */
  DryRun?: boolean;
  /** Verbose logging */
  Verbose?: boolean;
  /** Ignore checkpoint, start fresh */
  NoResume?: boolean;
  /** Pre-filled configuration for auto-answering prompts */
  Config?: PartialInstallConfig;
  /** Fast mode: skip smoke test and optimize post-codegen steps */
  Fast?: boolean;
}

export interface DoctorOptions {
  /** Show detailed output */
  Verbose?: boolean;
}

export interface InstallResult {
  Success: boolean;
  DurationMs: number;
  Warnings: string[];
  PhasesCompleted: PhaseId[];
  PhasesFailed: PhaseId[];
}

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

export class InstallPlan {
  Tag: string;
  Dir: string;
  Config: PartialInstallConfig;
  Phases: PhaseInfo[];
  CreatedAt: Date;

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
