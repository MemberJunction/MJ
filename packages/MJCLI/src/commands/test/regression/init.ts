import { Args, Command, Flags } from '@oclif/core';
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Templates live at the package root (not under src/commands/, which oclif
// recursively scans as commands).
//   dev:  packages/MJCLI/src/init-templates/<name>/
//   dist: packages/MJCLI/dist/init-templates/<name>/   (copy-regression-assets.mjs)
// From this command file at <pkg>/{src,dist}/commands/test/regression/init.{ts,js},
// the package's {src,dist}/ root is three directories up.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', 'init-templates');

export default class TestRegressionInit extends Command {
  static description =
    'Scaffold one of the bundled regression-suite mode templates into the current directory. ' +
    'Adapt the generated files (target profile + optional compose overlay + tests) to point at ' +
    'your app, then run `mj test regression remote --target=...` to execute the suite against it.';

  static examples = [
    '<%= config.bin %> <%= command.id %> generic-web',
    '<%= config.bin %> <%= command.id %> static-file-server',
    '<%= config.bin %> <%= command.id %> remote-mj',
    '<%= config.bin %> <%= command.id %> bring-your-own-app',
    '<%= config.bin %> <%= command.id %> --list',
  ];

  static args = {
    name: Args.string({
      description: 'Template name to scaffold (run with --list to see available).',
      required: false,
    }),
  };

  static flags = {
    list: Flags.boolean({
      description: 'List available templates and exit.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TestRegressionInit);

    if (flags.list) {
      this.listTemplates();
      return;
    }

    if (!args.name) {
      this.error('✗ Missing template name. Run with --list to see available templates.');
    }

    this.scaffold(args.name);
  }

  private listTemplates(): void {
    if (!existsSync(TEMPLATES_DIR)) {
      this.error(
        `✗ Templates directory missing at ${TEMPLATES_DIR}. ` +
          `Reinstall @memberjunction/cli — published bundles include init-templates/.`,
      );
    }
    const entries = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    this.log(`Available templates (${entries.length}):`);
    for (const name of entries) {
      const readme = path.join(TEMPLATES_DIR, name, 'README.md');
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
        return line.replace(/[*_`]/g, '').slice(0, 80);
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  private scaffold(name: string): void {
    const src = path.join(TEMPLATES_DIR, name);
    if (!existsSync(src) || !statSync(src).isDirectory()) {
      this.error(
        `✗ Template '${name}' not found at ${src}. Run with --list to see available templates.`,
      );
    }

    const dest = path.resolve(name);
    if (existsSync(dest)) {
      this.error(`✗ Destination already exists: ${dest}\n  Remove or rename it first.`);
    }

    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });

    this.log(`✓ Scaffolded ./${name}/ from bundled '${name}' template`);
    this.log('');
    this.log('Next steps:');
    this.log(`  1. Edit ${name}/target.json — point baseUrl + auth at your app.`);
    const hasMeta =
      existsSync(path.join(src, 'byo-metadata')) || existsSync(path.join(src, 'metadata'));
    if (hasMeta) {
      this.log(`  2. Adjust the tests + suite under ${name}/ to match your app's workflows.`);
    }
    const hasOverlay = existsSync(path.join(src, 'docker-compose.app.yml'));
    this.log(
      `  3. Run: mj test regression remote --target=./${name}/target.json` +
        (hasOverlay ? ` --overlay=./${name}/docker-compose.app.yml` : ''),
    );
  }
}
