import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Recompute-trigger coverage for EntityPermissionsGridComponent's roleNameMap
 * precompute (PR #2841): the role-name lookup is built ONCE on data load
 * (`buildRoleNameMap`), keyed by NormalizeUUID(roleID), so the per-row template
 * binding `getRoleName` is an O(1) Map read instead of an O(roles) UUIDsEqual
 * scan over `md.Roles` every change-detection pass.
 *
 * These tests pin:
 *  (1) getRoleName resolves a known role after the map is built,
 *  (2) case variance (SQL upper vs Postgres lower) resolves via NormalizeUUID,
 *  (3) empty / missing / unknown roleID returns '' (no throw),
 *  (4) the map is REBUILT on each load — a role removed from the provider's
 *      list no longer resolves.
 *
 * Uses the real NormalizeUUID (`@memberjunction/global`); the component is `new`'d
 * with a mocked provider exposing `Roles`.
 */

vi.mock('@angular/core', () => ({
  Component: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  OnInit: class {},
  OnChanges: class {},
}));

vi.mock('@memberjunction/ng-base-types', () => {
  class MockBaseAngularComponent {
    Provider: unknown = null;
    get ProviderToUse(): unknown {
      return this.Provider;
    }
  }
  return { BaseAngularComponent: MockBaseAngularComponent };
});

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  RunView: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJEntityPermissionEntity: class {},
}));

import { EntityPermissionsGridComponent } from '../entity-permissions-grid.component';

interface MockRole {
  ID: string;
  Name: string;
}

function makeComponent(roles: MockRole[]): EntityPermissionsGridComponent {
  const component = new EntityPermissionsGridComponent();
  (component as unknown as { Provider: { Roles: MockRole[] } }).Provider = { Roles: roles };
  return component;
}

/** Call the private builder (the real component invokes it inside Refresh()). */
function build(component: EntityPermissionsGridComponent): void {
  (component as unknown as { buildRoleNameMap: () => void }).buildRoleNameMap();
}

describe('EntityPermissionsGridComponent — roleNameMap precompute', () => {
  let component: EntityPermissionsGridComponent;
  const roles: MockRole[] = [
    { ID: 'AAAAAAAA-1111-1111-1111-111111111111', Name: 'Administrator' },
    { ID: 'bbbbbbbb-2222-2222-2222-222222222222', Name: 'Integration' },
  ];

  beforeEach(() => {
    component = makeComponent(roles);
    build(component);
  });

  it('resolves a role name once the map is built', () => {
    expect(component.getRoleName('AAAAAAAA-1111-1111-1111-111111111111')).toBe('Administrator');
    expect(component.getRoleName('bbbbbbbb-2222-2222-2222-222222222222')).toBe('Integration');
  });

  it('resolves across UUID case variance (lookup upper vs stored lower, and vice versa)', () => {
    // stored uppercase, looked up lowercase
    expect(component.getRoleName('aaaaaaaa-1111-1111-1111-111111111111')).toBe('Administrator');
    // stored lowercase, looked up uppercase
    expect(component.getRoleName('BBBBBBBB-2222-2222-2222-222222222222')).toBe('Integration');
  });

  it('returns empty string for an empty roleID (no throw)', () => {
    expect(component.getRoleName('')).toBe('');
  });

  it('returns empty string for an unknown roleID', () => {
    expect(component.getRoleName('FFFFFFFF-9999-9999-9999-999999999999')).toBe('');
  });

  it('rebuilds the map on each load — a removed role no longer resolves', () => {
    expect(component.getRoleName('AAAAAAAA-1111-1111-1111-111111111111')).toBe('Administrator');

    // provider now exposes a DIFFERENT, smaller role set; rebuild
    (component as unknown as { Provider: { Roles: MockRole[] } }).Provider = {
      Roles: [{ ID: 'bbbbbbbb-2222-2222-2222-222222222222', Name: 'Integration' }],
    };
    build(component);

    expect(component.getRoleName('AAAAAAAA-1111-1111-1111-111111111111')).toBe('');
    expect(component.getRoleName('bbbbbbbb-2222-2222-2222-222222222222')).toBe('Integration');
  });

  it('handles an empty provider role list — every lookup returns ""', () => {
    const empty = makeComponent([]);
    build(empty);
    expect(empty.getRoleName('AAAAAAAA-1111-1111-1111-111111111111')).toBe('');
  });
});
