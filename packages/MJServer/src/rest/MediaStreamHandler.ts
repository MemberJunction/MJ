/**
 * @fileoverview Authenticated HTTP-Range media streaming route (`GET /media/:fileId`).
 *
 * Streams an `MJ: Files` object's bytes (optionally a byte range) to the browser so
 * `<audio>`/`<video>` elements get native progressive playback + seek-before-download
 * for large media — instead of the whole file being base64'd over GraphQL.
 *
 * Auth model: the request carries a short-lived signed token (`?token=`) minted by
 * `CreateMediaAccessToken` AFTER a per-user permission check. The token IS the
 * capability: this route re-verifies its signature/expiry/`typ` and that it matches
 * the `:fileId`, then loads the file under a SYSTEM context (it only needs
 * `ProviderKey`/`ProviderID` to locate the bytes — no row-level re-check, since
 * access was already authorized at mint).
 *
 * Mount unauthenticated, BEFORE the unified auth middleware:
 *   `app.use('/media', cors<cors.CorsRequest>(), createMediaStreamRouter())`
 *
 * @module @memberjunction/server/rest/MediaStreamHandler
 */

import express, { type Router, type Request, type Response } from 'express';
import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import type { FileStorageBase, ByteRange } from '@memberjunction/storage';
import { getSystemUser } from '../auth/index.js';
import { MediaAccessKeyManager } from './MediaAccessKeys.js';

/** A located bytes source for a file: the driver + the provider key to read. */
interface FileBytesSource {
  driver: FileStorageBase;
  providerKey: string;
  contentType: string;
}

/** A parsed, validated `Range` request against a known total size. */
interface ParsedRange {
  start: number;
  end: number;
}

/**
 * A parsed `Range` request WITHOUT a known total (streaming path). `end` is undefined
 * for an open-ended `bytes=start-` request, matching {@link ByteRange}'s "omit End = EOF".
 */
interface ParsedOpenRange {
  start: number;
  end?: number;
}

/**
 * Builds the Express router exposing `GET /media/:fileId`. Stateless — verification
 * and byte-source resolution happen per request.
 */
export function createMediaStreamRouter(): Router {
  const router = express.Router();
  router.get('/:fileId', async (req: Request, res: Response) => {
    await handleMediaRequest(req, res);
  });
  return router;
}

/** Top-level request handler: verify token → resolve bytes → stream/buffer with Range support. */
async function handleMediaRequest(req: Request, res: Response): Promise<void> {
  const fileId = req.params.fileId;
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  const claims = verifyMediaToken(token, fileId);
  if (!claims) {
    // No body leak — a bad/expired/mismatched token is indistinguishable from "forbidden".
    res.status(403).end();
    return;
  }

  // Never let CDNs or shared caches retain authorized media bytes.
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const source = await resolveFileBytesSource(fileId);
    if (!source) {
      res.status(404).end();
      return;
    }
    await streamOrBuffer(req, res, source);
  } catch (error) {
    LogError(`[MediaStream] Failed to serve file ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy();
    }
  }
}

/**
 * Verifies the token and that it grants access to THIS file. Returns null on any failure
 * (signature, expiry, `typ`, or fileId mismatch) so the caller can 403 uniformly.
 */
function verifyMediaToken(token: string, fileId: string): { fileId: string; userId: string } | null {
  if (!token) {
    return null;
  }
  const result = MediaAccessKeyManager.Instance.Verify(token);
  if (!result.Valid) {
    return null;
  }
  // The token's fileId must match the path — a token minted for file A cannot stream file B.
  if (result.Claims.fileId !== fileId) {
    return null;
  }
  return { fileId: result.Claims.fileId, userId: result.Claims.userId };
}

/**
 * Loads the file under a SYSTEM context and resolves its storage driver + provider key.
 * Returns null when the file row, its account, or its provider key can't be resolved
 * (→ 404). Mirrors `readRealtimeRecordingFile`'s account-resolution (engine config with
 * force-refresh fallback for newly-provisioned accounts).
 */
async function resolveFileBytesSource(fileId: string): Promise<FileBytesSource | null> {
  const systemUser: UserInfo = await getSystemUser();

  // global-provider-ok: the /media route runs pre-auth on the server's own provider; access
  // was already authorized at token-mint time, so this load only locates the bytes.
  const md = new Metadata();
  const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', systemUser);
  if (!await file.Load(fileId) || !file.ProviderKey) {
    return null;
  }

  // Resolve the storage account for the file's provider; force-refresh once if a
  // newly-provisioned account isn't in the cache yet.
  await FileStorageEngine.Instance.Config(false, systemUser);
  let accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
  if (accounts.length === 0) {
    await FileStorageEngine.Instance.Config(true, systemUser);
    accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
  }
  const account = accounts[0];
  if (!account) {
    return null;
  }

  const driver = await FileStorageEngine.Instance.GetDriver(account.ID, systemUser);
  return {
    driver,
    providerKey: file.ProviderKey,
    contentType: file.ContentType ?? 'application/octet-stream',
  };
}

/**
 * Streams the object honoring an HTTP `Range` request. Prefers true streaming
 * (`GetObjectStream`) for streaming-capable drivers; gracefully falls back to a
 * full buffered `GetObject` (slicing for Range) for drivers that don't.
 */
async function streamOrBuffer(req: Request, res: Response, source: FileBytesSource): Promise<void> {
  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

  if (source.driver.SupportsStreaming) {
    await serveViaStream(res, source, rangeHeader);
  } else {
    await serveViaBuffer(res, source, rangeHeader);
  }
}

/** True-streaming path: `GetObjectStream` + pipe, with 206 when a Range was honored. */
async function serveViaStream(res: Response, source: FileBytesSource, rangeHeader: string | undefined): Promise<void> {
  const range = rangeHeader ? parseRangeHeaderLoose(rangeHeader) : undefined;
  // Omit End for an open-ended range so the driver streams to EOF (per ByteRange semantics).
  const streamRange: ByteRange | undefined = range
    ? (range.end == null ? { Start: range.start } : { Start: range.start, End: range.end })
    : undefined;

  const result = await source.driver.GetObjectStream({ fullPath: source.providerKey, Range: streamRange });

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', result.ContentType ?? source.contentType);
  if (result.ContentLength != null) {
    res.setHeader('Content-Length', String(result.ContentLength));
  }
  if (result.ContentRange) {
    const { Start, End, Total } = result.ContentRange;
    res.setHeader('Content-Range', `bytes ${Start}-${End}/${Total}`);
    res.status(206);
  } else {
    res.status(200);
  }

  // Tear down the source stream if the client aborts (closed tab, seek, etc.).
  res.on('close', () => result.Stream.destroy());
  result.Stream.on('error', (err) => {
    LogError(`[MediaStream] Source stream error: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy();
    }
  });

  result.Stream.pipe(res);
}

/** Fallback path: full buffered `GetObject`, slicing the buffer for Range (206) or sending whole (200). */
async function serveViaBuffer(res: Response, source: FileBytesSource, rangeHeader: string | undefined): Promise<void> {
  const buffer = await source.driver.GetObject({ fullPath: source.providerKey });
  const total = buffer.length;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', source.contentType);

  if (!rangeHeader) {
    res.status(200);
    res.setHeader('Content-Length', String(total));
    res.end(buffer);
    return;
  }

  const range = parseRange(rangeHeader, total);
  if (!range) {
    // Unsatisfiable range — per RFC 7233, 416 + Content-Range with the total size.
    res.setHeader('Content-Range', `bytes */${total}`);
    res.status(416).end();
    return;
  }

  const slice = buffer.subarray(range.start, range.end + 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
  res.setHeader('Content-Length', String(slice.length));
  res.end(slice);
}

/**
 * Parses a single-range `bytes=start-end` header WITHOUT a known total (streaming path).
 * Returns the inclusive offsets, or undefined when the header is malformed/multi-range/
 * suffix-only (those we leave to the driver as a full read). `end` is left undefined when
 * open-ended (`bytes=start-`) so the driver streams to EOF.
 */
function parseRangeHeaderLoose(rangeHeader: string): ParsedOpenRange | undefined {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  if (!Number.isFinite(start)) {
    return undefined;
  }
  if (match[2] === '') {
    return { start };
  }
  const end = Number(match[2]);
  if (!Number.isFinite(end) || end < start) {
    return undefined;
  }
  return { start, end };
}

/**
 * Parses a single-range `bytes=start-end` header against a known total (buffer path),
 * clamping `end` to the last byte. Returns undefined when unsatisfiable (→ 416) or
 * malformed/multi-range.
 */
function parseRange(rangeHeader: string, total: number): ParsedRange | undefined {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  if (!Number.isFinite(start) || start >= total) {
    return undefined; // start past EOF → unsatisfiable
  }
  const requestedEnd = match[2] === '' ? total - 1 : Number(match[2]);
  const end = Math.min(requestedEnd, total - 1);
  if (end < start) {
    return undefined;
  }
  return { start, end };
}
