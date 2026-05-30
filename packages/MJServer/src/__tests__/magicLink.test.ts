import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
import {
  generateRawToken,
  hashToken,
  evaluateInvite,
  buildSessionClaims,
  MAGIC_LINK_TOKEN_PREFIX,
} from '../auth/magicLink/magicLinkCore.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';

describe('magic-link core', () => {
  describe('generateRawToken', () => {
    it('prefixes tokens and uses 32 bytes of hex entropy', () => {
      const t = generateRawToken();
      expect(t.startsWith(MAGIC_LINK_TOKEN_PREFIX)).toBe(true);
      const body = t.slice(MAGIC_LINK_TOKEN_PREFIX.length);
      expect(body).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces unique tokens', () => {
      const set = new Set(Array.from({ length: 100 }, () => generateRawToken()));
      expect(set.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('is deterministic and 64-hex (sha256)', () => {
      const raw = 'mj_ml_abc';
      expect(hashToken(raw)).toBe(hashToken(raw));
      expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('differs for different inputs and never equals the raw token', () => {
      const raw = generateRawToken();
      expect(hashToken(raw)).not.toBe(hashToken(generateRawToken()));
      expect(hashToken(raw)).not.toBe(raw);
    });
  });

  describe('evaluateInvite', () => {
    const now = Date.UTC(2026, 0, 1);
    const future = new Date(now + 3600_000);
    const past = new Date(now - 3600_000);

    it('accepts an active, unexpired, unused invite', () => {
      expect(evaluateInvite({ Status: 'Active', ExpiresAt: future, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: true });
    });

    it('rejects revoked invites first', () => {
      expect(evaluateInvite({ Status: 'Revoked', ExpiresAt: future, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: false, errorCode: 'revoked' });
    });

    it('rejects expired invites', () => {
      expect(evaluateInvite({ Status: 'Active', ExpiresAt: past, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: false, errorCode: 'expired' });
    });

    it('rejects consumed invites (by status)', () => {
      expect(evaluateInvite({ Status: 'Consumed', ExpiresAt: future, MaxUses: 1, UseCount: 1 }, now)).toEqual({ ok: false, errorCode: 'consumed' });
    });

    it('rejects when use count reaches max', () => {
      expect(evaluateInvite({ Status: 'Active', ExpiresAt: future, MaxUses: 3, UseCount: 3 }, now)).toEqual({ ok: false, errorCode: 'consumed' });
    });

    it('allows multi-use invites that still have uses left', () => {
      expect(evaluateInvite({ Status: 'Active', ExpiresAt: future, MaxUses: 3, UseCount: 2 }, now)).toEqual({ ok: true });
    });

    it('rejects unknown statuses as invalid', () => {
      expect(evaluateInvite({ Status: 'Pending', ExpiresAt: future, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: false, errorCode: 'invalid' });
    });
  });

  describe('buildSessionClaims', () => {
    it('scopes the token to exactly the given app and role and marks it magic-link', () => {
      const claims = buildSessionClaims({
        issuer: 'http://localhost:4051',
        audience: 'mj-magic-link',
        inviteId: 'INVITE-1',
        email: 'ext@client.com',
        firstName: 'Ext',
        lastName: 'User',
        applicationId: 'APP-1',
        roleName: 'External App User',
        nowSeconds: 1000,
        ttlSeconds: 3600,
      });
      expect(claims.mj_app_id).toBe('APP-1');
      expect(claims.mj_role).toBe('External App User');
      expect(claims.mj_magic_link).toBe(true);
      expect(claims.sub).toBe('magic-link|INVITE-1');
      expect(claims.exp - claims.iat).toBe(3600);
      expect(claims.email).toBe('ext@client.com');
      expect(claims.name).toBe('Ext User');
    });
  });
});

describe('MagicLinkKeyManager', () => {
  it('mints an RS256 token verifiable against the published JWKS, with a matching kid', () => {
    const km = MagicLinkKeyManager.Instance;
    km.Initialize(); // ephemeral keypair

    const claims = buildSessionClaims({
      issuer: 'http://localhost:4051',
      audience: 'mj-magic-link',
      inviteId: 'INVITE-1',
      email: 'ext@client.com',
      applicationId: 'APP-1',
      roleName: 'External App User',
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 3600,
    });
    const token = km.Sign(claims);

    const jwks = km.GetJWKS();
    expect(jwks.keys).toHaveLength(1);
    const jwk = jwks.keys[0];
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');

    // Token header kid must match the published key id (so jwks-rsa resolves it).
    const header = (jwt.decode(token, { complete: true }) as { header: { kid?: string; alg?: string } }).header;
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(jwk.kid);

    // Full verification against the public key reconstructed from the JWK.
    const publicKey = createPublicKey({ key: jwk as object, format: 'jwk' });
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'http://localhost:4051',
      audience: 'mj-magic-link',
    }) as Record<string, unknown>;
    expect(decoded.mj_magic_link).toBe(true);
    expect(decoded.mj_app_id).toBe('APP-1');
  });

  it('rejects a tampered token', () => {
    const km = MagicLinkKeyManager.Instance;
    km.Initialize();
    const claims = buildSessionClaims({
      issuer: 'http://localhost:4051',
      audience: 'mj-magic-link',
      inviteId: 'INVITE-2',
      email: 'ext@client.com',
      applicationId: 'APP-1',
      roleName: 'External App User',
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 3600,
    });
    const token = km.Sign(claims);
    const publicKey = createPublicKey({ key: km.GetJWKS().keys[0] as object, format: 'jwk' });

    // Flip a character in the payload segment.
    const parts = token.split('.');
    parts[1] = parts[1].slice(0, -2) + (parts[1].endsWith('A') ? 'BB' : 'AA');
    const tampered = parts.join('.');

    expect(() => jwt.verify(tampered, publicKey, { algorithms: ['RS256'] })).toThrow();
  });
});
