import * as crypto from 'node:crypto';
import { LogWarning } from '@memberjunction/core';
import { TrimTrailingSlashes } from '@memberjunction/global';
import { EncryptDiagnosticBundle, SignSenderRequest } from '@memberjunction/diagnostics';
import { MJ_VERSION } from './version.js';

/** Path of the intake API under a collector's public URL. */
export const COLLECTOR_INTAKE_SUBPATH = '/diagnostics/intake/v1';

/** Hosts that may use plain `http:` (local development only). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The enrolled identity this installation signs collector requests with. */
export interface CollectorSender {
  InstallID: string;
  KeyID: string;
  /** Ed25519 private key, PKCS#8 base64. */
  PrivateKeyBase64: string;
}

export interface SendBundleToCollectorParams {
  ArchiveBytes: Uint8Array;
  BundleID: string;
  ScrubLiterals: boolean;
  /** `Diagnostics.External.CollectorUrl`: the collector's public API URL. */
  CollectorUrl: string;
  Sender: CollectorSender;
  /** Collector Ed25519 signing key (SPKI base64) pinned at enrolment. */
  PinnedSigningPublicKeyBase64: string;
  /** Collector X25519 key (SPKI base64) recorded at enrolment; a different signed key is logged as a rotation. */
  EnrolledRecipientPublicKeyBase64?: string;
  ContactInfo?: string;
  Summary?: string;
}

export interface CollectorSendResult {
  ReferenceID: string;
  Status: string;
}

/** Signing context shared by every request of one send. */
interface CollectorRequestContext {
  Audience: string;
  Sender: CollectorSender;
}

interface CollectorPublicKeyResponse {
  keyId: string;
  publicKey: string;
  signature?: string;
}

interface CollectorInitiateResponse {
  referenceId: string;
  uploadUrl?: string;
}

/**
 * Returns the collector intake URL that is also the signed `aud`: the collector URL with trailing
 * slashes removed, plus `/diagnostics/intake/v1` (not added twice when the URL already ends with it).
 * Throws unless the URL is `https:` (plain `http:` only for a loopback host).
 */
export function CollectorIntakeAudience(collectorUrl: string): string {
  const base = TrimTrailingSlashes(collectorUrl.trim());
  if (!base) {
    throw new Error('No collector URL is configured (Diagnostics.External.CollectorUrl).');
  }
  assertSecureCollectorUrl(base);
  return base.endsWith(COLLECTOR_INTAKE_SUBPATH) ? base : `${base}${COLLECTOR_INTAKE_SUBPATH}`;
}

function assertSecureCollectorUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Diagnostics.External.CollectorUrl is not a valid URL.');
  }
  const loopbackHttp = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopbackHttp) {
    throw new Error('Diagnostics.External.CollectorUrl must use https (plain http is allowed only for localhost).');
  }
}

/**
 * Calls `fetch` without following redirects. A 3xx answer or a network failure throws a message
 * that names the step.
 */
export async function FetchWithoutRedirect(url: string, init: RequestInit, step: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: 'error' });
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : err instanceof Error ? err.message : String(err);
    throw new Error(`Collector ${step} failed: ${cause}. Redirects from the collector are not followed.`);
  }
}

/**
 * Returns the URL for the payload upload. A relative `uploadUrl` resolves against the intake URL.
 * Throws when the result is not on the collector's origin.
 */
export function ResolveCollectorUploadUrl(audience: string, referenceId: string, uploadUrl?: string): string {
  const fallback = `${audience}/bundles/${encodeURIComponent(referenceId)}/payload`;
  const resolved = new URL(uploadUrl || fallback, `${audience}/`);
  const expectedOrigin = new URL(audience).origin;
  if (resolved.origin !== expectedOrigin) {
    throw new Error(`The collector returned an upload URL on another origin (${resolved.origin}); the bundle was not sent.`);
  }
  return resolved.toString();
}

/**
 * Sends an archive to an enrolled collector: fetches its X25519 key and checks it against the
 * pinned signing key, encrypts with the sender signature, then runs initiate, upload and complete.
 * Every request carries an `MJDiag-Ed25519` Authorization header.
 */
export async function SendBundleToCollector(params: SendBundleToCollectorParams): Promise<CollectorSendResult> {
  if (!params.PinnedSigningPublicKeyBase64) {
    throw new Error('No pinned collector signing key (Diagnostics.External.CollectorSigningPublicKeyBase64). Enrol this installation first.');
  }
  const ctx: CollectorRequestContext = { Audience: CollectorIntakeAudience(params.CollectorUrl), Sender: params.Sender };
  const recipient = await fetchRecipientKey(ctx);
  const plaintextSha256 = sha256Hex(params.ArchiveBytes);
  const encryptedBytes = await EncryptDiagnosticBundle(params.ArchiveBytes, {
    recipientKeyId: recipient.keyId,
    recipientPublicKeyBase64: recipient.publicKey,
    recipientKeySignatureBase64: recipient.signature,
    pinnedAuthorityPublicKeyBase64: params.PinnedSigningPublicKeyBase64,
    senderSigningPrivateKeyBase64: params.Sender.PrivateKeyBase64,
    senderKeyId: params.Sender.KeyID,
    senderEnvironmentId: params.Sender.InstallID,
    manifestSha256: plaintextSha256
  });
  warnOnRecipientKeyRotation(recipient, params.EnrolledRecipientPublicKeyBase64);
  const encryptedSha256 = sha256Hex(encryptedBytes);
  const initiated = await initiateIntake(ctx, params, recipient.keyId, encryptedBytes.byteLength, plaintextSha256, encryptedSha256);
  const uploadUrl = ResolveCollectorUploadUrl(ctx.Audience, initiated.referenceId, initiated.uploadUrl);
  await expectOk(await signedFetch(ctx, 'PUT', uploadUrl, encryptedBytes, 'application/octet-stream'), 'PUT payload');
  const completeUrl = `${ctx.Audience}/bundles/${encodeURIComponent(initiated.referenceId)}/complete`;
  const completeBody = JSON.stringify({ encryptedSha256, plaintextSha256 });
  const completed = await expectOk(await signedFetch(ctx, 'POST', completeUrl, completeBody, 'application/json'), 'POST /complete');
  const json = (await completed.json()) as { referenceId?: string; status: string };
  if (!json.referenceId) {
    throw new Error('The collector did not return a reference ID on complete.');
  }
  return { ReferenceID: json.referenceId, Status: json.status };
}

/** Logs one warning when the collector's signed X25519 key differs from the key recorded at enrolment. */
function warnOnRecipientKeyRotation(recipient: CollectorPublicKeyResponse, enrolledKeyBase64: string | undefined): void {
  if (enrolledKeyBase64 && recipient.publicKey !== enrolledKeyBase64) {
    LogWarning(
      `The collector X25519 key '${recipient.keyId}' differs from the key recorded at enrolment ` +
        '(Diagnostics.External.CollectorPublicKeyBase64); it is signed by the pinned key, so this is treated as a key rotation.',
      'Diagnostics'
    );
  }
}

async function fetchRecipientKey(ctx: CollectorRequestContext): Promise<CollectorPublicKeyResponse> {
  const resp = await expectOk(await signedFetch(ctx, 'GET', `${ctx.Audience}/public-key`, '', undefined), 'GET /public-key');
  const json = (await resp.json()) as CollectorPublicKeyResponse;
  if (!json.keyId || !json.publicKey) {
    throw new Error('The collector public key response has no keyId or publicKey.');
  }
  if (!json.signature) {
    throw new Error('The collector public key is not signed, so it cannot be checked against the pinned signing key.');
  }
  return json;
}

async function initiateIntake(
  ctx: CollectorRequestContext,
  params: SendBundleToCollectorParams,
  keyId: string,
  sizeBytes: number,
  plaintextSha256: string,
  encryptedSha256: string
): Promise<CollectorInitiateResponse> {
  const body = JSON.stringify({
    installId: ctx.Sender.InstallID,
    bundleId: params.BundleID,
    formatVersion: 1,
    mjVersion: MJ_VERSION,
    scrubLiterals: params.ScrubLiterals,
    sizeBytes,
    plaintextSha256,
    encryptedSha256,
    keyId,
    summary: params.Summary,
    contact: params.ContactInfo
  });
  const resp = await expectOk(await signedFetch(ctx, 'POST', `${ctx.Audience}/bundles`, body, 'application/json'), 'POST /bundles');
  const json = (await resp.json()) as CollectorInitiateResponse;
  if (!json.referenceId) {
    throw new Error('The collector did not return a reference ID.');
  }
  return json;
}

/** Sends one request with an `MJDiag-Ed25519` header signed over the method, URL path and exact body bytes. */
async function signedFetch(
  ctx: CollectorRequestContext,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  body: Uint8Array | string,
  contentType: string | undefined
): Promise<Response> {
  const signed = await SignSenderRequest({
    Method: method,
    Path: new URL(url).pathname,
    Audience: ctx.Audience,
    InstallID: ctx.Sender.InstallID,
    KeyID: ctx.Sender.KeyID,
    PrivateKeyBase64: ctx.Sender.PrivateKeyBase64,
    Body: body
  });
  const headers: Record<string, string> = { Authorization: signed.AuthorizationHeader };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  const requestBody = method === 'GET' ? undefined : typeof body === 'string' ? body : Buffer.from(body);
  return FetchWithoutRedirect(url, { method, headers, body: requestBody }, `${method} ${new URL(url).pathname}`);
}

async function expectOk(resp: Response, step: string): Promise<Response> {
  if (!resp.ok) {
    throw new Error(`Collector ${step} failed: HTTP ${resp.status}`);
  }
  return resp;
}

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
