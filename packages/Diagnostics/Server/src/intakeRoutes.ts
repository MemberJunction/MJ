import * as crypto from 'node:crypto';
import { LogError } from '@memberjunction/core';
import { SanitizeForLog } from '@memberjunction/global';
import type { BaseServerMiddleware } from '@memberjunction/server/middleware/BaseServerMiddleware';
import {
  COMPLETE_EXPIRED_REASON,
  DiagnosticIntakeService,
  IntakeCompleteRequest,
  IntakeCapacityError,
  IntakeCreateBundleRequest,
  MAX_INTAKE_BUNDLE_BYTES,
  SENDER_MISMATCH_REASON
} from './intakeService.js';
import { INTAKE_BASE_SUBPATH, IntakeAudience, ResolvedSender, SenderIdentity } from './intakeAuth.js';
import { ParseEnrolRequestBody } from './intakeEnrolment.js';

type MiddlewareList = ReturnType<NonNullable<BaseServerMiddleware['GetPreAuthMiddleware']>>;
type MiddlewareHandler = MiddlewareList[number];
type ExpressApp = Parameters<NonNullable<BaseServerMiddleware['ConfigureExpressApp']>>[0];
type ExpressReq = Parameters<MiddlewareHandler>[0];
type ExpressRes = Parameters<MiddlewareHandler>[1];

const MAX_JSON_BODY_BYTES = 64 * 1024;
const UNAUTHORIZED = { error: 'Unauthorized' };

/** A request body read in full, with its SHA-256 computed while streaming. */
interface RawBody {
  Bytes: Uint8Array;
  Sha256Hex: string;
}

/**
 * Reads the raw request body and hashes it as it streams. Resolves `null` as soon as it is larger
 * than `maxBytes`; nothing more is buffered after that.
 */
function readRawBody(req: ExpressReq, maxBytes: number): Promise<RawBody | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const hash = crypto.createHash('sha256');
    let total = 0;
    let settled = false;
    const settle = (value: RawBody | null): void => {
      settled = true;
      resolve(value);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.byteLength;
      if (total > maxBytes) return settle(null);
      hash.update(chunk);
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) settle({ Bytes: new Uint8Array(Buffer.concat(chunks)), Sha256Hex: hash.digest('hex') });
    });
    req.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function parseJson(raw: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch {
    return undefined;
  }
}

function routeParam(req: ExpressReq, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

let loggedBadPublicUrl = false;

/** The path of the collector's public URL, or null (logged once) when that URL cannot be parsed. */
function publicBasePath(): string | null {
  try {
    return new URL(IntakeAudience()).pathname.replace(/\/+$/, '');
  } catch (err) {
    if (!loggedBadPublicUrl) {
      loggedBadPublicUrl = true;
      LogError(`Diagnostics intake: the public URL is not an absolute URL, so no signature can be verified: ${SanitizeForLog(err instanceof Error ? err.message : String(err), 500)}`);
    }
    return null;
  }
}

/**
 * The path the sender signed: the path of the collector's public URL (`IntakeAudience()`) followed
 * by the route subpath after the intake base, without the query string. A proxy that strips a path
 * prefix therefore does not change the verified path. Null when the public URL cannot be parsed.
 */
function signedPath(req: ExpressReq): string | null {
  const seen = (req.originalUrl || req.url || '').split('?')[0];
  const baseAt = seen.indexOf(INTAKE_BASE_SUBPATH);
  if (baseAt < 0) return seen;
  const publicBase = publicBasePath();
  return publicBase === null ? null : publicBase + seen.slice(baseAt + INTAKE_BASE_SUBPATH.length);
}

function authorizationHeader(req: ExpressReq): string | undefined {
  const value = req.headers['authorization'];
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(req: ExpressReq): string {
  return `ip:${req.ip ?? 'unknown'}`;
}

const RATE_LIMITED = { error: 'Diagnostic intake rate limit exceeded.' };
const UNAVAILABLE = { error: 'Diagnostic intake is temporarily unavailable.' };

/**
 * Sends 429 when the IP is over its failure budget, otherwise counts the failure and sends `status`.
 * Used for every failed authentication or enrolment attempt, including a failed signature check.
 */
function rejectAuthFailure(req: ExpressReq, res: ExpressRes, status: number, body: object): void {
  const intake = DiagnosticIntakeService.Instance;
  const ip = clientIp(req);
  if (intake.IpFailureLimitReached(ip)) {
    res.status(429).json(RATE_LIMITED);
    return;
  }
  intake.RecordIpFailure(ip);
  res.status(status).json(body);
}

/**
 * Authenticates a signed bundle request. The header and registration are checked before any body
 * is read (generic 401; generic 503, not counted against the IP, when the registration lookup
 * fails). Then the body is read up to `maxBytes(resolved)` (413 beyond that) and the signature over
 * the streamed body hash is verified (generic 401). Null when a response was sent.
 */
async function authenticate(
  req: ExpressReq,
  res: ExpressRes,
  maxBytes: (resolved: ResolvedSender) => number
): Promise<{ identity: SenderIdentity; raw: Uint8Array } | null> {
  const intake = DiagnosticIntakeService.Instance;
  const resolved = await intake.ResolveSender(authorizationHeader(req));
  if (resolved.Ok === false) {
    if (resolved.Reason === 'lookup-failed') {
      res.status(503).json(UNAVAILABLE);
    } else {
      rejectAuthFailure(req, res, 401, UNAUTHORIZED);
    }
    return null;
  }
  const body = await readRawBody(req, maxBytes(resolved));
  if (!body) {
    res.status(413).json({ error: 'Request body is too large.' });
    req.destroy();
    return null;
  }
  const path = signedPath(req);
  if (path === null) {
    res.status(401).json(UNAUTHORIZED);
    return null;
  }
  const verified = await intake.VerifySender(resolved, { Method: req.method, Path: path, BodySha256Hex: body.Sha256Hex });
  if (verified.Ok === false) {
    rejectAuthFailure(req, res, 401, UNAUTHORIZED);
    return null;
  }
  if (!intake.CheckRateLimit(`sender:${verified.InstallID.toLowerCase()}`)) {
    res.status(429).json(RATE_LIMITED);
    return null;
  }
  return { identity: verified, raw: body.Bytes };
}

const jsonBodyLimit = (): number => MAX_JSON_BODY_BYTES;

/**
 * Wraps a handler: 404 when intake is disabled; 429 before any work (no sender lookup, no
 * signature check) when the IP is over its failure budget, whatever the request carries;
 * generic 500 (logged) on an unexpected error.
 */
function intakeHandler(name: string, handler: (req: ExpressReq, res: ExpressRes) => Promise<void>): MiddlewareHandler {
  return (req: ExpressReq, res: ExpressRes) => {
    const intake = DiagnosticIntakeService.Instance;
    if (!intake.Enabled) {
      res.status(404).json({ error: 'Diagnostic intake is disabled on this instance.' });
      return;
    }
    if (intake.IpFailureLimitReached(clientIp(req))) {
      res.status(429).json(RATE_LIMITED);
      return;
    }
    void handler(req, res).catch((err: unknown) => {
      LogError(`Diagnostics intake ${name} failed: ${SanitizeForLog(err instanceof Error ? err.message : String(err), 1000)}`);
      if (!res.headersSent) res.status(500).json({ error: 'Diagnostic intake failed.' });
    });
  };
}

async function handlePublicKey(_req: ExpressReq, res: ExpressRes): Promise<void> {
  const intake = DiagnosticIntakeService.Instance;
  if (!intake.HasSigningKey) {
    LogError('Diagnostics intake: GET /public-key refused because no collector signing key is configured.');
    res.status(503).json({ error: 'Diagnostic intake is not available.' });
    return;
  }
  res.status(200).json(await intake.GetPublicKeyDescriptor());
}

async function handleEnrol(req: ExpressReq, res: ExpressRes): Promise<void> {
  const intake = DiagnosticIntakeService.Instance;
  const raw = await readRawBody(req, MAX_JSON_BODY_BYTES);
  const body = raw ? ParseEnrolRequestBody(parseJson(raw.Bytes)) : null;
  if (!body) {
    rejectAuthFailure(req, res, 400, { error: 'Invalid enrolment request.' });
    return;
  }
  const outcome = await intake.EnrolSender(body);
  if (outcome.Ok === false) {
    rejectAuthFailure(req, res, outcome.Status, { error: 'Enrolment refused.' });
  } else {
    res.status(200).json({ ...outcome.Body });
  }
}

async function handleCreate(req: ExpressReq, res: ExpressRes): Promise<void> {
  const auth = await authenticate(req, res, jsonBodyLimit);
  if (!auth) return;
  const intake = DiagnosticIntakeService.Instance;
  const reservation = await intake.ReserveDailyQuota(auth.identity);
  if (!reservation) {
    res.status(429).json({ error: 'Daily diagnostic bundle quota exceeded.' });
    return;
  }
  const body = parseJson(auth.raw) as IntakeCreateBundleRequest | undefined;
  try {
    res.status(201).json({ ...intake.InitiateBundleIntake(body as IntakeCreateBundleRequest, auth.identity) });
  } catch (err) {
    res.status(err instanceof IntakeCapacityError ? 429 : 400).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    reservation.Release();
  }
}

async function handlePayload(req: ExpressReq, res: ExpressRes): Promise<void> {
  const intake = DiagnosticIntakeService.Instance;
  const referenceId = routeParam(req, 'referenceId');
  const declared = intake.DeclaredPayloadSize(referenceId);
  const auth = await authenticate(req, res, () => Math.min(declared ?? MAX_JSON_BODY_BYTES, MAX_INTAKE_BUNDLE_BYTES));
  if (!auth) return;
  if (!(await intake.SenderWithinDailyQuota(auth.identity, referenceId))) {
    res.status(429).json({ error: 'Daily diagnostic bundle quota exceeded.' });
    return;
  }
  const result = await intake.UploadEncryptedPayload(referenceId, auth.raw, auth.identity);
  if (result.reasonCode === SENDER_MISMATCH_REASON) {
    res.status(403).json({ error: 'Forbidden' });
  } else if (!result.accepted) {
    res.status(400).json({ ...result });
  } else {
    res.status(200).json({ accepted: true, referenceId });
  }
}

async function handleComplete(req: ExpressReq, res: ExpressRes): Promise<void> {
  const auth = await authenticate(req, res, jsonBodyLimit);
  if (!auth) return;
  const referenceId = routeParam(req, 'referenceId');
  const body = (parseJson(auth.raw) ?? {}) as IntakeCompleteRequest;
  const result = await DiagnosticIntakeService.Instance.CompleteBundleIntake(referenceId, body, auth.identity);
  if (result.reasonCode === SENDER_MISMATCH_REASON) {
    res.status(403).json({ error: 'Forbidden' });
  } else if (result.reasonCode === COMPLETE_EXPIRED_REASON) {
    res.status(410).json({ ...result });
  } else {
    res.status(result.status === 'rejected' ? 422 : 200).json({ ...result });
  }
}

/**
 * Registers the intake routes under `/diagnostics/intake/v1`. `public-key` is public, `enroll`
 * is unauthenticated but rate-limited by IP, and the bundle routes require an `MJDiag-Ed25519`
 * signed request from a registered sender. Bodies are read raw so the signed body hash can be checked.
 */
export function RegisterIntakeRoutes(app: ExpressApp, route: (subpath: string) => string): void {
  const base = INTAKE_BASE_SUBPATH;
  app.get(route(`${base}/public-key`), intakeHandler('public-key', handlePublicKey));
  app.post(route(`${base}/enroll`), intakeHandler('enroll', handleEnrol));
  app.post(route(`${base}/bundles`), intakeHandler('create', handleCreate));
  app.put(route(`${base}/bundles/:referenceId/payload`), intakeHandler('payload', handlePayload));
  app.post(route(`${base}/bundles/:referenceId/complete`), intakeHandler('complete', handleComplete));
}
