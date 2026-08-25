import { confirm } from '@inquirer/prompts';
import { isInteractiveRun } from '../../../lib/interactive-guard.js';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import {
  BuildNpmrc,
  BuildRootPackageJson,
  BuildSentinel,
  BuildShellPeerGuidance,
  BuildWorkspaceYaml,
  PickTurboJson,
} from '../../../lib/dev-workspace/build.js';
import { DetectCandidates, LoadRepo } from '../../../lib/dev-workspace/detect.js';
import { WORKSPACE_DIR_ENV_VAR } from '../../../lib/dev-workspace/dir-flag.js';
import { FindMemberInstallTrees, IsInsideDirectory, RemoveMemberInstallTrees } from '../../../lib/dev-workspace/member-installs.js';
import { RunPnpmInstall } from '../../../lib/dev-workspace/pnpm.js';
import { AssertParentDirSafe, SENTINEL_FILE_NAME, WriteWorkspaceFiles } from '../../../lib/dev-workspace/write.js';
import type { CandidateRepo, DevDepConflict, GeneratedFile, ParentManifestReport } from '../../../lib/dev-workspace/types.js';

/** Renders one conflict's decision for a warn line. */
function describeConflict(conflict: DevDepConflict): string {
  const losers = conflict.Losers.map((l) => `${l.Version} (${l.Repo})`).join(', ');
  return `kept ${conflict.Winner.Version} (${conflict.Winner.Repo}), dropped ${losers}`;
}

/**
 * CLI command: `mj dev workspace`.
 *
 * Generates the four ephemeral files that join sibling repo checkouts into a
 * single pnpm workspace at their common parent directory (pnpm-workspace.yaml,
 * .npmrc, package.json, turbo.json), then runs `pnpm install` there.
 *
 * Automates what was previously a hand-run setup: writing those files yourself and
 * keeping them in step as repos come and go.
 * Linking only — app REGISTRATION into a running host is deliberately phase 2.
 */
export default class DevWorkspace extends Command {
  static description =
    'Join sibling repo clones into one pnpm workspace: writes pnpm-workspace.yaml, .npmrc, package.json, ' +
    'turbo.json and the .mj-dev-workspace.json sentinel at their common parent, then runs pnpm install there. ' +
    'Members are the parent\'s immediate subdirectories carrying an mj-app.json, a @mj-biz-apps package, or the ' +
    'MJ monorepo root name. Existing files are never overwritten without --force (which keeps a .bak of each). ' +
    'Generated files are ephemeral — never commit them; tear them down with `dev workspace clean`.';

  static examples = [
    '<%= config.bin %> dev workspace --dir ~/code/bluecypress',
    '<%= config.bin %> dev workspace --dir ~/code/bluecypress --exclude bizapps-sonar',
    '<%= config.bin %> dev workspace --dir ~/code/bluecypress --include bizapps-common --include bizapps-tasks',
    '<%= config.bin %> dev workspace --dir ~/code/bluecypress --no-install --force',
    'MJ_DEV_WORKSPACE_DIR=~/code/bluecypress <%= config.bin %> dev workspace',
  ];

  static flags = {
    dir: Flags.string({
      description: `Parent directory holding the sibling repo clones (must NOT itself be a git repo; env: ${WORKSPACE_DIR_ENV_VAR})`,
      env: WORKSPACE_DIR_ENV_VAR,
      default: '.',
    }),
    include: Flags.string({
      multiple: true,
      description: 'Repo directory name to include as a member (repeatable; adds to the detected set)',
    }),
    exclude: Flags.string({
      multiple: true,
      description: 'Repo directory name to exclude from the members (repeatable)',
    }),
    install: Flags.boolean({
      description: 'Run `pnpm install` at the parent after generating (disable with --no-install)',
      default: true,
      allowNo: true,
    }),
    force: Flags.boolean({
      description: 'Overwrite existing workspace files at the parent (a .bak copy of each is kept)',
      default: false,
    }),
    'clean-members': Flags.boolean({
      description:
        'Remove members\' standalone node_modules trees (root AND nested, depth-independent) before the parent ' +
        'install; --no-clean-members keeps them. Without either flag, an interactive run asks per member.',
      allowNo: true,
    }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DevWorkspace);
    const parentDir = path.resolve(flags.dir);

    try {
      AssertParentDirSafe(parentDir);
      const members = this.selectMembers(parentDir, flags.include ?? [], flags.exclude ?? []);
      await this.handleStandaloneInstalls(parentDir, members, flags['clean-members']);
      const files = this.buildFiles(parentDir, members, flags.verbose);
      const result = WriteWorkspaceFiles(parentDir, files, flags.force);
      for (const backup of result.BackedUp) {
        this.log(chalk.yellow(`Backed up existing file to ${backup}`));
      }
      this.log(chalk.green(`Wrote ${result.Written.join(', ')} at ${parentDir}`));
      for (const line of BuildShellPeerGuidance()) {
        this.log(chalk.dim(line));
      }

      if (flags.install) {
        this.log(chalk.bold('\nRunning pnpm install...'));
        await RunPnpmInstall(parentDir);
        this.log(chalk.green('pnpm install completed'));
      } else {
        this.log(chalk.dim('Skipped pnpm install (--no-install); run `pnpm install` at the parent when ready.'));
      }
      this.log(chalk.dim(`\nBuild any package from the parent: pnpm --filter <package-name> run build`));
      this.log(
        chalk.dim(
          `(members whose package.json pins npm refuse in-place pnpm runs — drive those from the parent with --filter until they migrate)`
        )
      );
      this.log(chalk.dim(`Check the result any time with:  ${this.config.bin} dev workspace status --dir ${parentDir}`));
      this.log(chalk.dim(`Tear it back down with:          ${this.config.bin} dev workspace clean --dir ${parentDir}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }

  /** Resolves the member set: detected candidates plus --include, minus --exclude. */
  private selectMembers(parentDir: string, include: string[], exclude: string[]): CandidateRepo[] {
    const members = new Map<string, CandidateRepo>();
    for (const candidate of DetectCandidates(parentDir)) {
      members.set(candidate.Name, candidate);
    }
    for (const name of include) {
      if (members.has(name)) continue;
      const repo = LoadRepo(parentDir, name);
      if (repo === null) {
        throw new Error(`--include ${name}: ${path.join(parentDir, name)} has no package.json — not a repo checkout`);
      }
      this.warn(`${name} was not detected as a candidate — including it anyway (--include)`);
      members.set(name, repo);
    }
    for (const name of exclude) {
      if (!members.delete(name)) this.warn(`--exclude ${name}: not in the member set, ignoring`);
    }
    if (members.size === 0) {
      throw new Error(`No member repos at ${parentDir}. Candidates are sibling dirs with an mj-app.json, @mj-biz-apps packages, or the MJ monorepo; use --include to add others.`);
    }
    const selected = [...members.values()].sort((a, b) => a.Name.localeCompare(b.Name));
    for (const member of selected) {
      const why = member.Reasons.length > 0 ? member.Reasons.join(', ') : 'included via --include';
      this.log(`${chalk.green('member')} ${member.Name} ${chalk.dim(`(${why})`)}`);
    }
    return selected;
  }

  /**
   * Builds every file's content (pure builders) and logs each resolution decision.
   * The sentinel comes last and records the names of the files alongside it, so its
   * inventory is true by construction rather than by a constant kept in step.
   */
  private buildFiles(parentDir: string, members: CandidateRepo[], verbose: boolean): GeneratedFile[] {
    const memberNames = members.map((m) => m.Name);
    const rootPkg = BuildRootPackageJson(path.basename(parentDir), members);
    for (const conflict of rootPkg.Conflicts) {
      this.warn(`devDependency conflict on ${conflict.Package}: ${describeConflict(conflict)}`);
    }
    this.log(chalk.dim(`packageManager pin ${rootPkg.Pin} from ${rootPkg.PinSource}`));
    const turbo = PickTurboJson(members);
    this.log(chalk.dim(`turbo.json copied from ${turbo.Source}`));
    for (const member of members) {
      this.reportMemberGlobs(member);
    }
    this.reportManifestAssembly(rootPkg.Report, verbose);
    const workspaceFiles: GeneratedFile[] = [
      { Name: 'pnpm-workspace.yaml', Content: BuildWorkspaceYaml(members) },
      { Name: '.npmrc', Content: BuildNpmrc() },
      { Name: 'package.json', Content: rootPkg.Content },
      { Name: 'turbo.json', Content: turbo.Content },
    ];
    const written = [...workspaceFiles.map((f) => f.Name), SENTINEL_FILE_NAME];
    return [...workspaceFiles, { Name: SENTINEL_FILE_NAME, Content: BuildSentinel(written, memberNames) }];
  }

  /**
   * Logs where a member's workspace globs came from — and warns LOUDLY when the
   * member has its own pnpm-workspace.yaml that yielded nothing usable, because a
   * silent packages/* fallback is exactly the #3795 failure: an install that
   * succeeds while the member's real packages resolve from the registry.
   */
  private reportMemberGlobs(member: CandidateRepo): void {
    for (const glob of member.UnsupportedGlobs) {
      this.warn(
        `${member.Name} glob '${glob}' has an unsupported shape (only fixed paths, trailing /* and trailing /** ` +
          `are expanded) — its packages are NOT enumerated for workspace:* overrides`
      );
    }
    if (member.WorkspaceGlobsSource === 'workspace-yaml-without-packages-globs') {
      this.warn(
        `${member.Name} has its own pnpm-workspace.yaml but it yielded NO globs rooted under packages/ — ` +
          `assuming ${member.Name}/packages/*. If that repo keeps packages anywhere else, they will NOT be ` +
          `linked into this workspace (they would resolve from the registry instead). Check ${member.Name}/pnpm-workspace.yaml.`
      );
      return;
    }
    if (member.WorkspaceGlobsSource === 'member-workspace-yaml') {
      this.log(chalk.dim(`${member.Name} contributes ${member.WorkspaceGlobs.length} workspace globs from its own pnpm-workspace.yaml`));
    }
  }

  /**
   * Detects members carrying standalone installs (root or nested node_modules —
   * depth-independent, per the field's 290-trees lesson on #3795) and removes
   * them before the parent install, honoring --clean-members/--no-clean-members
   * or asking interactively. A skip always states the exact consequence.
   */
  private async handleStandaloneInstalls(parentDir: string, members: CandidateRepo[], cleanFlag: boolean | undefined): Promise<void> {
    for (const member of members) {
      if (!IsInsideDirectory(parentDir, member.Path)) {
        // possible via --include with a path-like name; never enumerate such a member for deletion
        this.warn(`${member.Name} lives outside the parent directory (${member.Path}) — excluded from standalone-install cleanup entirely.`);
        continue;
      }
      const scan = FindMemberInstallTrees(member.Path);
      for (const dir of scan.UnreadableDirs) {
        this.warn(`${member.Name}: could not read ${dir} while scanning for standalone installs — skipped, anything under it was not scanned`);
      }
      if (scan.Trees.length === 0) continue;
      const clean = await this.shouldCleanMember(member.Name, scan.Trees.length, cleanFlag);
      if (!clean) {
        this.warn(
          `${member.Name}: keeping its standalone install (${scan.Trees.length} node_modules tree(s)). After the parent ` +
            `install those trees hold symlinks into a store the parent does not manage — expect dangling links and ` +
            `TS2307 'Cannot find module' errors that look like missing dependencies. Re-run with --clean-members to remove them.`
        );
        continue;
      }
      const result = RemoveMemberInstallTrees(scan.Trees);
      for (const skip of result.Skipped) {
        this.warn(`${member.Name}: NOT removed — ${skip.Path}: ${skip.Reason}`);
      }
      this.log(chalk.green(`${member.Name}: removed ${result.Removed.length} standalone node_modules tree(s)`));
    }
  }

  /** Decides one member's cleanup: an explicit flag wins; otherwise ask when interactive, skip loudly when not. */
  private async shouldCleanMember(name: string, treeCount: number, cleanFlag: boolean | undefined): Promise<boolean> {
    if (cleanFlag !== undefined) return cleanFlag;
    // Non-interactive by default (see lib/interactive-guard). This one skips loudly rather
    // than failing: leaving a standalone install in place is a safe no-op, and the warning
    // names the flags. Destructive prompts elsewhere fail fast instead.
    if (!isInteractiveRun() || !process.stdout.isTTY) {
      this.warn(
        `${name} has a standalone install (${treeCount} node_modules tree(s)) and this run is non-interactive ` +
          `with no --clean-members/--no-clean-members given — leaving it in place. ` +
          `Pass --clean-members or --no-clean-members to decide explicitly, or run at a terminal to be asked.`
      );
      return false;
    }
    this.log(`${name} has a standalone install (${treeCount} node_modules tree${treeCount === 1 ? '' : 's'}).`);
    this.log(`  keep it   → its old trees resolve against a store the parent install does not manage: two copies of shared packages, dangling symlinks, phantom 'Cannot find module' errors`);
    this.log(`  remove it → ${name} builds only through this workspace until you run a plain install inside it again (one command to switch back)`);
    return confirm({
      message: `Remove ${name}'s standalone install before the parent install?`,
      default: true,
    });
  }

  /**
   * Reports every absorption decision the manifest build made: pins, hoists,
   * patches, family overrides, drops and skips — loud conflicts, dim counts,
   * itemized detail behind --verbose. A derivation that dropped something and
   * said nothing is the #3795 disease; this method is why it cannot recur.
   */
  private reportManifestAssembly(report: ParentManifestReport, verbose: boolean): void {
    this.log(
      chalk.dim(
        `pnpm.overrides: ${report.LockfilePinCount} lockfile-derived pin(s), ${report.HoistedOverrideCount} hoisted ` +
          `member override(s), ${report.FamilyOverrideCount} workspace:* family override(s); ${report.Patches.length} patch(es) hoisted`
      )
    );
    for (const patch of report.Patches) {
      this.log(chalk.dim(`  patch ${patch.Package} -> ${patch.Path} (from ${patch.Repo})`));
    }
    for (const conflict of [...report.PinConflicts, ...report.BlockConflicts]) {
      this.warn(`override conflict on ${conflict.Package}: ${describeConflict(conflict)}`);
    }
    for (const unsupported of report.UnsupportedLockfiles) {
      this.warn(
        `${unsupported.Repo} commits ${unsupported.File} with lockfileVersion ${unsupported.Version} — a format this ` +
          `derivation cannot read, so that member contributes NO pins; its ranges resolve freshly at the parent`
      );
    }
    for (const dup of report.DuplicateFamilyPackages) {
      this.warn(`package ${dup.Package} is provided by ${dup.Repos.join(' AND ')} — the link target is decided by sort order; use --exclude to drop one`);
    }
    this.reportManifestDrops(report, verbose);
  }

  /** The dropped/skipped half of the assembly report: @types, workspace: drops, superseded pins, lockfile skips. */
  private reportManifestDrops(report: ParentManifestReport, verbose: boolean): void {
    if (report.SkippedTypesDevDeps.length > 0) {
      const detail = verbose ? `: ${report.SkippedTypesDevDeps.join(', ')}` : '';
      this.log(chalk.dim(`devDependency union: skipped ${report.SkippedTypesDevDeps.length} @types/* package(s) — duplicate @types are a nominal-type break${detail}`));
    }
    for (const dropped of report.DroppedWorkspaceDevDeps) {
      this.warn(`devDependency ${dropped.Package} (${dropped.Repo}) uses workspace: but NO member provides it — dropped from the parent manifest`);
    }
    if (report.SupersededPins.length > 0) {
      const detail = verbose ? `: ${report.SupersededPins.join(', ')}` : '';
      this.log(chalk.dim(`${report.SupersededPins.length} lockfile-derived pin(s) superseded by member overrides or workspace:* family overrides${detail}`));
    }
    if (report.LockfileSkips.length === 0) return;
    this.log(chalk.dim(`lockfile pin derivation skipped ${report.LockfileSkips.length} entr(y/ies) (workspace links / non-semver)${verbose ? ':' : ' — --verbose lists them'}`));
    if (!verbose) return;
    for (const { Repo, Skip } of report.LockfileSkips) {
      this.log(chalk.dim(`  ${Repo}: ${Skip.Name}@${Skip.Version} — ${Skip.Reason}`));
    }
  }
}
