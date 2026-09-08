import { Command, Flags } from '@oclif/core';
import path from 'node:path';
import {
  dockerComposeArgs,
  mintRunId,
  readRunSnapshot,
  requireMonorepoRoot,
  resolveRunDir,
  runDirFor,
  spawnTee,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionRerunFailures extends Command {
  static description =
    'Re-run only the failing tests from a prior run — at low concurrency and 0 ' +
    'retries by default (the recheck-storm lesson: retrying deterministic failures ' +
    'under the same conditions is the single largest waste in the suite). Reuses the ' +
    'already-running stack (run `up` first), so this replaces hand-authored recheck ' +
    'suite JSONs.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --run run-20260721T120000Z --workers 2',
    '<%= config.bin %> <%= command.id %> --status Timeout',
  ];

  static flags = {
    run: Flags.string({ description: 'Prior run id (run-<utc>) or path to pull failures from. Default: the newest run.' }),
    workers: Flags.integer({ min: 1, default: 2, description: 'Parallel workers (default 2 — deliberately low to avoid re-creating the load that caused the failures).' }),
    retries: Flags.integer({ min: 0, default: 0, description: 'Extra attempts per test (default 0 — do not retry deterministic failures).' }),
    status: Flags.string({ default: 'Failed,Timeout,Error', description: 'Comma-separated statuses to treat as "failure" and rerun.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionRerunFailures);
    requireMonorepoRoot();

    const priorDir = resolveRunDir(flags.run);
    if (!priorDir) {
      this.error(flags.run ? `No run found for "${flags.run}".` : 'No prior run found under test-results/. Run `up` first.');
    }
    const snap = readRunSnapshot(priorDir);
    if (snap.source === 'none') {
      this.error(`No results found in ${snap.runId} (results.partial.json / results.json missing).`);
    }

    const wanted = new Set(flags.status.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const names = [...new Set(
      snap.tests.filter(t => wanted.has(String(t.status).toLowerCase())).map(t => t.testName),
    )];

    // Comma is the TEST_NAME_FILTER delimiter — a name containing one can't be
    // transported safely, so drop it with a loud warning rather than mis-split.
    const transportable = names.filter(n => !n.includes(','));
    const dropped = names.filter(n => n.includes(','));
    if (dropped.length > 0) {
      this.warn(`${dropped.length} failing test name(s) contain a comma and can't be selected: ${dropped.join(' | ')}`);
    }
    if (transportable.length === 0) {
      this.log(`No rerunnable ${flags.status} tests in ${snap.runId} — nothing to do.`);
      return;
    }

    const runId = mintRunId();
    this.log(`▶ Rerun: ${runId}`);
    this.log(`  ${transportable.length} failing test(s) from ${snap.runId}, ${flags.workers} worker(s), ${flags.retries} retries`);
    this.log(`  Output: ${runDirFor(runId)}`);

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      RUN_ID: runId,
      TEST_NAME_FILTER: transportable.join(','),
      MAX_PARALLEL_WORKERS: String(flags.workers),
      MAX_RETRIES: String(flags.retries),
    };

    // Reuse the running infrastructure — a one-off runner container against the
 // stack a prior `up` left running. If the stack is down, the runner's
    // preflight fails fast with a clear "stack unreachable" message.
    const consoleLog = path.join(runDirFor(runId), 'console.log');
    const runArgs = dockerComposeArgs('full', ['run', '--rm', 'test-runner']);
    const code = await spawnTee('docker', runArgs, consoleLog, { env: childEnv });
    this.log(`\n▶ Rerun ${runId} finished (exit ${code}).`);
    if (code !== 0) this.exit(code);
  }
}
