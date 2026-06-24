import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
import {
  parseAllowedOrigins,
  isOriginAllowed,
  isModalityEnabled,
  evaluateWidgetMint,
  buildWidgetGuestClaims,
} from '../widget/widgetCore.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';

describe('widget core — parseAllowedOrigins', () => {
  it('parses a JSON array of origins', () => {
    expect(parseAllowedOrigins('["https://a.com","https://b.com"]')).toEqual(['https://a.com', 'https://b.com']);
  });

  it('tolerates a comma-separated string', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com')).toEqual(['https://a.com', 'https://b.com']);
  });

  it('normalizes case and strips trailing slashes', () => {
    expect(parseAllowedOrigins('["HTTPS://Acme.COM/"]')).toEqual(['https://acme.com']);
  });

  it('returns empty (fail-closed) for null / blank / non-array JSON', () => {
    expect(parseAllowedOrigins(null)).toEqual([]);
    expect(parseAllowedOrigins('   ')).toEqual([]);
    expect(parseAllowedOrigins('{"not":"an-array"}')).toEqual([]);
  });
});

describe('widget core — isOriginAllowed (fail-closed)', () => {
  const allowed = ['https://acme.com', 'https://www.acme.com'];

  it('accepts an exact (normalized) match', () => {
    expect(isOriginAllowed('https://acme.com', allowed)).toBe(true);
    expect(isOriginAllowed('HTTPS://ACME.COM/', allowed)).toBe(true);
  });

  it('rejects a non-listed origin', () => {
    expect(isOriginAllowed('https://evil.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://sub.acme.com', allowed)).toBe(false);
  });

  it('rejects a missing request origin', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed('', allowed)).toBe(false);
  });

  it('rejects everything when the allowlist is empty (never "*")', () => {
    expect(isOriginAllowed('https://acme.com', [])).toBe(false);
  });
});

describe('widget core — isModalityEnabled', () => {
  it('Both enables text and voice', () => {
    expect(isModalityEnabled('Both', 'Text')).toBe(true);
    expect(isModalityEnabled('Both', 'Voice')).toBe(true);
  });
  it('Text enables only text', () => {
    expect(isModalityEnabled('Text', 'Text')).toBe(true);
    expect(isModalityEnabled('Text', 'Voice')).toBe(false);
  });
  it('Voice enables only voice', () => {
    expect(isModalityEnabled('Voice', 'Voice')).toBe(true);
    expect(isModalityEnabled('Voice', 'Text')).toBe(false);
  });
});

describe('widget core — evaluateWidgetMint', () => {
  const base = { Status: 'Active', AllowedOrigins: '["https://acme.com"]', Modality: 'Both' };

  it('passes for an active widget from an allowed origin', () => {
    expect(evaluateWidgetMint(base, 'https://acme.com')).toEqual({ ok: true });
  });

  it('rejects a disabled widget', () => {
    expect(evaluateWidgetMint({ ...base, Status: 'Disabled' }, 'https://acme.com')).toEqual({
      ok: false,
      errorCode: 'disabled',
    });
  });

  it('rejects a disallowed origin', () => {
    expect(evaluateWidgetMint(base, 'https://evil.com')).toEqual({ ok: false, errorCode: 'origin_not_allowed' });
  });

  it('rejects a missing origin (fail-closed)', () => {
    expect(evaluateWidgetMint(base, undefined)).toEqual({ ok: false, errorCode: 'origin_not_allowed' });
  });
});

describe('widget core — buildWidgetGuestClaims', () => {
  const args = {
    issuer: 'https://mj.example.com',
    audience: 'mj-magic-link',
    widgetId: 'WIDGET-123',
    sessionId: 'sess-abc',
    anonymousEmail: 'anonymous@magic-link.local',
    applicationId: 'APP-1',
    guestRoleName: 'Widget Guest',
    nowSeconds: 1_000_000,
    ttlSeconds: 900,
  };

  it('marks the session anonymous + magic-link and binds the widget id', () => {
    const claims = buildWidgetGuestClaims(args);
    expect(claims.mj_anon).toBe(true);
    expect(claims.mj_magic_link).toBe(true);
    expect(claims.mj_widget_id).toBe('WIDGET-123');
  });

  it('scopes to the application + guest role and the configured anon email', () => {
    const claims = buildWidgetGuestClaims(args);
    expect(claims.mj_app_id).toBe('APP-1');
    expect(claims.mj_role).toBe('Widget Guest');
    expect(claims.email).toBe('anonymous@magic-link.local');
    expect(claims.sub).toBe('magic-link|sess-abc');
    expect(claims.mj_sid).toBe('sess-abc');
  });

  it('carries a single scope entry for the guest grant', () => {
    const claims = buildWidgetGuestClaims(args);
    expect(claims.mj_scopes).toHaveLength(1);
    expect(claims.mj_scopes?.[0]).toMatchObject({ appId: 'APP-1', role: 'Widget Guest' });
  });

  it('sets exp = iat + ttl', () => {
    const claims = buildWidgetGuestClaims(args);
    expect(claims.iat).toBe(1_000_000);
    expect(claims.exp).toBe(1_000_900);
  });
});

describe('widget core — RS256 sign + verify roundtrip (reuses MagicLinkKeyManager)', () => {
  it('mints a widget guest token that verifies against the published JWKS with the widget claim intact', () => {
    const km = MagicLinkKeyManager.Instance;
    km.Initialize(); // ephemeral keypair (idempotent if already initialized in-process)

    const claims = buildWidgetGuestClaims({
      issuer: 'https://mj.example.com',
      audience: 'mj-magic-link',
      widgetId: 'WIDGET-XYZ',
      sessionId: 'sess-roundtrip',
      anonymousEmail: 'anonymous@magic-link.local',
      applicationId: 'APP-9',
      guestRoleName: 'Widget Guest',
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 900,
    });
    const token = km.Sign(claims);

    const publicKey = createPublicKey({ key: km.GetJWKS().keys[0] as object, format: 'jwk' });
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'mj-magic-link' }) as jwt.JwtPayload;

    expect(decoded.mj_widget_id).toBe('WIDGET-XYZ');
    expect(decoded.mj_anon).toBe(true);
    expect(decoded.mj_magic_link).toBe(true);
    expect(decoded.mj_app_id).toBe('APP-9');
  });

  it('rejects a tampered widget token', () => {
    const km = MagicLinkKeyManager.Instance;
    km.Initialize();
    const claims = buildWidgetGuestClaims({
      issuer: 'https://mj.example.com',
      audience: 'mj-magic-link',
      widgetId: 'W',
      sessionId: 's',
      anonymousEmail: 'anonymous@magic-link.local',
      applicationId: 'A',
      guestRoleName: 'Widget Guest',
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 900,
    });
    const token = km.Sign(claims);
    const publicKey = createPublicKey({ key: km.GetJWKS().keys[0] as object, format: 'jwk' });
    const tampered = token.slice(0, -3) + 'AAA';
    expect(() => jwt.verify(tampered, publicKey, { algorithms: ['RS256'] })).toThrow();
  });
});
