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
  inviteId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** The Application this entry grants access to. */
  appId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** The role name this entry carries (email/app-session links). */
  role?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  /** For resource-share/embed links: the shared resource's type + id. */
  resourceType?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  resourceId?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * Claims carried by a MJ-issued magic-link session JWT.
 * Identity claims (email/given_name/family_name) follow standard OIDC so the
 * existing provider extraction works; the `mj_*` claims describe the scope.
 */
export interface MagicLinkJWTClaims {
  /** Issuer — MJ's public URL; resolves to the registered `magic-link` auth provider. */
  iss: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** Audience — the configured magic-link audience (default `mj-magic-link`). */
  aud: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** Subject — `magic-link|<inviteId>`. */
  sub: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** Issued-at (epoch seconds). */
  iat: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** Expiry (epoch seconds). */
  exp: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  email: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  given_name?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  family_name?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  name?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** The single Application this session is scoped to. */
  mj_app_id: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** The restricted role name assigned to this user (informational; enforcement is server-side via the role's entity permissions). */
  mj_role: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** UserID of the internal user who issued the invite (attribution/audit). Absent on links whose inviter could not be resolved. */
  mj_invited_by?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /**
   * Per-session scope UNION (Phase 4+). Each entry is one redeemed link's grant.
   * The server enforces anonymous sessions against THIS set (not the user's role
   * set), which is why two anon visitors sharing the Anonymous principal can hold
   * different scopes without accretion. For email sessions the singular mj_app_id/
   * mj_role remain authoritative; this carries the union when links are stacked.
   */
  mj_scopes?: MagicLinkScopeEntry[];  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** True when this session resolves to the shared Anonymous principal (claims-based enforcement). */
  mj_anon?: boolean;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** Opaque per-session id — correlates one anonymous session's activity across audit rows without a real user. */
  mj_sid?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /**
   * Public web widget instance id (additive — set only for widget guest sessions
   * minted by WidgetSessionService). Binds the synthesized guest principal to one
   * widget instance so its pinned agent / guest role can be locked down. Absent on
   * ordinary magic-link sessions.
   */
  mj_widget_id?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /**
   * Host-asserted visitor email for a widget `host-identity` session (additive). The
   * authoritative `email`/`sub` still resolve the constrained shared Anonymous principal;
   * this carries WHO the host says the visitor is, for the agent to look up their account —
   * without granting that account's permissions. Absent on anonymous/ordinary sessions.
   */
  mj_host_email?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /**
   * Returning-visitor anchor for a widget guest session (additive, RV1). Carried so the VOICE path —
   * whose conversation is created server-side — can stamp the same Conversation.VisitorKey the text
   * path stamps client-side. Present only when the widget remembers returning visitors.
   */
  mj_visitor_key?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** The prior conversation this visit chains from (RV2), for the voice path to stamp Conversation.LastConversationID. */
  mj_last_conversation_id?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** Resolved polymorphic identity entity id (RV4), for the voice path to stamp the existing Conversation.LinkedEntityID / AIAgentSession.LinkedEntityID. */
  mj_linked_entity_id?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** Resolved polymorphic identity record id (RV4), for the voice path to stamp the existing Conversation.LinkedRecordID / AIAgentSession.LinkedRecordID. */
  mj_linked_record_id?: string;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
  /** Marks the session as magic-link so the Explorer can confine the UI. */
  mj_magic_link: true;  // case-violation-ok-legacy-back-compat: snake_case mirrors an external payload — the remote spelling is the contract, not MJ convention
}

/** Parameters for creating a magic-link invite (POST /magic-link/create). */
export interface CreateMagicLinkInviteParams {
  /** Recipient email — becomes the provisioned user's email. */
  email: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** The Application the invite grants access to. */
  ApplicationId: string;
  /** Restricted role to assign. Defaults to the configured `restrictedRoleName`. */
  RoleId?: string;
  /** Hours until the link expires. Defaults to config `defaultExpiresInHours`. */
  ExpiresInHours?: number;
  /** Maximum redemptions. Defaults to 1 (single-use). */
  MaxUses?: number;
  /** Optional given/family name to seed the provisioned user. */
  firstName?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  lastName?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/** Result of creating an invite. */
export interface CreateMagicLinkInviteResult {
  success: boolean;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  inviteId?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** Full redemption URL to share. */
  redemptionUrl?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /**
   * The raw token, returned ONLY when no email provider is configured (so the
   * caller can deliver the link out of band). Never returned once email send
   * succeeds, and never persisted.
   */
  rawToken?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** Whether the invite email was dispatched. */
  emailSent?: boolean;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** ISO expiry timestamp. */
  expiresAt?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  error?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /**
   * Set when the request was rejected for authorization reasons:
   * `forbidden` — caller may not issue invites; `invalid_role` — the requested
   * role is not grantable via magic-link. Drives the HTTP status in the router.
   */
  errorCode?: 'forbidden' | 'invalid_role';  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
}

/** Why a redemption failed. */
export type RedeemErrorCode = 'not_found' | 'expired' | 'consumed' | 'revoked' | 'invalid' | 'provisioning_failed' | 'server_error';

/**
 * Per-request forensic context captured for the redemption audit trail
 * (`MJ: Magic Link Redemptions`). Sourced from the HTTP request at the router;
 * all fields optional because the API/JSON flow may omit them.
 */
export interface RedeemAuditContext {
  ipAddress?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  userAgent?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  origin?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/** Result of redeeming an invite. */
export interface RedeemMagicLinkResult {
  success: boolean;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** The minted session JWT (RS256). */
  token?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** ISO expiry of the session token. */
  expiresAt?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** The Application the session is scoped to. */
  applicationId?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** The Application's display name (used to deep-link the browser into that app). */
  applicationName?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  /** The Application's URL path slug (preferred for deep-linking; falls back to name). */
  applicationPath?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  email?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  error?: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  errorCode?: RedeemErrorCode;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
}
