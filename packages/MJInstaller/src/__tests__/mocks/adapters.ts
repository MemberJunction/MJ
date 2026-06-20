import { vi } from 'vitest';
import type { ProcessResult, ProcessOptions } from '../../adapters/ProcessRunner.js';
import type { SqlConnectivityResult } from '../../adapters/SqlServerAdapter.js';
import type { VersionInfo } from '../../models/VersionInfo.js';

/**
 * Create a mock FileSystemAdapter with vi.fn() stubs for all public methods.
 */
export function createMockFileSystem() {
  return {
    ExtractZip: vi.fn<(zipPath: string, targetDir: string) => Promise<string[]>>().mockResolvedValue([]),
    CreateDirectory: vi.fn<(dirPath: string) => Promise<void>>().mockResolvedValue(undefined),
    DirectoryExists: vi.fn<(dirPath: string) => Promise<boolean>>().mockResolvedValue(true),
    FileExists: vi.fn<(filePath: string) => Promise<boolean>>().mockResolvedValue(true),
    IsDirectoryEmpty: vi.fn<(dirPath: string) => Promise<boolean>>().mockResolvedValue(true),
    ListDirectoryEntries: vi.fn<(dirPath: string) => Promise<string[]>>().mockResolvedValue([]),
    GetFreeDiskSpace: vi.fn<(dirPath: string) => Promise<number>>().mockResolvedValue(10_000_000_000),
    CanWrite: vi.fn<(dirPath: string) => Promise<boolean>>().mockResolvedValue(true),
    CreateTempDir: vi.fn<(prefix?: string) => Promise<string>>().mockResolvedValue('/tmp/mj-install-test'),
    RemoveDir: vi.fn<(dirPath: string) => Promise<void>>().mockResolvedValue(undefined),
    RemoveFile: vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined),
    ReadJSON: vi.fn<(filePath: string) => Promise<unknown>>().mockResolvedValue({}),
    WriteJSON: vi.fn<(filePath: string, data: unknown) => Promise<void>>().mockResolvedValue(undefined),
    WriteText: vi.fn<(filePath: string, content: string) => Promise<void>>().mockResolvedValue(undefined),
    ReadText: vi.fn<(filePath: string) => Promise<string>>().mockResolvedValue(''),
    ListFiles: vi.fn<(dirPath: string, pattern?: RegExp) => Promise<string[]>>().mockResolvedValue([]),
    GetModifiedTime: vi.fn<(filePath: string) => Promise<number | null>>().mockResolvedValue(Date.now()),
    FindFiles: vi.fn<(dirPath: string, filename: string, maxDepth?: number) => Promise<string[]>>().mockResolvedValue([]),
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
    Run: vi.fn<(command: string, args: string[], options?: ProcessOptions) => Promise<ProcessResult>>().mockResolvedValue({ ...defaultResult }),
    RunSimple: vi.fn<(command: string, args: string[], cwd?: string) => Promise<string>>().mockResolvedValue(''),
    CommandExists: vi.fn<(command: string) => Promise<boolean>>().mockResolvedValue(true),
    killTree: vi.fn<(pid: number | undefined) => void>(),
    killByPort: vi.fn<(port: number) => void>(),
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
    CheckConnectivity: vi.fn<(config: unknown) => Promise<SqlConnectivityResult>>().mockResolvedValue({ ...defaultResult }),
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
    ListReleases: vi.fn<(includePrerelease?: boolean) => Promise<VersionInfo[]>>().mockResolvedValue([{ ...defaultVersion }]),
    GetReleaseByTag: vi.fn<(tag: string) => Promise<VersionInfo>>().mockResolvedValue({ ...defaultVersion }),
    DownloadRelease: vi.fn<(downloadUrl: string, destPath: string, onProgress?: (p: number) => void) => Promise<void>>().mockResolvedValue(undefined),
  };
}

export type MockGitHubProvider = ReturnType<typeof createMockGitHubProvider>;
