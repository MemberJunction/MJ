/**
 * @fileoverview RS256 key manager for magic-link session JWTs.
 *
 * MJ signs magic-link session tokens with an RS256 private key and publishes the
 * matching public key at a JWKS endpoint. Registering the `magic-link` auth
 * provider with that JWKS URL lets MJServer's standard issuer-driven validation
 * verify the tokens with no special-casing.
 *
 * @module @memberjunction/server/auth/magicLink
 */

import { BaseSingleton } from '@memberjunction/global';
import { LogStatusEx, LogWarning } from '@memberjunction/core';
import { createPrivateKey, createPublicKey, generateKeyPairSync, createHash, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { MagicLinkJWTClaims } from './types.js';

/**
 * True when the process is NOT running with `NODE_ENV=production`. This is the same
 * production/local-dev line MJServer already uses to forbid local dev auth in production.
 */
export function IsMagicLinkLocalDevEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV?.trim().toLowerCase() !== 'production';
}

/** Warning logged when a non-local-dev server falls back to an ephemeral keypair. */
export const EPHEMERAL_MAGIC_LINK_KEY_WARNING =
  '[MagicLink] No rsaPrivateKey configured and NODE_ENV=production — generated an EPHEMERAL RS256 keypair. ' +
  'Magic-link session tokens signed with it will stop validating when this process restarts, and they will not ' +
  'validate on any other MJAPI instance behind the same load balancer, because each process generates its own key. ' +
  'To fix, generate one RSA private key (e.g. `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048`) and set it ' +
  'as magicLink.rsaPrivateKey in mj.config.cjs or as MJ_MAGIC_LINK_PRIVATE_KEY (raw or base64-encoded PEM), ' +
  'using the same key on every instance.';

/** A single JSON Web Key plus the metadata jwks-rsa needs to match it. */
interface PublishedJWK extends JsonWebKey {
  kid: string;
  use: 'sig';
  alg: 'RS256';
}

/**
 * Manages the RS256 keypair used to sign and publish magic-link session tokens.
 * Singleton so the keypair (and therefore the `kid`) is stable for the process
 * lifetime — restarting with an ephemeral key invalidates outstanding sessions,
 * which is the intended dev behavior and an acceptable production key-rotation
 * mechanism.
 */
export class MagicLinkKeyManager extends BaseSingleton<MagicLinkKeyManager> {
  private privateKeyPem = '';
  private publicKey?: KeyObject;
  private _kid = '';
  private _initialized = false;
  private _isEphemeral = false;

  // Public to satisfy BaseSingleton.getInstance's `this: new () => T` constraint
  // (matches the AuthProviderFactory singleton pattern).
  public constructor() {
    super();
  }

  public static get Instance(): MagicLinkKeyManager {
    return MagicLinkKeyManager.getInstance<MagicLinkKeyManager>();
  }

  public get IsInitialized(): boolean {
    return this._initialized;
  }

  /**
   * True when no private key was configured and the keypair was generated for this process
   * only. Tokens signed with an ephemeral key do not survive a restart and do not validate on
   * other instances. Downstream code should ask this rather than reading the raw config value.
   */
  public get IsEphemeral(): boolean {
    return this._isEphemeral;
  }

  public get Kid(): string {
    return this._kid;
  }

  /**
   * Initializes the keypair from a provided PEM (raw or base64-encoded) or, if
   * none is supplied, generates an ephemeral 2048-bit RSA keypair. Idempotent.
   *
   * @param env - process environment used to decide whether the ephemeral fallback is a local-dev
   *   default (verbose-only notice) or a production misconfiguration (warning). Defaults to `process.env`.
   */
  public Initialize(privateKeyPem?: string, env: NodeJS.ProcessEnv = process.env): void {
    if (this._initialized) {
      return;
    }

    let priv: KeyObject;
    const supplied = privateKeyPem?.trim();
    if (supplied) {
      priv = createPrivateKey(this.normalizePem(supplied));
    } else {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      priv = privateKey;
      this._isEphemeral = true;
      this.reportEphemeralKey(env);
    }

    this.privateKeyPem = priv.export({ type: 'pkcs8', format: 'pem' }) as string;
    this.publicKey = createPublicKey(priv);
    this._kid = this.computeKid(this.publicKey);
    this._initialized = true;
  }

  /**
   * Signs a set of magic-link (or local-dev) claims and returns the compact JWT.
   * `iat`/`exp` are expected to already be set on the claims.
   */
  public Sign<T extends object>(claims: T): string {
    this.ensureInitialized();
    return jwt.sign(claims, this.privateKeyPem, { algorithm: 'RS256', keyid: this._kid });
  }

  /**
   * Verifies a magic-link session JWT signed by this key manager (`RS256`, `mj_magic_link === true`).
   * Returns `null` if invalid, expired, or forged.
   */
  public VerifySessionToken(
    token: string,
    options?: { issuer?: string; audience?: string },
  ): MagicLinkJWTClaims | null {
    this.ensureInitialized();
    try {
      const publicPem = this.publicKey!.export({ type: 'spki', format: 'pem' }) as string;
      const verifyOptions: jwt.VerifyOptions = { algorithms: ['RS256'] };
      if (options?.issuer) {
        verifyOptions.issuer = options.issuer;
      }
      if (options?.audience) {
        verifyOptions.audience = options.audience;
      }
      const decoded = jwt.verify(token, publicPem, verifyOptions);
      if (!decoded || typeof decoded !== 'object') {
        return null;
      }
      const claims = decoded as MagicLinkJWTClaims;
      if (claims.mj_magic_link !== true || typeof claims.sub !== 'string') {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }

  /**
   * Signs a redirect binding JWT (`mj_purpose = 'magic-link-redirect'`) that cryptographically
   * binds a validated `redirectUrl` to a specific invite's `tokenHash`.
   *
   * Note: Expiration is intentionally omitted from the redirect binding JWT because the database
   * invite row's `ExpiresAt` (enforced atomically during `RedeemInvite`) is the authoritative,
   * mutable expiration — allowing `UpdateInviteExpiry()` to extend an invite without invalidating
   * an already-delivered `&rt=` parameter.
   */
  public SignRedirectBinding(tokenHash: string, redirectUrl: string, _expiresAtEpochSeconds?: number): string {
    this.ensureInitialized();
    const nowSeconds = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        mj_purpose: 'magic-link-redirect',
        mj_th: tokenHash,
        mj_redirect: redirectUrl,
        iat: nowSeconds,
      },
      this.privateKeyPem,
      { algorithm: 'RS256', keyid: this._kid },
    );
  }

  /**
   * Verifies a redirect binding JWT produced by {@link SignRedirectBinding} and ensures it matches
   * `expectedTokenHash` (preventing cross-invite substitution) and carries a valid `http(s)` URL.
   * Ignores JWT `exp` so bindings minted before an `UpdateInviteExpiry()` extension remain valid
   * while the underlying invite row is valid. Returns the bound URL or `null`.
   */
  public VerifyRedirectBinding(bindingToken: string, expectedTokenHash: string): string | null {
    this.ensureInitialized();
    try {
      const publicPem = this.publicKey!.export({ type: 'spki', format: 'pem' }) as string;
      const decoded = jwt.verify(bindingToken, publicPem, {
        algorithms: ['RS256'],
        ignoreExpiration: true,
      });
      if (!decoded || typeof decoded !== 'object') {
        return null;
      }
      const record = decoded as { mj_purpose?: string; mj_th?: string; mj_redirect?: string };
      if (
        record.mj_purpose !== 'magic-link-redirect' ||
        record.mj_th !== expectedTokenHash ||
        typeof record.mj_redirect !== 'string' ||
        !record.mj_redirect
      ) {
        return null;
      }
      const parsed = new URL(record.mj_redirect);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return record.mj_redirect;
    } catch {
      return null;
    }
  }

  /**
   * Returns the JWKS document (public key set) for the JWKS endpoint.
   */
  public GetJWKS(): { keys: PublishedJWK[] } {
    this.ensureInitialized();
    const jwk = this.publicKey!.export({ format: 'jwk' });
    return { keys: [{ ...jwk, kid: this._kid, use: 'sig', alg: 'RS256' }] };
  }

  /**
   * Local dev (NODE_ENV not 'production'): the ephemeral fallback is the designed behavior and
   * fires on every boot, so the notice stays verbose-only. Otherwise it is a data-loss-on-restart
   * misconfiguration, so it is a warning in the default output.
   */
  private reportEphemeralKey(env: NodeJS.ProcessEnv): void {
    if (!IsMagicLinkLocalDevEnvironment(env)) {
      LogWarning(EPHEMERAL_MAGIC_LINK_KEY_WARNING);
      return;
    }
    LogStatusEx({
      message:
        '[MagicLink] No rsaPrivateKey configured — generated an EPHEMERAL RS256 keypair. ' +
        'Outstanding magic-link sessions will be invalidated on restart. Set magicLink.rsaPrivateKey ' +
        '(or MJ_MAGIC_LINK_PRIVATE_KEY) for stable production keys.',
      verboseOnly: true
    });
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('MagicLinkKeyManager not initialized — call Initialize() during server startup.');
    }
  }

  /** Accepts raw PEM or base64-encoded PEM and returns raw PEM. */
  private normalizePem(value: string): string {
    if (value.includes('-----BEGIN')) {
      return value;
    }
    return Buffer.from(value, 'base64').toString('utf8');
  }

  /** Stable key id derived from the public key (SHA-256 of DER, base64url, truncated). */
  private computeKid(publicKey: KeyObject): string {
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    return createHash('sha256').update(pem).digest('base64url').slice(0, 16);
  }
}
