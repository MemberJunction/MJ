import { Command, Flags } from '@oclif/core';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  AGENTIC_TEST_RUNNER_IMAGE,
  BACPAC_OVERLAY,
  BACPAC_STANDALONE_COMPOSE,
  dockerComposeArgs,
  isInsideMonorepo,
  resolveStandaloneCompose,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionUp extends Command {
  static description =
    'Run the self-contained MJ regression stack (Mode A). With --bacpac, the DB is imported ' +
    'from a .bacpac. Inside the monorepo this builds from source; outside, --bacpac runs the ' +
    'published-image stack (plain `up` is monorepo-only).';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --detach',
    '<%= config.bin %> <%= command.id %> --bacpac=./db.bacpac --suite="My Suite" --metadata=./my-suite-metadata',
    '<%= config.bin %> <%= command.id %> --bacpac=./db.bacpac --bacpac-no-upgrade',
  ];

  static flags = {
    detach: Flags.boolean({ char: 'd', description: 'Run containers in the background (docker compose up -d).', default: false }),
    bacpac: Flags.string({ description: 'Path to a .bacpac of a real MJ database to import and test against.' }),
    'bacpac-no-upgrade': Flags.boolean({
      description: 'Import the bacpac as-is — skip migrate/codegen. Only safe at the current MJ version. Requires --bacpac.',
      default: false,
    }),
    suite: Flags.string({ description: 'Test suite to run (TEST_SUITE_NAME). Use with --bacpac + --metadata.' }),
    metadata: Flags.string({ description: 'Directory of your test + test-suite metadata (pushed before the run). Requires --bacpac.' }),
    image: Flags.string({ description: '(external) Published agentic-test-runner image. Default: ' + AGENTIC_TEST_RUNNER_IMAGE + '.' }),
    'explorer-image': Flags.string({ description: '(external bacpac) Published Explorer image (prerequisite). Default: memberjunction/explorer:latest.' }),
    'env-file': Flags.string({ description: '(external) .env injected into the runner (auth env: refs).' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionUp);
    if ((flags['bacpac-no-upgrade'] || flags.metadata) && !flags.bacpac) {
      this.error('--bacpac-no-upgrade and --metadata require --bacpac.');
    }
    if (isInsideMonorepo()) {
      await this.runInMonorepo(flags);
    } else {
      await this.runExternal(flags);
    }
  }

  /** Inside the monorepo: build-from-source compose (+ bacpac overlay). */
  private async runInMonorepo(flags: Record<string, unknown>): Promise<void> {
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    const overlays: string[] = [];

    if (flags.bacpac) {
      const abs = path.resolve(flags.bacpac as string);
      if (!existsSync(abs) || !statSync(abs).isFile()) this.error(`✗ Bacpac file not found: ${abs}`);
      overlays.push(BACPAC_OVERLAY);
      childEnv.BACPAC_DIR = path.dirname(abs);
      childEnv.BACPAC_FILE = `/app/bacpac/${path.basename(abs)}`;
      childEnv.BACPAC_UPGRADE = flags['bacpac-no-upgrade'] ? 'false' : 'true';
      this.log(`▶ Bacpac: ${abs} (upgrade=${childEnv.BACPAC_UPGRADE})`);
      if (flags.metadata) {
        const metaAbs = path.resolve(flags.metadata as string);
        if (!existsSync(metaAbs) || !statSync(metaAbs).isDirectory()) this.error(`✗ --metadata directory not found: ${metaAbs}`);
        childEnv.USER_METADATA_DIR = metaAbs;
        childEnv.EXTRA_METADATA_DIRS = '/app/user-metadata';
        this.log(`  Suite metadata: ${metaAbs}`);
      }
    }
    if (flags.suite) { childEnv.TEST_SUITE_NAME = flags.suite as string; this.log(`  Suite: ${flags.suite}`); }

    const composeArgs = dockerComposeArgs('full', ['up'], overlays);
    if (flags.detach) composeArgs.push('-d');
    const code = await spawnInherit('docker', composeArgs, { env: childEnv });
    if (code !== 0) this.exit(code);
  }

  /** Outside the monorepo: only --bacpac is supported (published-image full stack). */
  private async runExternal(flags: Record<string, unknown>): Promise<void> {
    if (!flags.bacpac) {
      this.error(
        'Plain `up` boots the full self-contained MJ stack built from source — monorepo-only.\n' +
        '  Outside the monorepo, use `up --bacpac=<file>` (published-image stack) or ' +
        '`mj test regression remote --target=<file>` for a URL.',
      );
    }
    const abs = path.resolve(flags.bacpac as string);
    if (!existsSync(abs) || !statSync(abs).isFile()) this.error(`✗ Bacpac file not found: ${abs}`);
    if (!flags.metadata) this.error('External --bacpac requires --metadata (a dir with target.json + metadata/ for your suite).');
    const metaAbs = path.resolve(flags.metadata as string);
    if (!existsSync(metaAbs) || !statSync(metaAbs).isDirectory()) this.error(`✗ --metadata directory not found: ${metaAbs}`);

    const compose = resolveStandaloneCompose(BACPAC_STANDALONE_COMPOSE);
    if (!existsSync(compose)) this.error(`✗ Standalone bacpac compose not found (${compose}). Reinstall @memberjunction/cli.`);

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      MJ_IMAGE: (flags.image as string) ?? AGENTIC_TEST_RUNNER_IMAGE,
      MJ_EXPLORER_IMAGE: (flags['explorer-image'] as string) ?? 'memberjunction/explorer:latest',
      BACPAC_DIR: path.dirname(abs),
      BACPAC_FILE: path.basename(abs),
      BACPAC_UPGRADE: flags['bacpac-no-upgrade'] ? 'false' : 'true',
      TARGET_DIR: metaAbs,
      TARGET_FILE: 'target.json',
      USER_ENV_FILE: flags['env-file'] ? path.resolve(flags['env-file'] as string) : '/dev/null',
      TEST_SUITE_NAME: (flags.suite as string) ?? '',
    };

    this.warn(
      'External bacpac requires the `memberjunction/explorer` image (a published-Explorer prerequisite ' +
      'that is a separate workstream). If it cannot be pulled, the explorer service will fail to start.',
    );
    this.log(`▶ docker compose (bacpac-standalone) — bacpac=${abs} upgrade=${childEnv.BACPAC_UPGRADE}`);
    const code = await spawnInherit(
      'docker',
      ['compose', '-f', compose, 'up', '--abort-on-container-exit', '--exit-code-from', 'test-runner'],
      { env: childEnv },
    );
    if (code !== 0) this.exit(code);
  }
}
