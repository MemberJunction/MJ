/**
 * @fileoverview Imperative shell for public web widget guest sessions: resolves a
 * widget instance by its public key, enforces the origin allowlist + status, and
 * mints a short-lived anonymous guest session JWT by reusing the magic-link RS256
 * key + `anonymous-embed` synthesis. The pure logic lives in `widgetCore.ts`.
 *
 * Design (per public-web-widget.md W1 + open-Q #1): DIRECT-MINT for anonymous
 * guests — no MagicLinkInvite row is created (those model single-use invites; a
 * widget guest is ephemeral). Forensics ride the opaque per-session id (`mj_sid`)
 * carried in the token, plus best-effort structured audit logging. The minted
 * token is validated by the SAME `magic-link` auth provider (same issuer/audience/
 * JWKS) and synthesized into a constrained guest principal by `buildMagicLinkSessionUser`.
 *
 * @module @memberjunction/server/widget
 */

import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJConversationWidgetInstanceEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { generateSessionId } from '../auth/magicLink/magicLinkCore.js';
import { MagicLinkService } from '../auth/magicLink/MagicLinkService.js';
import { configInfo, type WidgetConfig } from '../config.js';
import { buildWidgetGuestClaims, evaluateWidgetMint, parseEnabledChannels, type WidgetMintErrorCode } from './widgetCore.js';
import { verifyHostAssertion, type HostAssertedIdentity } from './host-identity.js';
import { writeReturningVisitorRecap } from '../agentSessions/ReturningVisitorRecap.js';
import { resolveIdentityByEmail, mergeVisitorIdentity, forgetVisitor, type ResolvedVisitorIdentity } from './visitorIdentity.js';

const WIDGET_ENTITY = 'MJ: Conversation Widget Instances';
const CONVERSATIONS_ENTITY = 'MJ: Conversations';

/** Shape of the durable visitor anchor key (opaque base64url, same alphabet as generateSessionId). */
const VISITOR_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** Resolved returning-visitor anchor for a mint: the durable key + the prior conversation to chain from. */
interface ReturningVisitorResolution {
  /** The durable VisitorKey to persist as a cookie (validated-presented or freshly minted). */
  visitorKey: string;
  /** The most-recent prior conversation for this anchor in the widget's app, when this is a returning visit. */
  lastConversationId?: string;
}

/** Per-request forensic context captured for audit (sourced from the HTTP request). */
export interface WidgetMintAuditContext {
  ipAddress?: string;
  userAgent?: string;
  origin?: string;
}

/** Input to mint a guest session. */
export interface MintGuestSessionInput {
  /** The widget's public embed key (pk_live_…). */
  widgetKey: string;
  /** The request's Origin header — enforced against the instance allowlist. */
  origin?: string;
  /**
   * A host-signed RS256 identity assertion (D1 `host-identity` strategy). Required when the
   * resolved widget's AuthStrategy is `HostIdentity`; ignored otherwise. Verified against the
   * host's registered public key; its identity is carried as informational claims only.
   */
  hostAssertion?: string;
  /**
   * The durable returning-visitor anchor (RV1) the client presents from its first-party cookie.
   * Honored only when the widget's `RememberReturningVisitors` toggle is on: a valid presented key
   * chains this visit to the visitor's prior conversation; absent/invalid on a first visit, the
   * server mints a fresh one. Ignored entirely when remembering is off.
   */
  visitorKey?: string;
  audit?: WidgetMintAuditContext;
}

/** Result of a guest-session mint. */
export interface MintGuestSessionResult {
  success: boolean;
  /** The minted session JWT (RS256), held by the widget in memory and refreshed before expiry. */
  token?: string;
  /** ISO expiry of the session token. */
  expiresAt?: string;
  /** The widget instance id (also carried as the `mj_widget_id` claim). */
  widgetId?: string;
  /** The Application the session is scoped to. */
  applicationId?: string;
  /** The pinned support agent the widget passes as explicitAgentId for every turn (D5). */
  pinnedAgentId?: string;
  /** Which modalities this widget exposes (drives the widget UI). */
  modality?: string;
  /**
   * The opaque per-session id (also the signed scope resourceId). The widget stamps
   * Conversation.ExternalID with this so the Widget Guest RLS filters isolate this guest's rows.
   */
  sessionId?: string;
  /**
   * Optional hard ceiling (minutes) on a voice session for this widget. Surfaced so the client
   * voice-abuse guard uses the deployment-configured limit; also enforced server-side at mint.
   */
  voiceMaxSessionMinutes?: number;
  /** Whether returning-visitor memory is enabled for this widget (gates the cookie + chaining). */
  rememberReturningVisitors?: boolean;
  /**
   * The durable visitor anchor to persist as a cookie (RV1). Set only when remembering is on:
   * the validated key the client presented, or a freshly minted one on a first visit.
   */
  visitorKey?: string;
  /** The visitor's prior conversation for this anchor (RV2 chain); set only on a returning visit. */
  lastConversationId?: string;
  /**
   * The resolved polymorphic identity entity id (RV4), set only when a host-identity widget asserted a
   * resolvable identity at mint. The client stamps it (with {@link MintGuestSessionResult.linkedRecordId})
   * onto the new conversation so memory injection (RV3) keys off the resolved record, not the cookie.
   */
  linkedEntityId?: string;
  /** The resolved polymorphic identity record id (RV4); paired with {@link MintGuestSessionResult.linkedEntityId}. */
  linkedRecordId?: string;
  /**
   * Interactive channels (by name, e.g. `["Whiteboard"]`) this widget may attach when voice is active
   * (Phase 2). Mirrors the widget instance's `EnabledChannels`; empty (the default) = no channels.
   */
  enabledChannels?: string[];
  error?: string;
  errorCode?: WidgetMintErrorCode;
}

/** Input to resolve a returning visitor's identity after they verify (RV4, magic-link upgrade path). */
export interface ResolveVisitorIdentityInput {
  /** The widget's public embed key. */
  widgetKey: string;
  /** The durable returning-visitor anchor whose trail should be promoted to the verified identity. */
  visitorKey: string;
  /** The verified visitor's email (from the authenticated session) — resolved to a record via config. */
  verifiedEmail: string;
  /** The request's Origin header — enforced against the instance allowlist. */
  origin?: string;
}

/** Result of an RV4 identity resolve+merge. */
export interface ResolveVisitorIdentityResult {
  success: boolean;
  /** The resolved polymorphic pair, when a record matched the verified email. */
  resolved?: ResolvedVisitorIdentity;
  /** How many conversations were stamped with the resolved identity. */
  mergedConversations?: number;
  error?: string;
  errorCode?: WidgetMintErrorCode;
}

/** Input to a "forget me" request (RV5). */
export interface ForgetVisitorInput {
  /** The widget's public embed key. */
  widgetKey: string;
  /** The durable returning-visitor anchor to forget. */
  visitorKey: string;
  /** The request's Origin header — enforced against the instance allowlist. */
  origin?: string;
}

/**
 * Result of the shared RV4/RV5 visitor-privacy gate. A single flat shape (not a discriminated union)
 * because MJServer compiles without strictNullChecks, where literal-discriminant narrowing is disabled.
 * On `ok`, `widget`/`contextUser` are set; otherwise `errorCode`/`error` are set.
 */
interface VisitorPrivacyGateResult {
  ok: boolean;
  widget?: MJConversationWidgetInstanceEntity;
  contextUser?: UserInfo;
  errorCode?: WidgetMintErrorCode;
  error?: string;
}

/** Result of a "forget me" request (RV5). */
export interface ForgetVisitorResult {
  success: boolean;
  /** Count of memory notes archived. */
  notesArchived?: number;
  /** Count of conversations whose VisitorKey linkage was cleared. */
  conversationsCleared?: number;
  error?: string;
  errorCode?: WidgetMintErrorCode;
}

/** Input to request a magic-link identity upgrade for a live guest session (W5). */
export interface UpgradeGuestSessionInput {
  /** The widget's public embed key. */
  widgetKey: string;
  /** The email to send the verification link to (becomes the provisioned user's email). */
  email: string;
  /** The request's Origin header — enforced against the instance allowlist. */
  origin?: string;
}

/** Result of a magic-link upgrade request. Never carries the token (delivered by email, out-of-band). */
export interface UpgradeGuestSessionResult {
  success: boolean;
  /** Whether the verification email was dispatched (false when no comms provider is configured). */
  emailSent?: boolean;
  error?: string;
  errorCode?: WidgetMintErrorCode;
}

/** Minimal email sanity check (presence + single `@` with a dotted domain) — not full RFC validation. */
function isLikelyEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * Mints constrained, short-lived guest sessions for the public web widget.
 * Stateless; constructed once at server startup alongside the magic-link service.
 */
export class WidgetSessionService {
  constructor(
    private readonly publicUrl: string,
    private readonly config: WidgetConfig,
  ) {}

  /**
   * Resolves the widget instance, enforces guardrails, and mints a guest JWT.
   * Never throws for business failures — returns `{ success: false, errorCode }`.
   */
  public async MintGuestSession(input: MintGuestSessionInput): Promise<MintGuestSessionResult> {
    try {
      const contextUser = this.resolveLookupUser();
      if (!contextUser) {
        LogError('[Widget] No lookup context user available; server not configured.');
        return { success: false, errorCode: 'server_error', error: 'Server not configured for widget sessions.' };
      }

      const widget = await this.loadWidgetByKey(input.widgetKey, contextUser);
      if (!widget) {
        return this.audited({ success: false, errorCode: 'not_found', error: 'Unknown widget key.' }, input, undefined);
      }

      const eligibility = evaluateWidgetMint(
        { Status: widget.Status, AllowedOrigins: widget.AllowedOrigins, Modality: widget.Modality },
        input.origin,
      );
      if (!eligibility.ok) {
        return this.audited({ success: false, errorCode: eligibility.errorCode, error: 'Widget mint rejected.' }, input, widget);
      }

      const guestRoleName = this.resolveGuestRoleName(widget.GuestRoleID);
      if (!guestRoleName) {
        LogError(`[Widget] Guest role ${widget.GuestRoleID} for widget ${widget.ID} not found in metadata.`);
        return this.audited({ success: false, errorCode: 'server_error', error: 'Guest role not resolvable.' }, input, widget);
      }

      // D1 host-identity strategy: a HostIdentity widget MUST present a valid host assertion.
      let hostIdentity: HostAssertedIdentity | undefined;
      if (widget.AuthStrategy === 'HostIdentity') {
        const verified = this.verifyHost(widget, input.hostAssertion);
        if (!verified) {
          return this.audited({ success: false, errorCode: 'host_assertion_invalid', error: 'Host identity assertion invalid.' }, input, widget);
        }
        hostIdentity = verified;
      }

      // Returning-visitor anchor (RV1): resolve/mint the durable VisitorKey and chain to the prior
      // conversation — only when this widget opts in. Never blocks the mint (best-effort on lookup failure).
      const returningVisitor = await this.resolveReturningVisitor(widget, input.visitorKey, contextUser);

      // RV2 (text path): the text widget runs client-side and has no server "session closed" event, so
      // we recap the visitor's PRIOR conversation lazily, at the moment they return — which is exactly
      // when the recap is needed for RV3 to inject it into this new session. Idempotent (skips when a
      // recap already exists) and best-effort (never blocks or fails the mint).
      await this.recapPriorConversationIfNeeded(widget, returningVisitor, contextUser);

      // RV4 (host-identity path): when a host asserts a resolvable identity, promote the visitor's prior
      // anonymous trail to that record and surface the pair so the client stamps the new conversation.
      const resolvedIdentity = await this.resolveHostIdentityIfApplicable(widget, hostIdentity, returningVisitor, contextUser);

      return this.audited(this.mintToken(widget, guestRoleName, hostIdentity, returningVisitor, resolvedIdentity), input, widget);
    } catch (e) {
      LogError(e);
      return { success: false, errorCode: 'server_error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Refreshes a live guest session. The widget always holds its public key, so a
   * refresh is a fresh mint by the same key + origin — short-TTL tokens with no
   * refresh-token machinery (mirrors magic-link's no-refresh-token stance).
   */
  public async RefreshGuestSession(input: MintGuestSessionInput): Promise<MintGuestSessionResult> {
    return this.MintGuestSession(input);
  }

  /** Short-TTL cache of resolved per-instance rate limits, so the limiter doesn't hit the DB per request. */
  private readonly rateLimitCache = new Map<string, { limit: number; expiresAtMs: number }>();
  private static readonly RATE_LIMIT_CACHE_TTL_MS = 60_000;

  /**
   * Resolves the per-instance `RateLimitPerMinute` for a widget key (W6 hardening), falling back to the
   * deployment-wide `defaultRateLimitPerMinute` for an unknown/invalid key (so an enumeration probe is
   * still bounded by the coarse default). Cached for a short TTL so the dynamic limiter — which runs on
   * EVERY mint request — does not issue a DB read per request. Never throws.
   */
  public async ResolvePerInstanceRateLimit(widgetKey: string): Promise<number> {
    const key = (widgetKey ?? '').trim();
    const fallback = this.config.defaultRateLimitPerMinute;
    if (!key) {
      return fallback;
    }
    const cached = this.rateLimitCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAtMs > now) {
      return cached.limit;
    }
    let limit = fallback;
    try {
      const contextUser = this.resolveLookupUser();
      if (contextUser) {
        const widget = await this.loadWidgetByKey(key, contextUser);
        if (widget && widget.RateLimitPerMinute > 0) {
          limit = widget.RateLimitPerMinute;
        }
      }
    } catch (e) {
      LogError(e);
    }
    this.rateLimitCache.set(key, { limit, expiresAtMs: now + WidgetSessionService.RATE_LIMIT_CACHE_TTL_MS });
    return limit;
  }

  /**
   * W5 magic-link upgrade — "Verify it's you". For a widget whose AuthStrategy is `MagicLinkUpgrade`,
   * a guest supplies their email and we issue a single-use **email-mode** magic-link invite scoped to
   * the widget's Application (under the server principal — `CreateInvite` is Owner-gated). The visitor
   * clicks the emailed link → the existing public `POST /magic-link/redeem` mints a VERIFIED session
   * JWT → the widget swaps it in via `transport.UpdateToken`, preserving the live conversationId.
   *
   * This converges on the SAME `AuthProviderFactory` + `buildMagicLinkSessionUser` path as the guest
   * mint (D1), so the verified session is just a more-privileged principal on the one pathway. Never
   * throws for business failures — returns a structured result.
   */
  public async RequestUpgrade(input: UpgradeGuestSessionInput): Promise<UpgradeGuestSessionResult> {
    try {
      const email = (input.email ?? '').trim();
      if (!isLikelyEmail(email)) {
        return { success: false, errorCode: 'invalid_email', error: 'A valid email is required.' };
      }
      const contextUser = this.resolveLookupUser();
      if (!contextUser) {
        return { success: false, errorCode: 'server_error', error: 'Server not configured for widget sessions.' };
      }
      const widget = await this.loadWidgetByKey(input.widgetKey, contextUser);
      if (!widget) {
        return { success: false, errorCode: 'not_found', error: 'Unknown widget key.' };
      }
      const eligibility = evaluateWidgetMint({ Status: widget.Status, AllowedOrigins: widget.AllowedOrigins, Modality: widget.Modality }, input.origin);
      if (!eligibility.ok) {
        return { success: false, errorCode: eligibility.errorCode, error: 'Widget upgrade rejected.' };
      }
      if (widget.AuthStrategy !== 'MagicLinkUpgrade') {
        return { success: false, errorCode: 'upgrade_not_enabled', error: 'This widget does not offer magic-link upgrade.' };
      }
      const magicLinkConfig = configInfo.magicLink;
      if (!magicLinkConfig) {
        LogError('[Widget] Upgrade requested but magicLink config is absent.');
        return { success: false, errorCode: 'server_error', error: 'Identity verification is not configured.' };
      }
      const service = new MagicLinkService(this.publicUrl, magicLinkConfig);
      const result = await service.CreateInvite({ email, applicationId: widget.ApplicationID }, contextUser);
      if (!result.success) {
        LogError(`[Widget] Upgrade invite failed for widget ${widget.ID}: ${result.error ?? result.errorCode ?? 'unknown'}`);
        return { success: false, errorCode: 'server_error', error: 'Could not start identity verification.' };
      }
      // Deliberately do NOT echo the raw token/redemption URL to the public caller — the verified link
      // is delivered out-of-band by email so a widget-key holder cannot mint verified sessions at will.
      return { success: true, emailSent: result.emailSent ?? false };
    } catch (e) {
      LogError(e);
      return { success: false, errorCode: 'server_error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Verifies a host-identity assertion for a HostIdentity widget against the host's
   * registered public key (config interim store, keyed by widget PublicKey). Fails closed
   * when the key is absent or the assertion is missing/invalid.
   */
  private verifyHost(widget: MJConversationWidgetInstanceEntity, assertion: string | undefined): HostAssertedIdentity | null {
    // Prefer the per-instance HostPublicKey column (Phase 3 — no config-resident keys); fall back to the
    // interim config map (keyed by PublicKey) for deployments that haven't migrated their key yet.
    const hostKey = widget.HostPublicKey ?? this.config.hostPublicKeys?.[widget.PublicKey];
    const result = verifyHostAssertion(assertion, hostKey, widget.PublicKey);
    if (result.ok && result.identity) {
      return result.identity;
    }
    LogError(`[Widget] Host assertion rejected for widget ${widget.ID}: ${result.errorCode ?? 'unknown'}`);
    return null;
  }

  /** Builds + signs the guest JWT for an eligible widget instance. */
  private mintToken(
    widget: MJConversationWidgetInstanceEntity,
    guestRoleName: string,
    hostIdentity?: HostAssertedIdentity,
    returningVisitor?: ReturningVisitorResolution,
    resolvedIdentity?: ResolvedVisitorIdentity,
  ): MintGuestSessionResult {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlMinutes = widget.SessionTTLMinutes || this.config.defaultSessionTtlMinutes;
    // Generated once and returned to the client: the widget stamps Conversation.ExternalID with
    // this id so the Widget Guest RLS filters ({{ScopeResourceID}}) isolate this guest's rows.
    const sessionId = generateSessionId();
    const claims = buildWidgetGuestClaims({
      issuer: this.publicUrl,
      audience: this.config.audience,
      widgetId: widget.ID,
      sessionId,
      anonymousEmail: this.config.anonymousEmail,
      applicationId: widget.ApplicationID,
      guestRoleName,
      nowSeconds,
      ttlSeconds: ttlMinutes * 60,
      hostIdentity,
      // RV1/RV2/RV4: carry the returning-visitor anchor + resolved identity as claims so the voice path
      // (server-created conversation) stamps the same fields the text path stamps client-side.
      returningVisitor: returningVisitor
        ? {
            visitorKey: returningVisitor.visitorKey,
            lastConversationId: returningVisitor.lastConversationId,
            linkedEntityId: resolvedIdentity?.entityId,
            linkedRecordId: resolvedIdentity?.recordId,
          }
        : undefined,
    });
    const token = MagicLinkKeyManager.Instance.Sign(claims);
    return {
      success: true,
      token,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      widgetId: widget.ID,
      applicationId: widget.ApplicationID,
      pinnedAgentId: widget.PinnedAgentID,
      modality: widget.Modality,
      sessionId,
      // Phase 2: which interactive channels this widget may attach during a voice session. Read from the
      // per-instance EnabledChannels column (added by the Widget_Public_Hardening migration + CodeGen).
      enabledChannels: parseEnabledChannels(widget.EnabledChannels),
      voiceMaxSessionMinutes: widget.VoiceMaxSessionMinutes ?? undefined,
      rememberReturningVisitors: !!returningVisitor,
      visitorKey: returningVisitor?.visitorKey,
      lastConversationId: returningVisitor?.lastConversationId,
      linkedEntityId: resolvedIdentity?.entityId,
      linkedRecordId: resolvedIdentity?.recordId,
    };
  }

  /**
   * RV4 (host-identity path): when a `HostIdentity` widget asserts a resolvable identity AND remembering
   * is on, resolve the asserted email to a polymorphic record and merge the visitor's prior anonymous
   * trail onto it. Returns the resolved pair (so the client stamps the new conversation), or undefined
   * when not applicable or no record matched. Best-effort — never blocks the mint.
   */
  private async resolveHostIdentityIfApplicable(
    widget: MJConversationWidgetInstanceEntity,
    hostIdentity: HostAssertedIdentity | undefined,
    returningVisitor: ReturningVisitorResolution | undefined,
    contextUser: UserInfo,
  ): Promise<ResolvedVisitorIdentity | undefined> {
    if (!widget.RememberReturningVisitors || !hostIdentity?.email || !returningVisitor?.visitorKey) {
      return undefined;
    }
    // global-provider-ok: server-side mint under the single default provider.
    const identity = await resolveIdentityByEmail(hostIdentity.email, contextUser, Metadata.Provider, this.config.identityResolution);
    if (!identity) {
      return undefined;
    }
    await mergeVisitorIdentity({
      visitorKey: returningVisitor.visitorKey,
      applicationId: widget.ApplicationID,
      identity,
      contextUser,
      provider: Metadata.Provider,
    });
    return identity;
  }

  /**
   * RV4 (magic-link upgrade path): after a visitor verifies their identity, promote their anonymous
   * trail to the verified record. Called from the AUTHENTICATED route with the verified session's email,
   * so the resolved record is the deployment-configured target for that email (default: the MJ User).
   * Validates the widget + origin + opt-in + key, then resolves and merges. Never throws.
   */
  public async ResolveVisitorIdentity(input: ResolveVisitorIdentityInput): Promise<ResolveVisitorIdentityResult> {
    try {
      const gate = await this.gateVisitorPrivacyRequest(input.widgetKey, input.visitorKey, input.origin);
      if (!gate.ok) {
        return { success: false, errorCode: gate.errorCode, error: gate.error };
      }
      const identity = await resolveIdentityByEmail(input.verifiedEmail, gate.contextUser, Metadata.Provider, this.config.identityResolution);
      if (!identity) {
        // Verified, but no record matches the email under the configured target — nothing to merge.
        return { success: true, mergedConversations: 0 };
      }
      const mergedConversations = await mergeVisitorIdentity({
        visitorKey: input.visitorKey,
        applicationId: gate.widget.ApplicationID,
        identity,
        contextUser: gate.contextUser,
        provider: Metadata.Provider,
      });
      return { success: true, resolved: identity, mergedConversations };
    } catch (e) {
      LogError(e);
      return { success: false, errorCode: 'server_error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * RV5 "forget me": archives the visitor's auto-generated memory and clears the VisitorKey linkage for
   * this anchor in the widget's application. Public (the visitor proves possession of the durable key,
   * not an identity). Validates the widget + origin + opt-in + key, then delegates to {@link forgetVisitor}.
   */
  public async ForgetVisitor(input: ForgetVisitorInput): Promise<ForgetVisitorResult> {
    try {
      const gate = await this.gateVisitorPrivacyRequest(input.widgetKey, input.visitorKey, input.origin);
      if (!gate.ok) {
        return { success: false, errorCode: gate.errorCode, error: gate.error };
      }
      const { notesArchived, conversationsCleared } = await forgetVisitor({
        visitorKey: input.visitorKey,
        applicationId: gate.widget.ApplicationID,
        contextUser: gate.contextUser,
        provider: Metadata.Provider,
      });
      return { success: true, notesArchived, conversationsCleared };
    } catch (e) {
      LogError(e);
      return { success: false, errorCode: 'server_error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Shared guard for the RV4/RV5 visitor-privacy endpoints: resolves the lookup user, loads + validates
   * the widget (status/origin), requires returning-visitor memory to be ON, and validates the presented
   * VisitorKey shape. Returns the resolved widget + context user on success, or a structured failure.
   */
  private async gateVisitorPrivacyRequest(
    widgetKey: string,
    visitorKey: string,
    origin: string | undefined,
  ): Promise<VisitorPrivacyGateResult> {
    const contextUser = this.resolveLookupUser();
    if (!contextUser) {
      return { ok: false, errorCode: 'server_error', error: 'Server not configured for widget sessions.' };
    }
    const widget = await this.loadWidgetByKey(widgetKey, contextUser);
    if (!widget) {
      return { ok: false, errorCode: 'not_found', error: 'Unknown widget key.' };
    }
    const eligibility = evaluateWidgetMint(
      { Status: widget.Status, AllowedOrigins: widget.AllowedOrigins, Modality: widget.Modality },
      origin,
    );
    if (!eligibility.ok) {
      return { ok: false, errorCode: eligibility.errorCode ?? 'server_error', error: 'Widget request rejected.' };
    }
    if (!widget.RememberReturningVisitors) {
      return { ok: false, errorCode: 'upgrade_not_enabled', error: 'Returning-visitor memory is not enabled for this widget.' };
    }
    if (!VISITOR_KEY_PATTERN.test((visitorKey ?? '').trim())) {
      return { ok: false, errorCode: 'not_found', error: 'A valid visitorKey is required.' };
    }
    return { ok: true, widget, contextUser };
  }

  /**
   * Resolves the returning-visitor anchor for a mint (RV1). Returns undefined when the widget does NOT
   * opt in (RememberReturningVisitors off) — the default, fully-off path: no cookie, no chaining.
   * When on: validates the presented key (else mints a fresh one) and, for a returning key, finds the
   * visitor's most-recent prior conversation in this widget's application to chain from. Best-effort:
   * a lookup failure degrades to "no prior conversation" rather than blocking the session.
   */
  private async resolveReturningVisitor(
    widget: MJConversationWidgetInstanceEntity,
    presentedKey: string | undefined,
    contextUser: UserInfo,
  ): Promise<ReturningVisitorResolution | undefined> {
    if (!widget.RememberReturningVisitors) {
      return undefined;
    }
    const presented = (presentedKey ?? '').trim();
    const isReturning = VISITOR_KEY_PATTERN.test(presented);
    const visitorKey = isReturning ? presented : generateSessionId();
    const lastConversationId = isReturning
      ? await this.findPreviousConversationByVisitorKey(visitorKey, widget.ApplicationID, contextUser)
      : undefined;
    return { visitorKey, lastConversationId };
  }

  /**
   * Recaps the visitor's prior conversation when they return (RV2, text path). No-op unless this is a
   * returning visit (a resolved `lastConversationId`). Delegates to the shared, idempotent,
   * best-effort {@link writeReturningVisitorRecap}, attributing the recap to the widget's pinned agent
   * and stamping the widget's `VisitorMemoryRetentionDays` as the note's expiry. Awaited so the recap
   * note exists before the new session's memory injection (RV3) runs; the recap's own idempotency
   * bounds the LLM cost to the first return after each prior conversation.
   */
  private async recapPriorConversationIfNeeded(
    widget: MJConversationWidgetInstanceEntity,
    returningVisitor: ReturningVisitorResolution | undefined,
    contextUser: UserInfo,
  ): Promise<void> {
    const priorConversationId = returningVisitor?.lastConversationId;
    if (!priorConversationId) {
      return;
    }
    // global-provider-ok: server-side mint under the single default provider (same rationale as resolveGuestRoleName).
    await writeReturningVisitorRecap(
      priorConversationId,
      widget.PinnedAgentID,
      contextUser,
      Metadata.Provider,
      widget.VisitorMemoryRetentionDays,
    );
  }

  /**
   * Finds the visitor's most-recent prior conversation for a VisitorKey, scoped to the widget's
   * application so a key can never resolve a conversation from a different deployment. Returns the
   * id or undefined (first visit, or read failure — never throws).
   */
  private async findPreviousConversationByVisitorKey(
    visitorKey: string,
    applicationId: string,
    contextUser: UserInfo,
  ): Promise<string | undefined> {
    const rv = new RunView();
    const result = await rv.RunView<MJConversationEntity>(
      {
        EntityName: CONVERSATIONS_ENTITY,
        // visitorKey is validated base64url ([A-Za-z0-9_-]) so the literal is injection-safe; applicationId
        // is a server-trusted UUID. Scope to the application to prevent cross-widget anchor reuse.
        ExtraFilter: `VisitorKey = '${visitorKey}' AND ApplicationID = '${applicationId.replace(/'/g, "''")}'`,
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 1,
        Fields: ['ID'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      LogError(`[Widget] Returning-visitor lookup failed: ${result.ErrorMessage}`);
      return undefined;
    }
    return result.Results?.[0]?.ID ?? undefined;
  }

  /** Loads a single widget instance by its public key (read-only, simple result). */
  private async loadWidgetByKey(widgetKey: string, contextUser: UserInfo): Promise<MJConversationWidgetInstanceEntity | null> {
    const key = (widgetKey ?? '').trim();
    if (!key) {
      return null;
    }
    const rv = new RunView();
    const result = await rv.RunView<MJConversationWidgetInstanceEntity>(
      {
        EntityName: WIDGET_ENTITY,
        ExtraFilter: `PublicKey = '${key.replace(/'/g, "''")}'`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!result.Success) {
      LogError(`[Widget] Failed to load widget by key: ${result.ErrorMessage}`);
      return null;
    }
    return result.Results?.[0] ?? null;
  }

  /** Resolves the guest role's NAME from its id (claims carry the name, not the id). */
  private resolveGuestRoleName(guestRoleId: string): string | null {
    const md = Metadata.Provider; // global-provider-ok: pre-auth server-side mint under the single default provider
    const role = md?.Roles.find((r) => UUIDsEqual(r.ID, guestRoleId));
    return role?.Name ?? null;
  }

  /** Resolves the server-side context user used to READ widget config (not the guest principal). */
  private resolveLookupUser(): UserInfo | null {
    const candidate = this.config.contextUserForLookup;
    if (candidate) {
      const byName = UserCache.Instance.UserByName(candidate);
      if (byName) {
        return byName;
      }
      LogError(`[Widget] Configured lookup user '${candidate}' not found; falling back to system/Owner.`);
    }
    return (
      UserCache.Instance.GetSystemUser() ??
      UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ??
      null
    );
  }

  /**
   * Best-effort structured audit of a mint attempt. Never alters the result — losing
   * an audit line must not change whether a visitor got (or was denied) a session.
   * (A dedicated `MJ: Widget Session` audit entity is a follow-on; for now this is a
   * structured log line carrying the same forensics as the magic-link redemption row.)
   */
  private audited(result: MintGuestSessionResult, input: MintGuestSessionInput, widget: MJConversationWidgetInstanceEntity | null): MintGuestSessionResult {
    try {
      LogStatus(
        `[Widget][audit] mint outcome=${result.success ? 'success' : result.errorCode} ` +
        `widget=${widget?.ID ?? 'unknown'} origin=${input.audit?.origin ?? input.origin ?? '-'} ` +
        `ip=${input.audit?.ipAddress ?? '-'}`,
      );
    } catch {
      /* audit is best-effort */
    }
    return result;
  }
}
