import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AGENTIC_TEST_RUNNER_IMAGE,
  dockerComposeArgs,
  dockerRunArgs,
  isInsideMonorepo,
  LOAD_TARGET_SCRIPT,
  resolveStandaloneCompose,
  resolveTargetPath,
  spawnCapture,
  spawnInherit,
  STANDALONE_COMPOSE,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionRemote extends Command {
  static description =
    'Run the regression suite against a remote URL (Mode B/C/D). Inside the MJ ' +
    'monorepo it drives the local compose stack; outside it runs the published ' +
    'agentic-test-runner image (no monorepo needed).';

  static examples = [
    '<%= config.bin %> <%= command.id %> --target=staging-mj',
    '<%= config.bin %> <%= command.id %> --target=./my/custom.target.json',
    '<%= config.bin %> <%= command.id %> --target=./app/target.json --overlay=./app/docker-compose.app.yml',
    '<%= config.bin %> <%= command.id %> --target=./t.json --image=memberjunction/agentic-test-runner:v5.30.0 --env-file=./.env',
  ];

  static flags = {
    target: Flags.string({
      char: 't',
      description:
        'Target profile. Bare name (monorepo: docker/regression/targets/<name>.target.json) or a path.',
      required: true,
    }),
    'no-local-stack': Flags.boolean({
      description:
        '(monorepo only) Use the lean `remote-target` profile (test-runner only) instead of the full local stack.',
      default: false,
    }),
    overlay: Flags.string({
      description:
        'docker-compose overlay (Mode D) that boots your app alongside the runner on the same network. May repeat.',
      multiple: true,
    }),
    image: Flags.string({
      description:
        '(external) Published image tag to run. Default: ' + AGENTIC_TEST_RUNNER_IMAGE + '. Pin for reproducibility.',
    }),
    'env-file': Flags.string({
      description:
        '(external) Path to a .env injected into the runner (DB_*, AI_VENDOR_API_KEY__GeminiLLM, auth env: refs).',
    }),
    detach: Flags.boolean({
      char: 'd',
      description: '(monorepo) Run in the background (docker compose up -d).',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionRemote);
    if (isInsideMonorepo()) {
      await this.runInMonorepo(flags);
    } else {
      await this.runExternal(flags);
    }
  }

  /** Inside the monorepo: load the target host-side, drive the compose stack. */
  private async runInMonorepo(flags: Record<string, unknown>): Promise<void> {
    if (!existsSync(LOAD_TARGET_SCRIPT)) this.error(`✗ Loader missing: ${LOAD_TARGET_SCRIPT}`);

    const targetPath = resolveTargetPath(flags.target as string);
    if (!existsSync(targetPath)) this.error(`✗ Target profile not found: ${targetPath}`);

    this.log(`▶ Loading target profile: ${targetPath}`);
    const loaded = await spawnCapture(process.execPath, [LOAD_TARGET_SCRIPT, '--format=json', targetPath]);
    if (loaded.code !== 0) this.error(`✗ Target profile loader failed (exit ${loaded.code})`);

    let envFromProfile: Record<string, string>;
    try {
      envFromProfile = JSON.parse(loaded.stdout);
    } catch (err) {
      this.error(`✗ Target loader returned malformed JSON: ${(err as Error).message}`);
    }

    this.log(`  Profile: ${envFromProfile.TARGET_PROFILE_NAME ?? '(unnamed)'} (${envFromProfile.TARGET_PROFILE_KIND ?? 'unknown'})`);
    this.log(`  Base URL: ${envFromProfile.MJ_TEST_VAR_baseUrl ?? '(not set)'}`);

    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...envFromProfile };
    const composeProfile = (flags['no-local-stack'] as boolean) ? 'remote-target' : 'full';
    const overlays = ((flags.overlay as string[]) ?? []).map((p) => {
      if (!existsSync(p)) this.error(`✗ Overlay file not found: ${p}`);
      return p;
    });
    if (overlays.length > 0) this.log(`  Overlays: ${overlays.join(', ')}`);

    const composeArgs = dockerComposeArgs(composeProfile, ['up'], overlays);
    if (flags.detach as boolean) composeArgs.push('-d');

    this.log(`▶ docker compose --profile ${composeProfile} up`);
    const code = await spawnInherit('docker', composeArgs, { env: childEnv });
    if (code !== 0) this.exit(code);
  }

  /**
   * Outside the monorepo: run the published image. Mode B/C → `docker run`
   * (the image loads --target itself). Mode D (--overlay) → `docker compose`
   * with the bundled standalone compose + the user's app overlay.
   */
  private async runExternal(flags: Record<string, unknown>): Promise<void> {
    const targetPath = resolveTargetPath(flags.target as string);
    if (!existsSync(targetPath)) {
      this.error(`✗ Target profile not found: ${targetPath}\n  Outside the monorepo, pass a path (e.g. --target=./my-suite/target.json).`);
    }
    const image = (flags.image as string) ?? AGENTIC_TEST_RUNNER_IMAGE;
    const envFile = flags['env-file'] ? path.resolve(flags['env-file'] as string) : undefined;
    const targetDir = path.dirname(targetPath);
    const targetFile = path.basename(targetPath);
    const resultsDir = path.resolve('test-results');
    const overlays = ((flags.overlay as string[]) ?? []).map((p) => {
      if (!existsSync(p)) this.error(`✗ Overlay file not found: ${p}`);
      return path.resolve(p);
    });

    if (overlays.length > 0) {
      // Mode D — boot the app overlay alongside the runner via the standalone compose.
      const standalone = resolveStandaloneCompose(STANDALONE_COMPOSE);
      if (!existsSync(standalone)) {
        this.error(`✗ Standalone compose not found (${standalone}). Reinstall @memberjunction/cli or run from the monorepo.`);
      }
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        MJ_IMAGE: image,
        TARGET_DIR: targetDir,
        TARGET_FILE: targetFile,
        USER_ENV_FILE: envFile ?? '/dev/null',
      };
      const args = ['compose', '-f', standalone];
      for (const o of overlays) args.push('-f', o);
      args.push('up', '--abort-on-container-exit', '--exit-code-from', 'test-runner');
      this.log(`▶ docker compose (standalone + ${overlays.length} overlay) — image ${image}`);
      const code = await spawnInherit('docker', args, { env: childEnv });
      if (code !== 0) this.exit(code);
      return;
    }

    // Mode B/C — single `docker run` against the published image.
    this.log(`▶ docker run ${image} run --target=/work/${targetFile}`);
    const code = await spawnInherit(
      'docker',
      dockerRunArgs(image, ['run', `--target=/work/${targetFile}`], {
        mounts: [[targetDir, '/work'], [resultsDir, '/app/test-results']],
        envFile,
      }),
    );
    if (code !== 0) this.exit(code);
  }
}
