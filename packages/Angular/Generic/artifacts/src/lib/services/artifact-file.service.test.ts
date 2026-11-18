import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { ARTIFACT_FILE_URL_CACHE_TTL_MS, ArtifactFileService } from './artifact-file.service';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ArtifactFileService', () => {
  it('caches download URLs with LRU touch and expires stale entries after TTL', async () => {
    vi.useFakeTimers();
    const service = new ArtifactFileService();
    let callCount = 0;
    const provider = Object.assign(Object.create(null) as IMetadataProvider, {
      ExecuteGQL: async (_q: string, vars?: Record<string, string>) => {
        callCount++;
        return { ArtifactFileDownloadUrl: `https://cdn.example.com/${vars?.artifactVersionId}?n=${callCount}` };
      },
    });

    expect(await service.GetDownloadUrl('v1', false, provider)).toBe('https://cdn.example.com/v1?n=1');
    expect(await service.GetDownloadUrl('v1', false, provider)).toBe('https://cdn.example.com/v1?n=1');
    expect(callCount).toBe(1);

    vi.advanceTimersByTime(ARTIFACT_FILE_URL_CACHE_TTL_MS + 1000);
    expect(await service.GetDownloadUrl('v1', false, provider)).toBe('https://cdn.example.com/v1?n=2');
    expect(callCount).toBe(2);
  });

  it('falls back to GraphQLDataProvider.ExecuteGQL when no provider is supplied', async () => {
    const spy = vi.spyOn(GraphQLDataProvider, 'ExecuteGQL').mockResolvedValue({
      ArtifactFileDownloadUrl: 'https://cdn.example.com/static-fallback',
    });
    const service = new ArtifactFileService();
    expect(await service.GetDownloadUrl('v-static')).toBe('https://cdn.example.com/static-fallback');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('decodes both base64 and URL-encoded non-base64 data URIs cleanly', () => {
    const service = new ArtifactFileService();
    const b64Buf = service.DataUrlToArrayBuffer('data:text/plain;base64,SGVsbG8h');
    expect(new TextDecoder().decode(new Uint8Array(b64Buf))).toBe('Hello!');

    const urlEncodedBuf = service.DataUrlToArrayBuffer('data:text/plain;charset=utf-8,Hello%2C%20World%21');
    expect(new TextDecoder().decode(new Uint8Array(urlEncodedBuf))).toBe('Hello, World!');
  });
});
