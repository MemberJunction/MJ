import { Command } from '@oclif/core';
import { existsSync } from 'node:fs';
import {
  GEN_FORMS_SCRIPT,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionGenForms extends Command {
  static description =
    'Regenerate Angular entity forms used by the regression MJExplorer image. ' +
    'Slow (~5 min) — only required after schema or codegen changes.';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  async run(): Promise<void> {
    requireMonorepoRoot();
    if (!existsSync(GEN_FORMS_SCRIPT)) {
      this.error(`✗ ${GEN_FORMS_SCRIPT} not found. Verify the docker/regression/ directory is intact.`);
    }

    const code = await spawnInherit('bash', [GEN_FORMS_SCRIPT]);
    if (code !== 0) this.exit(code);
  }
}
