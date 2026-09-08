import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { AgentPermissionsPanelComponent } from './agent-permissions-panel.component';
import type { PermissionRow } from '../services/agent-permissions.service';

/**
 * DOM coverage for <mj-agent-permissions-panel> — the per-agent permission grantee list (~5×). Its
 * data comes from a self-provided AgentPermissionsService, but loadData() only runs when an Agent is
 * bound — so leaving Agent unset means the service is never invoked and we can drive the public
 * Rows / OwnerName state directly (before the first OnPush render). Covers the open-access banner
 * (no rows), the owner row, one row per grantee with its name/type, and the effective-permission pills.
 */

const makeRow = (over: Partial<PermissionRow> = {}): PermissionRow =>
  ({
    ID: 'p1',
    AgentID: 'a1',
    UserID: 'u1',
    RoleID: null,
    GrantedToName: 'Ada Lovelace',
    GrantType: 'user',
    CanView: true,
    CanRun: true,
    CanEdit: false,
    CanDelete: false,
    EffectiveCanView: true,
    EffectiveCanRun: true,
    EffectiveCanEdit: false,
    EffectiveCanDelete: false,
    Comments: null,
    Entity: {} as PermissionRow['Entity'],
    ...over,
  });

interface State { Rows?: PermissionRow[]; OwnerName?: string | null; IsLoading?: boolean }
const render = (state: State = {}) =>
  renderComponentFixture(AgentPermissionsPanelComponent, {
    declarations: [AgentPermissionsPanelComponent],
    // no Agent input → ngOnInit's loadData short-circuits, so the service is never called and the
    // state we set here survives to the (OnPush) first render.
    setup: (c) => {
      if (state.Rows) c.Rows = state.Rows;
      if (state.OwnerName !== undefined) c.OwnerName = state.OwnerName;
      c.IsLoading = state.IsLoading ?? false;
    },
  });

describe('AgentPermissionsPanelComponent (DOM)', () => {
  it('shows the open-access banner when there are no grantees', () => {
    const f = render({ Rows: [] });
    expect(query(f, '.ap-open-banner')).not.toBeNull();
    expect(query(f, '.ap-row')).toBeNull();
  });

  it('shows the owner row when an owner name is set', () => {
    const f = render({ Rows: [], OwnerName: 'Grace Hopper' });
    expect(query(f, '.ap-owner-row')).not.toBeNull();
    expect(text(f, '.ap-owner-name')).toBe('Grace Hopper');
  });

  it('renders one row per grantee with its name', () => {
    const f = render({ Rows: [makeRow({ GrantedToName: 'Ada' }), makeRow({ ID: 'p2', GrantedToName: 'Admins', GrantType: 'role', RoleID: 'r1' })] });
    const rows = queryAll(f, '.ap-row');
    expect(rows.length).toBe(2);
    const names = queryAll(f, '.ap-row-name').map((n) => n.textContent?.trim());
    expect(names).toEqual(['Ada', 'Admins']);
  });

  it('renders the grantee type label (User vs Role)', () => {
    const f = render({ Rows: [makeRow({ GrantType: 'role', RoleID: 'r1', UserID: null })] });
    expect(text(f, '.ap-row-type')).toBe('Role');
  });

  it('renders a permission pill for each effective capability', () => {
    const f = render({ Rows: [makeRow({ EffectiveCanView: true, EffectiveCanRun: true, EffectiveCanEdit: true, EffectiveCanDelete: true })] });
    expect(query(f, '.ap-pill-view')).not.toBeNull();
    expect(query(f, '.ap-pill-run')).not.toBeNull();
    expect(query(f, '.ap-pill-edit')).not.toBeNull();
    expect(query(f, '.ap-pill-delete')).not.toBeNull();
  });

  it('omits pills for capabilities the grantee does not have', () => {
    const f = render({ Rows: [makeRow({ EffectiveCanView: true, EffectiveCanRun: false, EffectiveCanEdit: false, EffectiveCanDelete: false })] });
    expect(query(f, '.ap-pill-view')).not.toBeNull();
    expect(query(f, '.ap-pill-run')).toBeNull();
    expect(query(f, '.ap-pill-delete')).toBeNull();
  });
});
