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

/**
 * The magic-link resource-scope `resourceType` used for a widget guest session. Pairs with the
 * opaque session id as `resourceId` so the synthesized principal's MagicLinkScope.ResourceID is
 * the session id — the discriminator the Widget Guest RLS filters key on for per-session isolation.
 */
export const WIDGET_SESSION_RESOURCE_TYPE = 'Widget Session';

/** Why a guest-session mint was rejected. Drives the HTTP status in the router. */
export type WidgetMintErrorCode =
    | 'not_found'
    | 'disabled'
    | 'origin_not_allowed'
    | 'modality_not_enabled'
    | 'host_assertion_invalid'
    | 'upgrade_not_enabled'
    | 'invalid_email'
    | 'server_error';

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
 * Parses the widget's `EnabledChannels` column into a clean list of channel names (Phase 2). Accepts a
 * JSON array (preferred, e.g. `["Whiteboard"]`) or a comma-separated string (tolerated). Returns an
 * empty array for null/blank/garbage — the backwards-compatible default (no channels attached).
 */
export function parseEnabledChannels(enabledChannels: string | null | undefined): string[] {
  const raw = enabledChannels?.trim();
  if (!raw) {
    return [];
  }
  const clean = (list: unknown[]): string[] =>
    list.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter((s) => s.length > 0);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? clean(parsed) : [];
  } catch {
    return clean(raw.split(','));
  }
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
 * Known automated-client User-Agent substrings (lowercased). A public mint endpoint is a cheap
 * target for crawlers and scripted abuse; this catches the obvious non-browser callers. It is a
 * coarse FIRST line of defense (W6 "basic behavioural and user-agent checks"), NOT a CAPTCHA — the
 * real boundaries remain the origin allowlist, rate limits, the restricted guest role, and short
 * token TTLs. Legitimate headless integrations should embed via host-identity, not the public mint.
 */
const BOT_USER_AGENT_MARKERS = [
  'bot', 'crawler', 'spider', 'scrape', 'curl', 'wget', 'python-requests',
  'httpclient', 'okhttp', 'java/', 'go-http-client', 'libwww', 'headlesschrome', 'phantomjs',
];

/**
 * Coarse bot heuristic for the public mint route. Returns `true` when the request should be treated as
 * an automated client: a missing/blank User-Agent (real browsers always send one) or a UA containing a
 * known automation marker. Deliberately conservative to avoid false positives on real browsers; pair
 * with the origin allowlist + rate limits, which are the hard controls.
 */
export function looksLikeBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim().toLowerCase();
  if (!ua) {
    return true;
  }
  return BOT_USER_AGENT_MARKERS.some((marker) => ua.includes(marker));
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
  /**
   * Host-asserted identity for a `host-identity` session. Its email/name are carried as
   * INFORMATIONAL claims only — the principal-resolving `email`/`sub` remain the shared
   * Anonymous principal, so a host can never escalate a guest into a real account.
   */
  hostIdentity?: { email: string; firstName?: string; lastName?: string };
  /**
   * Returning-visitor anchor + linked identity (RV1/RV2/RV4) carried as claims so the VOICE path
   * (server-created conversation) stamps the same fields the text path stamps client-side. Set only
   * when the widget remembers returning visitors. Omitted ⇒ no returning-visitor claims (default off).
   */
  returningVisitor?: {
    visitorKey?: string;
    lastConversationId?: string;
    linkedEntityId?: string;
    linkedRecordId?: string;
  };
}): MagicLinkJWTClaims {
  const claims = buildSessionClaims({
    issuer: args.issuer,
    audience: args.audience,
    // No invite row for a direct-mint guest; the opaque session id stands in as the
    // subject discriminator (sub = `magic-link|<sessionId>`) and scope-entry id.
    inviteId: args.sessionId,
    // ALWAYS the Anonymous principal email — never the host-provided one (that would let
    // the auth middleware resolve to a real user and leak its permissions).
    email: args.anonymousEmail,
    applicationId: args.applicationId,
    roleName: args.guestRoleName,
    anonymous: true,
    sessionId: args.sessionId,
    // Per-session resource scope → MagicLinkScope.ResourceID on the synthesized principal.
    // This is what the Widget Guest RLS filters key on ({{ScopeResourceID}}) to isolate one
    // anonymous guest's conversations from another's despite the shared Anonymous UserID.
    // It rides the SIGNED token, so a guest cannot forge another session's scope.
    resourceType: WIDGET_SESSION_RESOURCE_TYPE,
    resourceId: args.sessionId,
    nowSeconds: args.nowSeconds,
    ttlSeconds: args.ttlSeconds,
  });
  // Additive widget claim — lets the synthesized principal be bound to one widget.
  claims.mj_widget_id = args.widgetId;
  if (args.hostIdentity) {
    claims.given_name = args.hostIdentity.firstName ?? claims.given_name;
    claims.family_name = args.hostIdentity.lastName ?? claims.family_name;
    claims.name = [args.hostIdentity.firstName, args.hostIdentity.lastName].filter(Boolean).join(' ') || claims.name;
    claims.mj_host_email = args.hostIdentity.email;
  }
  if (args.returningVisitor) {
    claims.mj_visitor_key = args.returningVisitor.visitorKey;
    claims.mj_last_conversation_id = args.returningVisitor.lastConversationId;
    claims.mj_linked_entity_id = args.returningVisitor.linkedEntityId;
    claims.mj_linked_record_id = args.returningVisitor.linkedRecordId;
  }
  return claims;
}
