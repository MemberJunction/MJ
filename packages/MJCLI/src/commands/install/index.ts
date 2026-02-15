import { select, confirm, input } from '@inquirer/prompts';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import {
  InstallerEngine,
  type PromptEvent,
  type LogEvent,
  type WarnEvent,
  type ErrorEvent,
  type PhaseStartEvent,
  type PhaseEndEvent,
  type StepProgressEvent,
} from '@memberjunction/installer';

import { LegacyInstaller } from '../../lib/legacy-install.js';

export default class Install extends Command {
  static description = 'Install MemberJunction from a GitHub release';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -t v4.3.0',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --yes',
  ];

  static flags = {
    tag: Flags.string({
      char: 't',
      description: 'Release tag to install (e.g. v4.3.0). If omitted, shows a version picker.',
    }),
    dir: Flags.string({
      description: 'Target directory for the installation',
      default: '.',
    }),
    legacy: Flags.boolean({
      description: 'Use the legacy interactive installer (ZIP-only distribution)',
      hidden: true,
    }),
    'dry-run': Flags.boolean({
      description: 'Show the install plan without executing it',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Non-interactive mode: auto-select latest version and accept defaults',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed output',
    }),
    'skip-db': Flags.boolean({
      description: 'Skip database provisioning phases',
    }),
    'skip-start': Flags.boolean({
      description: 'Skip service startup and smoke tests',
    }),
    'no-resume': Flags.boolean({
      description: 'Ignore any existing checkpoint and start fresh',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Install);

    if (flags.legacy) {
      const legacy = new LegacyInstaller(this, flags.verbose ?? false);
      return legacy.Run();
    }

    return this.runEngineInstall(flags);
  }

  // ---------------------------------------------------------------------------
  // Engine-based install
  // ---------------------------------------------------------------------------

  private async runEngineInstall(flags: {
    tag?: string;
    dir: string;
    'dry-run'?: boolean;
    yes?: boolean;
    verbose?: boolean;
    'skip-db'?: boolean;
    'skip-start'?: boolean;
    'no-resume'?: boolean;
  }): Promise<void> {
    const engine = new InstallerEngine();

    this.wireEventHandlers(engine, flags.verbose ?? false);

    const plan = await engine.CreatePlan({
      Tag: flags.tag,
      Dir: flags.dir,
      SkipDB: flags['skip-db'],
      SkipStart: flags['skip-start'],
    });

    if (flags['dry-run']) {
      this.renderDryRun(plan);
      return;
    }

    this.renderHeader();

    const result = await engine.Run(plan, {
      Yes: flags.yes,
      Verbose: flags.verbose,
      NoResume: flags['no-resume'],
    });

    this.renderResult(result);
  }

  // ---------------------------------------------------------------------------
  // Event wiring — bridges engine events to CLI output + inquirer prompts
  // ---------------------------------------------------------------------------

  private wireEventHandlers(engine: InstallerEngine, verbose: boolean): void {
    engine.On('prompt', (event: PromptEvent) => {
      this.handlePromptEvent(event);
    });

    engine.On('phase:start', (event: PhaseStartEvent) => {
      this.log(chalk.cyan(`\u25b8 ${event.Description}`));
    });

    engine.On('phase:end', (event: PhaseEndEvent) => {
      const duration = chalk.dim(`(${this.formatDuration(event.DurationMs)})`);
      if (event.Status === 'completed') {
        this.log(chalk.green(`  \u2713 ${event.Phase} completed ${duration}`));
      } else if (event.Status === 'failed') {
        this.log(chalk.red(`  \u2717 ${event.Phase} failed ${duration}`));
      }
    });

    engine.On('step:progress', (event: StepProgressEvent) => {
      if (verbose) {
        const percent = event.Percent != null ? ` (${event.Percent}%)` : '';
        this.log(chalk.dim(`    ${event.Message}${percent}`));
      }
    });

    engine.On('log', (event: LogEvent) => {
      if (event.Level === 'verbose' && !verbose) return;
      this.log(event.Message);
    });

    engine.On('warn', (event: WarnEvent) => {
      this.log(chalk.yellow(`  \u26a0 ${event.Message}`));
    });

    engine.On('error', (event: ErrorEvent) => {
      this.log(chalk.red(`  \u2717 [${event.Phase}] ${event.Error.message}`));
      if (event.Error.SuggestedFix) {
        this.log(chalk.yellow(`    \u2192 ${event.Error.SuggestedFix}`));
      }
    });
  }

  private async handlePromptEvent(event: PromptEvent): Promise<void> {
    let answer: string;

    switch (event.PromptType) {
      case 'select':
        answer = await select({
          message: event.Message,
          choices: (event.Choices ?? []).map((c) => ({
            name: c.Label,
            value: c.Value,
          })),
        });
        break;

      case 'confirm': {
        const confirmed = await confirm({
          message: event.Message,
          default: event.Default === 'yes' || event.Default === 'true',
        });
        answer = confirmed ? 'yes' : 'no';
        break;
      }

      case 'input':
        answer = await input({
          message: event.Message,
          default: event.Default,
        });
        break;

      default:
        answer = event.Default ?? '';
        break;
    }

    event.Resolve(answer);
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  private renderHeader(): void {
    this.log('');
    this.log(chalk.bold('MemberJunction Installer'));
    this.log('\u2500'.repeat(23));
    this.log('');
  }

  private renderDryRun(plan: { Summarize(): string }): void {
    this.log('');
    this.log(chalk.bold(plan.Summarize()));
    this.log('');
    this.log(chalk.dim('Run without --dry-run to execute this plan.'));
  }

  private renderResult(result: {
    Success: boolean;
    DurationMs: number;
    Warnings: string[];
    PhasesCompleted: string[];
    PhasesFailed: string[];
  }): void {
    this.log('');

    if (result.Success) {
      this.log(chalk.green.bold('Installation completed successfully!'));
      if (result.Warnings.length > 0) {
        this.log(chalk.yellow(`  ${result.Warnings.length} warning(s) during install.`));
      }
      this.log(chalk.dim(`  Duration: ${this.formatDuration(result.DurationMs)}`));
      this.log(chalk.dim(`  Phases: ${result.PhasesCompleted.join(', ')}`));
      return;
    }

    this.log(chalk.red.bold('Installation failed.'));
    if (result.PhasesFailed.length > 0) {
      this.log(chalk.red(`  Failed phase(s): ${result.PhasesFailed.join(', ')}`));
    }
    this.log(chalk.dim(`  Duration: ${this.formatDuration(result.DurationMs)}`));
    this.log('');
    this.log(chalk.yellow('Run "mj install" to resume from the last checkpoint.'));
    this.log(chalk.yellow('Run "mj install --no-resume" to start fresh.'));
    this.log(chalk.yellow('Run "mj doctor" to diagnose issues.'));
    this.error('Installation failed', { exit: 1 });
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
