import { Args, Command, Flags } from '@oclif/core';
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import {
  AGENTIC_TEST_RUNNER_IMAGE,
  findMonorepoExamplesDir,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionInit extends Command {
  static description =
    'Scaffold one of the bundled regression-suite examples into the current directory. ' +
    'When run inside the MJ monorepo, copies from docker/regression/examples/ directly; ' +
    'otherwise, shells out to `docker run memberjunction/agentic-test-runner init <name>`.';

  static examples = [
    '<%= config.bin %> <%= command.id %> generic-web',
    '<%= config.bin %> <%= command.id %> static-file-server',
    '<%= config.bin %> <%= command.id %> remote-mj --image=memberjunction/agentic-test-runner:v5.30.0',
    '<%= config.bin %> <%= command.id %> --list',
  ];

  static args = {
    name: Args.string({
      description: 'Example directory name to scaffold (run with --list to see available).',
      required: false,
    }),
  };

  static flags = {
    list: Flags.boolean({
      description: 'List available examples and exit.',
      default: false,
    }),
    'force-docker': Flags.boolean({
      description:
        'Even inside the monorepo, use `docker run` against the published image instead of ' +
        'copying from docker/regression/examples/. Useful for testing what an external adopter sees.',
      default: false,
    }),
    image: Flags.string({
      description:
        'Override the docker image tag (default: memberjunction/agentic-test-runner:latest). ' +
        'Pin to a specific version like memberjunction/agentic-test-runner:v5.30.0 for reproducibility.',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TestRegressionInit);

    // Bare `--list` doesn't require a name; show inventory + exit.
    if (flags.list) {
      this.listExamples();
      return;
    }

    if (!args.name) {
      this.error('✗ Missing example name. Run with --list to see available examples.');
    }

    const examplesDir = findMonorepoExamplesDir();
    const useDocker = flags['force-docker'] || !examplesDir;
    if (useDocker) {
      await this.runViaDocker(args.name, flags.image);
    } else {
      this.runLocal(args.name, examplesDir);
    }
  }

  private listExamples(): void {
    const examplesDir = findMonorepoExamplesDir();
    if (!examplesDir) {
      this.log(
        'Not inside the MJ monorepo — listing requires the bundled examples directory. ' +
          'Run `docker run --rm ' +
          AGENTIC_TEST_RUNNER_IMAGE +
          ' help` to see what the image ships.',
      );
      return;
    }
    const entries = readdirSync(examplesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    this.log(`Available examples (${entries.length}):`);
    for (const name of entries) {
      const readme = path.join(examplesDir, name, 'README.md');
      const oneLiner = this.firstNonHeadingLine(readme);
      this.log(`  ${name.padEnd(24)} ${oneLiner ?? ''}`);
    }
    this.log('');
    this.log(`Scaffold one with: mj test regression init <name>`);
  }

  /**
   * Pluck the first non-heading line from a README.md to use as a one-line
   * description in the inventory. Returns undefined when the README is
   * missing or only contains headings.
   */
  private firstNonHeadingLine(readmePath: string): string | undefined {
    if (!existsSync(readmePath)) return undefined;
    try {
      const content = readFileSync(readmePath, 'utf8');
      for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('```')) continue;
        // Strip basic markdown emphasis for cleaner output.
        return line.replace(/[*_`]/g, '').slice(0, 80);
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  private runLocal(name: string, examplesDir: string): void {
    const src = path.join(examplesDir, name);
    if (!existsSync(src) || !statSync(src).isDirectory()) {
      this.error(
        `✗ Example '${name}' not found at ${src}. Run with --list to see available examples.`,
      );
    }

    const dest = path.resolve(name);
    if (existsSync(dest)) {
      this.error(
        `✗ Destination already exists: ${dest}\n  Remove or rename it first.`,
      );
    }

    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });

    this.log(`✓ Scaffolded ./${name}/ from ${src}`);
    this.log('');
    this.log('Next steps:');
    this.log(`  1. Edit ${name}/target.json — point baseUrl + auth at your app.`);
    if (existsSync(path.join(src, 'metadata'))) {
      this.log(`  2. Adjust tests under ${name}/metadata/tests/ to match your app.`);
    }
    this.log(
      `  3. Run: mj test regression remote --target=./${name}/target.json` +
        (existsSync(path.join(src, 'docker-compose.app.yml'))
          ? ` --overlay=./${name}/docker-compose.app.yml`
          : ''),
    );
  }

  private async runViaDocker(name: string, imageOverride?: string): Promise<void> {
    const image = imageOverride ?? AGENTIC_TEST_RUNNER_IMAGE;
    this.log(`▶ docker run --rm -v $(pwd):/out ${image} init ${name}`);

    const cwd = process.cwd();
    const code = await spawnInherit('docker', [
      'run',
      '--rm',
      '-v',
      `${cwd}:/out`,
      // Best-effort host-uid passthrough so scaffolded files aren't owned
      // by root on Linux hosts. (No-op on macOS where Docker Desktop
      // handles uid mapping itself.)
      '-e',
      `HOST_UID=${process.getuid?.() ?? ''}`,
      '-e',
      `HOST_GID=${process.getgid?.() ?? ''}`,
      image,
      'init',
      name,
    ]);
    if (code !== 0) this.exit(code);
  }
}
