/**
 * Tests for the shared clone-then-stamp helper (WS2 plan §4.2).
 *
 * `cloneUserInfoForSession` is the fix for the shared-`UserInfo`-mutation defect: `userRecord`
 * resolved during authentication (JWT or API-key) may be the shared `UserCache` instance, so
 * per-session state (TenantContext, MagicLinkScope, etc.) must be stamped onto a fresh clone,
 * never the shared instance. The clone survives only because `UserInfo`'s `_`-prefixed backing
 * fields are enumerable own properties `BaseInfo.copyInitData` gates on `hasOwnProperty` — a
 * refactor that breaks that silently drops a restricting context, which fails open. These tests
 * exist to catch exactly that regression.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo, UserRoleInfo } from '@memberjunction/core';
import { cloneUserInfoForSession } from '../userInfoSession.js';

function makeSourceUser(): UserInfo {
  const roles = [
    new UserRoleInfo({ UserID: 'u1', RoleID: 'r1', Role: 'Editor' }),
    new UserRoleInfo({ UserID: 'u1', RoleID: 'r2', Role: 'Viewer' }),
  ];
  const user = new UserInfo(null, { ID: 'u1', Name: 'Test User', Email: 'test@test.com', UserRoles: roles });
  user.TenantContext = { TenantID: 'tenant-abc', Source: 'header' };
  user.MagicLinkScope = { ResourceID: 'res-1', ResourceType: 'Report' };
  user.ReturningVisitorContext = { VisitorKey: 'visitor-1' };
  user.WidgetGuestContext = { WidgetID: 'widget-1' };
  user.IsMagicLinkAnonymous = true;
  return user;
}

describe('cloneUserInfoForSession', () => {
  it('returns a different object instance than the source', () => {
    const source = makeSourceUser();
    const clone = cloneUserInfoForSession(source, null);
    expect(clone).not.toBe(source);
  });

  it('preserves UserRoles identity (RoleID set) and count', () => {
    const source = makeSourceUser();
    const clone = cloneUserInfoForSession(source, null);

    expect(clone.UserRoles.length).toBe(source.UserRoles.length);
    expect(clone.UserRoles.map(r => r.RoleID).sort()).toEqual(source.UserRoles.map(r => r.RoleID).sort());
  });

  it('preserves all four existing per-session contexts', () => {
    const source = makeSourceUser();
    const clone = cloneUserInfoForSession(source, null);

    expect(clone.TenantContext).toEqual(source.TenantContext);
    expect(clone.MagicLinkScope).toEqual(source.MagicLinkScope);
    expect(clone.ReturningVisitorContext).toEqual(source.ReturningVisitorContext);
    expect(clone.WidgetGuestContext).toEqual(source.WidgetGuestContext);
    expect(clone.IsMagicLinkAnonymous).toBe(source.IsMagicLinkAnonymous);
  });

  it('preserves scalar identity fields (ID, Name, Email)', () => {
    const source = makeSourceUser();
    const clone = cloneUserInfoForSession(source, null);

    expect(clone.ID).toBe(source.ID);
    expect(clone.Name).toBe(source.Name);
    expect(clone.Email).toBe(source.Email);
  });

  it('mutating the clone never touches the source instance (the whole point of cloning)', () => {
    const source = makeSourceUser();
    const clone = cloneUserInfoForSession(source, null);

    clone.TenantContext = { TenantID: 'a-different-tenant', Source: 'header' };

    expect(source.TenantContext?.TenantID).toBe('tenant-abc');
    expect(clone.TenantContext.TenantID).toBe('a-different-tenant');
  });

  it('two independent clones of the same shared source do not cross-contaminate (concurrent-request simulation)', () => {
    const shared = makeSourceUser();

    const cloneForRequestA = cloneUserInfoForSession(shared, null);
    cloneForRequestA.TenantContext = { TenantID: 'tenant-A', Source: 'header' };

    const cloneForRequestB = cloneUserInfoForSession(shared, null);
    cloneForRequestB.TenantContext = { TenantID: 'tenant-B', Source: 'header' };

    expect(cloneForRequestA.TenantContext.TenantID).toBe('tenant-A');
    expect(cloneForRequestB.TenantContext.TenantID).toBe('tenant-B');
    expect(shared.TenantContext?.TenantID).toBe('tenant-abc'); // shared instance untouched
  });

  it('rolesOverride replaces UserRoles on the clone without touching the source (magic-link anonymous path)', () => {
    const source = makeSourceUser();
    const synthesized = [new UserRoleInfo({ UserID: 'anon', RoleID: 'r-anon', Role: 'AnonymousShare' })];

    const clone = cloneUserInfoForSession(source, null, synthesized);

    expect(clone.UserRoles.map(r => r.RoleID)).toEqual(['r-anon']);
    expect(source.UserRoles.length).toBe(2); // source untouched
  });

  it('omitting rolesOverride copies the source UserRoles unchanged', () => {
    const source = makeSourceUser();
    const clone = cloneUserInfoForSession(source, null);

    expect(clone.UserRoles.map(r => r.RoleID).sort()).toEqual(['r1', 'r2']);
  });
});
