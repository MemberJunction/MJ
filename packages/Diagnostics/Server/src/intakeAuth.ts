import { LogError } from '@memberjunction/core';
import { SanitizeForLog, TrimTrailingSlashes } from '@memberjunction/global';
import {
  MJDIAG_MAX_CLOCK_SKEW_SECONDS,
  MJDiagSenderAssertion,
  ParseSenderAuthorizationHeader,
  VerifySenderAssertion
} from '@memberjunction/diagnostics';
import { GetDiagnosticsApiRoute } from './apiRoute.js';
import {
  CountReceivedBundlesLastDay,
  IntakeDataContext,
  ISenderRegistry,
  SenderRegistration
} from './senderRegistry.js';

/** Base subpath of the intake routes. The collector audience is its public URL. */
export const INTAKE_BASE_SUBPATH = '/diagnostics/intake/v1';

/** A sender whose request assertion verified. */
export interface SenderIdentity {
  Ok: true;
  InstallID: string;
  KeyID: string;
  Registration: SenderRegistration;
}

export type SenderAuthFailureReason =
  | 'missing'
  | 'malformed'
  | 'unknown-install'
  | 'not-active'
  | 'unknown-key'
  | 'skew'
  | 'audience'
  | 'signature'
  | 'replay';

export interface SenderAuthFailure {
  Ok: false;
  Reason: SenderAuthFailureReason;
}

/** The parts of an HTTP request the signature covers, once the body has been read. */
export interface SignedRequestParts {
  Method: string;
  /** Full request path (base path included) without the query string. */
  Path: string;
  /** Lower-case hex SHA-256 of the raw request body. */
  BodySha256Hex: string;
}

/** A signed request: the Authorization header plus the parts its signature covers. */
export interface SignedIntakeRequest extends SignedRequestParts {
  AuthorizationHeader: string | undefined;
}

/** A parsed assertion whose install has an Active registration with that key. Not yet verified. */
export interface ResolvedSender {
  Ok: true;
  Assertion: MJDiagSenderAssertion;
  Registration: SenderRegistration;
}

/**
 * Remembers `(installId, nonce)` pairs and refuses a repeat. Each entry lives 602 s by default:
 * the ±300 s clock-skew window plus 2 s, because the skew check compares whole seconds.
 * Expired entries are swept when the cache grows.
 * When full of live entries it refuses new nonces (fail closed).
 *
 * The cache is per process. A collector that runs more than one instance needs a shared store
 * (for example Redis `SET NX EX`) so a nonce seen by one instance is refused by the others.
 */
export class ReplayCache {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  public constructor(ttlSeconds = MJDIAG_MAX_CLOCK_SKEW_SECONDS * 2 + 2, maxEntries = 100_000) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxEntries = maxEntries;
  }

  /** Records the nonce and returns true, or returns false when it was already seen or the cache is full. */
  public CheckAndRemember(installId: string, nonce: string, nowMs = Date.now()): boolean {
    const key = `${installId.toLowerCase()}|${nonce.toLowerCase()}`;
    const expiresAt = this.entries.get(key);
    if (expiresAt !== undefined && expiresAt > nowMs) {
      return false;
    }
    if (this.entries.size >= this.maxEntries) {
      this.Sweep(nowMs);
      if (this.entries.size >= this.maxEntries) {
        return false;
      }
    }
    this.entries.set(key, nowMs + this.ttlMs);
    return true;
  }

  /** Removes expired entries. */
  public Sweep(nowMs = Date.now()): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= nowMs) {
        this.entries.delete(key);
      }
    }
  }

  public Clear(): void {
    this.entries.clear();
  }

  public get Size(): number {
    return this.entries.size;
  }
}

/** This collector's audience: the public URL of the intake base path, without a trailing slash. */
export function IntakeAudience(): string {
  return TrimTrailingSlashes(GetDiagnosticsApiRoute()(INTAKE_BASE_SUBPATH, { absolute: true }));
}

function fail(reason: SenderAuthFailureReason, installId?: string): SenderAuthFailure {
  const who = installId ? ` (install '${SanitizeForLog(installId, 200)}')` : '';
  LogError(`Diagnostics intake: sender authentication failed${who}: ${reason}`);
  return { Ok: false, Reason: reason };
}

/** Checks the registration found for an assertion. Returns the failure reason, or null when usable. */
function registrationFailure(registration: SenderRegistration | null, keyId: string): SenderAuthFailureReason | null {
  if (!registration) return 'unknown-install';
  if (registration.Status !== 'Active') return 'not-active';
  if (!registration.KeyID || !registration.PublicKeyBase64 || registration.KeyID !== keyId) return 'unknown-key';
  return null;
}

/**
 * First step of authentication, done before the body is read: parses the `MJDiag-Ed25519` header,
 * finds the Active registration for the install and requires the header `keyId` to be the
 * registered key. Failures are logged with their reason.
 */
export async function ResolveSender(
  authorizationHeader: string | undefined,
  registry: ISenderRegistry,
  data: IntakeDataContext | null
): Promise<ResolvedSender | SenderAuthFailure> {
  if (!authorizationHeader) return fail('missing');
  const assertion = ParseSenderAuthorizationHeader(authorizationHeader);
  if (!assertion) return fail('malformed');
  const registration = await registry.Find(assertion.InstallID, data);
  const regFailure = registrationFailure(registration, assertion.KeyID);
  if (regFailure || !registration) return fail(regFailure ?? 'unknown-install', assertion.InstallID);
  return { Ok: true, Assertion: assertion, Registration: registration };
}

/**
 * Second step, after the body is read: verifies skew, audience and the signature over method,
 * path and body hash, then refuses a replayed nonce. Failures are logged with their reason.
 */
export async function VerifyResolvedSender(
  resolved: ResolvedSender,
  req: SignedRequestParts,
  replay: ReplayCache,
  now = new Date()
): Promise<SenderIdentity | SenderAuthFailure> {
  const { Assertion: assertion, Registration: registration } = resolved;
  const verified = await VerifySenderAssertion({
    Assertion: assertion,
    Method: req.Method,
    Path: req.Path,
    ExpectedAudience: IntakeAudience(),
    BodySha256Hex: req.BodySha256Hex,
    PublicKeyBase64: registration.PublicKeyBase64,
    Now: now
  });
  if (verified.Ok === false) return fail(verified.Reason, assertion.InstallID);
  if (!replay.CheckAndRemember(assertion.InstallID, assertion.Nonce, now.getTime())) {
    return fail('replay', assertion.InstallID);
  }
  return { Ok: true, InstallID: registration.InstallID, KeyID: registration.KeyID, Registration: registration };
}

/** Both steps for a request whose body is already read. Callers answer any failure with a generic 401. */
export async function AuthenticateSender(
  req: SignedIntakeRequest,
  registry: ISenderRegistry,
  replay: ReplayCache,
  data: IntakeDataContext | null,
  now = new Date()
): Promise<SenderIdentity | SenderAuthFailure> {
  const resolved = await ResolveSender(req.AuthorizationHeader, registry, data);
  if (resolved.Ok === false) return resolved;
  return VerifyResolvedSender(resolved, req, replay, now);
}

/**
 * Returns true when the sender may start another bundle: `MaxBundlesPerDay` is 0 (no limit), or
 * fewer `Received` bundle rows than that exist for the sender in the last 24 hours. A sender with
 * a limit and no data context, or a failed count, is refused (fail closed).
 */
export async function SenderWithinDailyQuota(identity: SenderIdentity, data: IntakeDataContext | null): Promise<boolean> {
  const limit = identity.Registration.MaxBundlesPerDay;
  if (!limit || limit <= 0) {
    return true;
  }
  if (!data) {
    return false;
  }
  const count = await CountReceivedBundlesLastDay(identity.InstallID, data);
  return count !== null && count < limit;
}

/** Fixed-window counter per key. It holds at most `maxKeys` keys and drops the oldest when full. */
export class RateCounter {
  private readonly _windows = new Map<string, { Count: number; WindowStartMs: number }>();
  private _lastSweepMs = 0;

  public constructor(
    private readonly _windowMs: number,
    public Max: number,
    private readonly _maxKeys = 10_000,
  ) {}

  /** Number of keys tracked now. */
  public get Size(): number {
    return this._windows.size;
  }

  /** True when `key` has used its budget in the current window. */
  public IsOver(key: string, now = Date.now()): boolean {
    const entry = this._windows.get(key);
    return entry !== undefined && now - entry.WindowStartMs < this._windowMs && entry.Count >= this.Max;
  }

  /** Counts one hit for `key`. Returns false when the key was already over its budget. */
  public Hit(key: string, now = Date.now()): boolean {
    this.sweepIfDue(now);
    const entry = this._windows.get(key);
    if (entry && now - entry.WindowStartMs < this._windowMs) {
      if (entry.Count >= this.Max) return false;
      entry.Count += 1;
      return true;
    }
    this.startWindow(key, now);
    return true;
  }

  /** Removes keys whose window has ended. */
  public Sweep(now = Date.now()): void {
    this._lastSweepMs = now;
    for (const [key, entry] of this._windows) {
      if (now - entry.WindowStartMs >= this._windowMs) this._windows.delete(key);
    }
  }

  public Clear(): void {
    this._windows.clear();
  }

  private sweepIfDue(now: number): void {
    if (now - this._lastSweepMs >= this._windowMs) this.Sweep(now);
  }

  private startWindow(key: string, now: number): void {
    this._windows.delete(key);
    if (this._windows.size >= this._maxKeys) this.Sweep(now);
    while (this._windows.size >= this._maxKeys) {
      const oldest = this._windows.keys().next().value;
      if (oldest === undefined) break;
      this._windows.delete(oldest);
    }
    this._windows.set(key, { Count: 1, WindowStartMs: now });
  }
}
