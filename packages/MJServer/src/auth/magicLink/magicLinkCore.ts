/**
 * @fileoverview Pure functional core for magic links — no DB, no email, no MJ
 * runtime imports. Everything here is deterministic given its inputs (modulo
 * crypto randomness) and unit-testable with plain assertions.
 *
 * @module @memberjunction/server/auth/magicLink
 */

import { randomBytes, createHash } from 'node:crypto';
import type { MagicLinkJWTClaims, MagicLinkScopeEntry, RedeemErrorCode } from './types.js';

/** Token prefix, mirroring the API-key convention (`mj_sk_`). */
export const MAGIC_LINK_TOKEN_PREFIX = 'mj_ml_';

/** Generates a cryptographically random raw magic-link token. */
export function generateRawToken(): string {
  return MAGIC_LINK_TOKEN_PREFIX + randomBytes(32).toString('hex');
}

/** Generates an opaque per-session id (anonymous-session forensics correlation). */
export function generateSessionId(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * SHA-256 hash of a raw token, base64url-encoded — only the hash is ever
 * persisted. base64url (43 chars) is shorter than hex (64 chars), URL-safe, and
 * carries the full 256 bits. Both write (CreateInvite) and read (RedeemInvite)
 * paths call this, so the encoding stays internally consistent.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('base64url');
}

/** Minimal shape of an invite needed for redemption eligibility. */
export interface InviteEvaluationInput {
  Status: string;
  ExpiresAt: Date | string;
  MaxUses: number;
  UseCount: number;
}

/** Normalizes a role/name for case- and whitespace-insensitive comparison. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Pure authorization check for WHO may issue magic-link invites.
 *
 * Owners are always allowed (Owner is MJ's superuser type). Otherwise the caller
 * must be a member of one of `issuerRoleNames`. An empty `issuerRoleNames` means
 * Owner-only — the secure default. This is what stops any authenticated user
 * (including an external user already holding a restricted magic-link session)
 * from minting invites.
 */
export function canIssueInvites(
  userType: string | null | undefined,
  userRoleNames: readonly string[],
  issuerRoleNames: readonly string[],
): boolean {
  if (normalizeName(userType ?? '') === 'owner') {
    return true;
  }
  const allowed = new Set(issuerRoleNames.map(normalizeName));
  if (allowed.size === 0) {
    return false;
  }
  return userRoleNames.some((r) => allowed.has(normalizeName(r)));
}

/**
 * Pure check for WHAT role an invite may grant. The restricted role is always
 * grantable; any other role must be explicitly listed in `grantableRoleNames`.
 * Applied to every caller (Owners included) so a privileged role can never be
 * attached to an external magic-link user unless the deployment opts in.
 */
export function isRoleGrantable(
  roleName: string | null | undefined,
  restrictedRoleName: string,
  grantableRoleNames: readonly string[],
): boolean {
  const target = normalizeName(roleName ?? '');
  if (!target) {
    return false;
  }
  const allowed = new Set<string>([normalizeName(restrictedRoleName), ...grantableRoleNames.map(normalizeName)]);
  return allowed.has(target);
}

/** Pure redemption-eligibility check. Returns ok + an error code when not. */
export function evaluateInvite(invite: InviteEvaluationInput, nowMs: number): { ok: boolean; errorCode?: RedeemErrorCode } {
  if (invite.Status === 'Revoked') {
    return { ok: false, errorCode: 'revoked' };
  }
  const expiresMs = new Date(invite.ExpiresAt).getTime();
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    return { ok: false, errorCode: 'expired' };
  }
  if (invite.Status === 'Consumed' || invite.UseCount >= invite.MaxUses) {
    return { ok: false, errorCode: 'consumed' };
  }
  if (invite.Status !== 'Active') {
    return { ok: false, errorCode: 'invalid' };
  }
  return { ok: true };
}

/**
 * Builds the atomic compare-and-swap UPDATE that consumes one use of an invite.
 *
 * The WHERE clause re-checks every eligibility condition at the DB level, so the
 * increment and the guard are a single atomic operation: concurrent redemptions
 * of a single-use link race on the row and exactly one matches (the matched row
 * is returned via OUTPUT). This is what actually enforces single-use — the
 * JS-side `evaluateInvite` is only a friendly pre-check.
 *
 * The invite ID MUST be bound as parameter `@p0` by the caller — it is never
 * interpolated into the string, so this builder is injection-safe regardless of
 * the ID's contents.
 *
 * OUTPUT goes `INTO` a table variable (not a bare OUTPUT): SQL Server forbids a
 * bare OUTPUT clause on a table that has enabled triggers, and CodeGen adds an
 * `__mj_UpdatedAt` trigger to every MJ table. The trailing SELECT returns exactly
 * the matched row(s) so the caller can detect a win (exactly one row) regardless
 * of trigger behavior.
 *
 * `qualifiedTable` is asserted to be a bracket-quoted `[schema].[table]` (word
 * chars only) before interpolation. The caller derives it from `EntityInfo`
 * (never user input), so this is defense-in-depth: even a future careless caller
 * cannot turn this into an injection vector — a non-conforming table throws.
 *
 * @param qualifiedTable  bracket-quoted `[schema].[table]` for MagicLinkInvite
 */
const QUALIFIED_TABLE_PATTERN = /^\[\w+\]\.\[\w+\]$/;

export function buildConsumeInviteSQL(qualifiedTable: string): string {
  if (!QUALIFIED_TABLE_PATTERN.test(qualifiedTable)) {
    throw new Error(`buildConsumeInviteSQL: refusing to build SQL for non-whitelisted table identifier '${qualifiedTable}'.`);
  }
  return (
    `DECLARE @consumed TABLE (ID UNIQUEIDENTIFIER); ` +
    `UPDATE ${qualifiedTable} ` +
    `SET UseCount = UseCount + 1, ` +
    `ConsumedAt = COALESCE(ConsumedAt, SYSUTCDATETIME()), ` +
    `Status = CASE WHEN UseCount + 1 >= MaxUses THEN 'Consumed' ELSE Status END ` +
    `OUTPUT INSERTED.ID INTO @consumed ` +
    `WHERE ID = @p0 AND Status = 'Active' AND UseCount < MaxUses AND ExpiresAt > SYSUTCDATETIME(); ` +
    `SELECT ID FROM @consumed;`
  );
}

/**
 * Pure scope-union: appends `next` to `prior` unless an entry from the same invite
 * is already present (dedup by inviteId). This is how a session accumulates the union
 * of scopes across multiple redeemed links — carried in the re-minted JWT, never as
 * roles on a shared user, so anonymous sessions can't accrete into a superuser.
 */
export function unionScopes(prior: readonly MagicLinkScopeEntry[] | undefined, next: MagicLinkScopeEntry): MagicLinkScopeEntry[] {
  const result = [...(prior ?? [])];
  if (!result.some((s) => s.inviteId === next.inviteId)) {
    result.push(next);
  }
  return result;
}

/** Builds the session-token claims (pure). */
export function buildSessionClaims(args: {
  issuer: string;
  audience: string;
  inviteId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  applicationId: string;
  roleName: string;
  invitedByUserId?: string;
  /** True for anonymous sessions — the server enforces scope from mj_scopes, not roles. */
  anonymous?: boolean;
  /** Opaque per-session id (anonymous forensics correlation). */
  sessionId?: string;
  /** Prior session's scope union to carry forward (multi-link anonymous sessions). */
  priorScopes?: readonly MagicLinkScopeEntry[];
  /** Resource-share/embed scope for this link's entry. */
  resourceType?: string;
  resourceId?: string;
  nowSeconds: number;
  ttlSeconds: number;
}): MagicLinkJWTClaims {
  const name = [args.firstName, args.lastName].filter(Boolean).join(' ') || undefined;
  const scopeEntry: MagicLinkScopeEntry = {
    inviteId: args.inviteId,
    appId: args.applicationId,
    role: args.roleName,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
  };
  return {
    iss: args.issuer,
    aud: args.audience,
    sub: `magic-link|${args.inviteId}`,
    iat: args.nowSeconds,
    exp: args.nowSeconds + args.ttlSeconds,
    email: args.email,
    given_name: args.firstName,
    family_name: args.lastName,
    name,
    mj_app_id: args.applicationId,
    mj_role: args.roleName,
    mj_invited_by: args.invitedByUserId,
    mj_scopes: unionScopes(args.priorScopes, scopeEntry),
    mj_anon: args.anonymous ? true : undefined,
    mj_sid: args.sessionId,
    mj_magic_link: true,
  };
}
