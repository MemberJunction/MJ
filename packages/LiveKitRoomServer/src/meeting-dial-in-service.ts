/**
 * @fileoverview Server-side service for verifying and generating phone dial-in codes for meetings.
 *
 * Security architecture:
 * - Dial-in codes are NOT verified through a public GraphQL mutation.
 * - Verification is performed server-side by the LiveKit SIP inbound path upon receiving verified webhooks.
 * - Dual rate-limiting:
 *   1. Keyed on the caller's verified phone number (`CallerNumber`).
 *   2. Keyed on the dialed trunk number (`DialedNumber`) to prevent distributed brute-forcing against a single line.
 * - Code generation uses `crypto.randomInt` (cryptographically secure pseudo-random number generator), never `Math.random`.
 *
 * @module @memberjunction/livekit-room-server
 */

import { randomInt } from 'node:crypto';
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMeetingEntity } from '@memberjunction/core-entities';

/** Rate limiter entry tracking attempts and lockouts. */
interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

/**
 * Rate limiter with configurable attempt limits and lockout windows.
 *
 * Keys are caller-supplied (caller and dialed numbers), so the number of tracked keys is capped.
 * Two things keep that cap from becoming a weakness under a flood of distinct keys:
 * - **Constant cost per call.** Expired entries are swept at most once every
 *   {@link sweepThreshold} inserts, not on every failure, and enforcing the cap drops one entry.
 *   Before, each failure past 1,000 keys walked the whole map, so a flood cost O(n) per attempt.
 * - **Lockouts are evicted last.** Locked-out keys live in their own map, and the cap drops the
 *   oldest key that is still only counting attempts. A locked-out caller can no longer flood
 *   distinct numbers to push their own lockout out of the map; a lockout is dropped only when
 *   every tracked key is locked out.
 */
export class DialInRateLimiter {
  /** Keys still counting attempts, oldest first (Map keeps insertion order). */
  private readonly attempts = new Map<string, RateLimitEntry>();
  /** Keys locked out (or whose lockout ended inside their window), oldest lockout first. */
  private readonly lockouts = new Map<string, RateLimitEntry>();
  /** New keys inserted since the last sweep of expired entries. */
  private insertsSinceSweep = 0;

  constructor(
    private readonly maxAttempts: number = 5,
    private readonly windowMs: number = 15 * 60 * 1000,
    private readonly lockoutMs: number = 15 * 60 * 1000,
  ) {}

  public CheckAllowed(key: string): { allowed: boolean; remainingMs?: number } {
    const entry = this.entryFor(key);
    if (!entry) {
      return { allowed: true };
    }
    const now = Date.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return { allowed: false, remainingMs: entry.lockedUntil - now };
    }
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.remove(key);
      return { allowed: true };
    }
    if (entry.attempts >= this.maxAttempts) {
      this.lock(key, entry, now);
      return { allowed: false, remainingMs: this.lockoutMs };
    }
    return { allowed: true };
  }

  /** Above this many tracked keys, expired entries are swept, at most once per this many new keys. */
  private static readonly sweepThreshold = 1000;
  /** Hard ceiling on tracked keys; when a new key would pass it, one entry is dropped (see the class doc). */
  private static readonly maxEntries = 10000;

  /** Number of tracked keys (diagnostics/tests). */
  public get Size(): number {
    return this.attempts.size + this.lockouts.size;
  }

  public RecordFailure(key: string): void {
    const now = Date.now();
    const entry = this.entryFor(key);
    if (entry?.lockedUntil && entry.lockedUntil > now) {
      return; // already locked out: a further failure neither extends nor resets the lockout
    }
    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.remove(key);
      this.makeRoomForNewKey(now);
      this.attempts.set(key, { attempts: 1, firstAttemptAt: now });
      return;
    }
    entry.attempts++;
    if (entry.attempts >= this.maxAttempts) {
      this.lock(key, entry, now);
    }
  }

  public RecordSuccess(key: string): void {
    this.remove(key);
  }

  public Clear(): void {
    this.attempts.clear();
    this.lockouts.clear();
    this.insertsSinceSweep = 0;
  }

  private entryFor(key: string): RateLimitEntry | undefined {
    return this.attempts.get(key) ?? this.lockouts.get(key);
  }

  private remove(key: string): void {
    this.attempts.delete(key);
    this.lockouts.delete(key);
  }

  /** Locks the key out from `now`, moving it to the lockout map as its newest entry. */
  private lock(key: string, entry: RateLimitEntry, now: number): void {
    entry.lockedUntil = now + this.lockoutMs;
    this.attempts.delete(key);
    this.lockouts.delete(key);
    this.lockouts.set(key, entry);
  }

  /** Called before a new key is inserted: sweeps on the amortized schedule, then enforces the cap. */
  private makeRoomForNewKey(now: number): void {
    this.insertsSinceSweep++;
    if (this.Size >= DialInRateLimiter.sweepThreshold && this.insertsSinceSweep >= DialInRateLimiter.sweepThreshold) {
      this.sweepExpired(now);
      this.insertsSinceSweep = 0;
    }
    while (this.Size >= DialInRateLimiter.maxEntries) {
      const victims = this.attempts.size > 0 ? this.attempts : this.lockouts;
      const oldest = victims.keys().next();
      if (oldest.done) {
        break;
      }
      victims.delete(oldest.value);
    }
  }

  /** Removes entries whose window and lockout have both elapsed. */
  private sweepExpired(now: number): void {
    for (const map of [this.attempts, this.lockouts]) {
      for (const [key, entry] of map) {
        const lockExpired = !entry.lockedUntil || entry.lockedUntil <= now;
        if (lockExpired && now - entry.firstAttemptAt > this.windowMs) {
          map.delete(key);
        }
      }
    }
  }
}

/** Input parameters for verifying a dial-in code. */
export interface VerifyDialInCodeParams {
  /** The verified caller number from the SIP carrier webhook. */
  CallerNumber: string;
  /** The dialed phone number or Phone Numbers row ID. */
  DialedNumber: string;
  /** The DTMF dial-in code entered by the caller. */
  DialInCode: string;
  /** Optional authenticated context user. */
  ContextUser?: UserInfo;
  /** Optional metadata provider. */
  Provider?: IMetadataProvider;
}

/** Result of dial-in code verification. */
export interface VerifyDialInCodeOutcome {
  Success: boolean;
  ErrorMessage?: string;
  RoomName?: string;
  MeetingID?: string;
}

/**
 * Server-side singleton service for meeting dial-in verification and code generation.
 */
export class MeetingDialInService extends BaseSingleton<MeetingDialInService> {
  // Caller-based limiter: 5 attempts per 15 minutes
  private readonly callerLimiter = new DialInRateLimiter(5, 15 * 60 * 1000, 15 * 60 * 1000);
  // Dialed-number limiter: 20 failed attempts per 15 minutes across all callers
  private readonly dialedLimiter = new DialInRateLimiter(20, 15 * 60 * 1000, 15 * 60 * 1000);

  public constructor() {
    super();
  }

  public static get Instance(): MeetingDialInService {
    return MeetingDialInService.getInstance<MeetingDialInService>();
  }

  /**
   * Generates a cryptographically secure 6-digit numeric dial-in code.
   */
  public GenerateDialInCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Generates a unique 6-digit dial-in code for a given phone number among active/scheduled meetings.
   */
  public async GenerateUniqueDialInCode(
    phoneNumberID: string,
    user: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<string | undefined> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escapedPhoneID = EscapeSQLString(phoneNumberID);

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = this.GenerateDialInCode();
      const res = await rv.RunView<MJMeetingEntity>(
        {
          EntityName: 'MJ: Meetings',
          ExtraFilter: `DialInPhoneNumberID = '${escapedPhoneID}' AND DialInCode = '${candidate}' AND Status IN ('Live', 'Scheduled')`,
          ResultType: 'entity_object',
        },
        user,
      );
      if (res.Success && (!res.Results || res.Results.length === 0)) {
        return candidate;
      }
    }
    return undefined;
  }

  /**
   * Verifies a DTMF dial-in code against active/scheduled meetings on the dialed line.
   * Rate limits on both the verified caller number and the dialed number.
   */
  public async VerifyDialInCode(params: VerifyDialInCodeParams): Promise<VerifyDialInCodeOutcome> {
    try {
      const callerNumber = (params.CallerNumber ?? '').trim().toLowerCase();
      const dialedNumber = (params.DialedNumber ?? '').trim();
      const dialInCode = (params.DialInCode ?? '').trim();

      if (!callerNumber) {
        return { Success: false, ErrorMessage: 'Caller number is required.' };
      }
      if (!dialedNumber) {
        return { Success: false, ErrorMessage: 'Dialed number is required.' };
      }
      if (!dialInCode) {
        return { Success: false, ErrorMessage: 'Dial-in code is required.' };
      }

      // Check caller-based rate limit
      const callerLimit = this.callerLimiter.CheckAllowed(callerNumber);
      if (!callerLimit.allowed) {
        const remainingSeconds = Math.ceil((callerLimit.remainingMs ?? 0) / 1000);
        return {
          Success: false,
          ErrorMessage: `Too many invalid attempts from this caller. Please try again in ${remainingSeconds} seconds.`,
        };
      }

      // Check dialed-number-based rate limit
      const dialedKey = dialedNumber.toLowerCase();
      const dialedLimit = this.dialedLimiter.CheckAllowed(dialedKey);
      if (!dialedLimit.allowed) {
        const remainingSeconds = Math.ceil((dialedLimit.remainingMs ?? 0) / 1000);
        return {
          Success: false,
          ErrorMessage: `Too many invalid attempts on this line. Please try again in ${remainingSeconds} seconds.`,
        };
      }

      const escapedDialed = EscapeSQLString(dialedNumber);
      const escapedCode = EscapeSQLString(dialInCode);

      const rv = params.Provider ? RunView.FromMetadataProvider(params.Provider) : new RunView();
      const filter = `(DialInPhoneNumberID = '${escapedDialed}' OR DialInPhoneNumber = '${escapedDialed}') AND DialInCode = '${escapedCode}' AND Status IN ('Live', 'Scheduled')`;

      const result = await rv.RunView<MJMeetingEntity>(
        {
          EntityName: 'MJ: Meetings',
          ExtraFilter: filter,
          ResultType: 'entity_object',
        },
        params.ContextUser,
      );

      if (!result.Success || !result.Results || result.Results.length === 0) {
        this.callerLimiter.RecordFailure(callerNumber);
        this.dialedLimiter.RecordFailure(dialedKey);
        return { Success: false, ErrorMessage: 'Invalid dial-in code.' };
      }

      this.callerLimiter.RecordSuccess(callerNumber);
      this.dialedLimiter.RecordSuccess(dialedKey);

      const meeting = result.Results[0];
      return {
        Success: true,
        RoomName: meeting.RoomName,
        MeetingID: meeting.ID,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      LogError(`[MeetingDialInService] VerifyDialInCode exception: ${msg}`);
      return { Success: false, ErrorMessage: msg };
    }
  }

  /** Clears rate limiter entries (test harness). */
  public ClearRateLimitsForTesting(): void {
    this.callerLimiter.Clear();
    this.dialedLimiter.Clear();
  }
}
