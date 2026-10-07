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

/** Rate limiter with configurable attempt limits and lockout windows. */
export class DialInRateLimiter {
  private readonly attempts = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maxAttempts: number = 5,
    private readonly windowMs: number = 15 * 60 * 1000,
    private readonly lockoutMs: number = 15 * 60 * 1000,
  ) {}

  public CheckAllowed(key: string): { allowed: boolean; remainingMs?: number } {
    const entry = this.attempts.get(key);
    if (!entry) {
      return { allowed: true };
    }
    const now = Date.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return { allowed: false, remainingMs: entry.lockedUntil - now };
    }
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true };
    }
    if (entry.attempts >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
      return { allowed: false, remainingMs: this.lockoutMs };
    }
    return { allowed: true };
  }

  public RecordFailure(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { attempts: 1, firstAttemptAt: now });
    } else {
      entry.attempts++;
      if (entry.attempts >= this.maxAttempts) {
        entry.lockedUntil = now + this.lockoutMs;
      }
    }
  }

  public RecordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  public Clear(): void {
    this.attempts.clear();
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
