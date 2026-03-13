import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import {
  InstallerEngine,
  type DiagnosticEvent,
  type Diagnostics,
  type LogEvent,
} from '@memberjunction/installer';

export default class Doctor extends Command {
  static description = 'Diagnose a MemberJunction installation';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dir ./my-mj-project',
    '<%= config.bin %> <%= command.id %> --verbose',
    '<%= config.bin %> <%= command.id %> --report',
    '<%= config.bin %> <%= command.id %> --report_extended',
  ];

  static flags = {
    dir: Flags.string({
      description: 'Target directory to diagnose',
      default: '.',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed output including suggested fixes inline',
    }),
    report: Flags.boolean({
      char: 'r',
      description: 'Generate a diagnostic report file (mj-diagnostic-report.md) for sharing with support',
    }),
    report_extended: Flags.boolean({
      description: 'Generate an extended report with config file snapshots and service startup log capture (~60s longer)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);
    const engine = new InstallerEngine();
    const targetDir = path.resolve(flags.dir);

    this.log('');
    this.log(chalk.bold('MJ Doctor'));
    this.log('─────────');

    engine.On('diagnostic', (event: DiagnosticEvent) => {
      const icon = this.formatStatusIcon(event.Status);
      this.log(`${icon} ${event.Message}`);
      if (event.SuggestedFix && flags.verbose) {
        this.log(chalk.dim(`     Fix: ${event.SuggestedFix}`));
      }
    });

    // Capture log events for report path notification
    engine.On('log', (event: LogEvent) => {
      if (event.Message.startsWith('Diagnostic report saved to:')) {
        this.log('');
        this.log(chalk.cyan(event.Message));
        this.log(chalk.dim('Share this file when requesting installation support. Passwords are redacted.'));
      }
    });

    const result: Diagnostics = await engine.Doctor(targetDir, {
      Verbose: flags.verbose,
      Report: flags.report,
      ReportExtended: flags.report_extended,
    });

    this.log('');

    if (result.HasFailures) {
      this.log(chalk.red.bold('Issues found:'));
      for (const failure of result.Failures) {
        this.log(chalk.red(`  ✗ ${failure.Message}`));
        if (failure.SuggestedFix) {
          this.log(chalk.yellow(`    → ${failure.SuggestedFix}`));
        }
      }
      this.log('');
    }

    const warningCount = result.Warnings.length;
    const failureCount = result.Failures.length;
    const passCount = result.Checks.filter((c) => c.Status === 'pass').length;

    if (failureCount > 0) {
      this.log(chalk.red(`${failureCount} issue(s), ${warningCount} warning(s), ${passCount} passed`));
    } else if (warningCount > 0) {
      this.log(chalk.yellow(`${warningCount} warning(s), ${passCount} passed — no critical issues`));
    } else {
      this.log(chalk.green(`All ${passCount} checks passed`));
    }

    if (flags.report || flags.report_extended) {
      const reportName = flags.report_extended
        ? 'mj-diagnostic-report-extended.md'
        : 'mj-diagnostic-report.md';
      this.log('');
      this.log(chalk.cyan(`Report generated at: ${path.join(targetDir, reportName)}`));
      if (flags.report_extended) {
        this.log(chalk.dim('Extended report includes config file snapshots and service startup logs.'));
      }
    }
  }

  private formatStatusIcon(status: string): string {
    switch (status) {
      case 'pass': return chalk.green('[PASS]');
      case 'fail': return chalk.red('[FAIL]');
      case 'warn': return chalk.yellow('[WARN]');
      case 'info': return chalk.blue('[INFO]');
      default:     return `[${status.toUpperCase()}]`;
    }
  }
}
