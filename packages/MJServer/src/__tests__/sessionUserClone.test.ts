/**
 * CloneUserForSessionContext tests.
 *
 * FAIL-OPEN GUARD: the clone must carry EVERY restricting per-session context
 * (TenantContext, MagicLinkScope, APIKeyActingContext, APIKeyRowFilters, ...) —
 * a lossy clone silently DROPS a restriction, which fails open. These tests also
 * pin the mechanism note in sessionUserClone.ts: if a refactor converts UserInfo
 * backing fields to #private fields or flips class-field emit semantics, the
 * spread-based clone breaks and these tests catch it.
 *
 * The other direction matters too: stamping the clone must never write through
 * to the source, because the source is very often the SHARED process-wide
 * UserCache instance (same-instant cross-request aliasing).
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { APIKeyRowFilterBinding } from '@memberjunction/core';
import { CloneUserForSessionContext } from '../auth/sessionUserClone.js';

const USER_ID = 'U0000000-0000-0000-0000-000000000001';

function buildSourceUser(): UserInfo {
  const user = new UserInfo(null, {
    ID: USER_ID,
    Name: 'Test User',
    Email: 'test@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [
      { UserID: USER_ID, RoleID: 'R0000000-0000-0000-0000-000000000001', Role: 'Developer' },
      { UserID: USER_ID, RoleID: 'R0000000-0000-0000-0000-000000000002', Role: 'Integration' },
    ],
  });
  user.TenantContext = { TenantID: 'tenant-1', Source: 'header' };
  user.MagicLinkScope = { ResourceID: 'res-1', ResourceType: 'Reports' };
  user.APIKeyActingContext = {
    ActingOrganizationID: 'ORG00000-0000-0000-0000-000000000001',
    ActingCompanyIDs: ['c1', 'c2'],
  };
  user.APIKeyRowFilters = [
    { EntityID: 'E0000000-0000-0000-0000-000000000001', PermissionType: 'Read', FilterID: 'F0000000-0000-0000-0000-000000000001' },
  ];
  user.ReturningVisitorContext = { VisitorKey: 'vk-1' };
  user.WidgetGuestContext = { WidgetID: 'W0000000-0000-0000-0000-000000000001' };
  user.IsMagicLinkAnonymous = true;
  return user;
}

describe('CloneUserForSessionContext', () => {
  it('returns a distinct UserInfo instance preserving identity fields', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone).not.toBe(source);
    expect(clone).toBeInstanceOf(UserInfo);
    expect(clone.ID).toBe(USER_ID);
    expect(clone.Email).toBe('test@example.com');
    expect(clone.Name).toBe('Test User');
    expect(clone.IsActive).toBe(true);
  });

  it('preserves UserRoles (same length, same role IDs)', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone.UserRoles).toHaveLength(source.UserRoles.length);
    expect(clone.UserRoles.map(r => r.RoleID)).toEqual(source.UserRoles.map(r => r.RoleID));
  });

  it('preserves TenantContext — dropping it would unscope the tenant [fail-open]', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone.TenantContext).toEqual({ TenantID: 'tenant-1', Source: 'header' });
  });

  it('preserves MagicLinkScope — dropping it would widen a resource-pinned share [fail-open]', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone.MagicLinkScope).toEqual({ ResourceID: 'res-1', ResourceType: 'Reports' });
  });

  it('preserves APIKeyActingContext — dropping it would collapse acting-scoped filters [fail-open]', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone.APIKeyActingContext).toEqual({
      ActingOrganizationID: 'ORG00000-0000-0000-0000-000000000001',
      ActingCompanyIDs: ['c1', 'c2'],
    });
  });

  it('preserves APIKeyRowFilters — dropping them would lift the key ceiling entirely [fail-open]', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone.APIKeyRowFilters).toEqual(source.APIKeyRowFilters);
    expect(clone.APIKeyRowFilters).toHaveLength(1);
  });

  it('preserves ReturningVisitorContext, WidgetGuestContext, and IsMagicLinkAnonymous', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    expect(clone.ReturningVisitorContext).toEqual({ VisitorKey: 'vk-1' });
    expect(clone.WidgetGuestContext).toEqual({ WidgetID: 'W0000000-0000-0000-0000-000000000001' });
    expect(clone.IsMagicLinkAnonymous).toBe(true);
  });

  it('stamping new contexts on the clone does NOT write through to the source', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    const newBindings: APIKeyRowFilterBinding[] = [
      { EntityID: 'E0000000-0000-0000-0000-000000000099', PermissionType: 'Update', FilterID: 'F0000000-0000-0000-0000-000000000099' },
    ];
    clone.TenantContext = { TenantID: 'tenant-OTHER', Source: 'custom' };
    clone.MagicLinkScope = { ResourceID: 'res-OTHER', ResourceType: 'Dashboards' };
    clone.APIKeyActingContext = { ActingOrganizationID: 'ORG-OTHER' };
    clone.APIKeyRowFilters = newBindings;
    clone.IsMagicLinkAnonymous = false;

    // The source (potentially the shared UserCache instance) must be untouched
    expect(source.TenantContext).toEqual({ TenantID: 'tenant-1', Source: 'header' });
    expect(source.MagicLinkScope).toEqual({ ResourceID: 'res-1', ResourceType: 'Reports' });
    expect(source.APIKeyActingContext?.ActingOrganizationID).toBe('ORG00000-0000-0000-0000-000000000001');
    expect(source.APIKeyRowFilters).toHaveLength(1);
    expect(source.APIKeyRowFilters?.[0].FilterID).toBe('F0000000-0000-0000-0000-000000000001');
    expect(source.IsMagicLinkAnonymous).toBe(true);
  });

  it('clearing contexts on the clone does NOT clear them on the source', () => {
    const source = buildSourceUser();
    const clone = CloneUserForSessionContext(source);

    clone.TenantContext = undefined;
    clone.APIKeyActingContext = undefined;
    clone.APIKeyRowFilters = undefined;

    expect(source.TenantContext).toBeDefined();
    expect(source.APIKeyActingContext).toBeDefined();
    expect(source.APIKeyRowFilters).toBeDefined();
  });

  it('does not invent contexts on a clone of a context-free user', () => {
    const source = new UserInfo(null, {
      ID: USER_ID,
      Email: 'plain@example.com',
      UserRoles: [],
    });
    const clone = CloneUserForSessionContext(source);

    expect(clone.TenantContext).toBeUndefined();
    expect(clone.MagicLinkScope).toBeUndefined();
    expect(clone.APIKeyActingContext).toBeUndefined();
    expect(clone.APIKeyRowFilters).toBeUndefined();
    expect(clone.IsMagicLinkAnonymous).toBe(false);
    expect(clone.UserRoles).toEqual([]);
  });
});
