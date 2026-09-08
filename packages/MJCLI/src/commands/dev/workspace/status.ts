import { Command, Flags } from '@oclif/core';
import path from 'node:path';
import { ResolveDirSource, WORKSPACE_DIR_ENV_VAR } from '../../../lib/dev-workspace/dir-flag.js';
import { GetPnpmVersion } from '../../../lib/dev-workspace/pnpm.js';
import { CollectWorkspaceStatus, RenderStatus } from '../../../lib/dev-workspace/status.js';

/**
 * CLI command: `mj dev workspace status`.
 *
 * Reports the state of a generated cross-repo workspace at the parent
 * directory: which of the four generated files exist, whether a lockfile and
 * node_modules exist, whether the sentinel manifest is present, the member list
 * versus the candidates detected on disk, how `--dir` was resolved, and whether
 * the active pnpm version matches the generated pin. Read-only — writes nothing.
 */
export default class DevWorkspaceStatus extends Command {
  static description =
    'Report the state of the generated cross-repo pnpm workspace at a parent directory: generated files, ' +
    'lockfile, node_modules, sentinel presence, members vs. detected candidates, and the pnpm pin. Read-only.';

  static examples = [
    '<%= config.bin %> dev workspace status',
    '<%= config.bin %> dev workspace status --dir ~/code/bluecypress',
    `MJ_DEV_WORKSPACE_DIR=~/code/bluecypress <%= config.bin %> dev workspace status`,
  ];

  static flags = {
    dir: Flags.string({
      description: `Parent directory holding the sibling repo clones (env: ${WORKSPACE_DIR_ENV_VAR})`,
      env: WORKSPACE_DIR_ENV_VAR,
      default: '.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DevWorkspaceStatus);
    const parentDir = path.resolve(flags.dir);
    const dirSource = ResolveDirSource(this.argv, process.env[WORKSPACE_DIR_ENV_VAR]);

    try {
      const activePnpm = await GetPnpmVersion(parentDir);
      const status = CollectWorkspaceStatus(parentDir, activePnpm, dirSource);
      this.log('');
      this.log(RenderStatus(status));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
