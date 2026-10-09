import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const { safeFetch, storage } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  storage: {
    Config: vi.fn(async () => undefined),
    GetAccountsByProviderID: vi.fn((): { ID: string }[] => [{ ID: 'account-1' }]),
    GetDriver: vi.fn(async () => ({ GetObject: vi.fn(async () => Buffer.from([1, 2, 3])) })),
  },
}));

vi.mock('@memberjunction/network-utils', () => ({ SafeFetch: (...args: Parameters<typeof fetch>) => safeFetch(...args) }));
vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: { Instance: storage } }));

import { FetchRoomAudioUrl, MAX_ROOM_AUDIO_URL_BYTES, ReadMJFileAudio } from '../room-audio/room-audio-sources';

const user = { ID: 'user-1', Name: 'Alice', Email: 'alice@example.com' } as unknown as UserInfo;

/** A provider whose `MJ: Files` row loads (or not) as told. */
function fakeProvider(loads: boolean) {
  const file = {
    Load: vi.fn(async () => loads),
    LatestResult: loads ? undefined : { CompleteMessage: 'Record not found' },
    ProviderID: 'provider-1',
    Provider: 'Azure',
    ProviderKey: 'hold/queue.wav',
    Name: 'queue.wav',
    ContentType: 'audio/wav',
  };
  const provider = { GetEntityObject: vi.fn(async () => file) } as unknown as IMetadataProvider;
  return { provider, file };
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
}

describe('ReadMJFileAudio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the File row as the user and downloads it from its storage provider', async () => {
    const { provider, file } = fakeProvider(true);
    const content = await ReadMJFileAudio('FILE-1', user, provider);
    expect(provider.GetEntityObject).toHaveBeenCalledWith('MJ: Files', user);
    expect(file.Load).toHaveBeenCalledWith('FILE-1');
    expect(storage.GetAccountsByProviderID).toHaveBeenCalledWith('provider-1');
    expect(storage.GetDriver).toHaveBeenCalledWith('account-1', user);
    expect([...content.Bytes]).toEqual([1, 2, 3]);
    expect(content).toMatchObject({ MimeType: 'audio/wav', FileName: 'queue.wav' });
  });

  it('fails clearly when the row cannot be loaded', async () => {
    await expect(ReadMJFileAudio('FILE-1', user, fakeProvider(false).provider)).rejects.toThrow(/could not be loaded.*Record not found/);
  });

  it('fails clearly when no storage account serves the provider', async () => {
    storage.GetAccountsByProviderID.mockReturnValueOnce([]);
    await expect(ReadMJFileAudio('FILE-1', user, fakeProvider(true).provider)).rejects.toThrow(/no configured storage account/);
  });
});

describe('FetchRoomAudioUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses plain http before fetching anything', async () => {
    await expect(FetchRoomAudioUrl('http://example.com/hold.mp3')).rejects.toThrow(/must use https/);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('downloads an https URL', async () => {
    safeFetch.mockResolvedValueOnce(new Response(streamOf([new Uint8Array([7, 8]), new Uint8Array([9])]), { headers: { 'content-type': 'audio/mpeg' } }));
    const content = await FetchRoomAudioUrl('https://cdn.example.com/music/hold.mp3');
    expect([...content.Bytes]).toEqual([7, 8, 9]);
    expect(content).toMatchObject({ MimeType: 'audio/mpeg', FileName: 'hold.mp3' });
  });

  it('refuses a body that declares itself over the limit', async () => {
    safeFetch.mockResolvedValueOnce(new Response(streamOf([]), { headers: { 'content-length': String(MAX_ROOM_AUDIO_URL_BYTES + 1) } }));
    await expect(FetchRoomAudioUrl('https://cdn.example.com/big.wav')).rejects.toThrow(/limit/);
  });

  it('stops reading a body that grows past the limit without declaring its size', async () => {
    const half = new Uint8Array(MAX_ROOM_AUDIO_URL_BYTES / 2 + 1);
    safeFetch.mockResolvedValueOnce(new Response(streamOf([half, half])));
    await expect(FetchRoomAudioUrl('https://cdn.example.com/big.wav')).rejects.toThrow(/exceeded the .*-byte limit/);
  });

  it('reports an HTTP error status', async () => {
    safeFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(FetchRoomAudioUrl('https://cdn.example.com/missing.mp3')).rejects.toThrow(/HTTP 404/);
  });
});
