import { Command } from '@oclif/core';

export default class Test extends Command {
  static description = 'MemberJunction Testing Framework - Execute and manage tests';

  static examples = [
    '<%= config.bin %> <%= command.id %> run <test-id>',
    '<%= config.bin %> <%= command.id %> run --name="Active Members Count"',
    '<%= config.bin %> <%= command.id %> suite <suite-id>',
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> list --suites',
    '<%= config.bin %> <%= command.id %> validate --all',
  ];

  async run(): Promise<void> {
    this.log('MemberJunction Testing Framework\n');
    this.log('Available commands:');
    this.log('  mj test run <test-id>           - Execute a single test');
    this.log('  mj test suite <suite-id>        - Execute a test suite');
    this.log('  mj test list                    - List available tests');
    this.log('  mj test validate                - Validate test definitions');
    this.log('  mj test history                 - View test execution history');
    this.log('  mj test compare                 - Compare test runs for regressions');
    this.log('');
    this.log('Legacy commands (file-based evals):');
    this.log('  mj test eval <eval-id>          - Run file-based AI evaluation');
    this.log('  mj test report --type=eval      - Generate eval report');
    this.log('');
    this.log('Run "mj test COMMAND --help" for more information on a command.');
  }
}
