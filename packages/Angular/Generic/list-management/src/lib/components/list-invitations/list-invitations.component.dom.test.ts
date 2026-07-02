import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, text, createFakeProvider } from '@memberjunction/ng-test-utils';
import { ListInvitationsComponent } from './list-invitations.component';

/**
 * DOM spec for <mj-list-invitations>. The component extends BaseAngularComponent and loads via
 * `RunView.FromMetadataProvider(this.ProviderToUse)`, so it reads the INJECTABLE provider — we pass
 * a fake straight into the `[Provider]` input (no global swap, no production change). Setting
 * `[ListID]` triggers the load; we then flush the async RunView and assert the tab-filtered table,
 * the per-tab counts, and tab switching. (See guides/ANGULAR_TESTING_GUIDE.md §6, recipe A.)
 */
const MOD = {
  imports: [CommonModule, FormsModule, MJButtonDirective, SharedGenericModule],
  declarations: [ListInvitationsComponent],
};

// Raw rows as 'MJ: List Invitations' returns them (ResultType 'simple'); the component maps these.
const INVITES = [
  {
    ID: 'i1',
    Email: 'ada@example.com',
    Role: 'Editor',
    Status: 'Pending',
    ExpiresAt: '2099-01-01T00:00:00Z',
    __mj_CreatedAt: '2026-01-02T00:00:00Z',
    Token: 't1',
  },
  {
    ID: 'i2',
    Email: 'alan@example.com',
    Role: 'Viewer',
    Status: 'Pending',
    ExpiresAt: '2099-01-01T00:00:00Z',
    __mj_CreatedAt: '2026-01-01T00:00:00Z',
    Token: 't2',
  },
  {
    ID: 'i3',
    Email: 'grace@example.com',
    Role: 'Viewer',
    Status: 'Accepted',
    ExpiresAt: '2099-01-01T00:00:00Z',
    __mj_CreatedAt: '2026-01-03T00:00:00Z',
    Token: 't3',
  },
];

async function renderLoaded(rows: unknown[] = INVITES) {
  const f = renderComponentFixture(ListInvitationsComponent, {
    ...MOD,
    inputs: { Provider: createFakeProvider({ runViewResults: rows }), ListID: 'list-1', ListName: 'My List' },
  });
  await new Promise((r) => setTimeout(r, 0)); // let the load's RunView settle
  f.detectChanges();
  return f;
}

describe('ListInvitationsComponent (DOM)', () => {
  it('shows the loading indicator while the initial load is in flight', () => {
    // Setting [ListID] starts load(), which sets loading=true synchronously and then awaits the
    // RunView. Before we flush that promise, the loading branch is what renders. (No flush here.)
    const f = renderComponentFixture(ListInvitationsComponent, {
      ...MOD,
      inputs: { Provider: createFakeProvider({ runViewResults: INVITES }), ListID: 'list-1' },
    });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.invitation-table')).toBeNull();
  });

  it('renders a table row per invitation on the active (Pending) tab, with the Editor role chip flagged', async () => {
    const f = await renderLoaded();
    const rows = queryAll(f, '.invitation-table tbody tr');
    expect(rows.length).toBe(2); // 2 Pending, the Accepted one is on another tab
    expect(queryAll(f, '.invitation-table tbody tr td:first-child').map((e) => e.textContent?.trim())).toEqual(['ada@example.com', 'alan@example.com']);
    // ada is an Editor, alan a Viewer → only the first row's chip carries the editor modifier
    expect(rows[0].querySelector('.role-chip')?.classList.contains('role-chip--editor')).toBe(true);
    expect(rows[1].querySelector('.role-chip')?.classList.contains('role-chip--editor')).toBe(false);
  });

  it('shows per-tab counts reflecting the loaded invitations', async () => {
    const f = await renderLoaded();
    const counts = queryAll(f, '.invitation-tab__count').map((e) => e.textContent?.trim());
    // tab order: Pending, Accepted, Expired, Revoked
    expect(counts).toEqual(['2', '1', '0', '0']);
  });

  it('marks the active tab and switches the visible rows when another tab is clicked', async () => {
    const f = await renderLoaded();
    const tabs = queryAll(f, '.invitation-tab');
    // default active tab is Pending (index 0)
    expect(tabs[0].classList.contains('invitation-tab--active')).toBe(true);

    (tabs[1] as HTMLButtonElement).click(); // Accepted
    f.detectChanges();
    expect(tabs[1].classList.contains('invitation-tab--active')).toBe(true);
    expect(tabs[0].classList.contains('invitation-tab--active')).toBe(false);

    const rows = queryAll(f, '.invitation-table tbody tr');
    expect(rows.length).toBe(1);
    expect(text(f, '.invitation-table tbody tr td:first-child')).toBe('grace@example.com');
  });

  it('shows the empty state when the active tab has no invitations', async () => {
    const f = await renderLoaded([]);
    expect(query(f, '.invitation-state--empty')).not.toBeNull();
    expect(query(f, '.invitation-table')).toBeNull();
  });
});
