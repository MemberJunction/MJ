import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { NormalizedPermission } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { UserSharingCenterComponent, SharingCenterDomainGroup, SharingCenterTab } from './user-sharing-center.component';

/**
 * DOM-level spec for <mj-user-sharing-center> — a standalone, data-bound component with
 * a two-tab layout, per-domain collapsible groups, and per-row click/revoke affordances.
 *
 * The component loads its data through PermissionEngine in ngOnInit, but loadTab() skips
 * loading when the target tab's array is already non-empty. So we seed SharedWithMe /
 * SharedByMe directly in `setup` (before the single OnPush detectChanges, zoneless §5),
 * which renders the populated surface without any engine or backend call. A fake provider
 * satisfies the ProviderToUse plumbing. The revoke flow (confirm dialog + entity Delete)
 * is data/backend-coupled and is out of scope here.
 */

function permission(overrides: Partial<NormalizedPermission> = {}): NormalizedPermission {
  return {
    DomainName: 'Dashboard Permissions',
    ResourceType: 'Dashboard',
    ResourceID: 'res1',
    ResourceName: 'Sales Dashboard',
    GranteeType: 'User',
    GranteeID: 'g1',
    GranteeName: 'Bob Grantee',
    Actions: ['View'],
    Effect: 'Allow',
    SourceRecordID: 'perm1',
    ...overrides,
  } as NormalizedPermission;
}

function group(overrides: Partial<SharingCenterDomainGroup> = {}): SharingCenterDomainGroup {
  return {
    DomainName: 'Dashboard Permissions',
    Icon: 'fa-solid fa-gauge',
    Rows: [permission()],
    Expanded: true,
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>, setup?: (c: UserSharingCenterComponent) => void): ComponentFixture<UserSharingCenterComponent> {
  return renderComponentFixture(UserSharingCenterComponent, {
    inputs: { Provider: createFakeProvider({ runViewResults: [] }), ...inputs },
    setup,
  });
}

describe('UserSharingCenterComponent (DOM, data-bound)', () => {
  it('marks the active tab from ActiveTab', () => {
    const f = render({ ActiveTab: 'shared-with-me' as SharingCenterTab }, (c) => {
      c.SharedWithMe = [group()];
    });
    const tabs = queryAll(f, '.tab');
    expect(hasClass(f, '.tabs .tab', 'active')).toBe(true); // first tab active
    expect(tabs[1].classList.contains('active')).toBe(false);
  });

  it('shows the close button by default and hides it when ShowCloseButton is false', () => {
    const withClose = render({}, (c) => {
      c.SharedWithMe = [group()];
    });
    expect(query(withClose, '.close')).not.toBeNull();

    const withoutClose = render({ ShowCloseButton: false }, (c) => {
      c.SharedWithMe = [group()];
    });
    expect(query(withoutClose, '.close')).toBeNull();
  });

  it('renders a domain group with its name and row count', () => {
    const f = render({}, (c) => {
      c.SharedWithMe = [group({ Rows: [permission(), permission({ SourceRecordID: 'perm2' })] })];
    });
    expect(text(f, '.group-name')).toBe('Dashboard Permissions');
    expect(text(f, '.count')).toBe('2');
  });

  it('renders one row per permission in an expanded group', () => {
    const f = render({}, (c) => {
      c.SharedWithMe = [group({ Rows: [permission(), permission({ SourceRecordID: 'perm2' })], Expanded: true })];
    });
    expect(queryAll(f, '.rows .row').length).toBe(2);
    expect(text(f, '.rows .row .resource')).toBe('Sales Dashboard');
  });

  it('hides rows when the group is collapsed', () => {
    const f = render({}, (c) => {
      c.SharedWithMe = [group({ Expanded: false })];
    });
    expect(query(f, '.rows')).toBeNull();
  });

  it('toggles a group open/closed when its header is clicked', () => {
    const f = render({}, (c) => {
      c.SharedWithMe = [group({ Expanded: false })];
    });
    expect(query(f, '.rows')).toBeNull();
    click(f, '.group-header');
    f.detectChanges();
    expect(query(f, '.rows')).not.toBeNull();
  });

  it('emits ResourceClicked with the row when a shared-with-me row is clicked', () => {
    const row = permission({ ResourceName: 'My Report' });
    const f = render({}, (c) => {
      c.SharedWithMe = [group({ Rows: [row] })];
    });
    const clicks = capture(f.componentInstance.ResourceClicked);
    click(f, '.rows .row');
    expect(clicks).toHaveLength(1);
    expect(clicks[0].ResourceName).toBe('My Report');
  });

  it('emits CloseRequested when the close button is clicked', () => {
    const f = render({}, (c) => {
      c.SharedWithMe = [group()];
    });
    const closes = capture(f.componentInstance.CloseRequested);
    click(f, '.close');
    expect(closes).toHaveLength(1);
  });

  it('switches to the shared-by-me tab and emits ActiveTabChange on tab click', async () => {
    const f = render({ ActiveTab: 'shared-with-me' as SharingCenterTab }, (c) => {
      c.SharedWithMe = [group()];
      // pre-seed so SwitchTab's loadTab is a no-op (no engine call)
      c.SharedByMe = [group({ DomainName: 'Artifact Permissions' })];
    });
    const tabChanges = capture(f.componentInstance.ActiveTabChange);

    await f.componentInstance.OnTabClick('shared-by-me');
    f.detectChanges();

    expect(tabChanges).toEqual(['shared-by-me']);
    expect(f.componentInstance.ActiveTab).toBe('shared-by-me');
  });

  it('renders a revoke button on shared-by-me rows', async () => {
    const f = render({ ActiveTab: 'shared-by-me' as SharingCenterTab }, (c) => {
      c.SharedByMe = [group({ DomainName: 'Artifact Permissions' })];
    });
    expect(query(f, '.row.editable')).not.toBeNull();
    expect(query(f, '.row .revoke')).not.toBeNull();
    expect(text(f, '.row .grantee')).toContain('Bob Grantee');
  });

  it('renders the error banner when ErrorMessage is set', () => {
    const f = render({}, (c) => {
      c.SharedWithMe = [group()];
      c.ErrorMessage = 'Failed to load shares: boom';
    });
    expect(query(f, '.error')).not.toBeNull();
    expect(text(f, '.error')).toContain('Failed to load shares: boom');
  });

  it('joins permission actions into a readable label', () => {
    const f = render({}, (c) => {
      // Read/Update are valid PermissionAction values ('View'/'Edit' are not in the union)
      c.SharedWithMe = [group({ Rows: [permission({ Actions: ['Read', 'Update'] })] })];
    });
    expect(text(f, '.row .actions')).toBe('Read, Update');
  });
});
