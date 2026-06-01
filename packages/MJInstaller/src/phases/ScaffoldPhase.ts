/**
 * Phase B — Version Selection + Scaffold
 *
 * Lists available MemberJunction releases from GitHub, lets the user pick
 * one interactively (or resolves a specific tag via `-t`), downloads the
 * release ZIP archive, and extracts it into the target directory.
 *
 * Key behaviors:
 * - **Interactive mode**: Emits a `prompt` event with up to 20 versions for
 *   the user to choose from (most recent first).
 * - **Non-interactive mode** (`--yes`): Auto-selects the latest stable release.
 * - **Specific tag** (`-t v5.1.0`): Resolves the exact release, falling back
 *   to tag lookup if no formal GitHub Release exists.
 * - **Directory safety**: Warns if the target directory is non-empty (ignoring
 *   installer-owned files like `.mj-install-state.json`).
 * - **Temp file cleanup**: Downloads to a temp directory, then cleans up the
 *   ZIP after extraction.
 *
 * @module phases/ScaffoldPhase
 * @see GitHubReleaseProvider — fetches releases and downloads ZIP archives.
 * @see FileSystemAdapter — handles ZIP extraction and temp directory management.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';
import { GitHubReleaseProvider } from '../adapters/GitHubReleaseProvider.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { RepoFetcher, type SparseFetchResult } from '../adapters/RepoFetcher.js';
import { DistributionAssembler, distributionSourcePaths } from '../distribution/DistributionAssembler.js';
import type { VersionInfo } from '../models/VersionInfo.js';

/** Default canonical MemberJunction clone URL used for the distribution sparse fetch. */
const DEFAULT_REPO_URL = 'https://github.com/MemberJunction/MJ.git';

/**
 * Input context for the scaffold phase.
 *
 * @see ScaffoldPhase.Run
 */
export interface ScaffoldContext {
  /**
   * Release tag to install (e.g., `"v5.1.0"`).
   * If `undefined`, version selection is interactive (or auto-selects latest in `--yes` mode).
   */
  Tag?: string;
  /** Absolute path to the target directory for extraction. */
  Dir: string;
  /** Non-interactive mode — auto-selects latest version and skips confirmation prompts. */
  Yes: boolean;
  /** Event emitter for progress, prompt, and log events. */
  Emitter: InstallerEventEmitter;
  /**
   * Installation mode. `distribution` (default) sparse-checks-out the source at the
   * resolved tag and assembles the distribution layout; `monorepo` downloads and
   * extracts the full repository zip.
   */
  InstallMode?: 'distribution' | 'monorepo';
  /** Canonical repo clone URL for the distribution sparse fetch (defaults to the MJ repo). */
  RepoUrl?: string;
}

/**
 * Result of the scaffold phase.
 *
 * @see ScaffoldPhase.Run
 */
export interface ScaffoldResult {
  /** The version that was selected and installed. */
  Version: VersionInfo;
  /** Absolute path to the directory where the release was extracted. */
  ExtractedDir: string;
}

/**
 * Phase B — Downloads and extracts a MemberJunction release.
 *
 * @example
 * ```typescript
 * const scaffold = new ScaffoldPhase();
 * const result = await scaffold.Run({
 *   Tag: 'v5.1.0',
 *   Dir: '/path/to/install',
 *   Yes: false,
 *   Emitter: emitter,
 * });
 * console.log(`Installed ${result.Version.Tag} to ${result.ExtractedDir}`);
 * ```
 */
export class ScaffoldPhase {
  private github!: GitHubReleaseProvider;
  private fileSystem = new FileSystemAdapter();
  private repoFetcher = new RepoFetcher();
  private assembler = new DistributionAssembler();

  /**
   * Execute the scaffold phase: resolve version, download ZIP, and extract.
   *
   * @param context - Scaffold input with tag, directory, mode, and emitter.
   * @returns The selected version and extraction path.
   * @throws {InstallerError} With code `TAG_NOT_FOUND` if the specified tag doesn't exist.
   * @throws {InstallerError} With code `NO_RELEASES` if no releases are found on GitHub.
   * @throws {InstallerError} With code `DOWNLOAD_FAILED` if the ZIP download fails.
   * @throws {InstallerError} With code `EXTRACT_FAILED` if ZIP extraction fails.
   * @throws {InstallerError} With code `USER_CANCELLED` if the user declines the non-empty directory prompt.
   */
  async Run(context: ScaffoldContext): Promise<ScaffoldResult> {
    const { Emitter: emitter } = context;
    const mode = context.InstallMode ?? 'distribution';
    this.github = new GitHubReleaseProvider();

    // Step 1: Resolve the concrete version (a release tag) to install.
    const version = context.Tag
      ? await this.resolveTag(context.Tag, emitter)
      : await this.selectVersion(context.Yes, emitter);

    // Step 2: Confirm the target directory is safe to write into.
    await this.confirmTargetDir(context.Dir, context.Yes, emitter);

    // Step 3: Materialize the code into the target directory. Distribution mode
    // sparse-checks-out the source and assembles the distribution layout; monorepo
    // mode downloads and extracts the full repository zip.
    if (mode === 'monorepo') {
      await this.downloadAndExtract(version, context);
    } else {
      await this.fetchAndAssemble(version, context);
    }

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: `Release ${version.Tag} installed to ${context.Dir}`,
    });

    return { Version: version, ExtractedDir: context.Dir };
  }

  /**
   * Distribution path: blobless sparse-checkout of the source at the resolved tag,
   * then assemble the distribution layout (apps/ rename, flattened tsconfigs, root
   * files) into the target dir — the same on-disk shape the bootstrap zip produced,
   * so all downstream phases are unaffected. The temp clone is always cleaned up.
   *
   * Also preserves the user's `install.config.json` across the assembly step:
   * `DistributionAssembler` writes `install.config.json` from the repo's template
   * (legacy camelCase, empty values), which would clobber a user-populated config
   * if one already exists in the target dir. Save the user's copy before the
   * assemble step and restore it afterwards.
   */
  private async fetchAndAssemble(version: VersionInfo, context: ScaffoldContext): Promise<void> {
    const { Emitter: emitter } = context;
    const repoUrl = context.RepoUrl ?? DEFAULT_REPO_URL;

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: `Fetching ${version.Tag} via sparse checkout...`,
    });

    let fetched: SparseFetchResult;
    try {
      fetched = await this.repoFetcher.FetchPaths({
        RepoUrl: repoUrl,
        Ref: version.Tag,
        Paths: distributionSourcePaths(false),
      });
    } catch (err) {
      throw new InstallerError(
        'scaffold',
        'FETCH_FAILED',
        `Failed to fetch ${version.Tag} from ${repoUrl}: ${err instanceof Error ? err.message : String(err)}`,
        'Check network access to GitHub. For an air-gapped install, run "mj bundle" on a connected machine and install from the resulting zip.'
      );
    }

    // Snapshot a user-populated install.config.json before assembly overwrites it.
    const userConfigPath = path.join(context.Dir, 'install.config.json');
    const savedUserConfig = (await this.fileSystem.FileExists(userConfigPath))
      ? await this.fileSystem.ReadText(userConfigPath)
      : null;

    try {
      if (fetched.UsedFallback) {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: 'Blobless partial clone unavailable; used the full sparse-checkout fallback.',
        });
      }
      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'scaffold',
        Message: 'Assembling distribution layout...',
      });
      await this.assembler.AssembleToDir({ SourceDir: fetched.Dir }, context.Dir);

      if (savedUserConfig !== null) {
        await this.fileSystem.WriteText(userConfigPath, savedUserConfig);
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'scaffold',
          Message: 'Preserved existing install.config.json across distribution assembly.',
        });
      }
    } catch (err) {
      throw new InstallerError(
        'scaffold',
        'ASSEMBLE_FAILED',
        `Failed to assemble the distribution: ${err instanceof Error ? err.message : String(err)}`,
        'Re-run "mj install", or run "mj bundle" and install from the resulting zip.'
      );
    } finally {
      await fetched.Cleanup();
    }
  }

  /**
   * Monorepo path: download the full repository zip for the resolved tag and
   * extract it into the target directory. Used by `mj install --monorepo`.
   *
   * Also preserves the user's `install.config.json` across `ExtractZip`: the
   * monorepo zip ships a stub `install.config.json` template that would
   * otherwise overwrite a user-populated config sitting in the target dir.
   */
  private async downloadAndExtract(version: VersionInfo, context: ScaffoldContext): Promise<void> {
    const { Emitter: emitter } = context;
    const zipPath = await this.downloadRelease(version, emitter);

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: 'Extracting release...',
    });

    // Snapshot a user-populated install.config.json before extraction overwrites it.
    const userConfigPath = path.join(context.Dir, 'install.config.json');
    const savedUserConfig = (await this.fileSystem.FileExists(userConfigPath))
      ? await this.fileSystem.ReadText(userConfigPath)
      : null;

    try {
      await this.fileSystem.ExtractZip(zipPath, context.Dir);
    } catch (err) {
      throw new InstallerError(
        'scaffold',
        'EXTRACT_FAILED',
        `Failed to extract ZIP: ${err instanceof Error ? err.message : String(err)}`,
        'Download the release ZIP manually and extract it into the target directory.'
      );
    }

    if (savedUserConfig !== null) {
      await this.fileSystem.WriteText(userConfigPath, savedUserConfig);
      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'scaffold',
        Message: 'Preserved existing install.config.json across release extraction.',
      });
    }

    // Clean up temp ZIP (non-critical).
    try {
      await this.fileSystem.RemoveFile(zipPath);
    } catch {
      // ignore — temp dir is reclaimed by the OS
    }
  }

  /**
   * Read the Claude Code pack version stamp and emit a log or warn accordingly.
   * Non-fatal — a missing pack is recoverable post-install via `mj install:claude`.
   */
  private async reportClaudePack(dir: string, emitter: InstallerEventEmitter): Promise<void> {
    const versionPath = path.join(dir, '.claude', 'mj', 'VERSION');
    let packVersion: string | null = null;
    try {
      const raw = await fs.readFile(versionPath, 'utf8');
      packVersion = raw.trim();
    } catch {
      // file absent or unreadable — fall through to the warn branch
    }

    if (packVersion) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Claude Code pack v${packVersion} installed.`,
      });
    } else {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'scaffold',
        Message: 'Claude Code pack not found in distribution. Run `mj install:claude` to add it.',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal steps
  // ---------------------------------------------------------------------------

  private async resolveTag(tag: string, emitter: InstallerEventEmitter): Promise<VersionInfo> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: `Resolving release tag: ${tag}`,
    });

    try {
      return await this.github.GetReleaseByTag(tag);
    } catch (err) {
      // Try to suggest available tags
      let suggestion = '';
      try {
        const releases = await this.github.ListReleases();
        if (releases.length > 0) {
          const tagList = releases.slice(0, 5).map((r) => r.Tag).join(', ');
          suggestion = ` Available versions: ${tagList}`;
        }
      } catch {
        // can't list — that's fine
      }

      throw new InstallerError(
        'scaffold',
        'TAG_NOT_FOUND',
        `Release tag "${tag}" not found.${suggestion}`,
        `Run "mj install" without -t to see available versions, or check https://github.com/MemberJunction/MJ/releases`
      );
    }
  }

  private async selectVersion(yes: boolean, emitter: InstallerEventEmitter): Promise<VersionInfo> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: 'Fetching available versions...',
    });

    const releases = await this.github.ListReleases();

    if (releases.length === 0) {
      throw new InstallerError(
        'scaffold',
        'NO_RELEASES',
        'No releases found on GitHub.',
        'Check https://github.com/MemberJunction/MJ/releases to verify releases are available.'
      );
    }

    // In non-interactive mode, pick the latest
    if (yes) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Auto-selecting latest version: ${releases[0].Tag}`,
      });
      return releases[0];
    }

    // Interactive: emit prompt for version selection
    const choices = releases.slice(0, 20).map((r) => ({
      Label: `${r.Tag} — ${r.Name} (${r.ReleaseDate.toLocaleDateString()})${r.Prerelease ? ' [prerelease]' : ''}`,
      Value: r.Tag,
    }));

    const selectedTag = await new Promise<string>((resolve) => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: 'version-select',
        PromptType: 'select',
        Message: 'Select a MemberJunction version to install:',
        Choices: choices,
        Default: releases[0].Tag,
        Resolve: resolve,
      });
    });

    const selected = releases.find((r) => r.Tag === selectedTag);
    if (!selected) {
      throw new InstallerError(
        'scaffold',
        'INVALID_VERSION',
        `Selected version "${selectedTag}" not found in release list.`,
        'Try running the installer again.'
      );
    }

    return selected;
  }

  /**
   * Files created by the installer itself that should be ignored when deciding
   * whether the target directory is "empty".
   */
  private static readonly INSTALLER_OWNED_FILES = new Set([
    '.mj-install-state.json',
  ]);

  private async confirmTargetDir(dir: string, yes: boolean, emitter: InstallerEventEmitter): Promise<void> {
    const exists = await this.fileSystem.DirectoryExists(dir);
    if (!exists) return; // Will be created during extraction

    const empty = await this.isEffectivelyEmpty(dir);
    if (empty) return;

    if (yes) {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'scaffold',
        Message: `Target directory "${dir}" is not empty. Proceeding with --yes flag.`,
      });
      return;
    }

    const answer = await new Promise<string>((resolve) => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: 'overwrite-dir',
        PromptType: 'confirm',
        Message: `Target directory "${dir}" is not empty. Continue anyway? Files may be overwritten.`,
        Default: 'no',
        Resolve: resolve,
      });
    });

    if (answer !== 'yes' && answer !== 'y' && answer !== 'true') {
      throw new InstallerError(
        'scaffold',
        'USER_CANCELLED',
        'Installation cancelled by user.',
        'Choose an empty directory or use --yes to skip this confirmation.'
      );
    }
  }

  /**
   * Returns true if the directory contains no files other than installer-owned
   * artifacts (e.g. `.mj-install-state.json` from a previous run).
   */
  private async isEffectivelyEmpty(dir: string): Promise<boolean> {
    const entries = await this.fileSystem.ListDirectoryEntries(dir);
    return entries.every((name) => ScaffoldPhase.INSTALLER_OWNED_FILES.has(name));
  }

  private async downloadRelease(version: VersionInfo, emitter: InstallerEventEmitter): Promise<string> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: `Downloading ${version.Tag}...`,
      Percent: 0,
    });

    const tempDir = await this.fileSystem.CreateTempDir();
    const zipPath = path.join(tempDir, `${version.Tag}.zip`);

    let downloadedMB = 0;
    try {
      await this.github.DownloadRelease(version.DownloadUrl, zipPath, (percent) => {
        if (percent >= 0) {
          // Determinate progress — server provided Content-Length
          emitter.Emit('step:progress', {
            Type: 'step:progress',
            Phase: 'scaffold',
            Message: `Downloading ${version.Tag}... ${percent}%`,
            Percent: percent,
          });
        } else {
          // Indeterminate progress — no Content-Length (API zipball fallback)
          downloadedMB++;
          emitter.Emit('step:progress', {
            Type: 'step:progress',
            Phase: 'scaffold',
            Message: `Downloading ${version.Tag}... (data received)`,
            Percent: -1,
          });
        }
      });
    } catch (err) {
      throw new InstallerError(
        'scaffold',
        'DOWNLOAD_FAILED',
        `Download failed: ${err instanceof Error ? err.message : String(err)}`,
        `Download manually from: ${version.DownloadUrl}`
      );
    }

    return zipPath;
  }
}
