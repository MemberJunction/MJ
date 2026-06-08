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
import { LogStatus } from '@memberjunction/core';
import { createPrivateKey, createPublicKey, generateKeyPairSync, createHash, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { MagicLinkJWTClaims } from './types.js';

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

  public get Kid(): string {
    return this._kid;
  }

  /**
   * Initializes the keypair from a provided PEM (raw or base64-encoded) or, if
   * none is supplied, generates an ephemeral 2048-bit RSA keypair. Idempotent.
   */
  public Initialize(privateKeyPem?: string): void {
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
      LogStatus(
        '[MagicLink] No rsaPrivateKey configured — generated an EPHEMERAL RS256 keypair. ' +
        'Outstanding magic-link sessions will be invalidated on restart. Set magicLink.rsaPrivateKey ' +
        '(or MJ_MAGIC_LINK_PRIVATE_KEY) for stable production keys.'
      );
    }

    this.privateKeyPem = priv.export({ type: 'pkcs8', format: 'pem' }) as string;
    this.publicKey = createPublicKey(priv);
    this._kid = this.computeKid(this.publicKey);
    this._initialized = true;
  }

  /**
   * Signs a set of magic-link claims and returns the compact JWT.
   * `iat`/`exp` are expected to already be set on the claims.
   */
  public Sign(claims: MagicLinkJWTClaims): string {
    this.ensureInitialized();
    return jwt.sign(claims, this.privateKeyPem, { algorithm: 'RS256', keyid: this._kid });
  }

  /**
   * Returns the JWKS document (public key set) for the JWKS endpoint.
   */
  public GetJWKS(): { keys: PublishedJWK[] } {
    this.ensureInitialized();
    const jwk = this.publicKey!.export({ format: 'jwk' });
    return { keys: [{ ...jwk, kid: this._kid, use: 'sig', alg: 'RS256' }] };
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
