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
import { RunPnpmInstall } from '../../../lib/dev-workspace/pnpm.js';
import { AssertParentDirSafe, SENTINEL_FILE_NAME, WriteWorkspaceFiles } from '../../../lib/dev-workspace/write.js';
import type { CandidateRepo, GeneratedFile } from '../../../lib/dev-workspace/types.js';

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
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DevWorkspace);
    const parentDir = path.resolve(flags.dir);

    try {
      AssertParentDirSafe(parentDir);
      const members = this.selectMembers(parentDir, flags.include ?? [], flags.exclude ?? []);
      const files = this.buildFiles(parentDir, members);
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
      this.log(chalk.dim(`\nCheck the result any time with: ${this.config.bin} dev workspace status --dir ${parentDir}`));
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
  private buildFiles(parentDir: string, members: CandidateRepo[]): GeneratedFile[] {
    const memberNames = members.map((m) => m.Name);
    const rootPkg = BuildRootPackageJson(path.basename(parentDir), members);
    for (const conflict of rootPkg.Conflicts) {
      const losers = conflict.Losers.map((l) => `${l.Version} (${l.Repo})`).join(', ');
      this.warn(`devDependency conflict on ${conflict.Package}: kept ${conflict.Winner.Version} (${conflict.Winner.Repo}), dropped ${losers}`);
    }
    this.log(chalk.dim(`packageManager pin ${rootPkg.Pin} from ${rootPkg.PinSource}`));
    const turbo = PickTurboJson(members);
    this.log(chalk.dim(`turbo.json copied from ${turbo.Source}`));
    for (const member of members) {
      this.reportMemberGlobs(member);
    }
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
}
