import { Command, Flags } from '@oclif/core';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  AGENTIC_TEST_RUNNER_IMAGE,
  BACPAC_OVERLAY,
  BACPAC_STANDALONE_COMPOSE,
  dockerComposeArgs,
  formsFingerprintStatus,
  FULL_INFRA_SERVICES,
  isInsideMonorepo,
  mintRunId,
  parseMemoryToBytes,
  resolveStandaloneCompose,
  runDirFor,
  spawnInherit,
  spawnTee,
  suggestWorkers,
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
    retries: Flags.integer({
      min: 0,
      description: 'Extra attempts per failing test (MAX_RETRIES). 0 disables retries. Default 2. ' +
        'Retrying deterministic failures under the conditions that produced them is the ' +
        'single largest waste in the suite — set 0 when re-running known-failing tests.',
    }),
    workers: Flags.integer({
      min: 1,
      description: 'Parallel workers (MAX_PARALLEL_WORKERS). Default 3. Size against runner memory — ' +
        'each browser worker needs ~1.5g; 4 workers OOM\'d the default-memory host.',
    }),
    // DR-F5: resource-sizing flags → the existing compose mem_limit env knobs
    // (shell env wins over --env-file, the same mechanism --workers/--retries use).
    'runner-memory': Flags.string({ description: 'Runner container memory limit (MJ_REGRESSION_RUNNER_MEM_LIMIT), e.g. 8g. Default 7g — sizes the Chromium browser workers.' }),
    'db-memory': Flags.string({ description: 'SQL Server container memory limit (MJ_REGRESSION_SQL_MEM_LIMIT), e.g. 6g. Default 4g.' }),
    'api-memory': Flags.string({ description: 'MJAPI container memory limit (MJ_REGRESSION_API_MEM_LIMIT), e.g. 12g. Default 10g.' }),
    metadata: Flags.string({ description: 'Directory of your test + test-suite metadata (pushed before the run). Requires --bacpac.' }),
    'skip-forms-check': Flags.boolean({
      description: 'Skip the DR-C5 tripwire that refuses to start the self-contained stack when the ' +
        'baked entity forms are missing or stale vs the current schema. Override only when you know ' +
        'the images already carry current forms.',
      default: false,
    }),
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

    // DR-C5: the self-contained stack bakes the generated entity forms into the
    // explorer/api images at build time, so `up` cannot fix stale forms itself
    // (already-built images keep the forms they were built with). Refuse to run
    // a stack whose baked forms are missing/stale vs the current schema and point
    // the user at `build`, rather than silently testing a schema the DB no longer
    // has. Bacpac runs import their own DB, so this AssociationDemo-forms check
    // doesn't apply to them.
    if (!flags.bacpac && !flags['skip-forms-check']) {
      const status = formsFingerprintStatus();
      if (!status.fresh) {
        this.error(
          `✗ Entity forms are missing or stale — ${status.reason}.\n` +
          `  The self-contained stack bakes these forms into the explorer/api images at build\n` +
          `  time; starting now would test a schema that no longer matches the database.\n` +
          `  Fix:  mj test regression build   (regenerates the forms and rebuilds the images)\n` +
          `  Override (not recommended):  --skip-forms-check`,
        );
      }
    }

    // DR-F1: mint the run id host-side (unless the caller pre-set RUN_ID, e.g.
    // a resume) so the host owns the run's identity + output dir from launch.
    const runId = process.env.RUN_ID || mintRunId();
    childEnv.RUN_ID = runId;
    this.log(`▶ Run: ${runId}`);
    this.log(`  Output: ${runDirFor(runId)}`);

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
    // DR-E2: forward the sizing knobs as env for compose interpolation. Guard on
    // `!== undefined` — `--retries 0` is valid and falsy (it's the whole point:
    // disable retries when re-running known failures).
    if (flags.retries !== undefined) { childEnv.MAX_RETRIES = String(flags.retries); }
    if (flags.workers !== undefined) { childEnv.MAX_PARALLEL_WORKERS = String(flags.workers); }

    // DR-F5: memory-sizing flags → the compose mem_limit env knobs. Validate up
    // front so a typo'd size aborts here (~instant) rather than as a cryptic
    // compose error after infra has started.
    const memFlags: Array<[string, string]> = [
      ['runner-memory', 'MJ_REGRESSION_RUNNER_MEM_LIMIT'],
      ['db-memory', 'MJ_REGRESSION_SQL_MEM_LIMIT'],
      ['api-memory', 'MJ_REGRESSION_API_MEM_LIMIT'],
    ];
    for (const [flag, envVar] of memFlags) {
      const val = flags[flag] as string | undefined;
      if (val === undefined) continue;
      if (parseMemoryToBytes(val) === null) {
        this.error(`✗ --${flag} must be a docker memory size like 8g / 512m / 2048k (got: ${val})`);
      }
      childEnv[envVar] = val;
    }

    // DR-F5: effective-config banner — one place stating exactly what this run
    // will use, so a mis-set flag is visible before the ~10-min suite. The worker
    // line carries the DR-A4 suggestion derived from the runner's memory budget:
    // advisory only, it never overrides an explicit --workers.
    const runnerMem = childEnv.MJ_REGRESSION_RUNNER_MEM_LIMIT ?? '7g'; // compose default
    const runnerMemBytes = parseMemoryToBytes(runnerMem);
    const suggested = runnerMemBytes !== null ? suggestWorkers(runnerMemBytes) : null;
    const workersLine = flags.workers !== undefined ? String(flags.workers) : '3 (default)';
    this.log('  ── effective config ──');
    this.log(`     workers: ${workersLine}` + (suggested !== null ? `   [A4 suggests ≤${suggested} for a ${runnerMem} runner]` : ''));
    this.log(`     retries: ${flags.retries !== undefined ? String(flags.retries) : '2 (default)'}`);
    this.log(`     memory:  runner=${runnerMem}  db=${childEnv.MJ_REGRESSION_SQL_MEM_LIMIT ?? '4g'}  api=${childEnv.MJ_REGRESSION_API_MEM_LIMIT ?? '10g'}`);

    // DR-F2: detached, or bacpac (its own one-shot import flow), keep the classic
    // single `up`. Plain `--abort-on-container-exit` is unsafe here — the one-shot
    // db-setup exits 0 early and would abort the whole stack — so the exit-code fix
    // uses the up-then-run split below instead.
    if (flags.detach || flags.bacpac) {
      const composeArgs = dockerComposeArgs('full', ['up'], overlays);
      if (flags.detach) composeArgs.push('-d');
      const code = await spawnInherit('docker', composeArgs, { env: childEnv });
      if (code !== 0) this.exit(code);
      return;
    }

    // DR-F2: attached Mode A — start infrastructure detached and wait for health,
    // then run the test-runner in the FOREGROUND so its exit code (the suite
    // verdict, propagated by the entrypoint's `exit $EXIT_CODE`) reaches the shell
    // verbatim. Plain `docker compose up` swallowed that code and blocked forever
    // after the runner finished. The runner's stream is teed to the run dir's
    // console.log so an attached run also leaves a complete host-side record.
    const upArgs = dockerComposeArgs('full', ['up', '-d', '--wait', ...FULL_INFRA_SERVICES], overlays);
    const upCode = await spawnInherit('docker', upArgs, { env: childEnv });
    if (upCode !== 0) {
      this.error(`✗ Infrastructure failed to start/stay healthy (exit ${upCode}). See logs above; the runner was not started.`);
    }

    const consoleLog = path.join(runDirFor(runId), 'console.log');
    const runArgs = dockerComposeArgs('full', ['run', '--rm', 'test-runner'], overlays);
    const code = await spawnTee('docker', runArgs, consoleLog, { env: childEnv });
    this.log(`\n▶ Run ${runId} finished (exit ${code}). Stack left running — 'mj test regression down' to tear down, 'stop' to pause.`);
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
      RUN_ID: process.env.RUN_ID || mintRunId(), // DR-F1: host-owned run identity
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
