/**
 * Turns whatever credential the page supplies into a held GraphQL principal:
 *   • an **invite token** (`mj_ml_…`) is REDEEMED here (`POST /magic-link/redeem?format=json`) for an
 *     anonymous session JWT;
 *   • an already-minted JWT (a `token` attribute, a widget-key guest session, or one recovered from the
 *     tab's stash) is held directly.
 *
 * Lifted from the Caliber widget's auth adapter and generalized: there is no Caliber payload in it — it
 * knows tokens, expiry and a provider, nothing about what the session is for.
 *
 * WHY NOT `@memberjunction/ng-auth-services`: its public barrel re-exports the MSAL/Auth0/Okta/Cognito/
 * WorkOS providers, each hard-importing its IdP SDK — an unacceptable payload for a one-script embed. The
 * `exp` decode below is a deliberate, documented duplication of the magic-link provider's own.
 *
 * Every seam (HTTP, provider, clock) is injected so the decision logic runs under a plain node test;
 * production wires the browser `fetch` and `GraphQLDataProvider` (`widget-auth.browser.ts`).
 */
import { LogError } from '@memberjunction/core';
import { TrimTrailingSlashes } from '@memberjunction/global';

/** Raw-invite prefix — mirrors MJ's `MAGIC_LINK_TOKEN_PREFIX`. */
export const INVITE_TOKEN_PREFIX = 'mj_ml_';

/** The redeem endpoint, relative to the MJAPI root. */
const REDEEM_PATH = '/magic-link/redeem?format=json';

/** The provider seam: production configures `GraphQLDataProvider`, specs use a fake. */
export interface AuthProviderPort {
  /** True when an authenticated principal is already held (by the host application, or a prior hold). */
  isConfigured(): boolean;
  /**
   * Holds `jwt` as the provider's bearer credential and boots MemberJunction on it. False when the provider
   * rejected it. `onRefresh` is how the provider asks for a fresh token when the server says this one is no
   * longer good; it resolves to the new token, or rejects when there is no way to renew.
   */
  configure(jwt: string, onRefresh: () => Promise<string>): Promise<boolean>;
}

/** The HTTP seam for redemption — narrow on purpose so URL/response handling stays testable. */
export type HttpPostPort = (url: string, body: Readonly<Record<string, string>>) => Promise<{ ok: boolean; json: unknown }>;

export interface WidgetAuthAdapterDeps {
  /** MJAPI root. Null in a host app that already configured auth. */
  apiUrl?: string | null;
  provider: AuthProviderPort;
  post: HttpPostPort;
  /** Renews a held token (the widget-key path); absent when the credential cannot be renewed. */
  refresh?: (() => Promise<string>) | null;
  now?: () => number;
}

/** The subset of MJ's `RedeemMagicLinkResult` the widget consumes. */
interface RedeemResponse {
  readonly success: boolean;
  readonly token?: string;
  /** `not_found | expired | consumed | revoked | invalid | provisioning_failed | server_error`. */
  readonly errorCode?: string;
}

/** Why a credential could not be held — a stable code plus words a visitor can act on. */
export interface HoldFailure {
  code: 'no-api-url' | 'redeem-failed' | 'provider-rejected';
  message: string;
}

/** The outcome of {@link WidgetAuthAdapter.Hold}. */
export type HoldResult = { held: true; jwt: string | null } | { held: false; failure: HoldFailure };

/** Shown when the anonymous session cannot be renewed. Magic-link sessions have NO refresh path by MJ's design. */
export const SESSION_EXPIRED_MESSAGE = 'This session has expired. Please start again or request a new link.';

export class WidgetAuthAdapter {
  private readonly apiUrl: string | null;
  private readonly provider: AuthProviderPort;
  private readonly post: HttpPostPort;
  private readonly refresh: (() => Promise<string>) | null;
  private readonly now: () => number;

  /** The JWT this adapter is holding, if any. */
  private heldJwt: string | null = null;

  public constructor(deps: WidgetAuthAdapterDeps) {
    // MJ's own convention carries a trailing slash (`GRAPHQL_URI: 'http://localhost:4111/'`) and a host page
    // will paste exactly that into `api-url`; normalise so path joins stay clean.
    this.apiUrl = (deps.apiUrl != null ? TrimTrailingSlashes(deps.apiUrl) : null);
    this.provider = deps.provider;
    this.post = deps.post;
    this.refresh = deps.refresh ?? null;
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Holds `credential` as the GraphQL principal, redeeming it first when it is an invite token.
   *
   * On success returns THE CREDENTIAL NOW HELD — always a session JWT, so for an invite this is the
   * redeemed token, NOT the argument (callers that persist anything must persist this, or a live
   * single-use invite would be left at rest) — or `null` when the page's own principal won (see below).
   * Never throws.
   */
  public async Hold(credential: string): Promise<HoldResult> {
    // NEVER CLOBBER: the provider is a page-wide singleton. Embedded in an application that is already
    // authenticated, reconfiguring it would sign that user out of their own app — so an existing principal
    // wins and the hold is a successful no-op. This is also why redemption is skipped: burning a single-use
    // invite would be pure loss. Nothing is reported as held: the host's credential is not ours to hand out.
    if (this.provider.isConfigured()) {
      return { held: true, jwt: null };
    }
    const redeemed = credential.startsWith(INVITE_TOKEN_PREFIX) ? await this.redeem(credential) : { jwt: credential };
    if ('failure' in redeemed) {
      return { held: false, failure: redeemed.failure };
    }
    const accepted = await this.provider.configure(redeemed.jwt, () => this.renew());
    if (!accepted) {
      return { held: false, failure: { code: 'provider-rejected', message: 'The server did not accept this session. Please try again.' } };
    }
    this.heldJwt = redeemed.jwt;
    return { held: true, jwt: redeemed.jwt };
  }

  /**
   * True when a usable principal is held. A JWT this adapter holds must still be unexpired; a principal the
   * host app owns is taken on trust (its lifecycle is the host's, not ours).
   */
  public HasPrincipal(): boolean {
    if (this.heldJwt !== null) {
      return !this.isExpired(this.heldJwt);
    }
    return this.provider.isConfigured();
  }

  /** The `exp` (epoch ms) of a JWT, or null when unreadable. Exposed so a store can bound what it remembers. */
  public ReadExpiry(jwt: string): number | null {
    const payload = this.decodePayload(jwt);
    if (payload === null) {
      return null;
    }
    const exp = payload['exp'];
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  }

  /** Asks the renewer for a fresh token and holds it; rejects (honestly) when there is no renewer. */
  private async renew(): Promise<string> {
    if (this.refresh === null) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    const next = await this.refresh();
    this.heldJwt = next;
    return next;
  }

  /**
   * True when `jwt` is expired. An UNREADABLE token (malformed, or carrying no `exp`) is treated as NOT
   * expired: it is the server's job to reject it, and guessing "expired" here would convert a server-side
   * auth question into a client-side dead-end.
   */
  private isExpired(jwt: string): boolean {
    const exp = this.ReadExpiry(jwt);
    return exp !== null && exp <= this.now();
  }

  /**
   * Decodes a JWT payload WITHOUT verifying it (the server validates via JWKS) — the widget only needs `exp`
   * to decide whether a call is worth making. base64url padding is restored and the bytes are read as UTF-8.
   */
  private decodePayload(jwt: string): Record<string, unknown> | null {
    const segment = jwt.split('.')[1];
    if (segment === undefined || segment.length === 0) {
      return null;
    }
    try {
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const parsed: unknown = JSON.parse(this.utf8FromBase64(padded));
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      // Malformed token — unreadable, not provably expired. See isExpired.
      return null;
    }
  }

  /** UTF-8-safe base64 decode (names are routinely non-ASCII; plain `atob` mangles them). */
  private utf8FromBase64(base64: string): string {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /**
   * Exchanges an invite token for a session JWT. The failure is returned, not just logged: an operator is
   * otherwise blind to a deployment-wide breakage (wrong api-url, magic links disabled, dead signing key),
   * and a visitor deserves to be told the link is spent rather than shown a blank widget.
   */
  private async redeem(inviteToken: string): Promise<{ jwt: string } | { failure: HoldFailure }> {
    // Guard BEFORE the request. Interpolating a null apiUrl yields the RELATIVE "null/magic-link/redeem…",
    // which fetch resolves against the embedding page — sending the invite token to a URL that was never
    // meant to receive it. A bare embed with no api-url cannot authenticate by any path anyway.
    if (this.apiUrl === null) {
      LogError('mj-realtime-widget: an invite token arrived but no api-url is configured, so it cannot be redeemed.');
      return { failure: { code: 'no-api-url', message: 'This widget is missing its server address (api-url).' } };
    }
    const endpoint = `${this.apiUrl}${REDEEM_PATH}`;
    let response: { ok: boolean; json: unknown };
    try {
      response = await this.post(endpoint, { token: inviteToken });
    } catch (error) {
      LogError(`mj-realtime-widget: magic-link redemption could not reach ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
      return { failure: { code: 'redeem-failed', message: 'We could not reach the server. Please check your connection and try again.' } };
    }
    const body = this.asRedeemResponse(response.json);
    if (!response.ok || body === null || !body.success || body.token === undefined) {
      LogError(
        `mj-realtime-widget: magic-link redemption failed. reason=${body?.errorCode ?? 'unreadable-response'}, httpOk=${response.ok}, endpoint=${endpoint}`
      );
      return { failure: { code: 'redeem-failed', message: DescribeRedeemFailure(body?.errorCode) } };
    }
    return { jwt: body.token };
  }

  /** Typed guard over the redeem response (no `any` — the body is untrusted network input). */
  private asRedeemResponse(raw: unknown): RedeemResponse | null {
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const rec = raw as Record<string, unknown>;
    if (typeof rec['success'] !== 'boolean') {
      return null;
    }
    return {
      success: rec['success'],
      token: typeof rec['token'] === 'string' ? rec['token'] : undefined,
      errorCode: typeof rec['errorCode'] === 'string' ? rec['errorCode'] : undefined
    };
  }
}

/** Words for a redeem failure code; the codes are the server's, the sentences are the widget's. */
export function DescribeRedeemFailure(code: string | undefined): string {
  switch (code) {
    case 'expired':
      return 'This invitation link has expired. Please request a new one.';
    case 'consumed':
      return 'This invitation link has already been used. Please request a new one.';
    case 'revoked':
      return 'This invitation link is no longer valid.';
    case 'not_found':
    case 'invalid':
      return 'This invitation link is not valid. Please check it or request a new one.';
    default:
      return 'We could not start your session from this link. Please try again or request a new one.';
  }
}
