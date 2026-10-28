import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { mockVerifyUserRecord, mockFindUser, engine } = vi.hoisted(() => ({
  mockVerifyUserRecord: vi.fn(),
  mockFindUser: vi.fn(),
  engine: {
    Loaded: true,
    Config: vi.fn(),
    FindBinding: vi.fn(),
    BindingsForUser: vi.fn(),
    CreateBinding: vi.fn(),
    TouchLastLogin: vi.fn(),
  },
}));

vi.mock('../index.js', () => ({ VerifyUserRecord: mockVerifyUserRecord }));
vi.mock('../UserExternalIdentityEngine.js', () => ({ UserExternalIdentityEngine: { Instance: engine } }));
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { FindUser: mockFindUser, GetSystemUser: () => ({ ID: 'system' }) } },
}));

import { BuildLoginIdentity, DecideEmailMatchBinding, HasEmailDrift, ResolveLoginUser, type LoginBinding } from '../loginIdentityBinding.js';

const ISSUER = 'https://login.example/';
const identity = { Issuer: ISSUER, Subject: 'sub-b', ProviderName: 'test' };
const userA = { ID: 'user-a', Email: 'a@example.com', IsActive: true } as UserInfo;
const userB = { ID: 'user-b', Email: 'b@example.com', IsActive: true } as UserInfo;
const binding = (id: string, userID: string, issuer: string, subject: string): LoginBinding => ({ ID: id, UserID: userID, Issuer: issuer, Subject: subject });
const plainLogin = (email: string) => ({ TokenEmail: email, LookupEmail: email, Remapped: false });

describe('BuildLoginIdentity', () => {
  it('needs both an issuer and a subject', () => {
    expect(BuildLoginIdentity(ISSUER, 'sub', 'p')).toEqual({ Issuer: ISSUER, Subject: 'sub', ProviderName: 'p' });
    expect(BuildLoginIdentity(undefined, 'sub')).toBeUndefined();
    expect(BuildLoginIdentity(ISSUER, undefined)).toBeUndefined();
  });
});

describe('DecideEmailMatchBinding', () => {
  it('binds a user with no bindings', () => {
    expect(DecideEmailMatchBinding(identity, false, [])).toEqual({ Kind: 'bind' });
  });

  it('never binds through a USER_EMAIL_MAP remap', () => {
    expect(DecideEmailMatchBinding(identity, true, [])).toEqual({ Kind: 'skip', Reason: 'remapped' });
  });

  it('skips when the token has no stable subject', () => {
    expect(DecideEmailMatchBinding(undefined, false, [])).toEqual({ Kind: 'skip', Reason: 'no-identity' });
  });

  it('refuses a new subject from an issuer the user is already bound to', () => {
    const existing = [binding('bind-1', 'user-a', ISSUER, 'sub-a')];
    expect(DecideEmailMatchBinding(identity, false, existing)).toEqual({ Kind: 'refuse', Reason: 'issuer-already-bound', ExistingBindingID: 'bind-1' });
  });

  it('allows a second binding from a different issuer', () => {
    const existing = [binding('bind-1', 'user-a', 'https://other.example/', 'sub-a')];
    expect(DecideEmailMatchBinding(identity, false, existing)).toEqual({ Kind: 'bind' });
  });
});

describe('HasEmailDrift', () => {
  it('compares case-insensitively and ignores a missing token email', () => {
    expect(HasEmailDrift(userA, 'A@Example.com')).toBe(false);
    expect(HasEmailDrift(userA, 'b@example.com')).toBe(true);
    expect(HasEmailDrift(userA, undefined)).toBe(false);
  });
});

describe('ResolveLoginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engine.Loaded = true;
    engine.FindBinding.mockReturnValue(undefined);
    engine.BindingsForUser.mockReturnValue([]);
    engine.CreateBinding.mockResolvedValue('new-binding');
  });

  it('resolves a bound login to its bound user even when the email now matches someone else', async () => {
    engine.FindBinding.mockReturnValue(binding('bind-b', 'user-b', ISSUER, 'sub-b'));
    mockFindUser.mockResolvedValue(userB);

    const result = await ResolveLoginUser({ Identity: identity, LoginEmail: plainLogin('a@example.com') });

    expect(result).toEqual({ User: userB, Source: 'binding', BindingID: 'bind-b', EmailDrift: true });
    expect(mockVerifyUserRecord).not.toHaveBeenCalled();
  });

  it('refuses a bound login whose user cannot be loaded instead of falling back to email', async () => {
    engine.FindBinding.mockReturnValue(binding('bind-b', 'user-b', ISSUER, 'sub-b'));
    mockFindUser.mockResolvedValue(undefined);

    const result = await ResolveLoginUser({ Identity: identity, LoginEmail: plainLogin('b@example.com') });

    expect(result.Source).toBe('refused');
    expect(result.User).toBeUndefined();
    expect(mockVerifyUserRecord).not.toHaveBeenCalled();
  });

  it('matches an unbound login by email once and binds it', async () => {
    mockVerifyUserRecord.mockResolvedValue(userB);

    const result = await ResolveLoginUser({ Identity: identity, LoginEmail: plainLogin('b@example.com') });

    expect(result).toEqual({ User: userB, Source: 'email', BindingID: 'new-binding', EmailDrift: false });
    expect(engine.CreateBinding).toHaveBeenCalledWith('user-b', identity, { ID: 'system' });
  });

  it('lets a remap win over a binding and never binds it', async () => {
    engine.FindBinding.mockReturnValue(binding('bind-b', 'user-b', ISSUER, 'sub-b'));
    mockVerifyUserRecord.mockResolvedValue(userA);

    const result = await ResolveLoginUser({
      Identity: identity,
      LoginEmail: { TokenEmail: 'b@example.com', LookupEmail: 'a@example.com', Remapped: true },
    });

    expect(result).toEqual({ User: userA, Source: 'email', EmailDrift: false });
    expect(mockVerifyUserRecord.mock.calls[0][0]).toBe('a@example.com');
    expect(engine.CreateBinding).not.toHaveBeenCalled();
  });

  it('refuses an email match when the user is bound to another account at the same issuer', async () => {
    mockVerifyUserRecord.mockResolvedValue(userA);
    engine.BindingsForUser.mockReturnValue([binding('bind-a', 'user-a', ISSUER, 'sub-a')]);

    const result = await ResolveLoginUser({ Identity: identity, LoginEmail: plainLogin('a@example.com') });

    expect(result).toEqual({ User: undefined, Source: 'refused', EmailDrift: false });
    expect(engine.CreateBinding).not.toHaveBeenCalled();
  });

  it('still logs in by email when the binding cache cannot load', async () => {
    engine.Loaded = false;
    engine.Config.mockRejectedValue(new Error('Invalid object name UserExternalIdentity'));
    mockVerifyUserRecord.mockResolvedValue(userB);

    const result = await ResolveLoginUser({ Identity: identity, LoginEmail: plainLogin('b@example.com') });

    expect(result).toEqual({ User: userB, Source: 'email', EmailDrift: false });
    expect(engine.FindBinding).not.toHaveBeenCalled();
    expect(engine.CreateBinding).not.toHaveBeenCalled();
  });

  it('reports not-found when no user matches', async () => {
    mockVerifyUserRecord.mockResolvedValue(undefined);
    const result = await ResolveLoginUser({ Identity: identity, LoginEmail: plainLogin('nobody@example.com') });
    expect(result).toEqual({ User: undefined, Source: 'not-found', EmailDrift: false });
  });
});
