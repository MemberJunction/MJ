import { vi } from 'vitest';
import type { ProcessResult } from '../../adapters/ProcessRunner.js';
import type { SqlConnectivityResult } from '../../adapters/SqlServerAdapter.js';
import type { VersionInfo } from '../../models/VersionInfo.js';

/**
 * Create a mock FileSystemAdapter with vi.fn() stubs for all public methods.
 */
export function createMockFileSystem() {
  return {
    ExtractZip: vi.fn<[string, string], Promise<string[]>>().mockResolvedValue([]),
    CreateDirectory: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
    DirectoryExists: vi.fn<[string], Promise<boolean>>().mockResolvedValue(true),
    FileExists: vi.fn<[string], Promise<boolean>>().mockResolvedValue(true),
    IsDirectoryEmpty: vi.fn<[string], Promise<boolean>>().mockResolvedValue(true),
    ListDirectoryEntries: vi.fn<[string], Promise<string[]>>().mockResolvedValue([]),
    GetFreeDiskSpace: vi.fn<[string], Promise<number>>().mockResolvedValue(10_000_000_000),
    CanWrite: vi.fn<[string], Promise<boolean>>().mockResolvedValue(true),
    CreateTempDir: vi.fn<[string?], Promise<string>>().mockResolvedValue('/tmp/mj-install-test'),
    RemoveDir: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
    RemoveFile: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
    ReadJSON: vi.fn().mockResolvedValue({}),
    WriteJSON: vi.fn<[string, unknown], Promise<void>>().mockResolvedValue(undefined),
    WriteText: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
    ReadText: vi.fn<[string], Promise<string>>().mockResolvedValue(''),
    ListFiles: vi.fn<[string, RegExp?], Promise<string[]>>().mockResolvedValue([]),
    GetModifiedTime: vi.fn<[string], Promise<number | null>>().mockResolvedValue(Date.now()),
    FindFiles: vi.fn<[string, string, number?], Promise<string[]>>().mockResolvedValue([]),
  };
}

export type MockFileSystem = ReturnType<typeof createMockFileSystem>;

/**
 * Create a mock ProcessRunner with vi.fn() stubs for all public methods.
 */
export function createMockProcessRunner() {
  const defaultResult: ProcessResult = {
    ExitCode: 0,
    Stdout: '',
    Stderr: '',
    TimedOut: false,
  };

  return {
    Run: vi.fn().mockResolvedValue({ ...defaultResult }),
    RunSimple: vi.fn<[string, string[], string?], Promise<string>>().mockResolvedValue(''),
    CommandExists: vi.fn<[string], Promise<boolean>>().mockResolvedValue(true),
    killTree: vi.fn<[number | undefined], void>(),
    killByPort: vi.fn<[number], void>(),
  };
}

export type MockProcessRunner = ReturnType<typeof createMockProcessRunner>;

/**
 * Create a mock SqlServerAdapter with vi.fn() stubs.
 */
export function createMockSqlAdapter() {
  const defaultResult: SqlConnectivityResult = {
    Reachable: true,
    LatencyMs: 15,
  };

  return {
    CheckConnectivity: vi.fn().mockResolvedValue({ ...defaultResult }),
  };
}

export type MockSqlAdapter = ReturnType<typeof createMockSqlAdapter>;

/**
 * Create a mock GitHubReleaseProvider with vi.fn() stubs.
 */
export function createMockGitHubProvider() {
  const defaultVersion: VersionInfo = {
    Tag: 'v5.2.0',
    Name: 'v5.2.0',
    ReleaseDate: new Date('2025-02-15'),
    Prerelease: false,
    DownloadUrl: 'https://github.com/MemberJunction/MJ/archive/refs/tags/v5.2.0.zip',
  };

  return {
    ListReleases: vi.fn().mockResolvedValue([{ ...defaultVersion }]),
    GetReleaseByTag: vi.fn().mockResolvedValue({ ...defaultVersion }),
    DownloadRelease: vi.fn<[string, string, ((p: number) => void)?], Promise<void>>().mockResolvedValue(undefined),
  };
}

export type MockGitHubProvider = ReturnType<typeof createMockGitHubProvider>;
