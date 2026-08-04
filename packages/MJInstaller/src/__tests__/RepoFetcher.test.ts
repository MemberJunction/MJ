/**
 * Tests for RepoFetcher's clone-strategy selection. simple-git is mocked so no
 * network/git is involved; the temp-dir lifecycle uses the real filesystem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stat } from 'node:fs/promises';

const mockGit = {
  clone: vi.fn<(repoUrl: string, dir: string, options: string[]) => Promise<string>>(),
  raw: vi.fn<(args: string[]) => Promise<string>>(),
};
vi.mock('simple-git', () => ({
  simpleGit: () => mockGit,
}));

import { RepoFetcher } from '../adapters/RepoFetcher.js';

describe('RepoFetcher', () => {
  beforeEach(() => {
    mockGit.clone.mockReset();
    mockGit.raw.mockReset();
    mockGit.clone.mockResolvedValue('');
    mockGit.raw.mockResolvedValue('');
  });

  it('uses a blobless partial clone when the server supports it', async () => {
    const result = await new RepoFetcher().FetchPaths({ RepoUrl: 'url', Ref: 'v1.0.0', Paths: ['a', 'b'] });
    try {
      expect(result.UsedFallback).toBe(false);
      expect(mockGit.clone.mock.calls[0][2]).toContain('--filter=blob:none');
      expect(mockGit.raw).toHaveBeenCalledWith(['sparse-checkout', 'set', '--no-cone', 'a', 'b']);
      expect(mockGit.raw).toHaveBeenCalledWith(['checkout']);
    } finally {
      await result.Cleanup();
    }
  });

  it('falls back to a full sparse clone when the partial filter is rejected', async () => {
    mockGit.clone.mockImplementation((_url, _dir, opts) =>
      opts.includes('--filter=blob:none') ? Promise.reject(new Error('filter unsupported')) : Promise.resolve('')
    );
    const result = await new RepoFetcher().FetchPaths({ RepoUrl: 'url', Ref: 'v1.0.0', Paths: ['a'] });
    try {
      expect(result.UsedFallback).toBe(true);
      expect(mockGit.clone).toHaveBeenCalledTimes(2);
      expect(mockGit.clone.mock.calls[1][2]).toContain('--sparse');
      expect(mockGit.raw).toHaveBeenCalledWith(['sparse-checkout', 'set', '--no-cone', 'a']);
    } finally {
      await result.Cleanup();
    }
  });

  it('throws when no paths are requested', async () => {
    await expect(new RepoFetcher().FetchPaths({ RepoUrl: 'u', Ref: 'v', Paths: [] })).rejects.toThrow();
  });

  it('creates a temp dir that Cleanup removes', async () => {
    const result = await new RepoFetcher().FetchPaths({ RepoUrl: 'u', Ref: 'v', Paths: ['a'] });
    await expect(stat(result.Dir)).resolves.toBeDefined();
    await result.Cleanup();
    await expect(stat(result.Dir)).rejects.toThrow();
  });

  it('removes the temp dir and rethrows when both clone strategies fail', async () => {
    mockGit.clone.mockRejectedValue(new Error('network down'));
    await expect(new RepoFetcher().FetchPaths({ RepoUrl: 'u', Ref: 'v', Paths: ['a'] })).rejects.toThrow('network down');
  });
});
