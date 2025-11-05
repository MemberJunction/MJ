import { Command } from '@oclif/core';

export default class Test extends Command {
  static description = 'Run tests (AI evals, scenarios, integrations)';

  static examples = [
    '<%= config.bin %> <%= command.id %> eval active-members-basic',
    '<%= config.bin %> <%= command.id %> list --type=eval',
    '<%= config.bin %> <%= command.id %> validate --type=eval',
  ];

  async run(): Promise<void> {
    this.log('MemberJunction Testing Framework\n');
    this.log('Available commands:');
    this.log('  mj test eval <eval-id>          - Run AI evaluation(s)');
    this.log('  mj test list --type=eval        - List available evals');
    this.log('  mj test validate --type=eval    - Validate eval files');
    this.log('  mj test report --type=eval      - Generate eval report');
    this.log('');
    this.log('Run "mj test COMMAND --help" for more information on a command.');
  }
}
