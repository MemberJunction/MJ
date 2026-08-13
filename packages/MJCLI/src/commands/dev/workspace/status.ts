import { Command, Flags } from '@oclif/core';
import path from 'node:path';
import { GetPnpmVersion } from '../../../lib/dev-workspace/pnpm.js';
import { CollectWorkspaceStatus, RenderStatus } from '../../../lib/dev-workspace/status.js';

/**
 * CLI command: `mj dev workspace status`.
 *
 * Reports the state of a generated cross-repo workspace at the parent
 * directory: which of the four generated files exist, whether a lockfile and
 * node_modules exist, the member list versus the candidates detected on disk,
 * and whether the active pnpm version matches the generated pin.
 */
export default class DevWorkspaceStatus extends Command {
  static description = 'Report the state of the generated cross-repo pnpm workspace at a parent directory';

  static examples = [
    '<%= config.bin %> dev workspace status',
    '<%= config.bin %> dev workspace status --dir ~/code/bluecypress',
  ];

  static flags = {
    dir: Flags.string({
      description: 'Parent directory holding the sibling repo clones',
      default: '.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DevWorkspaceStatus);
    const parentDir = path.resolve(flags.dir);

    try {
      const activePnpm = await GetPnpmVersion(parentDir);
      const status = CollectWorkspaceStatus(parentDir, activePnpm);
      this.log('');
      this.log(RenderStatus(status));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
