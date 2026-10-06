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

/** PostgreSQL table identifier — `schema.table` (word chars only); auto-quoted downstream. */
const QUALIFIED_TABLE_PATTERN_PG = /^\w+\.\w+$/;

/**
 * Builds the PostgreSQL atomic compare-and-swap UPDATE that consumes one use of an invite.
 *
 * PostgreSQL only. SQL Server consumes through the granted `spConsumeMagicLinkInvite` procedure,
 * because its runtime roles are never granted table DML (#4753). PostgreSQL needs neither: its
 * runtime roles hold INSERT/UPDATE/DELETE on every `__mj` table
 * (V202605040300__v5.33.x__Unblock_PostgreSQL_End_To_End.pg-only.sql), and no PG counterpart of
 * the procedure exists — the release-time converter leaves `CREATE PROCEDURE` unhandled.
 *
 * The WHERE re-checks every eligibility condition (the same predicate as the procedure), so the
 * increment and the guard are one atomic statement: concurrent redemptions of a single-use link
 * serialize on the row lock and exactly one matches. `RETURNING ID` yields the row iff the guard
 * matched. The invite ID MUST be bound by the caller as `$1` — it is never interpolated.
 *
 * `qualifiedTable` is `schema.table` unquoted (PostgreSQLDataProvider.ExecuteSQL auto-quotes the
 * PascalCase identifiers) and is asserted against a whitelist before interpolation — the caller
 * never passes user input, so this is defense-in-depth.
 */
export function buildConsumeInvitePostgresSQL(qualifiedTable: string): string {
  if (!QUALIFIED_TABLE_PATTERN_PG.test(qualifiedTable)) {
    throw new Error(`buildConsumeInvitePostgresSQL: refusing to build SQL for non-whitelisted table identifier '${qualifiedTable}'.`);
  }
  return (
    `UPDATE ${qualifiedTable} ` +
    `SET UseCount = UseCount + 1, ` +
    `ConsumedAt = COALESCE(ConsumedAt, (now() AT TIME ZONE 'utc')), ` +
    `Status = CASE WHEN UseCount + 1 >= MaxUses THEN 'Consumed' ELSE Status END ` +
    `WHERE ID = $1 AND Status = 'Active' AND UseCount < MaxUses AND ExpiresAt > (now() AT TIME ZONE 'utc') ` +
    `RETURNING ID;`
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
