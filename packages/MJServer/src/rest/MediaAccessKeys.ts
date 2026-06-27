/**
 * @fileoverview Short-lived HS256 token manager for authenticated media streaming.
 *
 * Media-access tokens are minted by the `CreateMediaAccessToken` GraphQL mutation
 * (after a per-user permission check on the `MJ: Files` row) and verified by the
 * `/media/:fileId` streaming route. The token IS the capability: access is checked
 * once at mint time, and the route trusts a valid, unexpired, file-matching token.
 *
 * This is intentionally a SEPARATE, self-contained mechanism from the magic-link
 * RS256 manager: media streaming must work on EVERY deployment, whereas the
 * magic-link keypair is only initialized when `magicLink.enabled` is configured.
 * We sign HS256 with the deployment's symmetric secret (`MJ_BASE_ENCRYPTION_KEY`),
 * falling back to an ephemeral per-process secret (with a warning) when unset —
 * the same degradation MagicLinkKeyManager uses for its ephemeral keypair.
 *
 * @module @memberjunction/server/rest/MediaAccessKeys
 */

import { BaseSingleton } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

/** The token's `typ` claim — the route rejects any token whose `typ` differs. */
export const MEDIA_ACCESS_TOKEN_TYPE = 'media-access';

/** Default media-access token lifetime (hours). Long enough to cover a full playback session. */
export const MEDIA_ACCESS_DEFAULT_TTL_HOURS = 4;

/** The claims carried by a media-access token. */
export interface MediaAccessTokenClaims {
  /** The `MJ: Files` id this token grants streaming access to. */
  fileId: string;
  /** The id of the user the token was minted for (audit/forensics only — access was already checked). */
  userId: string;
  /** Discriminator — always {@link MEDIA_ACCESS_TOKEN_TYPE}. */
  typ: typeof MEDIA_ACCESS_TOKEN_TYPE;
}

/** Outcome of verifying a media-access token. */
export type MediaTokenVerifyResult =
  | { Valid: true; Claims: MediaAccessTokenClaims }
  | { Valid: false };

/**
 * Signs and verifies short-lived HS256 media-access tokens. Singleton so the
 * signing secret is stable for the process lifetime. The secret is resolved
 * lazily on first use from `MJ_BASE_ENCRYPTION_KEY`; if unset, an ephemeral
 * 32-byte secret is generated (outstanding tokens die on restart — acceptable
 * for a 4h-TTL streaming credential).
 */
export class MediaAccessKeyManager extends BaseSingleton<MediaAccessKeyManager> {
  private secret = '';
  private _initialized = false;

  // Public to satisfy BaseSingleton.getInstance's `this: new () => T` constraint.
  public constructor() {
    super();
  }

  public static get Instance(): MediaAccessKeyManager {
    return MediaAccessKeyManager.getInstance<MediaAccessKeyManager>();
  }

  /** Resolves the signing secret once, preferring the deployment's symmetric key. */
  private ensureSecret(): void {
    if (this._initialized) {
      return;
    }
    const configured = process.env.MJ_BASE_ENCRYPTION_KEY?.trim();
    if (configured) {
      this.secret = configured;
    } else {
      this.secret = randomBytes(32).toString('base64');
      LogStatus(
        '[MediaAccess] No MJ_BASE_ENCRYPTION_KEY configured — generated an EPHEMERAL HS256 secret for ' +
        'media-access tokens. Outstanding media URLs will be invalidated on restart. Set ' +
        'MJ_BASE_ENCRYPTION_KEY for stable signing.',
      );
    }
    this._initialized = true;
  }

  /**
   * Mints a signed media-access token for a file + user, expiring after `ttlHours`.
   *
   * @returns `{ Token, ExpiresAt }` — the compact JWT and its absolute expiry.
   */
  public Sign(fileId: string, userId: string, ttlHours: number = MEDIA_ACCESS_DEFAULT_TTL_HOURS): { Token: string; ExpiresAt: Date } {
    this.ensureSecret();
    const claims: MediaAccessTokenClaims = { fileId, userId, typ: MEDIA_ACCESS_TOKEN_TYPE };
    const expiresInSeconds = Math.floor(ttlHours * 3600);
    const token = jwt.sign(claims, this.secret, { algorithm: 'HS256', expiresIn: expiresInSeconds });
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return { Token: token, ExpiresAt: expiresAt };
  }

  /**
   * Verifies a token's signature, expiry, and `typ`. Returns the typed claims on
   * success. Never throws — an invalid/expired/malformed token returns `{ Valid: false }`.
   */
  public Verify(token: string): MediaTokenVerifyResult {
    this.ensureSecret();
    try {
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      if (
        typeof decoded === 'object' && decoded !== null &&
        (decoded as { typ?: unknown }).typ === MEDIA_ACCESS_TOKEN_TYPE &&
        typeof (decoded as { fileId?: unknown }).fileId === 'string' &&
        typeof (decoded as { userId?: unknown }).userId === 'string'
      ) {
        const d = decoded as { fileId: string; userId: string };
        return { Valid: true, Claims: { fileId: d.fileId, userId: d.userId, typ: MEDIA_ACCESS_TOKEN_TYPE } };
      }
      return { Valid: false };
    } catch {
      // Signature mismatch, expiry, or malformed token — all map to "not valid".
      return { Valid: false };
    }
  }
}
