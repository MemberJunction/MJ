import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { IMetadataProvider } from '@memberjunction/core';
import { MJStorageMediaPlayerComponent } from './storage-media-player.component';

/**
 * Builds a stub provider whose `ExecuteGQL` returns a scripted `CreateMediaAccessToken`
 * payload keyed by fileId, so the wrapper resolves streaming URLs without any network.
 */
function stubProvider(
  byFileId: Record<string, { Success: boolean; Url?: string; MimeType?: string; ErrorMessage?: string }>,
): IMetadataProvider {
  const ExecuteGQL = vi.fn(async (_query: string, vars: { fileId: string }) => ({
    CreateMediaAccessToken: byFileId[vars.fileId] ?? { Success: false, ErrorMessage: 'unknown' },
  }));
  // Only ExecuteGQL is exercised by the wrapper; cast through unknown for the stub.
  return { ExecuteGQL } as unknown as IMetadataProvider;
}

/** Waits for the component's async ngOnInit/resolveTracks chain to settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MJStorageMediaPlayerComponent — streaming-URL resolution', () => {
  it('sets the MediaTrack Url to the authenticated streaming URL and derives audio Kind', async () => {
    const provider = stubProvider({
      'FILE-A': { Success: true, Url: 'http://localhost:4000/media/FILE-A?token=abc', MimeType: 'audio/webm' },
    });
    const fixture = renderComponentFixture(MJStorageMediaPlayerComponent, {
      inputs: { Provider: provider, FileID: 'FILE-A' },
    });
    await flush();

    const tracks = fixture.componentInstance.ResolvedTracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].Url).toBe('http://localhost:4000/media/FILE-A?token=abc');
    expect(tracks[0].Kind).toBe('audio');
    expect(tracks[0].MimeType).toBe('audio/webm');
    expect(fixture.componentInstance.AccessError).toBeNull();
  });

  it('derives video Kind from a video MIME type', async () => {
    const provider = stubProvider({
      'FILE-V': { Success: true, Url: 'http://localhost:4000/media/FILE-V?token=xyz', MimeType: 'video/mp4' },
    });
    const fixture = renderComponentFixture(MJStorageMediaPlayerComponent, {
      inputs: { Provider: provider, FileID: 'FILE-V' },
    });
    await flush();

    const tracks = fixture.componentInstance.ResolvedTracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].Kind).toBe('video');
  });

  it('surfaces the no-access state when the mint mutation fails for every file', async () => {
    const provider = stubProvider({
      'FILE-X': { Success: false, ErrorMessage: 'You do not have access to this file or it does not exist.' },
    });
    const fixture = renderComponentFixture(MJStorageMediaPlayerComponent, {
      inputs: { Provider: provider, FileID: 'FILE-X' },
    });
    await flush();

    expect(fixture.componentInstance.ResolvedTracks).toHaveLength(0);
    expect(fixture.componentInstance.AccessError).toContain('do not have access');
  });

  it('defaults Kind to audio when MimeType is absent', async () => {
    const provider = stubProvider({
      'FILE-N': { Success: true, Url: 'http://localhost:4000/media/FILE-N?token=t' },
    });
    const fixture = renderComponentFixture(MJStorageMediaPlayerComponent, {
      inputs: { Provider: provider, FileID: 'FILE-N' },
    });
    await flush();

    const tracks = fixture.componentInstance.ResolvedTracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].Kind).toBe('audio');
  });
});
