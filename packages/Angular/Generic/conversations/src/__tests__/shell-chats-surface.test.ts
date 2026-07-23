/**
 * Unit tests for ShellChatsSurfaceComponent (SLICE-S2) — the pure derivation and
 * selection logic, exercised without TestBed (Object.create prototype pattern,
 * same convention as artifact-pane-maximize-reset). Engine/services are seeded
 * as plain fakes; contracts under test: filter matching (name+description),
 * grouped partition (pinned / per-project non-pinned / ungrouped, recency
 * order, empty groups skipped), flat ordering (pinned first), ShowProjects-off
 * forcing flat, selection set ops (toggle / select-all-visible / clear on
 * Done), and the relative time label.
 */
import '@angular/compiler';
import { EventEmitter } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = new Map<string, string>();
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    UserInfoEngine: {
      get Instance() {
        return {
          GetSetting: (key: string) => settings.get(key),
          SetSettingDebounced: (key: string, value: string) => settings.set(key, value),
          Config: () => Promise.resolve(),
        };
      },
    },
  };
});

import { ShellChatsSurfaceComponent } from '../lib/components/shell/shell-chats-surface.component';

interface FakeConversation {
  ID: string;
  Name: string;
  Description: string | null;
  IsPinned: boolean;
  IsArchived: boolean;
  ProjectID: string | null;
  EnvironmentID: string;
  __mj_UpdatedAt: Date;
}

const ENV = 'env-1';
let conversations: FakeConversation[] = [];
let projects: Array<{ ID: string; Name: string; Color: string | null; IsArchived: boolean; EnvironmentID: string }> = [];

function conv(id: string, over: Partial<FakeConversation> = {}): FakeConversation {
  return {
    ID: id,
    Name: `Conversation ${id}`,
    Description: null,
    IsPinned: false,
    IsArchived: false,
    ProjectID: null,
    EnvironmentID: ENV,
    __mj_UpdatedAt: new Date('2026-07-20T12:00:00Z'),
    ...over,
  };
}

function createComponent(): ShellChatsSurfaceComponent {
  const c = Object.create(ShellChatsSurfaceComponent.prototype) as ShellChatsSurfaceComponent;
  const open = c as unknown as Record<string, unknown>;
  c.FilterText = '';
  c.SelectMode = false;
  (c as unknown as { SelectedIds: Set<string> }).SelectedIds?.clear?.();
  Object.defineProperty(c, 'SelectedIds', { value: new Set<string>(), writable: false });
  c.EnvironmentId = ENV;
  c.ShowProjects = true;
  c.Provider = null;
  c.OpenMenuId = null;
  c.MoveSubmenuOpen = false;
  c.DragOverTarget = null;
  open['cdr'] = { markForCheck: vi.fn(), detectChanges: vi.fn() };
  // Object.create skips field initializers — seed the outputs the tests observe.
  c.ConversationSelected = new EventEmitter();
  c.NewConversationClicked = new EventEmitter();
  open['notificationService'] = { getBadgeConfig: () => ({ show: false }), markConversationAsRead: vi.fn() };
  open['dialogService'] = { confirm: vi.fn(), alert: vi.fn(), input: vi.fn() };
  // Override the engine getter with a fake cache.
  Object.defineProperty(c, 'engine', {
    get: () => ({ Conversations: conversations, Projects: projects }),
  });
  return c;
}

describe('ShellChatsSurfaceComponent — derivations', () => {
  beforeEach(() => {
    settings.clear();
    projects = [
      { ID: 'p1', Name: 'Renewal', Color: '#123456', IsArchived: false, EnvironmentID: ENV },
      { ID: 'p2', Name: 'Website', Color: null, IsArchived: false, EnvironmentID: ENV },
      { ID: 'p3', Name: 'Archived', Color: null, IsArchived: true, EnvironmentID: ENV },
    ];
    conversations = [
      conv('a', { Name: 'Alpha renewal targets', ProjectID: 'p1', __mj_UpdatedAt: new Date('2026-07-22T10:00:00Z') }),
      conv('b', { Name: 'Beta', Description: 'homepage rewrite', ProjectID: 'p2', __mj_UpdatedAt: new Date('2026-07-21T10:00:00Z') }),
      conv('c', { Name: 'Gamma quick question', __mj_UpdatedAt: new Date('2026-07-23T10:00:00Z') }),
      conv('d', { Name: 'Delta pinned', IsPinned: true, ProjectID: 'p1', __mj_UpdatedAt: new Date('2026-07-19T10:00:00Z') }),
      conv('e', { Name: 'Epsilon archived', IsArchived: true }),
      conv('f', { Name: 'Foreign env', EnvironmentID: 'other-env' }),
    ];
  });

  it('filters by name AND description, case-insensitive; archived + foreign-env excluded', () => {
    const c = createComponent();
    expect(c.FlatRows.map((r) => r.ID)).toEqual(['d', 'c', 'a', 'b']); // pinned first, then recency
    c.FilterText = 'HOMEPAGE';
    expect(c.FlatRows.map((r) => r.ID)).toEqual(['b']); // matched via description
    c.FilterText = 'epsilon';
    expect(c.FlatRows).toEqual([]); // archived never surfaces
  });

  it('grouped mode partitions pinned / per-project / ungrouped by recency, skipping empty groups', () => {
    const c = createComponent();
    expect(c.PinnedRows.map((r) => r.ID)).toEqual(['d']);
    const groups = c.ProjectGroups;
    expect(groups.map((g) => g.Project.ID)).toEqual(['p1', 'p2']); // archived p3 skipped entirely
    expect(groups[0].Rows.map((r) => r.ID)).toEqual(['a']); // pinned d NOT duplicated into its project group
    expect(c.UngroupedRows.map((r) => r.ID)).toEqual(['c']);
    c.FilterText = 'alpha';
    expect(c.ProjectGroups.map((g) => g.Project.ID)).toEqual(['p1']); // p2 now empty → skipped
    expect(c.UngroupedRows).toEqual([]);
  });

  it('GroupMode is pref-backed and FORCED flat when ShowProjects is off', () => {
    const c = createComponent();
    expect(c.GroupMode).toBe('project'); // default
    settings.set('mj.conversations.chatsGroup.v1', 'flat');
    expect(c.GroupMode).toBe('flat');
    settings.set('mj.conversations.chatsGroup.v1', 'project');
    c.ShowProjects = false;
    expect(c.GroupMode).toBe('flat'); // mockup line 734 gating
  });

  it('selection: row click toggles in select mode; SelectAllVisible covers every visible row; Done clears', () => {
    const c = createComponent();
    c.SelectMode = true;
    const row = conversations[0] as never;
    c.OnRowClicked(row);
    expect(c.SelectedIds.size).toBe(1);
    c.OnRowClicked(row);
    expect(c.SelectedIds.size).toBe(0);
    c.SelectAllVisible();
    expect(c.SelectedIds.size).toBe(4); // a,b,c,d visible
    c.ToggleSelectMode(); // Done
    expect(c.SelectMode).toBe(false);
    expect(c.SelectedIds.size).toBe(0);
  });

  it('row click OUTSIDE select mode emits + marks read instead of selecting', () => {
    const c = createComponent();
    const emitted: string[] = [];
    c.ConversationSelected.subscribe((e: { ID: string }) => emitted.push(e.ID));
    c.OnRowClicked(conversations[2] as never);
    expect(emitted).toEqual(['c']);
    expect(c.SelectedIds.size).toBe(0);
    const notif = (c as unknown as Record<string, { markConversationAsRead: ReturnType<typeof vi.fn> }>)['notificationService'];
    expect(notif.markConversationAsRead).toHaveBeenCalledWith('c');
  });

  it('TimeLabel: now / hours / days / weeks buckets', () => {
    const c = createComponent();
    const at = (msAgo: number) => conv('t', { __mj_UpdatedAt: new Date(Date.now() - msAgo) }) as never;
    expect(c.TimeLabel(at(30_000))).toBe('now');
    expect(c.TimeLabel(at(3 * 3600_000))).toBe('3h');
    expect(c.TimeLabel(at(2 * 86400_000))).toBe('2d');
    expect(c.TimeLabel(at(21 * 86400_000))).toBe('3w');
  });
});
