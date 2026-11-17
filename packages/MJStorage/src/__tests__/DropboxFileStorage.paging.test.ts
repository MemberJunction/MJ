/**
 * #4439 — Dropbox returns folder listings and search results in pages. ListObjects must follow the
 * cursor to the last page, and SearchFiles must hand back a real cursor the caller can continue from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropboxFileStorage } from '../drivers/DropboxFileStorage';

type FakeEntry = { '.tag': 'file' | 'folder'; name: string; path_lower: string; path_display: string; id: string; size?: number; server_modified?: string; rev?: string };

function file(name: string): FakeEntry {
  return { '.tag': 'file', name, path_lower: `/docs/${name}`, path_display: `/docs/${name}`, id: `id:${name}`, size: 1, server_modified: '2026-01-01T00:00:00Z', rev: '1' };
}

function folder(name: string): FakeEntry {
  return { '.tag': 'folder', name, path_lower: `/docs/${name}`, path_display: `/docs/${name}`, id: `id:${name}` };
}

function searchMatch(name: string) {
  return { metadata: { '.tag': 'metadata', metadata: file(name) }, match_type: { '.tag': 'filename' } };
}

function driverWith(client: Record<string, unknown>): DropboxFileStorage {
  const driver = new DropboxFileStorage();
  (driver as unknown as { _client: unknown })._client = client;
  return driver;
}

describe('DropboxFileStorage paging (#4439)', () => {
  beforeEach(() => {
    vi.stubEnv('STORAGE_DROPBOX_ACCESS_TOKEN', 'test-token');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('ListObjects follows the cursor and returns every page', async () => {
    const filesListFolder = vi.fn(async () => ({ result: { entries: [file('a.txt'), folder('sub')], has_more: true, cursor: 'c1' } }));
    const filesListFolderContinue = vi.fn(async ({ cursor }: { cursor: string }) =>
      cursor === 'c1'
        ? { result: { entries: [file('b.txt')], has_more: true, cursor: 'c2' } }
        : { result: { entries: [file('c.txt')], has_more: false, cursor: 'c3' } });
    const driver = driverWith({ filesListFolder, filesListFolderContinue });

    const result = await driver.ListObjects('docs');

    expect(result.objects.map((o) => o.name)).toEqual(['a.txt', 'sub', 'b.txt', 'c.txt']);
    expect(result.prefixes).toEqual(['docs/sub/']);
    expect(filesListFolderContinue.mock.calls.map((c) => c[0].cursor)).toEqual(['c1', 'c2']);
  });

  it('ListObjects makes one call when there is a single page', async () => {
    const filesListFolder = vi.fn(async () => ({ result: { entries: [file('a.txt')], has_more: false, cursor: 'c1' } }));
    const filesListFolderContinue = vi.fn();
    const driver = driverWith({ filesListFolder, filesListFolderContinue });

    const result = await driver.ListObjects('docs');

    expect(result.objects).toHaveLength(1);
    expect(filesListFolderContinue).not.toHaveBeenCalled();
  });

  it('SearchFiles returns the Dropbox cursor as nextPageToken, and continues from it', async () => {
    const filesSearchV2 = vi.fn(async () => ({ result: { matches: [searchMatch('a.txt')], has_more: true, cursor: 'search-cursor-1' } }));
    const filesSearchContinueV2 = vi.fn(async () => ({ result: { matches: [searchMatch('b.txt')], has_more: false } }));
    const driver = driverWith({ filesSearchV2, filesSearchContinueV2 });

    const first = await driver.SearchFiles('report');
    expect(first.hasMore).toBe(true);
    expect(first.nextPageToken).toBe('search-cursor-1');

    const second = await driver.SearchFiles('report', { pageToken: first.nextPageToken });
    expect(filesSearchContinueV2).toHaveBeenCalledWith({ cursor: 'search-cursor-1' });
    expect(filesSearchV2).toHaveBeenCalledTimes(1);
    expect(second.results.map((r) => r.name)).toEqual(['b.txt']);
    expect(second.hasMore).toBe(false);
    expect(second.nextPageToken).toBeUndefined();
  });
});
