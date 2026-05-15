import { Command } from '@oclif/core';

export default class TestRegression extends Command {
  static description =
    'MJ Explorer regression test suite — Docker-based LLM-driven browser tests';

  static examples = [
    '<%= config.bin %> <%= command.id %> build      # Build images (incl. gen-forms on first run)',
    '<%= config.bin %> <%= command.id %> up         # Run the full self-contained MJ stack (Mode A)',
    '<%= config.bin %> <%= command.id %> down       # Tear down + wipe DB volumes',
    '<%= config.bin %> <%= command.id %> gen-forms  # Regenerate Angular entity forms',
    '<%= config.bin %> <%= command.id %> compare    # Diff the two most recent runs',
    '<%= config.bin %> <%= command.id %> remote --target=staging-mj  # Mode B/C/D against a remote URL',
    '<%= config.bin %> <%= command.id %> init generic-web            # Scaffold one of the example dirs',
  ];

  async run(): Promise<void> {
    this.log('MJ Explorer Regression Test Suite\n');
    this.log('Available subcommands:');
    this.log('  mj test regression build              Build Docker images for the regression stack');
    this.log('  mj test regression up                 Run the self-contained MJ stack (Mode A)');
    this.log('  mj test regression down               Stop the stack and wipe DB volumes');
    this.log('  mj test regression gen-forms          One-shot: regenerate Angular entity forms');
    this.log('  mj test regression compare            Compare the two most recent run-*/results.json');
    this.log('  mj test regression remote --target=X  Run against a remote URL (Mode B/C/D)');
    this.log('  mj test regression init <name>        Scaffold a starter example into the cwd');
    this.log('');
    this.log('Most subcommands shell out to docker compose using the regression stack at');
    this.log('docker/regression/. `init` works both inside the monorepo (copies locally) and');
    this.log('outside (shells out to the published memberjunction/agentic-test-runner image).');
    this.log('');
    this.log('Run "mj test regression COMMAND --help" for details on each subcommand.');
  }
}
