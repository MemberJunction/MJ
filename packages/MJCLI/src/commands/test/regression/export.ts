import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  INLINE_REPORT_SCRIPT,
  RESULTS_DIR,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionExport extends Command {
  static description =
    'Export a regression run\'s HTML report as a single self-contained file ' +
    '(screenshots inlined as base64), producing report.standalone.html. ' +
    'Portable for sharing or attaching as a CI artifact.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --run=run-20260526T220118Z',
    '<%= config.bin %> <%= command.id %> --run=./some/other/run-dir',
  ];

  static flags = {
    run: Flags.string({
      char: 'r',
      description:
        'Which run to export. Accepts a folder name under docker/regression/test-results/ ' +
        'or a path to a run directory. Defaults to the most recent run (the `latest` symlink).',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionExport);
    requireMonorepoRoot();

    if (!existsSync(INLINE_REPORT_SCRIPT)) {
      this.error(`✗ Exporter missing: ${INLINE_REPORT_SCRIPT}`);
    }

    // No --run → let inline-report.cjs default to the `latest` symlink.
    // A path-like value passes through; a bare name resolves under test-results/.
    const args = [INLINE_REPORT_SCRIPT];
    if (flags.run) {
      const runDir =
        flags.run.includes('/') || path.isAbsolute(flags.run)
          ? path.resolve(flags.run)
          : path.resolve(RESULTS_DIR, flags.run);
      if (!existsSync(runDir)) {
        this.error(`✗ Run directory not found: ${runDir}`);
      }
      args.push(runDir);
    }

    const code = await spawnInherit(process.execPath, args);
    if (code !== 0) this.exit(code);
  }
}
