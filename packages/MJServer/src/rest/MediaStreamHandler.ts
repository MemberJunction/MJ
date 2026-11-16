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
import { GetSystemUser } from '../auth/index.js';
import { MediaAccessKeyManager } from './MediaAccessKeys.js';
import { UploadTokenManager } from './UploadTokenManager.js';
import { ParseRange, ParseRangeHeaderLoose } from './mediaRange.js';
import { CreateRouteRateLimiter } from './routeRateLimit.js';
import type { RouteRateLimitSettings } from '../routeRateLimitConfigUnits.js';

/** A located bytes source for a file: the driver + the provider key to read. */
interface FileBytesSource {
  driver: FileStorageBase;
  providerKey: string;
  contentType: string;
  fileName: string;
}

/** Options for {@link CreateMediaStreamRouter}. */
export interface MediaStreamRouterOptions {
  /**
   * Per-route limiter settings (normally `configInfo.rateLimiting.routes`). Omitted groups use the
   * defaults in `routeRateLimitConfigUnits.ts`, which are on.
   */
  RateLimits?: {
    Upload?: Partial<RouteRateLimitSettings>;
    Read?: Partial<RouteRateLimitSettings>;
  };
}

/**
 * Builds the Express router exposing:
 * - `GET /media/:fileId` and `GET /media/:fileId/:filename` (Range streaming)
 * - `POST /media/upload-stage` (Raw binary upload staging)
 */
export function CreateMediaStreamRouter(options?: MediaStreamRouterOptions): Router {
  const router = express.Router();
  // Per-IP limiters (on by default; see routeRateLimit.ts). The upload route takes 100 MB bodies,
  // so it has its own tighter budget, applied before the body is read.
  const uploadLimiter = CreateRouteRateLimiter('mediaUpload', options?.RateLimits?.Upload);
  const readLimiter = CreateRouteRateLimiter('mediaRead', options?.RateLimits?.Read);

  router.post(
    '/upload-stage',
    ...uploadLimiter,
    express.raw({ type: () => true, limit: '100mb' }),
    async (req: Request, res: Response) => {
      await handleUploadStageRequest(req, res);
    }
  );

  router.get('/:fileId', ...readLimiter, async (req: Request, res: Response) => {
    await handleMediaRequest(req, res);
  });
  router.get('/:fileId/:filename', ...readLimiter, async (req: Request, res: Response) => {
    await handleMediaRequest(req, res);
  });
  return router;
}

/** @deprecated Use {@link CreateMediaStreamRouter}. */
export function createMediaStreamRouter(): Router {
  return CreateMediaStreamRouter();
}

/**
 * Authenticated raw binary upload staging handler (`POST /media/upload-stage`).
 *
 * Accepts raw file binary bytes directly in request body, stages in UploadTokenManager
 * memory cache, and returns an ephemeral single-use upload token for the GraphQL mutation.
 *
 * Security: Requires a cryptographically signed media-upload token minted by `CreateUploadStageToken`
 * (verified via `MediaAccessKeyManager.Instance.VerifyUpload`).
 */
async function handleUploadStageRequest(req: Request, res: Response): Promise<void> {
  // Never let CDNs or shared caches retain upload endpoints
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 1. Resolve signed upload token strictly from Authorization header (avoids bearer token in URL logs)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();

  if (!token) {
    console.warn('[MediaStreamHandler] POST /media/upload-stage: Missing or empty Authorization header');
    res.status(401).json({ Success: false, ErrorMessage: 'Authorization header with Bearer token required.' });
    return;
  }

  // Cryptographically verify token signature, expiry, and 'media-upload' typ claim
  const uploadVerify = MediaAccessKeyManager.Instance.VerifyUpload(token);
  if (!uploadVerify.Valid || !uploadVerify.UserId) {
    console.warn(`[MediaStreamHandler] POST /media/upload-stage: Token verification failed: ${uploadVerify.Error || 'invalid or expired'}`);
    res.status(401).json({ Success: false, ErrorMessage: `Invalid or expired upload token: ${uploadVerify.Error || 'unauthorized'}` });
    return;
  }

  const userId = uploadVerify.UserId;

  // 2. Validate binary body
  const buffer = req.body as Buffer;
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    res.status(400).json({ Success: false, ErrorMessage: 'Empty or invalid file payload.' });
    return;
  }

  // 3. Extract and sanitize metadata
  const rawFileName = (req.headers['x-file-name'] as string) || (req.query.fileName as string) || 'upload.bin';
  let fileName = 'upload.bin';
  try {
    fileName = decodeURIComponent(rawFileName);
  } catch {
    fileName = rawFileName;
  }
  // Sanitize filename: remove directory traversal, leading slashes, control chars
  fileName = fileName.replace(/[/\\]+/g, '_').replace(/^\.+/, '').replace(/[\x00-\x1f\x7f]/g, '').trim() || 'upload.bin';

  const mimeType = (req.headers['content-type'] as string) || (req.query.mimeType as string) || 'application/octet-stream';

  try {
    const uploadToken = UploadTokenManager.Instance.Stage({
      buffer,
      fileName,
      mimeType,
      userId,
    });

    res.status(200).json({
      Success: true,
      UploadToken: uploadToken,
      FileName: fileName,
      MimeType: mimeType,
      ContentLength: buffer.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LogError(`[MediaStream] Upload staging failed for '${fileName}': ${message}`);
    res.status(400).json({ Success: false, ErrorMessage: message });
  }
}

/** Top-level request handler: verify token → resolve bytes → stream/buffer with Range support. */
async function handleMediaRequest(req: Request, res: Response): Promise<void> {
  // Express type defs allow req.params values to be string | string[]; normalize to string
  // so downstream consumers with moduleResolution:"node" type-check cleanly (see SignatureWebhookHandler).
  const rawFileId = req.params.fileId;
  const fileId: string = Array.isArray(rawFileId) ? rawFileId[0] : rawFileId;
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  const claims = verifyMediaToken(token, fileId);
  if (!claims) {
    // No body leak — a bad/expired/mismatched token is indistinguishable from "forbidden".
    res.status(403).end();
    return;
  }

  // Never let CDNs or shared caches retain authorized media bytes, and never leak the
  // token-bearing URL through the Referer header of subresources the media might trigger.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

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
 *
 * Each `null` return is LOGGED with which of those three distinct causes it was. The response
 * stays a bare 404 (no body — the route must not describe server config to an unauthenticated
 * caller), so the log is the only diagnostic there is; an unlogged 404 made a misconfigured
 * provider indistinguishable from a deleted file.
 */
async function resolveFileBytesSource(fileId: string): Promise<FileBytesSource | null> {
  const systemUser: UserInfo = await GetSystemUser();

  // The /media route runs pre-auth on the server's own provider; access was already authorized
  // at token-mint time, so this load only locates the bytes.
  const md = new Metadata(); // global-provider-ok: pre-auth system-context route, no per-request provider
  const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', systemUser);
  if (!await file.Load(fileId)) {
    LogError(`[MediaStream] File ${fileId} could not be loaded (no such 'MJ: Files' row?) — responding 404.`);
    return null;
  }
  if (!file.ProviderKey) {
    LogError(`[MediaStream] File ${fileId} ('${file.Name}') has no ProviderKey, so its bytes cannot be located — responding 404.`);
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
    LogError(
      `[MediaStream] File ${fileId} points at storage provider ${file.ProviderID}, which has no ` +
        `'MJ: File Storage Accounts' row — nothing can read its bytes. Responding 404.`,
    );
    return null;
  }

  const driver = await FileStorageEngine.Instance.GetDriver(account.ID, systemUser);
  return {
    driver,
    providerKey: file.ProviderKey,
    contentType: file.ContentType ?? 'application/octet-stream',
    fileName: file.Name || 'file',
  };
}

/**
 * SECURITY: whether a content type is safe to render inline on the API origin. `Files.ContentType`
 * is caller-controlled at upload time, so serving e.g. `text/html` or `image/svg+xml` with
 * `Content-Disposition: inline` lets an uploaded file run script on the API origin when its
 * tokenized /media URL is opened in a browser (stored XSS). Only passive media types render
 * inline; everything else — SVG included, because it can carry script — downloads as an attachment.
 */
function isInlineSafeContentType(contentType: string): boolean {
  const normalized = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  if (normalized === 'image/svg+xml') {
    return false;
  }
  if (normalized.startsWith('image/') || normalized.startsWith('video/') || normalized.startsWith('audio/')) {
    return true;
  }
  return normalized === 'application/pdf' || normalized === 'text/plain';
}

/** Builds the Content-Disposition header: inline only for inline-safe types, else attachment. */
function buildContentDisposition(contentType: string, fileName: string): string {
  const disposition = isInlineSafeContentType(contentType) ? 'inline' : 'attachment';
  return `${disposition}; filename="${encodeURIComponent(fileName)}"`;
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
  const range = rangeHeader ? ParseRangeHeaderLoose(rangeHeader) : undefined;
  // Omit End for an open-ended range so the driver streams to EOF (per ByteRange semantics).
  const streamRange: ByteRange | undefined = range
    ? (range.end == null ? { Start: range.start } : { Start: range.start, End: range.end })
    : undefined;

  const result = await source.driver.GetObjectStream({ fullPath: source.providerKey, Range: streamRange });

  const effectiveContentType = result.ContentType ?? source.contentType;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', effectiveContentType);
  res.setHeader('Content-Disposition', buildContentDisposition(effectiveContentType, source.fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
  res.setHeader('Content-Disposition', buildContentDisposition(source.contentType, source.fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!rangeHeader) {
    res.status(200);
    res.setHeader('Content-Length', String(total));
    res.end(buffer);
    return;
  }

  const range = ParseRange(rangeHeader, total);
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

