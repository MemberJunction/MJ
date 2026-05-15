import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import {
  dockerComposeArgs,
  LOAD_TARGET_SCRIPT,
  requireMonorepoRoot,
  resolveTargetPath,
  spawnCapture,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionRemote extends Command {
  static description =
    'Run the regression suite against a remote URL (Mode B/C/D). Loads a ' +
    'target profile from docker/regression/targets/, resolves env: references, ' +
    'and starts the test-runner with the appropriate MJ_TEST_VAR_* substitutions.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --target=staging-mj',
    '<%= config.bin %> <%= command.id %> --target=./my/custom.target.json',
    '<%= config.bin %> <%= command.id %> --target=byo-app --no-local-stack',
  ];

  static flags = {
    target: Flags.string({
      char: 't',
      description:
        'Target profile to load. Accepts a bare name (resolved to ' +
        'docker/regression/targets/<name>.target.json) or a path.',
      required: true,
    }),
    'no-local-stack': Flags.boolean({
      description:
        'Use the lean `remote-target` profile (test-runner only). Requires DB_HOST/DB_PORT/etc. ' +
        'to point at an external SQL Server. Default behavior boots the full local stack so the ' +
        'runner has an ephemeral DB to record outputs in.',
      default: false,
    }),
    overlay: Flags.string({
      description:
        'Path to a docker-compose overlay (Mode D). Bring up the app under test alongside the ' +
        'test-runner in the same network — the test-runner can then reach it at its compose ' +
        'service name (e.g. http://my-app:3000). Pass multiple times to layer overlays.',
      multiple: true,
    }),
    detach: Flags.boolean({
      char: 'd',
      description: 'Run in the background (docker compose up -d).',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionRemote);
    requireMonorepoRoot();

    if (!existsSync(LOAD_TARGET_SCRIPT)) {
      this.error(`✗ Loader missing: ${LOAD_TARGET_SCRIPT}`);
    }

    const targetPath = resolveTargetPath(flags.target);
    if (!existsSync(targetPath)) {
      this.error(`✗ Target profile not found: ${targetPath}`);
    }

    this.log(`▶ Loading target profile: ${targetPath}`);
    const loaded = await spawnCapture(process.execPath, [
      LOAD_TARGET_SCRIPT,
      '--format=json',
      targetPath,
    ]);
    if (loaded.code !== 0) {
      this.error(`✗ Target profile loader failed (exit ${loaded.code})`);
    }

    let envFromProfile: Record<string, string>;
    try {
      envFromProfile = JSON.parse(loaded.stdout);
    } catch (err) {
      this.error(`✗ Target loader returned malformed JSON: ${(err as Error).message}`);
    }

    const profileName = envFromProfile.TARGET_PROFILE_NAME ?? '(unnamed)';
    const profileKind = envFromProfile.TARGET_PROFILE_KIND ?? 'unknown';
    const baseUrl = envFromProfile.MJ_TEST_VAR_baseUrl ?? '(not set)';
    this.log(`  Profile: ${profileName} (${profileKind})`);
    this.log(`  Base URL: ${baseUrl}`);

    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...envFromProfile };

    // Profile selection: default = "full" so the test-runner has the local
    // ephemeral DB for TestRun/TestRunOutput rows. `--no-local-stack` swaps
    // to the lean remote-target profile (test-runner only) for users with
    // their own external DB.
    const composeProfile = flags['no-local-stack'] ? 'remote-target' : 'full';

    // Resolve overlay paths to absolute so they survive any cwd changes
    // inside docker compose's argument handling.
    const overlays = (flags.overlay ?? []).map((p) => {
      if (!existsSync(p)) this.error(`✗ Overlay file not found: ${p}`);
      return p;
    });
    if (overlays.length > 0) {
      this.log(`  Overlays: ${overlays.join(', ')}`);
    }

    const composeArgs = dockerComposeArgs(composeProfile, ['up'], overlays);
    if (flags.detach) composeArgs.push('-d');

    this.log(`▶ docker compose --profile ${composeProfile} up`);
    const code = await spawnInherit('docker', composeArgs, { env: childEnv });
    if (code !== 0) this.exit(code);
  }
}
