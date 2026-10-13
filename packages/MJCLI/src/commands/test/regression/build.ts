import { Args, Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  DockerComposeArgs,
  GEN_FORMS_SCRIPT,
  RequireMonorepoRoot,
  SpawnInherit,
} from '../../../lib/regression/docker-helpers.js';

const GENERATED_FORMS_DIR = 'docker/regression/.docker-generated/MJExplorer-forms/Entities';

export default class TestRegressionBuild extends Command {
  static description =
    'Build Docker images for the regression stack. On first run (or whenever ' +
    '.docker-generated/ is empty) this also invokes `gen-forms` to generate ' +
    'Angular entity forms — that step takes ~5 minutes but only happens when ' +
    'the form output is missing.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> mjexplorer  # rebuild a specific service',
    '<%= config.bin %> <%= command.id %> --skip-gen-forms',
  ];

  static strict = false;

  static args = {
    service: Args.string({
      description: 'Optional service name(s) to rebuild (e.g. mjexplorer, test-runner).',
      required: false,
    }),
  };

  static flags = {
    'skip-gen-forms': Flags.boolean({
      description:
        'Skip the gen-forms guard, even when .docker-generated/ is empty. Use when you know ' +
        'the entity forms are already generated.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(TestRegressionBuild);
    RequireMonorepoRoot();

    if (!flags['skip-gen-forms'] && !existsSync(path.resolve(GENERATED_FORMS_DIR))) {
      this.log(
        '▶ .docker-generated/ is empty — running `gen-forms` first (one-time, ~5 min)...',
      );
      const genCode = await SpawnInherit('bash', [GEN_FORMS_SCRIPT]);
      if (genCode !== 0) this.exit(genCode);
    }

    // Pass-through any positional service names so users can rebuild a
    // single image (e.g. `mj test regression build mjexplorer`).
    const services = (argv as string[]).filter(Boolean);
    const composeArgs = DockerComposeArgs('full', ['build', ...services]);

    const code = await SpawnInherit('docker', composeArgs);
    if (code !== 0) this.exit(code);
  }
}
