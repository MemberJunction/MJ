/**
 * @fileoverview Pure functional core for the public web widget guest-session
 * mint — no DB, no MJ runtime, no Express. Deterministic given inputs (modulo
 * the session-id randomness it delegates to magicLinkCore) and unit-testable
 * with plain assertions. Mirrors the magic-link `magicLinkCore.ts` split.
 *
 * The widget reuses the magic-link RS256 mint + `anonymous-embed` synthesis. This
 * module owns only the widget-specific pure logic: origin-allowlist enforcement,
 * widget-instance eligibility, and assembling the guest claims (anonymous + the
 * additive `mj_widget_id` claim) on top of magic-link's `buildSessionClaims`.
 *
 * @module @memberjunction/server/widget
 */

import { buildSessionClaims } from '../auth/magicLink/magicLinkCore.js';
import type { MagicLinkJWTClaims } from '../auth/magicLink/types.js';

/** Why a guest-session mint was rejected. Drives the HTTP status in the router. */
export type WidgetMintErrorCode = 'not_found' | 'disabled' | 'origin_not_allowed' | 'modality_not_enabled' | 'server_error';

/** The minimal widget-instance shape the pure validators need (a subset of the entity). */
export interface WidgetInstanceEligibilityInput {
  Status: string;
  AllowedOrigins: string | null;
  Modality: string;
}

/**
 * Parses the widget's `AllowedOrigins` column into a normalized origin list.
 * Accepts a JSON array (preferred, e.g. `["https://a.com","https://b.com"]`) or a
 * comma-separated string (tolerated). Returns an empty array for null/blank/garbage
 * — which makes the allowlist FAIL-CLOSED (no origin is allowed) by construction.
 */
export function parseAllowedOrigins(allowedOrigins: string | null | undefined): string[] {
  const raw = allowedOrigins?.trim();
  if (!raw) {
    return [];
  }
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    // Not JSON — tolerate a CSV form.
    return raw.split(',').map((s) => normalizeOrigin(s)).filter((s): s is string => !!s);
  }
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((s): s is string => typeof s === 'string').map(normalizeOrigin).filter((s): s is string => !!s);
}

/** Lowercases + trims an origin and strips a trailing slash for stable comparison. */
function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * FAIL-CLOSED origin check. The request's `Origin` header must exactly match one of
 * the widget's allowed origins (after normalization). A missing request origin, or
 * an empty allowlist, is rejected — a public mint endpoint must never accept "*".
 */
export function isOriginAllowed(requestOrigin: string | null | undefined, allowedOrigins: readonly string[]): boolean {
  if (!requestOrigin || allowedOrigins.length === 0) {
    return false;
  }
  const candidate = normalizeOrigin(requestOrigin);
  return allowedOrigins.some((o) => o === candidate);
}

/** True when the requested modality (or the widget's default render) is enabled by the instance. */
export function isModalityEnabled(widgetModality: string, requested: 'Text' | 'Voice'): boolean {
  const m = widgetModality.trim().toLowerCase();
  if (m === 'both') {
    return true;
  }
  return m === requested.toLowerCase();
}

/**
 * Pure eligibility check for a mint: the widget must be Active and the request's
 * origin must be on the allowlist. Returns an error code on the first failure so the
 * router can map it to a precise HTTP status. Modality is checked separately by the
 * voice path (W4) since a text mint is always permitted for an enabled widget.
 */
export function evaluateWidgetMint(
  widget: WidgetInstanceEligibilityInput,
  requestOrigin: string | null | undefined,
): { ok: boolean; errorCode?: WidgetMintErrorCode } {
  if (widget.Status.trim().toLowerCase() !== 'active') {
    return { ok: false, errorCode: 'disabled' };
  }
  if (!isOriginAllowed(requestOrigin, parseAllowedOrigins(widget.AllowedOrigins))) {
    return { ok: false, errorCode: 'origin_not_allowed' };
  }
  return { ok: true };
}

/**
 * Builds the guest-session JWT claims for a widget visitor. Reuses magic-link's
 * `buildSessionClaims` (anonymous mode → the shared Anonymous principal + claims-based
 * role synthesis) and layers on the additive `mj_widget_id` claim so the synthesized
 * principal is locked to one widget instance. The role name carried here is the
 * widget's restricted guest role (D5 backstop).
 */
export function buildWidgetGuestClaims(args: {
  issuer: string;
  audience: string;
  widgetId: string;
  sessionId: string;
  anonymousEmail: string;
  applicationId: string;
  guestRoleName: string;
  nowSeconds: number;
  ttlSeconds: number;
}): MagicLinkJWTClaims {
  const claims = buildSessionClaims({
    issuer: args.issuer,
    audience: args.audience,
    // No invite row for a direct-mint guest; the opaque session id stands in as the
    // subject discriminator (sub = `magic-link|<sessionId>`) and scope-entry id.
    inviteId: args.sessionId,
    email: args.anonymousEmail,
    applicationId: args.applicationId,
    roleName: args.guestRoleName,
    anonymous: true,
    sessionId: args.sessionId,
    nowSeconds: args.nowSeconds,
    ttlSeconds: args.ttlSeconds,
  });
  // Additive widget claim — lets the synthesized principal be bound to one widget.
  claims.mj_widget_id = args.widgetId;
  return claims;
}
