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
import type { MJWidgetInstanceEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { generateSessionId } from '../auth/magicLink/magicLinkCore.js';
import type { WidgetConfig } from '../config.js';
import { buildWidgetGuestClaims, evaluateWidgetMint, type WidgetMintErrorCode } from './widgetCore.js';
import { verifyHostAssertion, type HostAssertedIdentity } from './host-identity.js';

const WIDGET_ENTITY = 'MJ: Widget Instances';

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
  error?: string;
  errorCode?: WidgetMintErrorCode;
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

      return this.audited(this.mintToken(widget, guestRoleName, hostIdentity), input, widget);
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

  /**
   * Verifies a host-identity assertion for a HostIdentity widget against the host's
   * registered public key (config interim store, keyed by widget PublicKey). Fails closed
   * when the key is absent or the assertion is missing/invalid.
   */
  private verifyHost(widget: MJWidgetInstanceEntity, assertion: string | undefined): HostAssertedIdentity | null {
    const hostKey = this.config.hostPublicKeys?.[widget.PublicKey];
    const result = verifyHostAssertion(assertion, hostKey, widget.PublicKey);
    if (result.ok && result.identity) {
      return result.identity;
    }
    LogError(`[Widget] Host assertion rejected for widget ${widget.ID}: ${result.errorCode ?? 'unknown'}`);
    return null;
  }

  /** Builds + signs the guest JWT for an eligible widget instance. */
  private mintToken(widget: MJWidgetInstanceEntity, guestRoleName: string, hostIdentity?: HostAssertedIdentity): MintGuestSessionResult {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlMinutes = widget.SessionTTLMinutes || this.config.defaultSessionTtlMinutes;
    const claims = buildWidgetGuestClaims({
      issuer: this.publicUrl,
      audience: this.config.audience,
      widgetId: widget.ID,
      sessionId: generateSessionId(),
      anonymousEmail: this.config.anonymousEmail,
      applicationId: widget.ApplicationID,
      guestRoleName,
      nowSeconds,
      ttlSeconds: ttlMinutes * 60,
      hostIdentity,
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
    };
  }

  /** Loads a single widget instance by its public key (read-only, simple result). */
  private async loadWidgetByKey(widgetKey: string, contextUser: UserInfo): Promise<MJWidgetInstanceEntity | null> {
    const key = (widgetKey ?? '').trim();
    if (!key) {
      return null;
    }
    const rv = new RunView();
    const result = await rv.RunView<MJWidgetInstanceEntity>(
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
  private audited(result: MintGuestSessionResult, input: MintGuestSessionInput, widget: MJWidgetInstanceEntity | null): MintGuestSessionResult {
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
