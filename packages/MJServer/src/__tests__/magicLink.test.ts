import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
import {
  generateRawToken,
  hashToken,
  evaluateInvite,
  buildSessionClaims,
  buildConsumeInviteSQL,
  canIssueInvites,
  isRoleGrantable,
  MAGIC_LINK_TOKEN_PREFIX,
} from '../auth/magicLink/magicLinkCore.js';
import { buildRedeemLandingHtml, escapeHtml } from '../auth/magicLink/redeemLanding.js';
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

  describe('buildConsumeInviteSQL', () => {
    const table = '[__mj].[MagicLinkInvite]';
    const sql = buildConsumeInviteSQL(table);

    it('targets the supplied qualified table', () => {
      expect(sql).toContain(`UPDATE ${table} `);
    });

    it('increments UseCount', () => {
      expect(sql).toContain('UseCount = UseCount + 1');
    });

    it('stamps ConsumedAt only the first time (COALESCE preserves an existing value)', () => {
      expect(sql).toContain('ConsumedAt = COALESCE(ConsumedAt, SYSUTCDATETIME())');
    });

    it('flips Status to Consumed exactly when the last use is taken', () => {
      expect(sql).toContain("Status = CASE WHEN UseCount + 1 >= MaxUses THEN 'Consumed' ELSE Status END");
    });

    it('returns the affected row via OUTPUT INTO a table var so the caller can detect a win (exactly one row)', () => {
      // Must be OUTPUT ... INTO, not a bare OUTPUT: SQL Server forbids a bare
      // OUTPUT clause on a table with enabled triggers, and CodeGen adds an
      // __mj_UpdatedAt trigger to every MJ table. Regression guard for that bug.
      expect(sql).toContain('OUTPUT INSERTED.ID INTO @consumed');
      expect(sql).not.toMatch(/OUTPUT INSERTED\.ID(?!\s+INTO)/);
      expect(sql).toContain('SELECT ID FROM @consumed');
    });

    it('guards atomically on Active + not-exhausted + not-expired — this IS the single-use gate', () => {
      const where = sql.slice(sql.indexOf('WHERE'));
      expect(where).toContain("Status = 'Active'");
      expect(where).toContain('UseCount < MaxUses');
      expect(where).toContain('ExpiresAt > SYSUTCDATETIME()');
    });

    it('binds the invite ID as a parameter, never interpolated (injection-safe)', () => {
      expect(sql).toContain('ID = @p0');
      // The id must not be string-interpolated with quotes around a value.
      expect(sql).not.toMatch(/ID = '/);
    });

    it('is a self-contained batch: declare table var, update-with-output, select', () => {
      // Intentionally a 3-statement batch (the OUTPUT-INTO requirement). The ID is
      // still parameterized, so the batch carries no interpolated user input.
      expect(sql).toContain('DECLARE @consumed TABLE (ID UNIQUEIDENTIFIER)');
      expect(sql.match(/;/g)?.length).toBe(3);
      expect(sql.trim().endsWith(';')).toBe(true);
    });
  });

  describe('canIssueInvites', () => {
    it('always allows Owners, regardless of issuer-role config (case/space-insensitive)', () => {
      expect(canIssueInvites('Owner', [], [])).toBe(true);
      expect(canIssueInvites('  owner ', [], [])).toBe(true);
    });

    it('Owner-only by default: a non-Owner with no configured issuer roles is denied', () => {
      expect(canIssueInvites('User', ['Developer', 'External App User'], [])).toBe(false);
    });

    it('denies an external user holding the restricted role (the escalation we are blocking)', () => {
      // restricted role is never an issuer role, so this stays false even if someone
      // mistakenly leaves issuerRoleNames empty
      expect(canIssueInvites('User', ['External App User'], [])).toBe(false);
    });

    it('allows a non-Owner only when one of their roles is a configured issuer role', () => {
      expect(canIssueInvites('User', ['Sales Admin'], ['Sales Admin'])).toBe(true);
      expect(canIssueInvites('User', ['sales admin'], ['Sales Admin'])).toBe(true); // case-insensitive
      expect(canIssueInvites('User', ['Marketing'], ['Sales Admin'])).toBe(false);
    });

    it('handles null/undefined type and empty role lists safely', () => {
      expect(canIssueInvites(null, [], ['X'])).toBe(false);
      expect(canIssueInvites(undefined, ['X'], ['X'])).toBe(true);
    });
  });

  describe('isRoleGrantable', () => {
    const restricted = 'External App User';

    it('always allows the restricted role (case/space-insensitive)', () => {
      expect(isRoleGrantable('External App User', restricted, [])).toBe(true);
      expect(isRoleGrantable(' external app user ', restricted, [])).toBe(true);
    });

    it('rejects a privileged role by default — blocks roleId=Owner escalation', () => {
      expect(isRoleGrantable('Owner', restricted, [])).toBe(false);
      expect(isRoleGrantable('Administrator', restricted, [])).toBe(false);
    });

    it('allows additional roles only when explicitly opted in', () => {
      expect(isRoleGrantable('Read Only Guest', restricted, ['Read Only Guest'])).toBe(true);
      expect(isRoleGrantable('read only guest', restricted, ['Read Only Guest'])).toBe(true);
      expect(isRoleGrantable('Owner', restricted, ['Read Only Guest'])).toBe(false);
    });

    it('rejects empty/null role names', () => {
      expect(isRoleGrantable('', restricted, [])).toBe(false);
      expect(isRoleGrantable(null, restricted, [])).toBe(false);
    });
  });

  describe('escapeHtml', () => {
    it('escapes the five significant HTML characters', () => {
      expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    });

    it('leaves a normal magic-link token untouched', () => {
      const t = generateRawToken();
      expect(escapeHtml(t)).toBe(t);
    });
  });

  describe('buildRedeemLandingHtml', () => {
    const token = generateRawToken();
    const html = buildRedeemLandingHtml(token, '/magic-link/redeem');

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
      const evil = buildRedeemLandingHtml('a"><script>x</script>', '/magic-link/redeem');
      expect(evil).not.toContain('<script>x</script>');
      expect(evil).toContain('&lt;script&gt;');
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
