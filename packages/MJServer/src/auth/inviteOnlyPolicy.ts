import type { JwtPayload } from 'jsonwebtoken';
import type { UserHandlingInfo } from '../config.js';

/** Canonical prefix on invite-only authentication refusal messages for bundler-safe error classification. */
export const INVITE_ONLY_AUTH_ERROR_PREFIX = 'Invite-only sign-in refused:';

/** Canonical prefix when `requireVerifiedEmail` rejects sign-in in non-invite-only deployments. */
export const EMAIL_VERIFICATION_AUTH_ERROR_PREFIX = 'Sign-in refused:';

/** Input to {@link EvaluateExternalEmailVerification}. */
export interface ExternalEmailVerificationInput {
  /** Verified JWT payload from the identity provider. */
  Payload: JwtPayload;
  /** Active `userHandling` configuration block. */
  UserHandling: Partial<UserHandlingInfo> | undefined;
  /** Registered MJ auth provider name (e.g. `'azure'`, `'auth0'`), if known. */
  ProviderName?: string;
  /** Token issuer (`iss` claim). */
  Issuer?: string;
}

/** Result of {@link EvaluateExternalEmailVerification}. */
export type ExternalEmailVerificationResult =
  | { readonly Allowed: true }
  | { readonly Allowed: false; readonly Reason: string };

/** Returns true when deployment is configured for invite-only external user access. */
export function IsInviteOnlyMode(userHandling: Partial<UserHandlingInfo> | undefined): boolean {
  return userHandling?.inviteOnly === true;
}

/** Returns true when external sign-ins must present a verified email assertion (always true in invite-only mode). */
export function IsVerifiedEmailRequired(userHandling: Partial<UserHandlingInfo> | undefined): boolean {
  return userHandling?.inviteOnly === true || userHandling?.requireVerifiedEmail === true;
}

/**
 * Returns the effective role list for newly provisioned users.
 * In invite-only mode, auto-granting `'UI'` (or any configured `newUserRoles`) is unconditionally disabled.
 */
export function ResolveEffectiveNewUserRoles(userHandling: Partial<UserHandlingInfo> | undefined): string[] {
  if (IsInviteOnlyMode(userHandling)) {
    return [];
  }
  return Array.isArray(userHandling?.newUserRoles) ? [...userHandling.newUserRoles] : [];
}

/**
 * Normalizes `userHandling` when `inviteOnly: true` so inherited defaults (`autoCreateNewUsers: true`,
 * `newUserRoles: ['UI']`) from `DEFAULT_SERVER_CONFIG` can never leak into runtime behavior.
 */
export function NormalizeInviteOnlyUserHandling<T extends Partial<UserHandlingInfo>>(userHandling: T): T {
  if (!IsInviteOnlyMode(userHandling)) {
    return userHandling;
  }
  return {
    ...userHandling,
    autoCreateNewUsers: false,
    requireVerifiedEmail: true,
    newUserRoles: [],
  };
}

/**
 * Evaluates whether a verified JWT satisfies external email-verification requirements.
 *
 * - In non-invite-only deployments with `requireVerifiedEmail: false` (default), always allows.
 * - When `inviteOnly: true` or `requireVerifiedEmail: true`:
 *   1. Explicit `email_verified === false` or `xms_edov === false` is ALWAYS refused.
 *   2. Explicit `email_verified === true` (or `xms_edov === true` when `email_verified` is omitted) is allowed.
 *   3. MJ-issued magic-link tokens (`mj_magic_link === true`) are allowed when `email_verified` is omitted.
 *   4. Otherwise fails closed, unless the provider name or issuer is listed in
 *      `userHandling.verifiedEmailOptionalProviders` (e.g. enterprise Entra ID tenants whose tokens
 *      omit standard OIDC `email_verified`).
 */
export function EvaluateExternalEmailVerification(input: ExternalEmailVerificationInput): ExternalEmailVerificationResult {
  if (!IsVerifiedEmailRequired(input.UserHandling)) {
    return { Allowed: true };
  }

  const prefix = IsInviteOnlyMode(input.UserHandling)
    ? INVITE_ONLY_AUTH_ERROR_PREFIX
    : EMAIL_VERIFICATION_AUTH_ERROR_PREFIX;
  const emailVerified = normalizeEmailVerifiedClaim(input.Payload.email_verified);
  const entraVerified = normalizeEmailVerifiedClaim(input.Payload['xms_edov']);

  if (emailVerified === false || entraVerified === false) {
    return {
      Allowed: false,
      Reason: `${prefix} external identity provider reports an unverified email claim.`,
    };
  }

  if (emailVerified === true || entraVerified === true) {
    return { Allowed: true };
  }

  if (input.Payload['mj_magic_link'] === true) {
    return { Allowed: true };
  }

  if (isOptionalVerifiedProvider(input.UserHandling, input.ProviderName, input.Issuer)) {
    return { Allowed: true };
  }

  return {
    Allowed: false,
    Reason: `${prefix} external identity provider token is missing a verified email claim (email_verified: true).`,
  };
}

type EmailVerifiedClaimValue = boolean | number | string | object | null | undefined;

function normalizeEmailVerifiedClaim(value: EmailVerifiedClaimValue): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return undefined;
    }
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return false;
  }
  return false;
}

function isOptionalVerifiedProvider(
  userHandling: Partial<UserHandlingInfo> | undefined,
  providerName: string | undefined,
  issuer: string | undefined,
): boolean {
  const allowList = userHandling?.verifiedEmailOptionalProviders;
  if (!Array.isArray(allowList) || allowList.length === 0) {
    return false;
  }
  const normalizedAllowList = new Set(
    allowList
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(normalizeProviderIdentifier),
  );
  if (providerName && normalizedAllowList.has(normalizeProviderIdentifier(providerName))) {
    return true;
  }
  if (issuer && normalizedAllowList.has(normalizeProviderIdentifier(issuer))) {
    return true;
  }
  return false;
}

function normalizeProviderIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}
