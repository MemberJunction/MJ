import { createMockFileSystem, createMockGitHubProvider } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { sampleVersionInfo } from './mocks/fixtures.js';
import type { ScaffoldContext } from '../phases/ScaffoldPhase.js';
import { InstallerError } from '../errors/InstallerError.js';
import type { VersionInfo } from '../models/VersionInfo.js';

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

  // ─── Download + Extract ────────────────────────────────────────────

  describe('download and extract', () => {
    it('should return ScaffoldResult with correct Version and ExtractedDir', async () => {
      const ctx = makeContext({ Tag: 'v5.2.0' });
      const result = await phase.Run(ctx);
      expect(result.Version.Tag).toBe('v5.2.0');
      expect(result.ExtractedDir).toBe('/test/install');
    });

    it('should throw DOWNLOAD_FAILED when download fails', async () => {
      mockGitHub.DownloadRelease.mockRejectedValue(new Error('Network timeout'));
      const ctx = makeContext({ Tag: 'v5.2.0' });

      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      try {
        await phase.Run(ctx);
      } catch (err) {
        expect((err as InstallerError).Code).toBe('DOWNLOAD_FAILED');
        expect((err as InstallerError).message).toContain('Network timeout');
      }
    });

    it('should throw EXTRACT_FAILED when extraction fails', async () => {
      mockFs.ExtractZip.mockRejectedValue(new Error('Corrupt ZIP'));
      const ctx = makeContext({ Tag: 'v5.2.0' });

      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      try {
        await phase.Run(ctx);
      } catch (err) {
        expect((err as InstallerError).Code).toBe('EXTRACT_FAILED');
        expect((err as InstallerError).message).toContain('Corrupt ZIP');
      }
    });
  });

  // ─── Cleanup ───────────────────────────────────────────────────────

  describe('temp file cleanup', () => {
    it('should call RemoveFile for temp zip after successful extraction', async () => {
      const ctx = makeContext({ Tag: 'v5.2.0' });
      await phase.Run(ctx);
      expect(mockFs.RemoveFile).toHaveBeenCalledWith(
        expect.stringContaining('v5.2.0.zip')
      );
    });

    it('should not throw if RemoveFile fails (non-critical cleanup)', async () => {
      mockFs.RemoveFile.mockRejectedValue(new Error('Permission denied'));
      const ctx = makeContext({ Tag: 'v5.2.0' });
      // Should still succeed
      await expect(phase.Run(ctx)).resolves.toBeDefined();
    });
  });
});
