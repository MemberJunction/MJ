import jwt, { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';

/** Why a host-assertion verification failed (mirrors the public web-widget mint error codes). */
export type HostAssertionError = 'missing' | 'bad_signature' | 'expired' | 'no_email' | 'no_key';

/** Result of verifying a host-signed identity assertion. `userInfo` is present iff `ok` is true. */
export interface HostAssertionVerifyResult {
  ok: boolean;
  userInfo?: AuthUserInfo;
  /** The host's opaque user id for the visitor (assertion `sub`) — audit correlation, not an MJ user id. */
  hostUserId?: string;
  errorCode?: HostAssertionError;
}

/**
 * Authentication provider for the public web-widget **host-identity** strategy (D1).
 *
 * When a widget is embedded in an already-authenticated host portal, the host signs a short-lived
 * RS256 assertion (with ITS OWN key) describing the visitor. Unlike Auth0/magic-link tokens — validated
 * by the standard issuer→JWKS path — a host assertion is verified against a STATIC per-widget public key
 * (stored on `WidgetInstance.HostPublicKey`) and exchanged at `POST /widget/session` for an MJ guest JWT.
 * So this provider does NOT use the JWKS machinery: it exposes {@link VerifyHostAssertion} (static-PEM
 * RS256 verification) + {@link extractUserInfo}, and the widget mint resolves it via the ClassFactory.
 *
 * It still subclasses {@link BaseAuthProvider} (and registers in the same factory) so host-identity is a
 * first-class, discoverable provider rather than ad-hoc mint code — the architecture the widget plan calls
 * for. The base constructor builds a JWKS client from `jwksUri`; host-identity has no JWKS, so callers pass
 * a placeholder `jwksUri` that is never contacted (verification goes through {@link VerifyHostAssertion}).
 */
@RegisterClass(BaseAuthProvider, 'host-identity')
export class HostIdentityProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /** Host identity never uses JWKS — config is valid as long as it names the provider. */
  override validateConfig(): boolean {
    return !!this.name;
  }

  /**
   * Verifies a host-signed RS256 assertion against the host's STATIC public key (PEM) and extracts the
   * asserted visitor identity. The assertion's `aud` must equal `expectedAudience` (the widget key, bound
   * at the host) and it must carry an `email`. Never throws — returns a structured result.
   */
  VerifyHostAssertion(
    assertion: string | undefined,
    hostPublicKeyPem: string | undefined,
    expectedAudience: string,
  ): HostAssertionVerifyResult {
    if (!assertion) {
      return { ok: false, errorCode: 'missing' };
    }
    if (!hostPublicKeyPem) {
      return { ok: false, errorCode: 'no_key' };
    }
    let payload: JwtPayload;
    try {
      payload = jwt.verify(assertion, hostPublicKeyPem, { algorithms: ['RS256'], audience: expectedAudience }) as JwtPayload;
    } catch (e) {
      // jsonwebtoken throws TokenExpiredError for expiry; everything else is a signature/format fault.
      return { ok: false, errorCode: e instanceof jwt.TokenExpiredError ? 'expired' : 'bad_signature' };
    }
    const userInfo = this.extractUserInfo(payload);
    if (!userInfo.email) {
      return { ok: false, errorCode: 'no_email' };
    }
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    return { ok: true, userInfo, hostUserId: sub };
  }

  /** Maps a verified host-assertion payload to standard MJ identity fields. */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    const email = str(payload.email);
    const firstName = str(payload.given_name) ?? str(payload['firstName']);
    const lastName = str(payload.family_name) ?? str(payload['lastName']);
    return {
      email,
      firstName,
      lastName,
      fullName: str(payload.name) ?? ([firstName, lastName].filter(Boolean).join(' ') || undefined),
      preferredUsername: email,
    };
  }
}
