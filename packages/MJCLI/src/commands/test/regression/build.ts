import { Args, Command, Flags } from '@oclif/core';
import {
  dockerComposeArgs,
  formsFingerprintStatus,
  GEN_FORMS_SCRIPT,
  requireMonorepoRoot,
  spawnInherit,
  writeFormsFingerprint,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionBuild extends Command {
  static description =
    'Build Docker images for the regression stack. When the generated Angular ' +
    'entity forms are missing OR stale vs the current schema (migrations + ' +
    'AssociationDB + MJ version), this first invokes `gen-forms` (~5 min) to ' +
    'regenerate them, so the explorer/api images never bake a schema that no ' +
    'longer matches the DB.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> mjexplorer  # rebuild a specific service',
    '<%= config.bin %> <%= command.id %> --skip-gen-forms',
  ];

  static strict = false;

  static args = {
    service: Args.string({
      description: 'Optional service name(s) to rebuild (e.g. mjexplorer, test-runner).',
      required: false,
    }),
  };

  static flags = {
    'skip-gen-forms': Flags.boolean({
      description:
        'Skip the gen-forms staleness guard, even when the forms are missing or stale. ' +
        'Use only when you know the entity forms are already current.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(TestRegressionBuild);
    requireMonorepoRoot();

    // regenerate the entity forms whenever they're missing OR stale vs
    // the current schema fingerprint — not just when the directory is absent (the
    // old guard silently baked stale forms after a migration edit). Stamp the
    // fingerprint on success so a later build with an unchanged schema is a no-op.
    if (!flags['skip-gen-forms']) {
      const status = formsFingerprintStatus();
      if (!status.fresh) {
        this.log(`▶ Regenerating entity forms — ${status.reason} (gen-forms, ~5 min)...`);
        const genCode = await spawnInherit('bash', [GEN_FORMS_SCRIPT]);
        if (genCode !== 0) this.exit(genCode);
        writeFormsFingerprint(status.current);
        this.log(`  ✓ Forms regenerated; fingerprint ${status.current} recorded.`);
      } else {
        this.log(`▶ Entity forms are current (fingerprint ${status.current}) — skipping gen-forms.`);
      }
    }

    // Pass-through any positional service names so users can rebuild a
    // single image (e.g. `mj test regression build mjexplorer`).
    const services = (argv as string[]).filter(Boolean);
    const composeArgs = dockerComposeArgs('full', ['build', ...services]);

    const code = await spawnInherit('docker', composeArgs);
    if (code !== 0) this.exit(code);
  }
}
