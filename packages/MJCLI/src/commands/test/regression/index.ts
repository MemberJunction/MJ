import { Command } from '@oclif/core';

export default class TestRegression extends Command {
  static description =
    'MJ Explorer regression test suite — Docker-based LLM-driven browser tests';

  static examples = [
    '<%= config.bin %> <%= command.id %> build      # Build images (incl. gen-forms on first run)',
    '<%= config.bin %> <%= command.id %> up         # Run the full self-contained MJ stack (Mode A)',
    '<%= config.bin %> <%= command.id %> status --watch   # How far along / how healthy the run is',
    '<%= config.bin %> <%= command.id %> logs test-runner -f  # Tail runner logs',
    '<%= config.bin %> <%= command.id %> rerun-failures  # Re-run just the prior run\'s failures',
    '<%= config.bin %> <%= command.id %> stop       # Pause the stack (keeps DB; inspectable)',
    '<%= config.bin %> <%= command.id %> down       # Tear down + wipe DB volumes',
    '<%= config.bin %> <%= command.id %> compare    # Diff the two most recent runs',
    '<%= config.bin %> <%= command.id %> remote --target=staging-mj  # Mode B/C/D against a remote URL',
  ];

  async run(): Promise<void> {
    this.log('MJ Explorer Regression Test Suite\n');
    this.log('Available subcommands:');
    this.log('  mj test regression build              Build Docker images for the regression stack');
    this.log('  mj test regression up                 Run the self-contained MJ stack (Mode A)');
    this.log('  mj test regression status [--watch]   Progress + pass/fail/flaky counts + container health');
    this.log('  mj test regression logs [service] -f  Tail stack logs (wrapper over docker compose logs)');
    this.log('  mj test regression rerun-failures     Re-run just the prior run\'s failures (2 workers, 0 retries)');
    this.log('  mj test regression stop               Pause the stack, keep the DB (inspectable; use down to wipe)');
    this.log('  mj test regression down               Stop the stack and wipe DB volumes');
    this.log('  mj test regression gen-forms          One-shot: regenerate Angular entity forms');
    this.log('  mj test regression compare            Compare the two most recent run-*/results.json');
    this.log('  mj test regression export             Export a run as a portable standalone HTML report');
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
