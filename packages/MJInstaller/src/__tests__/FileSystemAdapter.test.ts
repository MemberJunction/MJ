// ---------------------------------------------------------------------------
// Mock node:fs/promises, node:fs, node:os, and adm-zip
// ---------------------------------------------------------------------------
const mockFsPromises = {
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn(),
  statfs: vi.fn(),
};

vi.mock('node:fs/promises', () => ({
  default: mockFsPromises,
}));

vi.mock('node:fs', () => ({
  default: {
    createWriteStream: vi.fn(),
  },
}));

const mockTmpdir = vi.fn().mockReturnValue('/tmp');
vi.mock('node:os', () => ({
  default: {
    tmpdir: () => mockTmpdir(),
  },
}));

// AdmZip mock — must be a constructible class because source uses `new AdmZip(path)`
const mockGetEntries = vi.fn().mockReturnValue([]);
let lastAdmZipPath: string | undefined;

class FakeAdmZip {
  constructor(zipPath: string) {
    lastAdmZipPath = zipPath;
  }
  getEntries = mockGetEntries;
}

vi.mock('adm-zip', () => ({
  default: FakeAdmZip,
}));

// Import AFTER mocks are installed
const { FileSystemAdapter } = await import('../adapters/FileSystemAdapter.js');

describe('FileSystemAdapter', () => {
  let adapter: InstanceType<typeof FileSystemAdapter>;

  beforeEach(() => {
    adapter = new FileSystemAdapter();
  });

  describe('ExtractZip', () => {
    it('should open the ZIP file with AdmZip', async () => {
      mockGetEntries.mockReturnValue([]);
      mockFsPromises.readdir.mockResolvedValue([]);

      await adapter.ExtractZip('/tmp/release.zip', '/target');

      expect(lastAdmZipPath).toBe('/tmp/release.zip');
    });

    it('should strip single root folder from GitHub zipballs', async () => {
      mockFsPromises.writeFile.mockClear();
      mockFsPromises.mkdir.mockClear();

      const entries = [
        { entryName: 'MemberJunction-MJ-abc1234/', isDirectory: true, getData: () => Buffer.from('') },
        { entryName: 'MemberJunction-MJ-abc1234/package.json', isDirectory: false, getData: () => Buffer.from('{}') },
        { entryName: 'MemberJunction-MJ-abc1234/src/', isDirectory: true, getData: () => Buffer.from('') },
        { entryName: 'MemberJunction-MJ-abc1234/src/index.ts', isDirectory: false, getData: () => Buffer.from('export {}') },
      ];
      mockGetEntries.mockReturnValue(entries);
      mockFsPromises.readdir.mockResolvedValue(['package.json', 'src']);

      const result = await adapter.ExtractZip('/tmp/release.zip', '/target');

      // The writeFile calls should be for the stripped paths
      const writtenPaths: string[] = mockFsPromises.writeFile.mock.calls.map(
        (c: [string, ...unknown[]]) => c[0]
      );

      // Should write to paths containing package.json (with any OS separator)
      expect(writtenPaths.some((p: string) => p.includes('package.json'))).toBe(true);
      // Should NOT contain the root wrapper folder name
      expect(writtenPaths.every((p: string) => !p.includes('MemberJunction-MJ-abc1234'))).toBe(true);

      expect(result).toEqual(['package.json', 'src']);
    });

    it('should preserve multiple root folders without stripping', async () => {
      const entries = [
        { entryName: 'folder-a/', isDirectory: true, getData: () => Buffer.from('') },
        { entryName: 'folder-a/file.txt', isDirectory: false, getData: () => Buffer.from('a') },
        { entryName: 'folder-b/', isDirectory: true, getData: () => Buffer.from('') },
        { entryName: 'folder-b/file.txt', isDirectory: false, getData: () => Buffer.from('b') },
      ];
      mockGetEntries.mockReturnValue(entries);
      mockFsPromises.readdir.mockResolvedValue(['folder-a', 'folder-b']);

      await adapter.ExtractZip('/tmp/multi.zip', '/target');

      // With multiple roots, paths should NOT be stripped
      const writeFileCalls = mockFsPromises.writeFile.mock.calls;
      const writtenPaths = writeFileCalls.map((c: [string, Uint8Array]) => c[0]);
      // Should include full paths with folder-a and folder-b
      expect(writtenPaths.some((p: string) => p.includes('folder-a'))).toBe(true);
      expect(writtenPaths.some((p: string) => p.includes('folder-b'))).toBe(true);
    });

    it('should return the list of top-level entries from the target directory', async () => {
      mockGetEntries.mockReturnValue([]);
      mockFsPromises.readdir.mockResolvedValue(['packages', 'package.json', 'turbo.json']);

      const result = await adapter.ExtractZip('/tmp/release.zip', '/target');
      expect(result).toEqual(['packages', 'package.json', 'turbo.json']);
    });

    it('should create the target directory if it does not exist', async () => {
      mockGetEntries.mockReturnValue([]);
      mockFsPromises.readdir.mockResolvedValue([]);

      await adapter.ExtractZip('/tmp/release.zip', '/new/path/target');

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/new/path/target', { recursive: true });
    });
  });

  describe('CreateDirectory', () => {
    it('should call mkdir with recursive: true', async () => {
      await adapter.CreateDirectory('/path/to/new/dir');

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/path/to/new/dir', { recursive: true });
    });
  });

  describe('DirectoryExists', () => {
    it('should return true for an existing directory', async () => {
      mockFsPromises.stat.mockResolvedValue({ isDirectory: () => true });

      const result = await adapter.DirectoryExists('/existing/dir');
      expect(result).toBe(true);
    });

    it('should return false when stat throws (directory does not exist)', async () => {
      mockFsPromises.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await adapter.DirectoryExists('/nonexistent/dir');
      expect(result).toBe(false);
    });

    it('should return false when the path exists but is not a directory', async () => {
      mockFsPromises.stat.mockResolvedValue({ isDirectory: () => false });

      const result = await adapter.DirectoryExists('/path/to/file.txt');
      expect(result).toBe(false);
    });
  });

  describe('FileExists', () => {
    it('should return true for an existing file', async () => {
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true });

      const result = await adapter.FileExists('/path/to/file.txt');
      expect(result).toBe(true);
    });

    it('should return false when stat throws (file does not exist)', async () => {
      mockFsPromises.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await adapter.FileExists('/nonexistent/file.txt');
      expect(result).toBe(false);
    });

    it('should return false when the path exists but is not a regular file', async () => {
      mockFsPromises.stat.mockResolvedValue({ isFile: () => false });

      const result = await adapter.FileExists('/path/to/directory');
      expect(result).toBe(false);
    });
  });

  describe('IsDirectoryEmpty', () => {
    it('should return true for an empty directory', async () => {
      mockFsPromises.readdir.mockResolvedValue([]);

      const result = await adapter.IsDirectoryEmpty('/empty/dir');
      expect(result).toBe(true);
    });

    it('should return false for a non-empty directory', async () => {
      mockFsPromises.readdir.mockResolvedValue(['file.txt', 'subdir']);

      const result = await adapter.IsDirectoryEmpty('/non-empty/dir');
      expect(result).toBe(false);
    });

    it('should return true when the directory does not exist', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await adapter.IsDirectoryEmpty('/nonexistent/dir');
      expect(result).toBe(true);
    });
  });

  describe('ListDirectoryEntries', () => {
    it('should return directory entries', async () => {
      mockFsPromises.readdir.mockResolvedValue(['a.txt', 'b.txt', 'subdir']);

      const result = await adapter.ListDirectoryEntries('/some/dir');
      expect(result).toEqual(['a.txt', 'b.txt', 'subdir']);
    });

    it('should return empty array when the directory does not exist', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await adapter.ListDirectoryEntries('/nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('ReadJSON', () => {
    it('should parse and return JSON file content', async () => {
      const data = { name: 'test', version: '1.0.0' };
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(data));

      const result = await adapter.ReadJSON<{ name: string; version: string }>('/path/to/file.json');
      expect(result).toEqual(data);
    });

    it('should throw when the file does not exist', async () => {
      mockFsPromises.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(adapter.ReadJSON('/nonexistent.json')).rejects.toThrow('ENOENT');
    });

    it('should throw when the file contains invalid JSON', async () => {
      mockFsPromises.readFile.mockResolvedValue('not valid json {{{');

      await expect(adapter.ReadJSON('/bad.json')).rejects.toThrow();
    });
  });

  describe('WriteJSON', () => {
    it('should write pretty-printed JSON with 2-space indent', async () => {
      const data = { key: 'value', nested: { a: 1 } };
      await adapter.WriteJSON('/path/to/out.json', data);

      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/path/to/out.json',
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });
  });

  describe('ReadText', () => {
    it('should return file content as a string', async () => {
      mockFsPromises.readFile.mockResolvedValue('hello world');

      const result = await adapter.ReadText('/path/to/file.txt');
      expect(result).toBe('hello world');
    });

    it('should throw when the file does not exist', async () => {
      mockFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));

      await expect(adapter.ReadText('/nonexistent.txt')).rejects.toThrow('ENOENT');
    });
  });

  describe('WriteText', () => {
    it('should create parent directories and write the file', async () => {
      await adapter.WriteText('/path/to/new/file.txt', 'content');

      // Should create parent directories
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/[/\\]path[/\\]to[/\\]new$/),
        { recursive: true }
      );
      // Should write the file
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/path/to/new/file.txt',
        'content',
        'utf-8'
      );
    });
  });

  describe('ListFiles', () => {
    it('should return file names from the directory', async () => {
      mockFsPromises.readdir.mockResolvedValue([
        { name: 'file1.ts', isFile: () => true },
        { name: 'file2.ts', isFile: () => true },
        { name: 'subdir', isFile: () => false },
      ]);

      const result = await adapter.ListFiles('/path/to/dir');
      expect(result).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should filter files by regex pattern', async () => {
      mockFsPromises.readdir.mockResolvedValue([
        { name: 'environment.ts', isFile: () => true },
        { name: 'environment.prod.ts', isFile: () => true },
        { name: 'app.module.ts', isFile: () => true },
      ]);

      const result = await adapter.ListFiles('/path/to/dir', /environment.*\.ts$/);
      expect(result).toEqual(['environment.ts', 'environment.prod.ts']);
    });

    it('should return empty array when directory does not exist', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await adapter.ListFiles('/nonexistent/dir');
      expect(result).toEqual([]);
    });

    it('should return empty array when no files match the pattern', async () => {
      mockFsPromises.readdir.mockResolvedValue([
        { name: 'app.module.ts', isFile: () => true },
        { name: 'main.ts', isFile: () => true },
      ]);

      const result = await adapter.ListFiles('/path', /\.json$/);
      expect(result).toEqual([]);
    });
  });

  describe('GetFreeDiskSpace', () => {
    it('should return free disk space in bytes', async () => {
      mockFsPromises.stat.mockResolvedValue({ isDirectory: () => true });
      mockFsPromises.statfs.mockResolvedValue({ bavail: 1000, bsize: 4096 });

      const result = await adapter.GetFreeDiskSpace('/existing/dir');
      expect(result).toBe(1000 * 4096);
    });

    it('should walk up to find an existing ancestor if path does not exist', async () => {
      // First call for /non/existent/path: not a directory
      // Second call for /non/existent: not a directory
      // Third call for /non: exists
      mockFsPromises.stat
        .mockRejectedValueOnce(new Error('ENOENT'))  // /non/existent/path
        .mockRejectedValueOnce(new Error('ENOENT'))  // /non/existent
        .mockResolvedValueOnce({ isDirectory: () => true });  // /non

      mockFsPromises.statfs.mockResolvedValue({ bavail: 500, bsize: 4096 });

      const result = await adapter.GetFreeDiskSpace('/non/existent/path');
      expect(result).toBe(500 * 4096);
    });
  });

  describe('CanWrite', () => {
    it('should return true when a probe file can be written and deleted', async () => {
      const result = await adapter.CanWrite('/writable/dir');
      expect(result).toBe(true);

      // Should have created the directory
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/writable/dir', { recursive: true });
      // Should have written a test file
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.mj-install-write-test-'),
        'test'
      );
      // Should have deleted the test file
      expect(mockFsPromises.unlink).toHaveBeenCalled();
    });

    it('should return false when writing fails (permission denied)', async () => {
      mockFsPromises.writeFile.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      const result = await adapter.CanWrite('/readonly/dir');
      expect(result).toBe(false);
    });
  });

  describe('CreateTempDir', () => {
    it('should create a temp directory with default prefix', async () => {
      mockFsPromises.mkdtemp.mockResolvedValue('/tmp/mj-install-xyz');

      const result = await adapter.CreateTempDir();
      expect(result).toBe('/tmp/mj-install-xyz');

      // Should use os.tmpdir() + prefix
      expect(mockFsPromises.mkdtemp).toHaveBeenCalledWith(
        expect.stringContaining('mj-install-')
      );
    });

    it('should use custom prefix when provided', async () => {
      mockFsPromises.mkdtemp.mockResolvedValue('/tmp/custom-abc');

      await adapter.CreateTempDir('custom-');

      expect(mockFsPromises.mkdtemp).toHaveBeenCalledWith(
        expect.stringContaining('custom-')
      );
    });
  });

  describe('RemoveDir', () => {
    it('should call rm with recursive and force options', async () => {
      await adapter.RemoveDir('/path/to/remove');

      expect(mockFsPromises.rm).toHaveBeenCalledWith('/path/to/remove', {
        recursive: true,
        force: true,
      });
    });
  });

  describe('RemoveFile', () => {
    it('should delete the file', async () => {
      await adapter.RemoveFile('/path/to/file.txt');

      expect(mockFsPromises.unlink).toHaveBeenCalledWith('/path/to/file.txt');
    });

    it('should not throw when the file does not exist', async () => {
      mockFsPromises.unlink.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(adapter.RemoveFile('/nonexistent.txt')).resolves.toBeUndefined();
    });
  });

  describe('GetModifiedTime', () => {
    it('should return the modification time in milliseconds', async () => {
      mockFsPromises.stat.mockResolvedValue({ mtimeMs: 1700000000000 });

      const result = await adapter.GetModifiedTime('/path/to/file.ts');
      expect(result).toBe(1700000000000);
    });

    it('should return null when the file does not exist', async () => {
      mockFsPromises.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await adapter.GetModifiedTime('/nonexistent.ts');
      expect(result).toBeNull();
    });
  });

  describe('FindFiles', () => {
    beforeEach(() => {
      // Clear readdir mock to get accurate call counts for FindFiles tests
      mockFsPromises.readdir.mockReset();
    });

    it('should find files matching the exact filename recursively', async () => {
      // Root directory
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'package.json', isFile: () => true, isDirectory: () => false },
        { name: 'packages', isFile: () => false, isDirectory: () => true },
        { name: 'node_modules', isFile: () => false, isDirectory: () => true },
      ]);
      // packages/ subdirectory
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'package.json', isFile: () => true, isDirectory: () => false },
        { name: 'src', isFile: () => false, isDirectory: () => true },
      ]);
      // packages/src/ subdirectory
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'index.ts', isFile: () => true, isDirectory: () => false },
      ]);

      const result = await adapter.FindFiles('/root', 'package.json');

      // Should find package.json in root and in packages/
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('package.json');
      expect(result[1]).toContain('package.json');
    });

    it('should skip node_modules and .git directories', async () => {
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'node_modules', isFile: () => false, isDirectory: () => true },
        { name: '.git', isFile: () => false, isDirectory: () => true },
        { name: 'src', isFile: () => false, isDirectory: () => true },
      ]);
      // Only src/ should be traversed
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'target.txt', isFile: () => true, isDirectory: () => false },
      ]);

      const result = await adapter.FindFiles('/root', 'target.txt');
      expect(result).toHaveLength(1);

      // readdir should only have been called twice: root and src/
      expect(mockFsPromises.readdir).toHaveBeenCalledTimes(2);
    });

    it('should respect maxDepth limit', async () => {
      // depth 0
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'level1', isFile: () => false, isDirectory: () => true },
      ]);
      // depth 1 (maxDepth = 1, so we go into level1)
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'level2', isFile: () => false, isDirectory: () => true },
      ]);
      // depth 2 would exceed maxDepth 1, so should not be called

      const result = await adapter.FindFiles('/root', 'target.txt', 1);
      expect(result).toHaveLength(0);

      // Should have only read root and level1 directories
      expect(mockFsPromises.readdir).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when directory cannot be read', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('EACCES'));

      const result = await adapter.FindFiles('/forbidden', 'file.txt');
      expect(result).toEqual([]);
    });

    it('should use default maxDepth of 3', async () => {
      // Set up 5 levels of nesting to verify depth 3 is the limit
      // depth 0
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'l1', isFile: () => false, isDirectory: () => true },
      ]);
      // depth 1
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'l2', isFile: () => false, isDirectory: () => true },
      ]);
      // depth 2
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'l3', isFile: () => false, isDirectory: () => true },
      ]);
      // depth 3
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'l4', isFile: () => false, isDirectory: () => true },
      ]);
      // depth 4 would exceed maxDepth 3

      await adapter.FindFiles('/root', 'target.txt');

      // Should have read 4 directories: root, l1, l2, l3
      // l4 should NOT be read because currentDepth (4) > maxDepth (3)
      expect(mockFsPromises.readdir).toHaveBeenCalledTimes(4);
    });
  });
});
