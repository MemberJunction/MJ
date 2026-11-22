/**
 * AssertTokenEmailVerified: the email_verified gate MJServer applies to a verified token
 * before it resolves or creates a user.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRequiresEmailVerified } = vi.hoisted(() => ({ mockRequiresEmailVerified: vi.fn() }));

vi.mock('@memberjunction/auth-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/auth-providers')>();
  return {
    CheckEmailVerified: actual.CheckEmailVerified,
    DescribeEmailVerifiedRefusal: actual.DescribeEmailVerifiedRefusal,
    AuthProviderFactory: { Instance: { RequiresEmailVerified: mockRequiresEmailVerified } },
  };
});

import { AssertTokenEmailVerified } from '../auth/emailVerifiedGate.js';

const ISSUER = 'https://idp.example.com/';

describe('AssertTokenEmailVerified', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockRequiresEmailVerified.mockReset().mockReturnValue(false);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('throws on email_verified false', () => {
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email: 'a@example.com', email_verified: false })).toThrow(
      'Email address is not verified by the identity provider',
    );
  });

  it('throws on the string "false"', () => {
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email_verified: 'false' })).toThrow();
  });

  it('passes on email_verified true', () => {
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email_verified: true })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes an absent claim by default', () => {
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email: 'a@example.com' })).not.toThrow();
  });

  it('throws on an absent claim when the provider requires it', () => {
    mockRequiresEmailVerified.mockReturnValue(true);
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email: 'a@example.com' })).toThrow();
    expect(mockRequiresEmailVerified).toHaveBeenCalledWith(ISSUER);
  });

  it('passes a true claim when the provider requires it', () => {
    mockRequiresEmailVerified.mockReturnValue(true);
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email_verified: true })).not.toThrow();
  });

  it('logs the issuer and reason, never the email', () => {
    expect(() => AssertTokenEmailVerified({ iss: ISSUER, email: 'a@example.com', email_verified: false })).toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain(ISSUER);
    expect(line).not.toContain('a@example.com');
  });
});
