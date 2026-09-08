import { Command, Flags } from '@oclif/core';
import path from 'node:path';
import { ResolveDirSource, WORKSPACE_DIR_ENV_VAR } from '../../../lib/dev-workspace/dir-flag.js';
import { CollectDoctorReport, DoctorHasFailures, RenderDoctor, type DoctorReport } from '../../../lib/dev-workspace/doctor.js';
import { GetPnpmVersion } from '../../../lib/dev-workspace/pnpm.js';
import type { DirSource } from '../../../lib/dev-workspace/types.js';

/**
 * CLI command: `mj dev workspace doctor`.
 *
 * Read-only health check for a generated cross-repo workspace: prints one
 * PASS/WARN/FAIL/SKIP line per check and exits non-zero when any check FAILS, so
 * it can gate a script. It writes nothing, deletes nothing and makes no network
 * call — every fix it finds is printed as a command for the user to run.
 *
 * The check `status` cannot do is the one-copy census: it reads the parent's pnpm
 * virtual store and fails when more than one version of a must-be-single-copy
 * package (Angular, RxJS, zone.js, MJ core/global) is installed there.
 */
export default class DevWorkspaceDoctor extends Command {
  static description =
    'Health-check the generated cross-repo pnpm workspace at a parent directory: workspace files, sentinel, ' +
    'pnpm pin vs. active version, member directories, detected-but-unlisted repos, members carrying a standalone ' +
    'install, and a one-copy census of the parent package store (more than one @angular/core, rxjs, zone.js or ' +
    'MJ core/global is a FAIL). Prints PASS/WARN/FAIL per check and exits non-zero on any FAIL. Read-only.';

  static examples = [
    '<%= config.bin %> dev workspace doctor',
    '<%= config.bin %> dev workspace doctor --dir ~/code/bluecypress',
    `MJ_DEV_WORKSPACE_DIR=~/code/bluecypress <%= config.bin %> dev workspace doctor`,
  ];

  static flags = {
    dir: Flags.string({
      description: `Parent directory holding the sibling repo clones (env: ${WORKSPACE_DIR_ENV_VAR})`,
      env: WORKSPACE_DIR_ENV_VAR,
      default: '.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DevWorkspaceDoctor);
    const parentDir = path.resolve(flags.dir);
    const dirSource = ResolveDirSource(this.argv, process.env[WORKSPACE_DIR_ENV_VAR]);

    const report = await this.collectReport(parentDir, dirSource);
    this.log('');
    this.log(RenderDoctor(report));
    if (DoctorHasFailures(report)) {
      this.exit(1);
    }
  }

  /**
   * Probes the active pnpm version (the one spawn in this command) and collects the
   * report. Collection errors — an unreadable store, a parent that does not exist —
   * become a clean CLI error rather than a stack trace; `this.error` never returns.
   */
  private async collectReport(parentDir: string, dirSource: DirSource): Promise<DoctorReport> {
    try {
      const activePnpm = await GetPnpmVersion(parentDir);
      return CollectDoctorReport(parentDir, activePnpm, dirSource);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error(message);
    }
  }
}
