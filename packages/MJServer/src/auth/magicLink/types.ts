/**
 * @fileoverview Types for the MemberJunction magic-link feature.
 * @module @memberjunction/server/auth/magicLink
 */

/**
 * One unit of scope a magic-link session holds. The union of these across all links
 * a session has redeemed is the anonymous-session authorization boundary (enforced
 * server-side against the claims, never via roles on the shared Anonymous principal).
 */
export interface MagicLinkScopeEntry {
  /** The invite that granted this scope entry. */
  inviteId: string;
  /** The Application this entry grants access to. */
  appId: string;
  /** The role name this entry carries (email/app-session links). */
  role?: string;
  /** For resource-share/embed links: the shared resource's type + id. */
  resourceType?: string;
  resourceId?: string;
}

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
  /** UserID of the internal user who issued the invite (attribution/audit). Absent on links whose inviter could not be resolved. */
  mj_invited_by?: string;
  /**
   * Per-session scope UNION (Phase 4+). Each entry is one redeemed link's grant.
   * The server enforces anonymous sessions against THIS set (not the user's role
   * set), which is why two anon visitors sharing the Anonymous principal can hold
   * different scopes without accretion. For email sessions the singular mj_app_id/
   * mj_role remain authoritative; this carries the union when links are stacked.
   */
  mj_scopes?: MagicLinkScopeEntry[];
  /** True when this session resolves to the shared Anonymous principal (claims-based enforcement). */
  mj_anon?: boolean;
  /** Opaque per-session id — correlates one anonymous session's activity across audit rows without a real user. */
  mj_sid?: string;
  /**
   * Public web widget instance id (additive — set only for widget guest sessions
   * minted by WidgetSessionService). Binds the synthesized guest principal to one
   * widget instance so its pinned agent / guest role can be locked down. Absent on
   * ordinary magic-link sessions.
   */
  mj_widget_id?: string;
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
  /**
   * Set when the request was rejected for authorization reasons:
   * `forbidden` — caller may not issue invites; `invalid_role` — the requested
   * role is not grantable via magic-link. Drives the HTTP status in the router.
   */
  errorCode?: 'forbidden' | 'invalid_role';
}

/** Why a redemption failed. */
export type RedeemErrorCode = 'not_found' | 'expired' | 'consumed' | 'revoked' | 'invalid' | 'provisioning_failed' | 'server_error';

/**
 * Per-request forensic context captured for the redemption audit trail
 * (`MJ: Magic Link Redemptions`). Sourced from the HTTP request at the router;
 * all fields optional because the API/JSON flow may omit them.
 */
export interface RedeemAuditContext {
  ipAddress?: string;
  userAgent?: string;
  origin?: string;
}

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
