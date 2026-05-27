import { Command, Flags } from '@oclif/core';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  BACPAC_OVERLAY,
  dockerComposeArgs,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionUp extends Command {
  static description =
    'Run the self-contained MJ regression stack (Mode A). Creates a new test-results/run-* folder. ' +
    'With --bacpac, the MJ database is imported from a .bacpac instead of built from scratch.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --detach',
    '<%= config.bin %> <%= command.id %> --bacpac=./db.bacpac --suite="My Suite" --metadata=./my-suite-metadata',
    '<%= config.bin %> <%= command.id %> --bacpac=./db.bacpac --bacpac-no-upgrade',
  ];

  static flags = {
    detach: Flags.boolean({
      char: 'd',
      description: 'Run containers in the background (docker compose up -d).',
      default: false,
    }),
    bacpac: Flags.string({
      description:
        'Path to a .bacpac of a real MJ database to import and test against, instead of ' +
        'building the DB from scratch.',
    }),
    'bacpac-no-upgrade': Flags.boolean({
      description:
        'Import the bacpac as-is — skip `mj migrate` + `mj codegen`. Only safe when the ' +
        'bacpac is already at the current MJ version. Requires --bacpac.',
      default: false,
    }),
    suite: Flags.string({
      description:
        'Name of the test suite to run (TEST_SUITE_NAME). Use with --bacpac + --metadata to run ' +
        'your own suite against the imported DB.',
    }),
    metadata: Flags.string({
      description:
        'Path to a directory of your test + test-suite metadata (pushed before the run). Requires --bacpac.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionUp);
    requireMonorepoRoot();

    if ((flags['bacpac-no-upgrade'] || flags.metadata) && !flags.bacpac) {
      this.error('--bacpac-no-upgrade and --metadata require --bacpac.');
    }

    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    const overlays: string[] = [];

    if (flags.bacpac) {
      const abs = path.resolve(flags.bacpac);
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        this.error(`✗ Bacpac file not found: ${abs}`);
      }
      overlays.push(BACPAC_OVERLAY);
      childEnv.BACPAC_DIR = path.dirname(abs);
      childEnv.BACPAC_FILE = `/app/bacpac/${path.basename(abs)}`;
      childEnv.BACPAC_UPGRADE = flags['bacpac-no-upgrade'] ? 'false' : 'true';
      this.log(`▶ Bacpac: ${abs} (upgrade=${childEnv.BACPAC_UPGRADE})`);

      if (flags.metadata) {
        const metaAbs = path.resolve(flags.metadata);
        if (!existsSync(metaAbs) || !statSync(metaAbs).isDirectory()) {
          this.error(`✗ --metadata directory not found: ${metaAbs}`);
        }
        childEnv.USER_METADATA_DIR = metaAbs;
        childEnv.EXTRA_METADATA_DIRS = '/app/user-metadata';
        this.log(`  Suite metadata: ${metaAbs}`);
      }
    }

    if (flags.suite) {
      childEnv.TEST_SUITE_NAME = flags.suite;
      this.log(`  Suite: ${flags.suite}`);
    }

    const composeArgs = dockerComposeArgs('full', ['up'], overlays);
    if (flags.detach) composeArgs.push('-d');

    const code = await spawnInherit('docker', composeArgs, { env: childEnv });
    if (code !== 0) this.exit(code);
  }
}
