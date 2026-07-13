import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Recompute-trigger coverage for ListInvitationsComponent.visibleInvitations
 * (PR #2841): the precomputed per-tab list is rebuilt only when the source data
 * (`invitations`) or the active tab changes — NOT on every change-detection pass
 * (a getter there would allocate a fresh map+filter each CD tick).
 *
 * The recompute also hydrates the Pending→Expired client boundary: a Pending
 * invitation whose ExpiresAt is in the past surfaces under the Expired tab
 * without waiting for the server-side flip.
 *
 * Pins:
 *  (1) recompute runs on data load (loadInvitations calls it),
 *  (2) recompute runs on tab change (setTab),
 *  (3) the Pending→Expired hydration boundary is applied during recompute,
 *  (4) visibleInvitations is a precomputed FIELD (stable identity between reads),
 *  (5) countFor reflects the same hydration boundary.
 *
 * inject(ChangeDetectorRef) is stubbed; BaseAngularComponent is mocked.
 */

vi.mock('@angular/core', () => ({
  Component: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  OnInit: class {},
  inject: () => ({ detectChanges() {}, markForCheck() {} }),
}));

vi.mock('@memberjunction/ng-base-types', () => {
  class MockBaseAngularComponent {
    Provider: unknown = null;
    get ProviderToUse(): unknown { return this.Provider; }
  }
  return { BaseAngularComponent: MockBaseAngularComponent };
});

vi.mock('@memberjunction/core', () => ({ RunView: class {} }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
  GraphQLListsClient: class {},
}));

import { ListInvitationsComponent } from '../list-invitations.component';

type Status = 'Pending' | 'Accepted' | 'Expired' | 'Revoked';
interface Row {
  ID: string;
  Email: string;
  Role: 'Editor' | 'Viewer';
  Status: Status;
  ExpiresAt: Date;
  CreatedAt: Date;
  Token: string;
}

function row(id: string, status: Status, expiresInMs: number): Row {
  return {
    ID: id,
    Email: `${id}@example.com`,
    Role: 'Viewer',
    Status: status,
    ExpiresAt: new Date(Date.now() + expiresInMs),
    CreatedAt: new Date(),
    Token: `tok-${id}`,
  };
}

function makeComponent(): ListInvitationsComponent {
  return new ListInvitationsComponent();
}

/** Set source data + run the (private) recompute, mirroring loadInvitations(). */
function loadData(component: ListInvitationsComponent, rows: Row[]): void {
  (component as unknown as { invitations: Row[] }).invitations = rows;
  (component as unknown as { recomputeVisibleInvitations: () => void }).recomputeVisibleInvitations();
}

const HOUR = 3_600_000;

describe('ListInvitationsComponent — visibleInvitations recompute', () => {
  let component: ListInvitationsComponent;

  beforeEach(() => {
    component = makeComponent();
  });

  it('recomputes visibleInvitations on data load (default Pending tab)', () => {
    loadData(component, [
      row('p1', 'Pending', +HOUR),
      row('a1', 'Accepted', +HOUR),
    ]);
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['p1']);
  });

  it('recomputes when the active tab changes (setTab)', () => {
    loadData(component, [
      row('p1', 'Pending', +HOUR),
      row('a1', 'Accepted', +HOUR),
      row('r1', 'Revoked', +HOUR),
    ]);
    expect(component.activeTab).toBe('Pending');
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['p1']);

    component.setTab('Accepted');
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['a1']);

    component.setTab('Revoked');
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['r1']);
  });

  it('hydrates a past-due Pending invite as Expired (the client boundary)', () => {
    loadData(component, [
      row('p-live', 'Pending', +HOUR),    // still valid
      row('p-stale', 'Pending', -HOUR),   // expired in the past
    ]);
    // Pending tab shows only the still-live one
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['p-live']);

    // Expired tab surfaces the past-due Pending one without a server flip
    component.setTab('Expired');
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['p-stale']);
  });

  it('does NOT reclassify an Accepted/Revoked row even when its ExpiresAt is in the past', () => {
    loadData(component, [
      row('a-old', 'Accepted', -HOUR),
      row('r-old', 'Revoked', -HOUR),
    ]);
    component.setTab('Expired');
    expect(component.visibleInvitations).toHaveLength(0);
    component.setTab('Accepted');
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['a-old']);
    component.setTab('Revoked');
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['r-old']);
  });

  it('countFor applies the same Pending→Expired hydration boundary', () => {
    loadData(component, [
      row('p-live', 'Pending', +HOUR),
      row('p-stale', 'Pending', -HOUR),
      row('a1', 'Accepted', +HOUR),
    ]);
    expect(component.countFor('Pending')).toBe(1);  // only the live one
    expect(component.countFor('Expired')).toBe(1);  // the stale Pending one
    expect(component.countFor('Accepted')).toBe(1);
    expect(component.countFor('Revoked')).toBe(0);
  });

  it('visibleInvitations is a precomputed field — re-reading it (no recompute) returns the same array', () => {
    loadData(component, [row('p1', 'Pending', +HOUR)]);
    const first = component.visibleInvitations;
    const second = component.visibleInvitations;
    expect(second).toBe(first); // stable identity (not re-allocated per access)
  });

  it('re-load with new data refreshes the visible list', () => {
    loadData(component, [row('p1', 'Pending', +HOUR)]);
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['p1']);
    loadData(component, [row('p2', 'Pending', +HOUR), row('p3', 'Pending', +HOUR)]);
    expect(component.visibleInvitations.map((i) => i.ID)).toEqual(['p2', 'p3']);
  });
});
