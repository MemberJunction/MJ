import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import {
  AssertCleanAllowed,
  ExecuteClean,
  PlanClean,
  RenderCleanPlan,
} from '../../../lib/dev-workspace/clean.js';
import { WORKSPACE_DIR_ENV_VAR } from '../../../lib/dev-workspace/dir-flag.js';
import { PrebundleRecordsOf, RevertPrebundleExcludes, type PrebundleRevertResult } from '../../../lib/dev-workspace/prebundle.js';
import type { CleanPlan, CleanResult } from '../../../lib/dev-workspace/types.js';

/**
 * CLI command: `mj dev workspace clean`.
 *
 * Removes exactly the residue `mj dev workspace` leaves at a parent directory:
 * the three generated files (plus a `turbo.json` an earlier version wrote, when the
 * sentinel lists it), the sentinel manifest, `pnpm-lock.yaml`, and the
 * `node_modules` tree. Member repo checkouts are never touched, except that the
 * `angular.json` prebundle-exclude entries the sentinel records are taken back out.
 *
 * Deletion is gated on proof of ownership — without `--force`, the sentinel the
 * generator writes must be present and carry its marker, so a hand-made workspace
 * cannot be torn down by accident.
 */
export default class DevWorkspaceClean extends Command {
  static description =
    'Remove exactly the generated cross-repo workspace residue at a parent directory: the three generated files, ' +
    'the .mj-dev-workspace.json sentinel, pnpm-lock.yaml and the node_modules tree, and takes the angular.json ' +
    'prebundle-exclude entries the sentinel records back out. Member repo checkouts are otherwise untouched, and ' +
    '.bak backups are never touched. Without --force a valid sentinel must be present, so a hand-made workspace ' +
    'cannot be torn down by accident. Preview first with --dry-run, which deletes nothing and exits 0.';

  static examples = [
    '<%= config.bin %> dev workspace clean --dir ~/code/bluecypress --dry-run',
    '<%= config.bin %> dev workspace clean --dir ~/code/bluecypress',
    '<%= config.bin %> dev workspace clean --dir ~/code/bluecypress --dry-run --force',
    '<%= config.bin %> dev workspace clean --dir ~/code/bluecypress --force',
  ];

  static flags = {
    dir: Flags.string({
      description: `Parent directory holding the sibling repo clones (must NOT itself be a git repo; env: ${WORKSPACE_DIR_ENV_VAR})`,
      env: WORKSPACE_DIR_ENV_VAR,
      default: '.',
    }),
    'dry-run': Flags.boolean({
      description: 'List what would be removed and exit without deleting anything',
      default: false,
    }),
    force: Flags.boolean({
      description: 'Clean even without the generator sentinel (hand-made or pre-sentinel workspaces)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DevWorkspaceClean);
    const parentDir = path.resolve(flags.dir);

    try {
      const sentinel = AssertCleanAllowed(parentDir, flags.force);
      if (sentinel.Kind !== 'valid') {
        this.warn(`Cleaning without a valid sentinel (--force): only the files this tool owns will be removed.`);
      }
      const plan = PlanClean(parentDir, sentinel);
      // Before ExecuteClean: the sentinel holding the records is removed last, so a failure here
      // leaves it in place and a re-run can finish.
      const prebundle = RevertPrebundleExcludes(parentDir, PrebundleRecordsOf(sentinel), flags['dry-run']);
      if (flags['dry-run']) {
        this.reportDryRun(plan, prebundle);
        return;
      }
      this.reportPrebundle(prebundle, 'removed');
      this.reportRemovals(ExecuteClean(plan), plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }

  /** Prints the plan and states plainly that nothing was deleted. */
  private reportDryRun(plan: CleanPlan, prebundle: PrebundleRevertResult): void {
    for (const line of RenderCleanPlan(plan)) {
      this.log(line);
    }
    this.reportPrebundle(prebundle, 'would remove');
    this.log(chalk.dim('\n--dry-run: nothing was deleted.'));
  }

  /** Logs the angular.json prebundle entries taken out (or that would be), and any file left alone. */
  private reportPrebundle(result: PrebundleRevertResult, verb: string): void {
    for (const revert of result.Reverted) {
      this.log(`${chalk.green(verb)} prebundle exclude ${revert.Removed.join(', ')} from ${revert.File} (project ${revert.Project})`);
    }
    for (const skip of result.Skipped) {
      this.warn(`prebundle exclude: left ${skip.File} alone — ${skip.Reason}`);
    }
  }

  /** Logs every deletion, every path that was already gone, and every kept backup. */
  private reportRemovals(result: CleanResult, plan: CleanPlan): void {
    for (const name of result.Removed) {
      this.log(`${chalk.green('removed')} ${name}`);
    }
    for (const name of result.AlreadyGone) {
      this.log(chalk.dim(`already gone ${name}`));
    }
    for (const backup of plan.PreservedBackups) {
      this.log(chalk.dim(`kept ${backup} (backups are never removed)`));
    }
    const summary =
      result.Removed.length === 0
        ? `Nothing to remove at ${plan.ParentDir}.`
        : `Removed ${result.Removed.length} path(s) at ${plan.ParentDir}. Member repo checkouts were not touched.`;
    this.log(chalk.bold(`\n${summary}`));
  }
}
