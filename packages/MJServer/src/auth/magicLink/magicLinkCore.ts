/**
 * @fileoverview Pure functional core for magic links — no DB, no email, no MJ
 * runtime imports. Everything here is deterministic given its inputs (modulo
 * crypto randomness) and unit-testable with plain assertions.
 *
 * @module @memberjunction/server/auth/magicLink
 */

import { randomBytes, createHash } from 'node:crypto';
import type { MagicLinkJWTClaims, RedeemErrorCode } from './types.js';

/** Token prefix, mirroring the API-key convention (`mj_sk_`). */
export const MAGIC_LINK_TOKEN_PREFIX = 'mj_ml_';

/** Generates a cryptographically random raw magic-link token. */
export function generateRawToken(): string {
  return MAGIC_LINK_TOKEN_PREFIX + randomBytes(32).toString('hex');
}

/** SHA-256 hex hash of a raw token — only the hash is ever persisted. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Minimal shape of an invite needed for redemption eligibility. */
export interface InviteEvaluationInput {
  Status: string;
  ExpiresAt: Date | string;
  MaxUses: number;
  UseCount: number;
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
 * @param qualifiedTable  bracket-quoted `[schema].[table]` for MagicLinkInvite
 */
export function buildConsumeInviteSQL(qualifiedTable: string): string {
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
  nowSeconds: number;
  ttlSeconds: number;
}): MagicLinkJWTClaims {
  const name = [args.firstName, args.lastName].filter(Boolean).join(' ') || undefined;
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
    mj_magic_link: true,
  };
}
