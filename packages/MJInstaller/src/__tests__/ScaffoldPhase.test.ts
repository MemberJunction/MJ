import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { createMockFileSystem, createMockGitHubProvider, createMockProcessRunner } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { sampleVersionInfo } from './mocks/fixtures.js';
import type { ScaffoldContext } from '../phases/ScaffoldPhase.js';
import { InstallerError } from '../errors/InstallerError.js';
import type { VersionInfo } from '../models/VersionInfo.js';
import type { SparseFetchResult } from '../adapters/RepoFetcher.js';
import type { WriteOp } from '../distribution/DistributionAssembler.js';

// ---------------------------------------------------------------------------
// Adapter mocks — ScaffoldPhase creates adapters via `new` in its constructor
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
vi.mock('../adapters/FileSystemAdapter.js', () => {
  return {
    FileSystemAdapter: function FileSystemAdapter() { return mockFs; },
  };
});

const mockGitHub = createMockGitHubProvider();
vi.mock('../adapters/GitHubReleaseProvider.js', () => {
  return {
    GitHubReleaseProvider: function GitHubReleaseProvider() { return mockGitHub; },
  };
});

const mockProcessRunner = createMockProcessRunner();
vi.mock('../adapters/ProcessRunner.js', () => {
  return {
    ProcessRunner: function ProcessRunner() { return mockProcessRunner; },
  };
});

const mockRepoFetcher = {
  FetchPaths: vi.fn<(opts: { RepoUrl: string; Ref: string; Paths: readonly string[] }) => Promise<SparseFetchResult>>(),
};
vi.mock('../adapters/RepoFetcher.js', () => {
  return {
    RepoFetcher: function RepoFetcher() { return mockRepoFetcher; },
  };
});

const mockAssembler = {
  AssembleToDir: vi.fn<(opts: { SourceDir: string; IncludeMigrations?: boolean }, destDir: string) => Promise<WriteOp[]>>(),
};
vi.mock('../distribution/DistributionAssembler.js', () => {
  return {
    DistributionAssembler: function DistributionAssembler() { return mockAssembler; },
    DistributionSourcePaths: () => ['packages/MJAPI', 'SQL Scripts'],
    get distributionSourcePaths() { return this.DistributionSourcePaths; },
  };
});

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { ScaffoldPhase } from '../phases/ScaffoldPhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<ScaffoldContext>): ScaffoldContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Yes: true,
    Emitter: emitter,
    ...overrides,
  };
}

function makeVersionList(): VersionInfo[] {
  return [
    { Tag: 'v5.2.0', Name: 'v5.2.0', ReleaseDate: new Date('2025-02-15'), Prerelease: false, DownloadUrl: 'https://example.com/v5.2.0.zip' },
    { Tag: 'v5.1.0', Name: 'v5.1.0', ReleaseDate: new Date('2025-01-10'), Prerelease: false, DownloadUrl: 'https://example.com/v5.1.0.zip' },
    { Tag: 'v5.0.0', Name: 'v5.0.0', ReleaseDate: new Date('2024-11-01'), Prerelease: false, DownloadUrl: 'https://example.com/v5.0.0.zip' },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScaffoldPhase', () => {
  let phase: ScaffoldPhase;

  beforeEach(() => {
    phase = new ScaffoldPhase();

    // Default happy-path mocks
    mockGitHub.ListReleases.mockResolvedValue(makeVersionList());
    mockGitHub.GetReleaseByTag.mockResolvedValue(sampleVersionInfo());
    mockGitHub.DownloadRelease.mockResolvedValue(undefined);
    mockFs.DirectoryExists.mockResolvedValue(false); // Dir does not exist yet
    mockFs.ListDirectoryEntries.mockResolvedValue([]);
    mockFs.CreateTempDir.mockResolvedValue('/tmp/mj-install-test');
    mockFs.ExtractZip.mockResolvedValue([]);
    mockFs.RemoveFile.mockResolvedValue(undefined);
    mockFs.RemoveDir.mockReset().mockResolvedValue(undefined);
    mockFs.CopyDirectory.mockReset().mockResolvedValue(undefined);
    mockFs.WriteText.mockClear();
    mockFs.FileExists.mockReset().mockResolvedValue(false);
    mockProcessRunner.Run.mockReset();
    mockProcessRunner.Run.mockResolvedValue({ ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false });

    // Distribution-mode sparse fetch + assemble defaults (happy path)
    mockRepoFetcher.FetchPaths.mockReset();
    mockRepoFetcher.FetchPaths.mockResolvedValue({
      Dir: '/tmp/mj-fetch-test',
      UsedFallback: false,
      Cleanup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    mockAssembler.AssembleToDir.mockReset();
    mockAssembler.AssembleToDir.mockResolvedValue([]);
  });

  // ─── resolveTag ────────────────────────────────────────────────────

  describe('resolveTag (explicit --tag)', () => {
    it('should call GetReleaseByTag when Tag is provided', async () => {
      const ctx = makeContext({ Tag: 'v5.2.0' });
      const result = await phase.Run(ctx);
      expect(mockGitHub.GetReleaseByTag).toHaveBeenCalledWith('v5.2.0');
      expect(result.Version.Tag).toBe('v5.2.0');
    });

    it('should throw TAG_NOT_FOUND with suggestions when tag does not exist', async () => {
      mockGitHub.GetReleaseByTag.mockRejectedValue(new Error('Not found'));
      mockGitHub.ListReleases.mockResolvedValue(makeVersionList());
      const ctx = makeContext({ Tag: 'v99.0.0' });

      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      try {
        await phase.Run(ctx);
      } catch (err) {
        const ie = err as InstallerError;
        expect(ie.Code).toBe('TAG_NOT_FOUND');
        expect(ie.message).toContain('v99.0.0');
        expect(ie.message).toContain('v5.2.0'); // suggestion from ListReleases
      }
    });

    it('should throw TAG_NOT_FOUND without suggestions when ListReleases also fails', async () => {
      mockGitHub.GetReleaseByTag.mockRejectedValue(new Error('Not found'));
      mockGitHub.ListReleases.mockRejectedValue(new Error('Network error'));
      const ctx = makeContext({ Tag: 'v99.0.0' });

      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      try {
        await phase.Run(ctx);
      } catch (err) {
        const ie = err as InstallerError;
        expect(ie.Code).toBe('TAG_NOT_FOUND');
        expect(ie.message).toContain('v99.0.0');
        // Should not contain "Available versions" because ListReleases failed
        expect(ie.message).not.toContain('Available versions');
      }
    });
  });

  // ─── selectVersion ─────────────────────────────────────────────────

  describe('selectVersion', () => {
    it('should auto-select latest version when yes=true', async () => {
      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);
      expect(result.Version.Tag).toBe('v5.2.0');
    });

    it('should throw NO_RELEASES when no releases are found', async () => {
      mockGitHub.ListReleases.mockResolvedValue([]);
      const ctx = makeContext({ Yes: true });

      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      try {
        await phase.Run(ctx);
      } catch (err) {
        const ie = err as InstallerError;
        expect(ie.Code).toBe('NO_RELEASES');
      }
    });

    it('should emit prompt for interactive version selection and resolve with user choice', async () => {
      const { emitter } = createMockEmitter();
      // Listen for prompt events and resolve with v5.1.0
      emitter.On('prompt', (e) => {
        if (e.PromptId === 'version-select') {
          e.Resolve('v5.1.0');
        }
      });

      const ctx = makeContext({ Yes: false, Emitter: emitter });
      const result = await phase.Run(ctx);
      expect(result.Version.Tag).toBe('v5.1.0');
    });
  });

  // ─── confirmTargetDir ──────────────────────────────────────────────

  describe('confirmTargetDir', () => {
    it('should proceed without prompt when directory does not exist', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });

      await phase.Run(ctx);
      const promptEvents = emittedEvents(emitSpy, 'prompt');
      // No overwrite-dir prompt should be emitted (version-select might be)
      const overwritePrompts = promptEvents.filter((e: unknown) =>
        (e as Record<string, unknown>).PromptId === 'overwrite-dir'
      );
      expect(overwritePrompts).toHaveLength(0);
    });

    it('should proceed without prompt when directory exists but is effectively empty', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListDirectoryEntries.mockResolvedValue([]); // empty
      const ctx = makeContext();
      // Should not throw
      await expect(phase.Run(ctx)).resolves.toBeDefined();
    });

    it('should proceed with warning when non-empty dir and yes=true', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListDirectoryEntries.mockResolvedValue(['package.json', 'src']);
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });

      await phase.Run(ctx);
      const warnEvents = emittedEvents(emitSpy, 'warn');
      expect(warnEvents.length).toBeGreaterThan(0);
      const overwriteWarn = warnEvents.find((e: unknown) =>
        (e as Record<string, string>).Message?.includes('not empty')
      );
      expect(overwriteWarn).toBeDefined();
    });

    it('should proceed when user confirms non-empty directory', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListDirectoryEntries.mockResolvedValue(['package.json']);
      const { emitter } = createMockEmitter();
      emitter.On('prompt', (e) => {
        if (e.PromptId === 'overwrite-dir') e.Resolve('yes');
        if (e.PromptId === 'version-select') e.Resolve('v5.2.0');
      });

      const ctx = makeContext({ Yes: false, Emitter: emitter });
      await expect(phase.Run(ctx)).resolves.toBeDefined();
    });

    it('should throw USER_CANCELLED when user declines non-empty directory', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListDirectoryEntries.mockResolvedValue(['package.json']);
      const { emitter } = createMockEmitter();
      emitter.On('prompt', (e) => {
        if (e.PromptId === 'overwrite-dir') e.Resolve('no');
        if (e.PromptId === 'version-select') e.Resolve('v5.2.0');
      });

      const ctx = makeContext({ Yes: false, Emitter: emitter });
      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      try {
        await phase.Run(ctx);
      } catch (err) {
        expect((err as InstallerError).Code).toBe('USER_CANCELLED');
      }
    });
  });

  // ─── isEffectivelyEmpty ────────────────────────────────────────────

  describe('isEffectivelyEmpty', () => {
    it('should treat directory with only .mj-install-state.json as empty', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListDirectoryEntries.mockResolvedValue(['.mj-install-state.json']);
      const ctx = makeContext();
      // Should proceed without any overwrite prompt/warning
      await expect(phase.Run(ctx)).resolves.toBeDefined();
    });
  });

  // ─── Result shape ──────────────────────────────────────────────────

  it('should return ScaffoldResult with correct Version and ExtractedDir', async () => {
    const result = await phase.Run(makeContext({ Tag: 'v5.2.0' }));
    expect(result.Version.Tag).toBe('v5.2.0');
    expect(result.ExtractedDir).toBe('/test/install');
  });

  // ─── Distribution mode (sparse fetch + assemble) ───────────────────

  describe('distribution fetch + assemble', () => {
    it('fetches via RepoFetcher at the resolved tag and assembles into the dir', async () => {
      const result = await phase.Run(makeContext({ Tag: 'v5.2.0' }));
      expect(mockRepoFetcher.FetchPaths).toHaveBeenCalledWith(
        expect.objectContaining({ Ref: 'v5.2.0' })
      );
      expect(mockAssembler.AssembleToDir).toHaveBeenCalledWith(
        expect.objectContaining({ SourceDir: '/tmp/mj-fetch-test' }),
        '/test/install'
      );
      expect(result.ExtractedDir).toBe('/test/install');
    });

    it('does not download or extract a zip in distribution mode', async () => {
      await phase.Run(makeContext({ Tag: 'v5.2.0' }));
      expect(mockGitHub.DownloadRelease).not.toHaveBeenCalled();
      expect(mockFs.ExtractZip).not.toHaveBeenCalled();
    });

    it('cleans up the temp clone after a successful assembly', async () => {
      const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockRepoFetcher.FetchPaths.mockResolvedValueOnce({ Dir: '/tmp/x', UsedFallback: false, Cleanup: cleanup });
      await phase.Run(makeContext({ Tag: 'v5.2.0' }));
      expect(cleanup).toHaveBeenCalled();
    });

    it('cleans up the temp clone even when assembly fails', async () => {
      const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockRepoFetcher.FetchPaths.mockResolvedValueOnce({ Dir: '/tmp/x', UsedFallback: false, Cleanup: cleanup });
      mockAssembler.AssembleToDir.mockRejectedValueOnce(new Error('boom'));
      await expect(phase.Run(makeContext({ Tag: 'v5.2.0' }))).rejects.toThrow(InstallerError);
      expect(cleanup).toHaveBeenCalled();
    });

    it('throws FETCH_FAILED pointing to mj bundle when the fetch fails', async () => {
      mockRepoFetcher.FetchPaths.mockReset();
      mockRepoFetcher.FetchPaths.mockRejectedValue(new Error('network down'));
      try {
        await phase.Run(makeContext({ Tag: 'v5.2.0' }));
        throw new Error('expected Run to throw');
      } catch (err) {
        const ie = err as InstallerError;
        expect(ie.Code).toBe('FETCH_FAILED');
        expect(ie.message).toContain('network down');
        expect(ie.SuggestedFix).toContain('mj bundle');
      }
    });

    it('throws ASSEMBLE_FAILED when assembly fails', async () => {
      mockAssembler.AssembleToDir.mockReset();
      mockAssembler.AssembleToDir.mockRejectedValue(new Error('bad tree'));
      try {
        await phase.Run(makeContext({ Tag: 'v5.2.0' }));
        throw new Error('expected Run to throw');
      } catch (err) {
        expect((err as InstallerError).Code).toBe('ASSEMBLE_FAILED');
      }
    });
  });

  // ─── Monorepo mode (shallow git clone of the tag) ──────────────────

  describe('monorepo git clone', () => {
    const monorepoCtx = () => makeContext({ Tag: 'v5.2.0', InstallMode: 'monorepo' });

    it('shallow-clones the tag into a temp dir with a relative destination', async () => {
      await phase.Run(monorepoCtx());
      expect(mockProcessRunner.Run).toHaveBeenCalledWith(
        'git',
        ['clone', '--depth', '1', '--branch', 'v5.2.0', '--', 'https://github.com/MemberJunction/MJ.git', 'MJ'],
        expect.objectContaining({ Cwd: '/tmp/mj-install-test' })
      );
    });

    it.each(['--upload-pack=touch x', 'v5.2.0 && echo hi', 'v5.2.0;rm'])('refuses to clone the unsafe tag %s', async (tag) => {
      mockGitHub.GetReleaseByTag.mockResolvedValue({ ...sampleVersionInfo(), Tag: tag });
      await expect(phase.Run(makeContext({ Tag: tag, InstallMode: 'monorepo' }))).rejects.toMatchObject({ Code: 'CLONE_FAILED' });
      expect(mockProcessRunner.Run).not.toHaveBeenCalled();
    });

    it('copies the clone into the target dir and removes the temp dir', async () => {
      await phase.Run(monorepoCtx());
      expect(mockFs.CopyDirectory).toHaveBeenCalledWith(path.join('/tmp/mj-install-test', 'MJ'), '/test/install');
      expect(mockFs.RemoveDir).toHaveBeenCalledWith('/tmp/mj-install-test');
    });

    it('does not download or extract a zip, or sparse-fetch', async () => {
      await phase.Run(monorepoCtx());
      expect(mockGitHub.DownloadRelease).not.toHaveBeenCalled();
      expect(mockFs.ExtractZip).not.toHaveBeenCalled();
      expect(mockRepoFetcher.FetchPaths).not.toHaveBeenCalled();
    });

    it('throws CLONE_FAILED with git output when the clone fails, and still removes the temp dir', async () => {
      mockProcessRunner.Run.mockResolvedValue({
        ExitCode: 128, Stdout: '', Stderr: "fatal: Remote branch v5.2.0 not found in upstream origin", TimedOut: false,
      });
      try {
        await phase.Run(monorepoCtx());
        throw new Error('expected Run to throw');
      } catch (err) {
        const ie = err as InstallerError;
        expect(ie.Code).toBe('CLONE_FAILED');
        expect(ie.message).toContain('Remote branch v5.2.0 not found');
      }
      expect(mockFs.CopyDirectory).not.toHaveBeenCalled();
      expect(mockFs.RemoveDir).toHaveBeenCalledWith('/tmp/mj-install-test');
    });

    it('throws CLONE_FAILED when the copy into the target fails', async () => {
      mockFs.CopyDirectory.mockRejectedValue(new Error('EACCES'));
      try {
        await phase.Run(monorepoCtx());
        throw new Error('expected Run to throw');
      } catch (err) {
        expect((err as InstallerError).Code).toBe('CLONE_FAILED');
        expect((err as InstallerError).message).toContain('EACCES');
      }
    });

    it('restores a user-populated install.config.json after the copy', async () => {
      mockFs.FileExists.mockImplementation(async (p: string) => p === path.join('/test/install', 'install.config.json'));
      mockFs.ReadText.mockResolvedValue('{"DatabaseHost":"db"}');
      await phase.Run(monorepoCtx());
      expect(mockFs.WriteText).toHaveBeenCalledWith(path.join('/test/install', 'install.config.json'), '{"DatabaseHost":"db"}');
    });

    it('does not throw if removing the temp dir fails (non-critical cleanup)', async () => {
      mockFs.RemoveDir.mockRejectedValue(new Error('Permission denied'));
      await expect(phase.Run(monorepoCtx())).resolves.toBeDefined();
    });
  });
});
