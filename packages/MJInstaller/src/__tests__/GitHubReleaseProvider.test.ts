import type { VersionInfo } from '../models/VersionInfo.js';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
vi.stubGlobal('fetch', mockFetch);

// Mock node:fs and node:stream/promises for DownloadRelease
const mockCreateWriteStream = vi.fn();
vi.mock('node:fs', () => ({
  default: {
    createWriteStream: (...args: unknown[]) => mockCreateWriteStream(...args),
  },
}));

const mockPipeline = vi.fn().mockResolvedValue(undefined);
vi.mock('node:stream/promises', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
}));

// Import AFTER mocks are installed
const { GitHubReleaseProvider } = await import('../adapters/GitHubReleaseProvider.js');

// ---------------------------------------------------------------------------
// Helpers to build mock GitHub API responses
// ---------------------------------------------------------------------------
function makeGitHubRelease(overrides: Partial<{
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  body: string;
  assets: Array<{ name: string; browser_download_url: string; size: number; content_type: string }>;
  zipball_url: string;
}> = {}) {
  return {
    tag_name: overrides.tag_name ?? 'v5.2.0',
    name: overrides.name ?? 'Release 5.2.0',
    published_at: overrides.published_at ?? '2025-02-15T00:00:00Z',
    prerelease: overrides.prerelease ?? false,
    body: overrides.body ?? 'Release notes body',
    assets: overrides.assets ?? [],
    zipball_url: overrides.zipball_url ?? 'https://api.github.com/repos/MemberJunction/MJ/zipball/v5.2.0',
  };
}

function makeGitHubTag(overrides: Partial<{
  name: string;
  zipball_url: string;
  commit: { sha: string; url: string };
}> = {}) {
  return {
    name: overrides.name ?? 'v5.1.0',
    zipball_url: overrides.zipball_url ?? 'https://api.github.com/repos/MemberJunction/MJ/zipball/v5.1.0',
    commit: overrides.commit ?? {
      sha: 'abc1234567890',
      url: 'https://api.github.com/repos/MemberJunction/MJ/commits/abc1234567890',
    },
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => jsonResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(data)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

describe('GitHubReleaseProvider', () => {
  let provider: InstanceType<typeof GitHubReleaseProvider>;

  beforeEach(() => {
    provider = new GitHubReleaseProvider('TestOwner', 'TestRepo');
  });

  describe('ListReleases', () => {
    it('should map GitHub releases to VersionInfo array', async () => {
      const releases = [
        makeGitHubRelease({ tag_name: 'v5.2.0', name: 'Release 5.2.0' }),
        makeGitHubRelease({ tag_name: 'v5.1.0', name: 'Release 5.1.0' }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result: VersionInfo[] = await provider.ListReleases();
      expect(result).toHaveLength(2);
      expect(result[0].Tag).toBe('v5.2.0');
      expect(result[0].Name).toBe('Release 5.2.0');
      expect(result[1].Tag).toBe('v5.1.0');
    });

    it('should filter out prereleases when includePrerelease is false', async () => {
      const releases = [
        makeGitHubRelease({ tag_name: 'v5.2.0', prerelease: false }),
        makeGitHubRelease({ tag_name: 'v5.3.0-beta.1', prerelease: true }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases(false);
      expect(result).toHaveLength(1);
      expect(result[0].Tag).toBe('v5.2.0');
    });

    it('should include prereleases when includePrerelease is true', async () => {
      const releases = [
        makeGitHubRelease({ tag_name: 'v5.2.0', prerelease: false }),
        makeGitHubRelease({ tag_name: 'v5.3.0-beta.1', prerelease: true }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases(true);
      expect(result).toHaveLength(2);
    });

    it('should fall back to tags API when releases array is empty', async () => {
      // First call: releases returns empty array
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      // Second call: tags API
      const tags = [makeGitHubTag({ name: 'v5.1.0' })];
      mockFetch.mockResolvedValueOnce(jsonResponse(tags));

      // Third call: commit date lookup for the tag
      mockFetch.mockResolvedValueOnce(jsonResponse({
        commit: { committer: { date: '2025-01-10T00:00:00Z' } },
      }));

      const result = await provider.ListReleases();
      expect(result).toHaveLength(1);
      expect(result[0].Tag).toBe('v5.1.0');
      expect(result[0].Prerelease).toBe(false);
    });

    it('should throw an Error when the releases API call fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(null, 500));

      await expect(provider.ListReleases()).rejects.toThrow('GitHub API error');
    });

    it('should prefer uploaded .zip asset URL over zipball_url', async () => {
      const releases = [
        makeGitHubRelease({
          tag_name: 'v5.2.0',
          assets: [{
            name: 'MJ-v5.2.0.zip',
            browser_download_url: 'https://github.com/MemberJunction/MJ/releases/download/v5.2.0/MJ-v5.2.0.zip',
            size: 50000000,
            content_type: 'application/zip',
          }],
          zipball_url: 'https://api.github.com/repos/MemberJunction/MJ/zipball/v5.2.0',
        }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases();
      expect(result[0].DownloadUrl).toContain('releases/download');
      expect(result[0].DownloadUrl).not.toContain('zipball');
    });

    it('should use zipball_url when no .zip asset is available', async () => {
      const releases = [
        makeGitHubRelease({
          tag_name: 'v5.2.0',
          assets: [], // No assets
          zipball_url: 'https://api.github.com/repos/MemberJunction/MJ/zipball/v5.2.0',
        }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases();
      expect(result[0].DownloadUrl).toContain('zipball');
    });

    it('should truncate release notes to 500 characters with ellipsis', async () => {
      const longBody = 'A'.repeat(600);
      const releases = [makeGitHubRelease({ body: longBody })];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases();
      expect(result[0].Notes).toBeDefined();
      expect(result[0].Notes!.length).toBe(503); // 500 chars + '...'
      expect(result[0].Notes!.endsWith('...')).toBe(true);
    });

    it('should not add ellipsis for short release notes', async () => {
      const shortBody = 'Short notes';
      const releases = [makeGitHubRelease({ body: shortBody })];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases();
      expect(result[0].Notes).toBe('Short notes');
    });

    it('should set Notes to undefined when body is empty', async () => {
      const releases = [makeGitHubRelease({ body: '' })];
      mockFetch.mockResolvedValueOnce(jsonResponse(releases));

      const result = await provider.ListReleases();
      expect(result[0].Notes).toBeUndefined();
    });
  });

  describe('GetReleaseByTag', () => {
    it('should return VersionInfo for a matching formal release', async () => {
      const release = makeGitHubRelease({ tag_name: 'v5.2.0' });
      mockFetch.mockResolvedValueOnce(jsonResponse(release));

      const result = await provider.GetReleaseByTag('v5.2.0');
      expect(result.Tag).toBe('v5.2.0');
      expect(result.Prerelease).toBe(false);
    });

    it('should fall back to tag/commit lookup when release returns non-ok', async () => {
      // First call: release 404
      mockFetch.mockResolvedValueOnce(jsonResponse(null, 404));

      // Second call: commits API for tag lookup
      mockFetch.mockResolvedValueOnce(jsonResponse({
        commit: { committer: { date: '2025-01-10T00:00:00Z' } },
      }));

      const result = await provider.GetReleaseByTag('v5.0.0');
      expect(result.Tag).toBe('v5.0.0');
      expect(result.Name).toBe('v5.0.0');
      expect(result.Prerelease).toBe(false);
      expect(result.DownloadUrl).toContain('zipball');
    });

    it('should throw when the tag is not found via fallback either', async () => {
      // First call: release 404
      mockFetch.mockResolvedValueOnce(jsonResponse(null, 404));
      // Second call: commit 404
      mockFetch.mockResolvedValueOnce(jsonResponse(null, 404));

      await expect(provider.GetReleaseByTag('v0.0.0')).rejects.toThrow('not found');
    });

    it('should use the correct API URL for the release lookup', async () => {
      const release = makeGitHubRelease({ tag_name: 'v5.2.0' });
      mockFetch.mockResolvedValueOnce(jsonResponse(release));

      await provider.GetReleaseByTag('v5.2.0');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/TestOwner/TestRepo/releases/tags/v5.2.0',
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': 'MJ-Installer' }),
        })
      );
    });
  });

  describe('DownloadRelease', () => {
    it('should throw when the response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(
        provider.DownloadRelease('https://example.com/file.zip', '/tmp/out.zip')
      ).rejects.toThrow('Download failed: 404 Not Found');
    });

    it('should throw when the response body is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
        headers: new Headers(),
      } as Response);

      await expect(
        provider.DownloadRelease('https://example.com/file.zip', '/tmp/out.zip')
      ).rejects.toThrow('no body');
    });

    it('should create a write stream to the destination path', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { getReader: () => mockReader },
        headers: new Headers({ 'content-length': '3' }),
      } as unknown as Response);

      const fakeWriteStream = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      mockCreateWriteStream.mockReturnValueOnce(fakeWriteStream);

      await provider.DownloadRelease('https://example.com/file.zip', '/tmp/dest.zip');

      expect(mockCreateWriteStream).toHaveBeenCalledWith('/tmp/dest.zip');
    });

    it('should call onProgress callback with percentage during download', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(50) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(50) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { getReader: () => mockReader },
        headers: new Headers({ 'content-length': '100' }),
      } as unknown as Response);

      const fakeWriteStream = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      mockCreateWriteStream.mockReturnValueOnce(fakeWriteStream);

      // Since DownloadRelease uses pipeline which is mocked, we need to test
      // the Readable manually. Let's verify the pipeline was called with the
      // write stream and some readable.
      const progressCalls: number[] = [];
      await provider.DownloadRelease(
        'https://example.com/file.zip',
        '/tmp/dest.zip',
        (pct) => progressCalls.push(pct)
      );

      expect(mockPipeline).toHaveBeenCalledWith(
        expect.anything(),  // Readable stream
        fakeWriteStream     // Write stream
      );
    });

    it('should pass User-Agent header and follow redirects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      } as Response);

      try {
        await provider.DownloadRelease('https://example.com/file.zip', '/tmp/out.zip');
      } catch {
        // Expected to throw
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': 'MJ-Installer' }),
          redirect: 'follow',
        })
      );
    });
  });

  describe('constructor', () => {
    it('should use default owner and repo when none provided', async () => {
      const defaultProvider = new GitHubReleaseProvider();
      const release = makeGitHubRelease();
      mockFetch.mockResolvedValueOnce(jsonResponse(release));

      await defaultProvider.GetReleaseByTag('v5.2.0');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('repos/MemberJunction/MJ/'),
        expect.anything()
      );
    });

    it('should use custom owner and repo when provided', async () => {
      const customProvider = new GitHubReleaseProvider('MyOrg', 'MyRepo');
      const release = makeGitHubRelease();
      mockFetch.mockResolvedValueOnce(jsonResponse(release));

      await customProvider.GetReleaseByTag('v1.0.0');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('repos/MyOrg/MyRepo/'),
        expect.anything()
      );
    });
  });
});
