import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import type { MJConversationEntity, MJProjectEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationListComponent } from './conversation-list.component';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';

/**
 * DOM spec for <mj-conversation-list>'s search clear button and sort buttons.
 *
 * ngOnInit is prototype-mocked (it reaches the live ConversationEngine
 * singleton); the engine field is replaced with a stub so rebuildGroups runs
 * against seeded conversations instead of the provider.
 */
@Component({ standalone: false, selector: 'mj-notification-badge', template: '' })
class StubNotificationBadgeComponent {
  @Input() conversationId: string | null = null;
}

@Component({ standalone: false, selector: 'mj-resource-share-dialog', template: '' })
class StubShareDialogComponent {
  @Input() Visible = false;
  @Input() Contexts: unknown[] = [];
  @Input() Adapter: unknown = null;
  @Input() Notice: string | null = null;
  @Input() ResourceLabel = '';
  @Output() Result = new EventEmitter<unknown>();
}

const currentUser = { ID: 'u1' } as unknown as UserInfo;

const conv = (
  id: string,
  name: string,
  updatedAt: string,
  extra: Partial<MJConversationEntity> = {}
) =>
  ({
    ID: id,
    Name: name,
    Description: '',
    ProjectID: null,
    IsPinned: false,
    __mj_UpdatedAt: new Date(updatedAt),
    ...extra
  } as unknown as MJConversationEntity);

const stubEngine = (conversations: MJConversationEntity[], projects: MJProjectEntity[] = []) => ({
  Conversations: conversations,
  Projects: projects,
  GetSharedByInfo: () => null,
  CanEditConversation: ConversationEngine.prototype.CanEditConversation,
  GetConversation: (id: string) => conversations.find(c => c.ID === id)
});

const render = (
  inputs: Record<string, unknown> = {},
  setup?: (c: ConversationListComponent) => void
) =>
  renderComponentFixture(ConversationListComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [ConversationListComponent, StubNotificationBadgeComponent, StubShareDialogComponent],
    providers: [
      { provide: DialogService, useValue: {} },
      { provide: NotificationService, useValue: {} },
      { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
      { provide: MJDialogService, useValue: {} },
    ],
    inputs: { environmentId: 'env1', currentUser, ...inputs },
    setup: (c) => {
      setup?.(c);
    },
  });

describe('ConversationListComponent (DOM) — search clear', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('shows no clear button while the search box is empty', () => {
    const f = render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine([]);
    });
    expect(query(f, '.search-clear')).toBeNull();
  });

  it('shows a clear button once the search box has text', () => {
    const f = render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine([]);
      c.searchQuery = 'budget';
    });
    f.detectChanges();
    expect(query(f, '.search-clear')).not.toBeNull();
  });

  it('clicking clear empties the search query and hides itself', () => {
    const f = render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine([]);
      c.searchQuery = 'budget';
    });
    f.detectChanges();
    (query(f, '.search-clear') as HTMLButtonElement).click();
    f.detectChanges();
    expect(f.componentInstance.searchQuery).toBe('');
    expect(query(f, '.search-clear')).toBeNull();
  });

  it('Escape in the search box clears the query', () => {
    const f = render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine([]);
      c.searchQuery = 'budget';
    });
    f.detectChanges();
    const input = query(f, '.search-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    f.detectChanges();
    expect(f.componentInstance.searchQuery).toBe('');
  });
});

describe('ConversationListComponent (DOM) — sort buttons', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const project = (id: string, name: string) =>
    ({ ID: id, Name: name, ParentID: null, Icon: null, Color: null } as unknown as MJProjectEntity);

  // Alphabetical order (Alpha, Beta, Cedar) is the reverse of newest-first, so a
  // test that passes under one sort cannot pass under the other.
  const seeded = [
    conv('c1', 'Cedar', '2026-03-01'),
    conv('c2', 'Alpha', '2026-01-01'),
    conv('c3', 'Beta', '2026-02-01')
  ];

  const names = (list: MJConversationEntity[]) => list.map(c => c.Name);

  const renderSeeded = (setup?: (c: ConversationListComponent) => void) =>
    render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine(seeded);
      setup?.(c);
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
    });

  it('renders a Date and a Name sort button', () => {
    const f = renderSeeded();
    const labels = queryAll(f, '.sort-btn').map(b => b.textContent?.trim());
    expect(labels.length).toBe(2);
    expect(labels.some(l => l?.includes('Date'))).toBe(true);
    expect(labels.some(l => l?.includes('Name'))).toBe(true);
  });

  it('defaults to newest first', () => {
    const f = renderSeeded();
    expect(names(f.componentInstance.ungroupedConversations)).toEqual(['Cedar', 'Beta', 'Alpha']);
  });

  it('sorts A→Z when Name is clicked', () => {
    const f = renderSeeded();
    f.componentInstance.SetSort('name');
    expect(names(f.componentInstance.ungroupedConversations)).toEqual(['Alpha', 'Beta', 'Cedar']);
  });

  it('flips to Z→A when the active Name button is clicked again', () => {
    const f = renderSeeded();
    f.componentInstance.SetSort('name');
    f.componentInstance.SetSort('name');
    expect(names(f.componentInstance.ungroupedConversations)).toEqual(['Cedar', 'Beta', 'Alpha']);
  });

  it('flips to oldest first when the active Date button is clicked again', () => {
    const f = renderSeeded();
    f.componentInstance.SetSort('date');
    expect(names(f.componentInstance.ungroupedConversations)).toEqual(['Alpha', 'Beta', 'Cedar']);
  });

  it('switching back to Date restores newest first rather than the last Date direction', () => {
    const f = renderSeeded();
    f.componentInstance.SetSort('date');   // date, now oldest first
    f.componentInstance.SetSort('name');   // name, A→Z
    f.componentInstance.SetSort('date');   // back to date
    expect(names(f.componentInstance.ungroupedConversations)).toEqual(['Cedar', 'Beta', 'Alpha']);
  });

  it('marks the active sort button and shows its direction', () => {
    const f = renderSeeded();
    const nameBtn = queryAll(f, '.sort-btn').find(b => b.textContent?.includes('Name')) as HTMLButtonElement;
    nameBtn.click();
    f.detectChanges();
    const active = queryAll(f, '.sort-btn.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Name');
    expect(query(f, '.sort-btn.active .fa-arrow-up-a-z')).not.toBeNull();
  });

  it('sorts the pinned section and each folder, not just the ungrouped list', () => {
    const f = render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine(
        [
          conv('p1', 'Zulu', '2026-01-01', { IsPinned: true }),
          conv('p2', 'Alpha', '2026-03-01', { IsPinned: true }),
          conv('f1', 'Yankee', '2026-01-01', { ProjectID: 'proj1' }),
          conv('f2', 'Bravo', '2026-03-01', { ProjectID: 'proj1' })
        ],
        [project('proj1', 'Work')]
      );
      c.SetSort('name');
    });
    expect(names(f.componentInstance.pinnedConversations)).toEqual(['Alpha', 'Zulu']);
    expect(names(f.componentInstance.folderTree[0].conversations)).toEqual(['Bravo', 'Yankee']);
  });

  it('sorts conversations with no name last', () => {
    const f = render({}, (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine([
        conv('c1', '', '2026-01-01'),
        conv('c2', 'Alpha', '2026-02-01')
      ]);
      c.SetSort('name');
    });
    expect(names(f.componentInstance.ungroupedConversations)).toEqual(['Alpha', '']);
  });
});
