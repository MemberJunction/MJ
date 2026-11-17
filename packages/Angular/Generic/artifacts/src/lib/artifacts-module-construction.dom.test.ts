import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { type IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DocumentLiveBlockEngine } from '@memberjunction/core-entities';
import { AngularAdapterService } from '@memberjunction/ng-react';
import { ArtifactsModule } from './artifacts.module';

describe('ArtifactsModule construction (#4802)', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('does not start loading the React runtime from a CDN when the module is constructed', () => {
    // Preload() is the sole entry that injects CDN hints (via LibraryLoader) and kicks off Initialize().
    const preload = vi.spyOn(AngularAdapterService.prototype, 'Preload');
    const initialize = vi.spyOn(AngularAdapterService.prototype, 'Initialize');

    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    // Resolving the injector constructs every imported NgModule eagerly, exactly
    // as importProvidersFrom/createApplication does at a host app's bootstrap.
    const module = TestBed.inject(ArtifactsModule);

    expect(module).toBeInstanceOf(ArtifactsModule);
    expect(preload).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
    const cdnTags = document.head.querySelectorAll('link[href*="unpkg.com"], script[src*="unpkg.com"], link[href*="jsdelivr"], script[src*="jsdelivr"]');
    expect(cdnTags.length).toBe(0);
  });

  it('registers client-side RegisterArtifactFileBytesLoader so LoadArtifactFileBytes resolves MJFile DownloadUrl', async () => {
    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    TestBed.inject(ArtifactsModule);

    const payloadBytes = new Uint8Array([80, 75, 3, 4]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => payloadBytes.buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const executeGql = vi.fn(async () => ({
      MJFile: { DownloadUrl: 'https://cdn.example.org/files/wb.xlsx?sig=abc' },
    }));
    const mockProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ExecuteGQL: executeGql,
    });
    const mockUser = Object.assign(Object.create(UserInfo.prototype) as UserInfo, {
      ID: 'user-1',
    });

    const loaded = await DocumentLiveBlockEngine.Instance.LoadArtifactFileBytes(
      'file-id-123',
      mockUser,
      mockProvider,
    );
    expect(executeGql).toHaveBeenCalledWith(
      expect.stringContaining('MJFile(ID: $FileID)'),
      { FileID: 'file-id-123' },
    );
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.org/files/wb.xlsx?sig=abc');
    expect(loaded).toBeInstanceOf(Uint8Array);
    expect(Array.from(loaded as Uint8Array)).toEqual([80, 75, 3, 4]);

    // Unsafe URL schemes must fail closed and return null without calling fetch
    fetchMock.mockClear();
    executeGql.mockResolvedValueOnce({
      MJFile: { DownloadUrl: 'javascript:alert(1)' },
    });
    const rejected = await DocumentLiveBlockEngine.Instance.LoadArtifactFileBytes(
      'file-id-bad',
      mockUser,
      mockProvider,
    );
    expect(rejected).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
