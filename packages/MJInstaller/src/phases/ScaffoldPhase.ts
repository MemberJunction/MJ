/**
 * Phase B — Version Selection + Scaffold
 *
 * Lists available releases, lets the user pick one (or uses -t tag),
 * downloads the ZIP, and extracts it into the target directory.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';
import { GitHubReleaseProvider } from '../adapters/GitHubReleaseProvider.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import type { VersionInfo } from '../models/VersionInfo.js';

export interface ScaffoldContext {
  /** Release tag to install. If undefined, version selection is interactive. */
  Tag?: string;
  /** Target directory for extraction */
  Dir: string;
  /** Non-interactive mode */
  Yes: boolean;
  Emitter: InstallerEventEmitter;
}

export interface ScaffoldResult {
  /** The version that was selected/installed */
  Version: VersionInfo;
  /** Path to the extracted release */
  ExtractedDir: string;
}

export class ScaffoldPhase {
  private github = new GitHubReleaseProvider();
  private fileSystem = new FileSystemAdapter();

  async Run(context: ScaffoldContext): Promise<ScaffoldResult> {
    const { Emitter: emitter } = context;

    // Step 1: Resolve version
    const version = context.Tag
      ? await this.resolveTag(context.Tag, emitter)
      : await this.selectVersion(context.Yes, emitter);

    // Step 2: Check if target dir is non-empty
    await this.confirmTargetDir(context.Dir, context.Yes, emitter);

    // Step 3: Download ZIP
    const zipPath = await this.downloadRelease(version, emitter);

    // Step 4: Extract
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: 'Extracting release...',
    });

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

    // Step 5: Clean up temp ZIP
    try {
      await this.fileSystem.RemoveFile(zipPath);
    } catch {
      // non-critical
    }

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'scaffold',
      Message: `Release ${version.Tag} extracted to ${context.Dir}`,
    });

    return {
      Version: version,
      ExtractedDir: context.Dir,
    };
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

    try {
      await this.github.DownloadRelease(version.DownloadUrl, zipPath, (percent) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'scaffold',
          Message: `Downloading ${version.Tag}... ${percent}%`,
          Percent: percent,
        });
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
