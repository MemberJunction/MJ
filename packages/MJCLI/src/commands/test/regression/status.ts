import { Command, Flags } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  dockerComposeArgs,
  readRunSnapshot,
  requireMonorepoRoot,
  resolveRunDir,
  spawnInherit,
  type RunSnapshot,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionStatus extends Command {
  static description =
    'Show how far along and how healthy the current (or a specified) run is — ' +
    'progress, pass/fail/flaky counts, and container health — from the DR-D5 ' +
    'incremental snapshot, without waiting for the run to finish.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --watch',
    '<%= config.bin %> <%= command.id %> --run run-20260721T120000Z',
  ];

  static flags = {
    run: Flags.string({ description: 'Run id (run-<utc>) or path. Default: the newest run.' }),
    watch: Flags.boolean({ char: 'w', description: 'Refresh every 5s until interrupted.', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionStatus);
    requireMonorepoRoot();

    do {
      if (flags.watch) console.clear(); // fresh view each refresh
      this.printRunSnapshot(flags.run);
      this.log('');
      await this.printContainers();
      if (flags.watch) {
        this.log('\n(watching — Ctrl-C to stop)');
        await new Promise(r => setTimeout(r, 5000));
      }
    } while (flags.watch);
  }

  private printRunSnapshot(runFlag?: string): void {
    const runDir = resolveRunDir(runFlag);
    if (!runDir) {
      this.log(runFlag ? `No run found for "${runFlag}".` : 'No runs found under test-results/.');
      return;
    }
    const snap = readRunSnapshot(runDir);
    this.log(`Run:     ${snap.runId}`);
    this.log(`Status:  ${snap.status}${snap.source === 'partial' ? ' (live)' : snap.source === 'final' ? ' (final)' : ''}`);
    if (snap.updatedAt) this.log(`Updated: ${snap.updatedAt}`);

    if (snap.source === 'none') {
      this.log('No results yet (run just started, or results.partial.json not written).');
    } else {
      const c = snap.counts;
      this.log(
        `Tests:   ${snap.completed} completed  —  ` +
          `${c.passed} passed, ${c.failed} failed, ${c.error} error, ${c.timeout} timeout` +
          (c.flaky ? `, ${c.flaky} flaky` : ''),
      );
      const mean = this.meanDurationMs(snap);
      if (mean != null) this.log(`Pace:    ~${(mean / 1000).toFixed(1)}s/test (mean of completed)`);
    }

    this.printHealth(runDir);
    this.log(`Output:  ${runDir}`);
    if (existsSync(path.join(runDir, 'console.log'))) this.log(`Console: ${path.join(runDir, 'console.log')}`);
  }

 /** health-state.json, when present (best-effort — the supervisor writes it). */
  private printHealth(runDir: string): void {
    const p = path.join(runDir, 'health-state.json');
    if (!existsSync(p)) return;
    try {
      const h = JSON.parse(readFileSync(p, 'utf8'));
      const reasons = Array.isArray(h.reasons) && h.reasons.length ? ` (${h.reasons.join('; ')})` : '';
      this.log(`Health:  ${h.state ?? 'unknown'}${reasons}`);
    } catch { /* best-effort */ }
  }

  private meanDurationMs(snap: RunSnapshot): number | null {
    const durations = snap.tests.map(t => t.durationMs).filter(d => typeof d === 'number' && d > 0);
    if (durations.length === 0) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  private async printContainers(): Promise<void> {
    this.log('Containers:');
    await spawnInherit('docker', dockerComposeArgs(undefined, ['--profile', '*', 'ps']));
  }
}
