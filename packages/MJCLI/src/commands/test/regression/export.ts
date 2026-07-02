import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AGENTIC_TEST_RUNNER_IMAGE,
  dockerRunArgs,
  INLINE_REPORT_SCRIPT,
  isInsideMonorepo,
  RESULTS_DIR,
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
        'Which run to export. A folder name (under test-results/) or a path. Defaults to the latest run.',
    }),
    image: Flags.string({
      description:
        '(external) Published image used to inline reports. Default: ' + AGENTIC_TEST_RUNNER_IMAGE + '.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionExport);

    if (isInsideMonorepo()) {
      // On-disk inline-report.cjs against docker/regression/test-results.
      if (!existsSync(INLINE_REPORT_SCRIPT)) this.error(`✗ Exporter missing: ${INLINE_REPORT_SCRIPT}`);
      const args = [INLINE_REPORT_SCRIPT];
      if (flags.run) {
        const runDir =
          flags.run.includes('/') || path.isAbsolute(flags.run)
            ? path.resolve(flags.run)
            : path.resolve(RESULTS_DIR, flags.run);
        if (!existsSync(runDir)) this.error(`✗ Run directory not found: ${runDir}`);
        args.push(runDir);
      }
      const code = await spawnInherit(process.execPath, args);
      if (code !== 0) this.exit(code);
      return;
    }

    // External: run the image's `export` subcommand against the mounted run dir.
    // Results live under ./test-results; mount it and resolve the run inside the container.
    const image = (flags.image as string) ?? AGENTIC_TEST_RUNNER_IMAGE;
    const resultsDir = path.resolve('test-results');
    if (!existsSync(resultsDir)) this.error(`✗ No ./test-results directory found to export from.`);
    const runArg = flags.run ? `/app/test-results/${path.basename(flags.run)}` : '/app/test-results/latest';
    this.log(`▶ docker run ${image} export ${runArg}`);
    const code = await spawnInherit(
      'docker',
      dockerRunArgs(image, ['export', runArg], { mounts: [[resultsDir, '/app/test-results']] }),
    );
    if (code !== 0) this.exit(code);
  }
}
