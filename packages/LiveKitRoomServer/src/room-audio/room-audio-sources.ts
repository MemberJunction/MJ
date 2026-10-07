/**
 * @fileoverview Where the room audio player gets an audio file's bytes: an `MJ: Files` row (read from its storage
 * provider through `@memberjunction/storage`), or an https URL (fetched through the SSRF-safe `SafeFetch`, with a
 * timeout and a byte cap). Both return {@link RoomAudioFileContent}, which `DecodeAudio` turns into PCM.
 *
 * @module @memberjunction/livekit-room-server
 */

import { LogError, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { SafeFetch } from '@memberjunction/network-utils';

/** An audio file's bytes plus what is known about its format. */
export interface RoomAudioFileContent {
  /** The file's bytes. */
  Bytes: Uint8Array;
  /** The MIME type, when known. */
  MimeType?: string;
  /** The file name, when known. */
  FileName?: string;
}

/** Reads an `MJ: Files` row's bytes. The default is {@link ReadMJFileAudio}; tests inject a fake. */
export type RoomAudioFileReader = (fileID: string, contextUser: UserInfo, provider?: IMetadataProvider) => Promise<RoomAudioFileContent>;

/** Fetches an https URL's bytes. The default is {@link FetchRoomAudioUrl}; tests inject a fake. */
export type RoomAudioUrlFetcher = (url: string) => Promise<RoomAudioFileContent>;

/** The largest file the player will download from a URL, in bytes (25 MB). */
export const MAX_ROOM_AUDIO_URL_BYTES = 25 * 1024 * 1024;

/** How long a URL download may take before it is abandoned, in ms. */
export const ROOM_AUDIO_URL_TIMEOUT_MS = 20_000;

/**
 * Reads an `MJ: Files` row's bytes from its storage provider, as the given user (so the user's read permission on
 * the file applies).
 *
 * @throws {Error} when the row cannot be loaded, no storage account serves its provider, or the download fails.
 */
export async function ReadMJFileAudio(fileID: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RoomAudioFileContent> {
  const md = provider ?? Metadata.Provider;
  const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
  const loaded = await file.Load(fileID);
  if (!loaded) {
    const detail = file.LatestResult?.CompleteMessage || 'not found, or not readable by this user';
    throw new Error(`Hold audio file ${fileID} could not be loaded from MJ: Files: ${detail}.`);
  }
  await FileStorageEngine.Instance.Config(false, contextUser, provider);
  const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
  if (accounts.length === 0) {
    throw new Error(`Hold audio file ${fileID} ('${file.Name}') is on storage provider ${file.Provider}, which has no configured storage account.`);
  }
  const driver = await FileStorageEngine.Instance.GetDriver(accounts[0].ID, contextUser);
  const buffer = await driver.GetObject({ fullPath: file.ProviderKey ?? file.Name });
  return {
    Bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    MimeType: file.ContentType ?? undefined,
    FileName: file.Name,
  };
}

/**
 * Checks that `url` is an absolute https URL. The player refuses plain http: hold audio is fetched by the server, and
 * a cleartext fetch would let anyone on the path substitute what callers hear.
 *
 * @throws {Error} when the URL is malformed or not https.
 */
export function AssertHttpsAudioUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Hold audio URL is not a valid URL: '${url}'.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Hold audio URL must use https; got '${parsed.protocol}' in '${url}'.`);
  }
  return parsed;
}

/**
 * Downloads an https audio URL through `SafeFetch` (every redirect hop re-checked against private/reserved
 * addresses), abandoning it after {@link ROOM_AUDIO_URL_TIMEOUT_MS} or once it passes {@link MAX_ROOM_AUDIO_URL_BYTES}.
 *
 * @throws {Error} on a non-https URL, an HTTP error status, a timeout, or a body over the byte cap.
 */
export async function FetchRoomAudioUrl(url: string): Promise<RoomAudioFileContent> {
  const parsed = AssertHttpsAudioUrl(url);
  const response = await SafeFetch(parsed.href, { signal: AbortSignal.timeout(ROOM_AUDIO_URL_TIMEOUT_MS) });
  if (!response.ok) {
    void response.body?.cancel();
    throw new Error(`Hold audio URL returned HTTP ${response.status}: '${url}'.`);
  }
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_ROOM_AUDIO_URL_BYTES) {
    void response.body?.cancel();
    throw new Error(`Hold audio URL is ${declared} bytes; the limit is ${MAX_ROOM_AUDIO_URL_BYTES} bytes: '${url}'.`);
  }
  const bytes = await readBodyWithCap(response, url);
  return { Bytes: bytes, MimeType: response.headers.get('content-type') ?? undefined, FileName: parsed.pathname.split('/').pop() };
}

/** Reads a response body, stopping (and cancelling the stream) the moment it passes the byte cap. */
async function readBodyWithCap(response: Response, url: string): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      total += chunk.value.byteLength;
      if (total > MAX_ROOM_AUDIO_URL_BYTES) {
        throw new Error(`Hold audio URL exceeded the ${MAX_ROOM_AUDIO_URL_BYTES}-byte limit: '${url}'.`);
      }
      chunks.push(chunk.value);
    }
  } finally {
    if (total > MAX_ROOM_AUDIO_URL_BYTES) {
      await reader.cancel().catch((err: Error) => LogError(`[RoomAudioPlayer] cancelling the oversize download of '${url}' failed: ${err.message}`));
    }
    reader.releaseLock();
  }
  return concatChunks(chunks, total);
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
