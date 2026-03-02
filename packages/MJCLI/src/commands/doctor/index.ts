import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import {
  InstallerEngine,
  type DiagnosticEvent,
  type Diagnostics,
} from '@memberjunction/installer';

export default class Doctor extends Command {
  static description = 'Diagnose a MemberJunction installation';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dir ./my-mj-project',
    '<%= config.bin %> <%= command.id %> --verbose',
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
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);
    const engine = new InstallerEngine();

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

    const result: Diagnostics = await engine.Doctor(flags.dir);

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
