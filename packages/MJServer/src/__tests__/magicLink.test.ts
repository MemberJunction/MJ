import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createPublicKey, type JsonWebKey } from 'node:crypto';
import {
  GenerateRawToken,
  HashToken,
  EvaluateInvite,
  BuildSessionClaims,
  CanIssueInvites,
  IsRoleGrantable,
  UnionScopes,
  MAGIC_LINK_TOKEN_PREFIX,
} from '../auth/magicLink/magicLinkCore.js';
import { BuildRedeemLandingHtml, EscapeHtml } from '../auth/magicLink/redeemLanding.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';

describe('magic-link core', () => {
  describe('generateRawToken', () => {
    it('prefixes tokens and uses 32 bytes of hex entropy', () => {
      const t = GenerateRawToken();
      expect(t.startsWith(MAGIC_LINK_TOKEN_PREFIX)).toBe(true);
      const body = t.slice(MAGIC_LINK_TOKEN_PREFIX.length);
      expect(body).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces unique tokens', () => {
      const set = new Set(Array.from({ length: 100 }, () => GenerateRawToken()));
      expect(set.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('is deterministic and base64url-encoded sha256 (43 chars, URL-safe alphabet)', () => {
      const raw = 'mj_ml_abc';
      expect(HashToken(raw)).toBe(HashToken(raw));
      // base64url of 32 bytes = 43 chars, no padding, only [A-Za-z0-9_-]
      expect(HashToken(raw)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('differs for different inputs and never equals the raw token', () => {
      const raw = GenerateRawToken();
      expect(HashToken(raw)).not.toBe(HashToken(GenerateRawToken()));
      expect(HashToken(raw)).not.toBe(raw);
    });
  });

  describe('evaluateInvite', () => {
    const now = Date.UTC(2026, 0, 1);
    const future = new Date(now + 3600_000);
    const past = new Date(now - 3600_000);

    it('accepts an active, unexpired, unused invite', () => {
      expect(EvaluateInvite({ Status: 'Active', ExpiresAt: future, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: true });
    });

    it('rejects revoked invites first', () => {
      expect(EvaluateInvite({ Status: 'Revoked', ExpiresAt: future, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: false, errorCode: 'revoked' });
    });

    it('rejects expired invites', () => {
      expect(EvaluateInvite({ Status: 'Active', ExpiresAt: past, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: false, errorCode: 'expired' });
    });

    it('rejects consumed invites (by status)', () => {
      expect(EvaluateInvite({ Status: 'Consumed', ExpiresAt: future, MaxUses: 1, UseCount: 1 }, now)).toEqual({ ok: false, errorCode: 'consumed' });
    });

    it('rejects when use count reaches max', () => {
      expect(EvaluateInvite({ Status: 'Active', ExpiresAt: future, MaxUses: 3, UseCount: 3 }, now)).toEqual({ ok: false, errorCode: 'consumed' });
    });

    it('allows multi-use invites that still have uses left', () => {
      expect(EvaluateInvite({ Status: 'Active', ExpiresAt: future, MaxUses: 3, UseCount: 2 }, now)).toEqual({ ok: true });
    });

    it('rejects unknown statuses as invalid', () => {
      expect(EvaluateInvite({ Status: 'Pending', ExpiresAt: future, MaxUses: 1, UseCount: 0 }, now)).toEqual({ ok: false, errorCode: 'invalid' });
    });
  });

  describe('buildSessionClaims', () => {
    it('scopes the token to exactly the given app and role and marks it magic-link', () => {
      const claims = BuildSessionClaims({
        issuer: 'http://localhost:4051',
        audience: 'mj-magic-link',
        inviteId: 'INVITE-1',
        email: 'ext@client.com',
        firstName: 'Ext',
        lastName: 'User',
        applicationId: 'APP-1',
        roleName: 'Magic Link Baseline',
        nowSeconds: 1000,
        ttlSeconds: 3600,
      });
      expect(claims.mj_app_id).toBe('APP-1');
      expect(claims.mj_role).toBe('Magic Link Baseline');
      expect(claims.mj_magic_link).toBe(true);
      expect(claims.sub).toBe('magic-link|INVITE-1');
      expect(claims.exp - claims.iat).toBe(3600);
      expect(claims.email).toBe('ext@client.com');
      expect(claims.name).toBe('Ext User');
    });

    it('carries mj_invited_by when an inviter is supplied (attribution claim)', () => {
      const claims = BuildSessionClaims({
        issuer: 'i', audience: 'a', inviteId: 'INVITE-1', email: 'e@x.com',
        applicationId: 'APP-1', roleName: 'Magic Link Baseline',
        invitedByUserId: 'USER-42', nowSeconds: 1000, ttlSeconds: 3600,
      });
      expect(claims.mj_invited_by).toBe('USER-42');
    });

    it('omits mj_invited_by when no inviter is supplied', () => {
      const claims = BuildSessionClaims({
        issuer: 'i', audience: 'a', inviteId: 'INVITE-1', email: 'e@x.com',
        applicationId: 'APP-1', roleName: 'Magic Link Baseline',
        nowSeconds: 1000, ttlSeconds: 3600,
      });
      expect(claims.mj_invited_by).toBeUndefined();
    });

    it('always emits a single-entry mj_scopes for the current link', () => {
      const claims = BuildSessionClaims({
        issuer: 'i', audience: 'a', inviteId: 'INVITE-1', email: 'e@x.com',
        applicationId: 'APP-1', roleName: 'Magic Link Baseline', nowSeconds: 1000, ttlSeconds: 3600,
      });
      expect(claims.mj_scopes).toEqual([{ inviteId: 'INVITE-1', appId: 'APP-1', role: 'Magic Link Baseline', resourceType: undefined, resourceId: undefined }]);
    });

    it('marks anonymous sessions and carries the per-session id + prior-scope union', () => {
      const claims = BuildSessionClaims({
        issuer: 'i', audience: 'a', inviteId: 'INVITE-2', email: 'anon@x',
        applicationId: 'APP-2', roleName: 'Guest', anonymous: true, sessionId: 'SID-9',
        priorScopes: [{ inviteId: 'INVITE-1', appId: 'APP-1', role: 'Guest' }],
        nowSeconds: 1000, ttlSeconds: 3600,
      });
      expect(claims.mj_anon).toBe(true);
      expect(claims.mj_sid).toBe('SID-9');
      // union = prior + this link, both apps present, no accretion duplicate
      expect(claims.mj_scopes?.map((s) => s.appId).sort()).toEqual(['APP-1', 'APP-2']);
    });

    it('does NOT mark mj_anon for email sessions', () => {
      const claims = BuildSessionClaims({
        issuer: 'i', audience: 'a', inviteId: 'INVITE-1', email: 'e@x.com',
        applicationId: 'APP-1', roleName: 'Magic Link Baseline', nowSeconds: 1000, ttlSeconds: 3600,
      });
      expect(claims.mj_anon).toBeUndefined();
    });
  });

  describe('unionScopes', () => {
    const a = { inviteId: 'I1', appId: 'A1', role: 'R' };
    const b = { inviteId: 'I2', appId: 'A2', role: 'R' };

    it('appends a new scope entry', () => {
      expect(UnionScopes([a], b)).toEqual([a, b]);
    });

    it('is idempotent by inviteId — re-redeeming the same link never accretes a duplicate', () => {
      expect(UnionScopes([a, b], { inviteId: 'I1', appId: 'A1', role: 'R' })).toEqual([a, b]);
    });

    it('handles an empty/undefined prior union', () => {
      expect(UnionScopes(undefined, a)).toEqual([a]);
      expect(UnionScopes([], a)).toEqual([a]);
    });
  });

  describe('canIssueInvites', () => {
    it('always allows Owners, regardless of issuer-role config (case/space-insensitive)', () => {
      expect(CanIssueInvites('Owner', [], [])).toBe(true);
      expect(CanIssueInvites('  owner ', [], [])).toBe(true);
    });

    it('Owner-only by default: a non-Owner with no configured issuer roles is denied', () => {
      expect(CanIssueInvites('User', ['Developer', 'Magic Link Baseline'], [])).toBe(false);
    });

    it('denies an external user holding the restricted role (the escalation we are blocking)', () => {
      // restricted role is never an issuer role, so this stays false even if someone
      // mistakenly leaves issuerRoleNames empty
      expect(CanIssueInvites('User', ['Magic Link Baseline'], [])).toBe(false);
    });

    it('allows a non-Owner only when one of their roles is a configured issuer role', () => {
      expect(CanIssueInvites('User', ['Sales Admin'], ['Sales Admin'])).toBe(true);
      expect(CanIssueInvites('User', ['sales admin'], ['Sales Admin'])).toBe(true); // case-insensitive
      expect(CanIssueInvites('User', ['Marketing'], ['Sales Admin'])).toBe(false);
    });

    it('handles null/undefined type and empty role lists safely', () => {
      expect(CanIssueInvites(null, [], ['X'])).toBe(false);
      expect(CanIssueInvites(undefined, ['X'], ['X'])).toBe(true);
    });
  });

  describe('isRoleGrantable', () => {
    const restricted = 'Magic Link Baseline';

    it('always allows the restricted role (case/space-insensitive)', () => {
      expect(IsRoleGrantable('Magic Link Baseline', restricted, [])).toBe(true);
      expect(IsRoleGrantable(' magic link baseline ', restricted, [])).toBe(true);
    });

    it('rejects a privileged role by default — blocks roleId=Owner escalation', () => {
      expect(IsRoleGrantable('Owner', restricted, [])).toBe(false);
      expect(IsRoleGrantable('Administrator', restricted, [])).toBe(false);
    });

    it('allows additional roles only when explicitly opted in', () => {
      expect(IsRoleGrantable('Read Only Guest', restricted, ['Read Only Guest'])).toBe(true);
      expect(IsRoleGrantable('read only guest', restricted, ['Read Only Guest'])).toBe(true);
      expect(IsRoleGrantable('Owner', restricted, ['Read Only Guest'])).toBe(false);
    });

    it('rejects empty/null role names', () => {
      expect(IsRoleGrantable('', restricted, [])).toBe(false);
      expect(IsRoleGrantable(null, restricted, [])).toBe(false);
    });
  });

  describe('escapeHtml', () => {
    it('escapes the five significant HTML characters', () => {
      expect(EscapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    });

    it('leaves a normal magic-link token untouched', () => {
      const t = GenerateRawToken();
      expect(EscapeHtml(t)).toBe(t);
    });
  });

  describe('buildRedeemLandingHtml', () => {
    const token = GenerateRawToken();
    const html = BuildRedeemLandingHtml(token, '/magic-link/redeem');

    it('renders a POST form to the redeem path (GET stays side-effect-free)', () => {
      expect(html).toContain('method="POST"');
      expect(html).toContain('action="/magic-link/redeem"');
    });

    it('carries the token in a hidden field for the click-to-continue submit', () => {
      expect(html).toContain(`name="token" value="${token}"`);
    });

    it('requires a human click — it does NOT auto-submit (defeats link scanners)', () => {
      expect(html).not.toContain('.submit()');
      expect(html).not.toContain('onload');
    });

    it('discourages indexing', () => {
      expect(html).toContain('name="robots"');
    });

    it('escapes a token containing HTML metacharacters into the form value', () => {
      const evil = BuildRedeemLandingHtml('a"><script>x</script>', '/magic-link/redeem');
      expect(evil).not.toContain('<script>x</script>');
      expect(evil).toContain('&lt;script&gt;');
    });
  });
});

describe('MagicLinkKeyManager', () => {
  it('mints an RS256 token verifiable against the published JWKS, with a matching kid', () => {
    const km = MagicLinkKeyManager.Instance;
    km.Initialize(); // ephemeral keypair

    const claims = BuildSessionClaims({
      issuer: 'http://localhost:4051',
      audience: 'mj-magic-link',
      inviteId: 'INVITE-1',
      email: 'ext@client.com',
      applicationId: 'APP-1',
      roleName: 'Magic Link Baseline',
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
    const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
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
    const claims = BuildSessionClaims({
      issuer: 'http://localhost:4051',
      audience: 'mj-magic-link',
      inviteId: 'INVITE-2',
      email: 'ext@client.com',
      applicationId: 'APP-1',
      roleName: 'Magic Link Baseline',
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 3600,
    });
    const token = km.Sign(claims);
    const publicKey = createPublicKey({ key: km.GetJWKS().keys[0] as unknown as JsonWebKey, format: 'jwk' });

    // Flip a character in the payload segment.
    const parts = token.split('.');
    parts[1] = parts[1].slice(0, -2) + (parts[1].endsWith('A') ? 'BB' : 'AA');
    const tampered = parts.join('.');

    expect(() => jwt.verify(tampered, publicKey, { algorithms: ['RS256'] })).toThrow();
  });
});
