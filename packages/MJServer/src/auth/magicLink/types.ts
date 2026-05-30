/**
 * @fileoverview Types for the MemberJunction magic-link feature.
 * @module @memberjunction/server/auth/magicLink
 */

/**
 * Claims carried by a MJ-issued magic-link session JWT.
 * Identity claims (email/given_name/family_name) follow standard OIDC so the
 * existing provider extraction works; the `mj_*` claims describe the scope.
 */
export interface MagicLinkJWTClaims {
  /** Issuer — MJ's public URL; resolves to the registered `magic-link` auth provider. */
  iss: string;
  /** Audience — the configured magic-link audience (default `mj-magic-link`). */
  aud: string;
  /** Subject — `magic-link|<inviteId>`. */
  sub: string;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
  email: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  /** The single Application this session is scoped to. */
  mj_app_id: string;
  /** The restricted role name assigned to this user (informational; enforcement is server-side via the role's entity permissions). */
  mj_role: string;
  /** Marks the session as magic-link so the Explorer can confine the UI. */
  mj_magic_link: true;
}

/** Parameters for creating a magic-link invite (POST /magic-link/create). */
export interface CreateMagicLinkInviteParams {
  /** Recipient email — becomes the provisioned user's email. */
  email: string;
  /** The Application the invite grants access to. */
  applicationId: string;
  /** Restricted role to assign. Defaults to the configured `restrictedRoleName`. */
  roleId?: string;
  /** Hours until the link expires. Defaults to config `defaultExpiresInHours`. */
  expiresInHours?: number;
  /** Maximum redemptions. Defaults to 1 (single-use). */
  maxUses?: number;
  /** Optional given/family name to seed the provisioned user. */
  firstName?: string;
  lastName?: string;
}

/** Result of creating an invite. */
export interface CreateMagicLinkInviteResult {
  success: boolean;
  inviteId?: string;
  /** Full redemption URL to share. */
  redemptionUrl?: string;
  /**
   * The raw token, returned ONLY when no email provider is configured (so the
   * caller can deliver the link out of band). Never returned once email send
   * succeeds, and never persisted.
   */
  rawToken?: string;
  /** Whether the invite email was dispatched. */
  emailSent?: boolean;
  /** ISO expiry timestamp. */
  expiresAt?: string;
  error?: string;
}

/** Why a redemption failed. */
export type RedeemErrorCode = 'not_found' | 'expired' | 'consumed' | 'revoked' | 'invalid' | 'provisioning_failed' | 'server_error';

/** Result of redeeming an invite. */
export interface RedeemMagicLinkResult {
  success: boolean;
  /** The minted session JWT (RS256). */
  token?: string;
  /** ISO expiry of the session token. */
  expiresAt?: string;
  /** The Application the session is scoped to. */
  applicationId?: string;
  /** The Application's display name (used to deep-link the browser into that app). */
  applicationName?: string;
  /** The Application's URL path slug (preferred for deep-linking; falls back to name). */
  applicationPath?: string;
  email?: string;
  error?: string;
  errorCode?: RedeemErrorCode;
}
