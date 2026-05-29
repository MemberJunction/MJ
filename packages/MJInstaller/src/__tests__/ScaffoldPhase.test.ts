import * as path from 'node:path';
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

  // ─── install.config.json preservation across ExtractZip ─────────────
  //
  // The bootstrap ZIP ships a stub `install.config.json` (legacy camelCase
  // shape, empty values) intended as a fill-in template. If the user already
  // populated their own `install.config.json` in the target dir before
  // running `mj install` (or before re-running with `--no-resume`), the
  // unconditional ExtractZip would clobber their customized file. The
  // scaffold phase backs up the file before extraction and restores it
  // afterwards so user edits survive.

  describe('install.config.json preservation', () => {
    // Use path.join so the test passes on Windows (which uses backslashes)
    // as well as POSIX. ScaffoldPhase calls path.join under the hood.
    const USER_CONFIG_PATH = path.join('/test/install', 'install.config.json');

    // Clear mock call history so cumulative calls from prior tests in this
    // file don't leak into our assertions. (We still want the default mock
    // return values set in the outer beforeEach, so use mockClear() — not
    // mockReset() — to preserve the implementations.)
    beforeEach(() => {
      mockFs.FileExists.mockClear();
      mockFs.ReadText.mockClear();
      mockFs.WriteText.mockClear();
      mockFs.ExtractZip.mockClear();
    });
    const USER_CONFIG_CONTENT = JSON.stringify(
      {
        DatabaseHost: 'localhost',
        DatabaseName: 'UserCustomized',
        AuthProviderValues: { CLIENT_ID: 'user-supplied-id' },
      },
      null,
      2,
    );

    it('should preserve an existing install.config.json across ExtractZip', async () => {
      // Simulate: user already has install.config.json in the target dir
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p === USER_CONFIG_PATH,
      );
      mockFs.ReadText.mockImplementation(async (p: string) =>
        p === USER_CONFIG_PATH ? USER_CONFIG_CONTENT : '',
      );

      const ctx = makeContext({ Tag: 'v5.2.0' });
      await phase.Run(ctx);

      // Read happens before extract; write happens after extract
      expect(mockFs.ReadText).toHaveBeenCalledWith(USER_CONFIG_PATH);
      expect(mockFs.ExtractZip).toHaveBeenCalled();
      expect(mockFs.WriteText).toHaveBeenCalledWith(
        USER_CONFIG_PATH,
        USER_CONFIG_CONTENT,
      );

      // Order check: ReadText (backup) → ExtractZip → WriteText (restore)
      const readOrder = mockFs.ReadText.mock.invocationCallOrder[0];
      const extractOrder = mockFs.ExtractZip.mock.invocationCallOrder[0];
      const writeOrder = mockFs.WriteText.mock.invocationCallOrder.find(
        (_, i) => mockFs.WriteText.mock.calls[i][0] === USER_CONFIG_PATH,
      );
      expect(readOrder).toBeLessThan(extractOrder);
      expect(extractOrder).toBeLessThan(writeOrder as number);
    });

    it('should not write any install.config.json when none existed before extract', async () => {
      // Simulate: no user config in the target dir
      mockFs.FileExists.mockResolvedValue(false);

      const ctx = makeContext({ Tag: 'v5.2.0' });
      await phase.Run(ctx);

      // FileExists was probed, no ReadText for the config, no restoration WriteText
      expect(mockFs.FileExists).toHaveBeenCalledWith(USER_CONFIG_PATH);
      const configReads = mockFs.ReadText.mock.calls.filter(
        ([p]: [string]) => p === USER_CONFIG_PATH,
      );
      const configWrites = mockFs.WriteText.mock.calls.filter(
        ([p]: [string]) => p === USER_CONFIG_PATH,
      );
      expect(configReads).toHaveLength(0);
      expect(configWrites).toHaveLength(0);
    });

    it('should emit a step:progress message when restoring a preserved config', async () => {
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p === USER_CONFIG_PATH,
      );
      mockFs.ReadText.mockResolvedValue(USER_CONFIG_CONTENT);

      // Build the context inline so we can capture the emitSpy and inspect
      // emitted events. (`makeContext` only exposes the emitter, not the spy.)
      const { emitter, emitSpy } = createMockEmitter();
      const ctx: ScaffoldContext = {
        Tag: 'v5.2.0',
        Dir: '/test/install',
        Yes: true,
        Emitter: emitter,
      };
      await phase.Run(ctx);

      const progressEvents = emittedEvents(emitSpy, 'step:progress') as Array<{
        Phase: string;
        Message: string;
      }>;
      const preserveMsg = progressEvents.find(
        (e) =>
          e.Phase === 'scaffold' &&
          e.Message?.includes('Preserved existing install.config.json'),
      );
      expect(preserveMsg).toBeDefined();
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
