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
 * DOM spec for <mj-conversation-list>'s modifier-click selection (Ctrl/Cmd
 * toggle, Shift range) and the bulk move / pin actions in the selection bar.
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

const conv = (id: string, name: string, extra: Partial<MJConversationEntity> = {}) =>
  ({
    ID: id,
    Name: name,
    Description: '',
    ProjectID: null,
    IsPinned: false,
    __mj_UpdatedAt: new Date('2026-01-01'),
    ...extra
  } as unknown as MJConversationEntity);

const project = (id: string, name: string, parentId: string | null = null) =>
  ({ ID: id, Name: name, ParentID: parentId, Icon: null, Color: null } as unknown as MJProjectEntity);

/**
 * Pinned P1 · folder Work [ subfolder Deep [ B1 ], A1, A2 ] · ungrouped U1, U2.
 * Rendered top-to-bottom that is: P1, B1, A1, A2, U1, U2 — subfolders render
 * above their parent's own conversations.
 */
const seeded = [
  conv('P1', 'Pinned', { IsPinned: true }),
  conv('A1', 'Work One', { ProjectID: 'proj1' }),
  conv('A2', 'Work Two', { ProjectID: 'proj1' }),
  conv('B1', 'Deep One', { ProjectID: 'proj2' }),
  conv('U1', 'Loose One'),
  conv('U2', 'Loose Two')
];
const seededProjects = [project('proj1', 'Work'), project('proj2', 'Deep', 'proj1')];

const stubEngine = (
  conversations: MJConversationEntity[],
  projects: MJProjectEntity[],
  overrides: Record<string, unknown> = {}
) => ({
  Conversations: conversations,
  Projects: projects,
  GetSharedByInfo: () => null,
  CanShareConversation: ConversationEngine.prototype.CanShareConversation,
  GetConversation: (id: string) => conversations.find(c => c.ID === id),
  ...overrides
});

const click = (modifier?: 'ctrl' | 'meta' | 'shift') =>
  new MouseEvent('click', {
    ctrlKey: modifier === 'ctrl',
    metaKey: modifier === 'meta',
    shiftKey: modifier === 'shift'
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
      { provide: NotificationService, useValue: { markConversationAsRead: () => {} } },
      { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
      { provide: MJDialogService, useValue: {} },
    ],
    inputs: { environmentId: 'env1', currentUser, ...inputs },
    setup: (c) => {
      (c as unknown as { engine: unknown }).engine = stubEngine(seeded, seededProjects);
      setup?.(c);
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
    },
  });

const byId = (id: string) => seeded.find(c => c.ID === id)!;
const selected = (c: ConversationListComponent) => Array.from(c.selectedConversationIds).sort();

describe('ConversationListComponent (DOM) — modifier-click selection', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('plain click opens a conversation and does not start selection mode', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    f.componentInstance.handleConversationClick(byId('U1'), click());
    expect(spy).toHaveBeenCalledWith('U1');
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('Ctrl-click starts selection mode, selects the row, and opens nothing', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(selected(f.componentInstance)).toEqual(['U1']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Cmd-click behaves like Ctrl-click', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U1'), click('meta'));
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('Ctrl-click on a selected row deselects it', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U2'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual(['U2']);
  });

  it('Shift-click selects the whole range in rendered order, across sections', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('P1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('A1'), click('shift'));
    // Rendered order is P1, B1, A1 — the subfolder's conversation sits between them.
    expect(selected(f.componentInstance)).toEqual(['A1', 'B1', 'P1']);
  });

  it('Shift-click selects the same range when dragged upward', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U2'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U1'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('Shift-click ranges from the open conversation, so one click highlights a span', () => {
    const f = render({ selectedConversationId: 'P1' });
    f.componentInstance.handleConversationClick(byId('A1'), click('shift'));
    expect(f.componentInstance.isSelectionMode).toBe(true);
    // Rendered order is P1, B1, A1 — all three come in on the single click.
    expect(selected(f.componentInstance)).toEqual(['A1', 'B1', 'P1']);
  });

  it('matches the open conversation regardless of ID casing', () => {
    const f = render({ selectedConversationId: 'p1' });
    f.componentInstance.handleConversationClick(byId('B1'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['B1', 'P1']);
  });

  it('keeps ranging from the open conversation on a second Shift-click', () => {
    const f = render({ selectedConversationId: 'P1' });
    f.componentInstance.handleConversationClick(byId('B1'), click('shift'));
    f.componentInstance.handleConversationClick(byId('A2'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['A1', 'A2', 'B1', 'P1']);
  });

  it('prefers a row picked with Ctrl over the open conversation as the range start', () => {
    const f = render({ selectedConversationId: 'P1' });
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U2'), click('shift'));
    // P1 rides along because the Ctrl-click seeded it, but the RANGE ran U1→U2 —
    // had it started at P1 it would have swept up B1, A1 and A2 as well.
    expect(selected(f.componentInstance)).toEqual(['P1', 'U1', 'U2']);
  });

  it('Shift-click selects just that row when no conversation is open', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('A2'), click('shift'));
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(selected(f.componentInstance)).toEqual(['A2']);
  });

  it('Shift-click selects just that row when the open conversation is hidden in a collapsed folder', () => {
    const f = render({ selectedConversationId: 'B1' }, (c) => {
      c.toggleFolder('proj2'); // collapse the folder holding the open conversation
    });
    f.componentInstance.handleConversationClick(byId('U1'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('a range never reaches rows hidden inside a collapsed folder', () => {
    const f = render({}, (c) => {
      c.toggleFolder('proj2'); // collapse the subfolder holding B1
    });
    f.componentInstance.handleConversationClick(byId('P1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('A1'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['A1', 'P1']);
  });

  it('a range never reaches rows hidden inside a collapsed section', () => {
    const f = render({}, (c) => {
      c.pinnedExpanded = false;
    });
    f.componentInstance.handleConversationClick(byId('B1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('A1'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['A1', 'B1']);
  });

  it('uses the flat rendered order when grouping is off', () => {
    const f = render({}, (c) => {
      c.groupBy = 'none';
    });
    // Flat order is Pinned then unpinnedConversations in engine order.
    f.componentInstance.handleConversationClick(byId('P1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('A2'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['A1', 'A2', 'P1']);
  });

  it('a plain click clears a highlighted range and opens that conversation', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U2'), click('shift'));
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);

    f.componentInstance.handleConversationClick(byId('A1'), click());

    expect(selected(f.componentInstance)).toEqual([]);
    expect(f.componentInstance.isSelectionMode).toBe(false);
    expect(spy).toHaveBeenCalledWith('A1');
  });

  it('ranges from the conversation a plain click opened', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('A1'), click());
    f.componentRef.setInput('selectedConversationId', 'A1'); // the host opens it

    f.componentInstance.handleConversationClick(byId('U1'), click('shift'));

    // Rendered order runs A1, A2, U1 — the cleared U1 comes back as part of the new range.
    expect(selected(f.componentInstance)).toEqual(['A1', 'A2', 'U1']);
  });

  it('a plain click collapses the selection however the mode was started', () => {
    const f = render();
    f.componentInstance.toggleSelectionMode();
    f.componentInstance.selectedConversationIds.add('U1');
    f.componentInstance.handleConversationClick(byId('U2'), click());
    expect(selected(f.componentInstance)).toEqual([]);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('leaves selection mode when a modifier-click deselects the last row', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('leaves selection mode when the last row is deselected, however the mode was started', () => {
    const f = render();
    f.componentInstance.toggleSelectionMode();
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual([]);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('Escape leaves selection mode and clears the selection', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(f.componentInstance.isSelectionMode).toBe(false);
    expect(selected(f.componentInstance)).toEqual([]);
  });
});

describe('ConversationListComponent (DOM) — bulk move and pin', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const bulkEngine = () => ({
    MoveMultipleConversationsToProject: vi.fn().mockResolvedValue({ Successful: ['U1', 'U2'], Failed: [] }),
    PinMultipleConversations: vi.fn().mockResolvedValue({ Successful: ['U1', 'U2'], Failed: [] })
  });

  const renderSelected = (
    ids: string[],
    engineOverrides: Record<string, unknown> = bulkEngine(),
    providerOverrides: Record<string, unknown> = {}
  ) => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const f = renderComponentFixture(ConversationListComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ConversationListComponent, StubNotificationBadgeComponent, StubShareDialogComponent],
      providers: [
        { provide: DialogService, useValue: { alert, ...providerOverrides } },
        { provide: NotificationService, useValue: { markConversationAsRead: () => {} } },
        { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
        { provide: MJDialogService, useValue: {} },
      ],
      inputs: { environmentId: 'env1', currentUser },
      setup: (c) => {
        (c as unknown as { engine: unknown }).engine = stubEngine(seeded, seededProjects, engineOverrides);
        (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
        c.toggleSelectionMode();
        ids.forEach(id => c.selectedConversationIds.add(id));
      },
    });
    return { f, alert, engine: (f.componentInstance as unknown as { engine: Record<string, ReturnType<typeof vi.fn>> }).engine };
  };

  it('moves every selected conversation into the chosen folder', async () => {
    const { f, engine } = renderSelected(['U1', 'U2']);
    await f.componentInstance.bulkMoveToFolder('proj1');
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['U1', 'U2'], 'proj1', currentUser);
  });

  it('moves selected conversations out of their folders when "No folder" is chosen', async () => {
    const { f, engine } = renderSelected(['U1']);
    await f.componentInstance.bulkMoveToFolder(null);
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['U1'], null, currentUser);
  });

  it('keeps the selection after a move so a second bulk action can follow', async () => {
    const { f } = renderSelected(['U1', 'U2']);
    await f.componentInstance.bulkMoveToFolder('proj1');
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('pins and unpins the whole selection', async () => {
    const { f, engine } = renderSelected(['U1', 'U2']);
    await f.componentInstance.bulkSetPinned(true);
    expect(engine['PinMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], true, currentUser);
    await f.componentInstance.bulkSetPinned(false);
    expect(engine['PinMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], false, currentUser);
  });

  it('reports the conversations that could not be moved', async () => {
    const failing = {
      MoveMultipleConversationsToProject: vi.fn().mockResolvedValue({
        Successful: ['U1'],
        Failed: [{ ID: 'U2', Name: 'Loose Two', Error: 'Permission denied' }]
      })
    };
    const { f, alert } = renderSelected(['U1', 'U2'], failing);
    await f.componentInstance.bulkMoveToFolder('proj1');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(String(alert.mock.calls[0][1])).toContain('Loose Two');
  });

  it('does nothing when a bulk action runs with an empty selection', async () => {
    const { f, engine } = renderSelected([]);
    await f.componentInstance.bulkSetPinned(true);
    expect(engine['PinMultipleConversations']).not.toHaveBeenCalled();
  });
});

describe('ConversationListComponent (DOM) — selection is shown on the row', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const renderInSelectionMode = (setup?: (c: ConversationListComponent) => void) => {
    const f = render({}, (c) => {
      c.toggleSelectionMode();
      setup?.(c);
    });
    f.detectChanges();
    return f;
  };

  it('marks selected rows and leaves the rest unmarked', () => {
    const f = renderInSelectionMode((c) => c.selectedConversationIds.add('U1'));
    const rows = queryAll(f, '.conversation-item');
    const selectedRows = rows.filter(r => r.classList.contains('selected'));
    expect(selectedRows.length).toBe(1);
    expect(selectedRows[0].textContent).toContain('Loose One');
  });

  it('marks every row of a multi-row selection', () => {
    const f = renderInSelectionMode((c) => {
      c.selectedConversationIds.add('U1');
      c.selectedConversationIds.add('A1');
    });
    expect(queryAll(f, '.conversation-item.selected').length).toBe(2);
  });

  it('keeps the open conversation distinguishable while it is also selected', () => {
    const f = renderInSelectionMode((c) => {
      c.selectedConversationId = 'U1';
      c.selectedConversationIds.add('U1');
    });
    const row = queryAll(f, '.conversation-item').find(r => r.textContent?.includes('Loose One'))!;
    expect(row.classList.contains('active')).toBe(true);
    expect(row.classList.contains('selected')).toBe(true);
  });

  it('drops every row mark when selection mode ends', () => {
    const f = renderInSelectionMode((c) => c.selectedConversationIds.add('U1'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(queryAll(f, '.conversation-item.selected').length).toBe(0);
  });
});

describe('ConversationListComponent (DOM) — dragging a whole selection', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const dragEvent = () =>
    ({
      dataTransfer: { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as DragEvent);

  const moveSpy = () => vi.fn().mockResolvedValue({ Successful: ['U1', 'U2'], Failed: [] });

  const renderWithSelection = (ids: string[], move = moveSpy()) => {
    const f = renderComponentFixture(ConversationListComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ConversationListComponent, StubNotificationBadgeComponent, StubShareDialogComponent],
      providers: [
        { provide: DialogService, useValue: { alert: vi.fn().mockResolvedValue(undefined) } },
        { provide: NotificationService, useValue: { markConversationAsRead: () => {} } },
        { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
        { provide: MJDialogService, useValue: {} },
      ],
      inputs: { environmentId: 'env1', currentUser },
      setup: (c) => {
        (c as unknown as { engine: unknown }).engine = stubEngine(seeded, seededProjects, {
          MoveMultipleConversationsToProject: move
        });
        (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
        c.toggleSelectionMode();
        ids.forEach(id => c.selectedConversationIds.add(id));
      },
    });
    f.detectChanges();
    return { f, move };
  };

  const folder = (id: string) => seededProjects.find(p => p.ID === id)!;

  it('keeps rows draggable while in selection mode', () => {
    const { f } = renderWithSelection(['U1']);
    const rows = queryAll(f, '.conversation-item');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('draggable')).toBe('true');
    }
  });

  /** Dispatches a real dragstart on the row so Angular runs its own change detection. */
  const dragRow = (f: ReturnType<typeof renderWithSelection>['f'], name: string) => {
    const row = queryAll(f, '.conversation-item').find(r => r.textContent?.includes(name))!;
    row.dispatchEvent(new Event('dragstart', { bubbles: true }));
  };

  it('dragging a selected row picks up every selected conversation', () => {
    const { f } = renderWithSelection(['U1', 'U2']);
    dragRow(f, 'Loose One');
    f.detectChanges();
    const draggingNames = queryAll(f, '.conversation-item.dragging').map(r => r.textContent);
    expect(draggingNames.length).toBe(2);
    expect(draggingNames.some(n => n?.includes('Loose One'))).toBe(true);
    expect(draggingNames.some(n => n?.includes('Loose Two'))).toBe(true);
  });

  it('dragging an unselected row carries only that row and leaves the selection alone', () => {
    const { f } = renderWithSelection(['U1', 'U2']);
    dragRow(f, 'Work One');
    f.detectChanges();
    expect(queryAll(f, '.conversation-item.dragging').length).toBe(1);
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('dropping the group on a folder moves every dragged conversation at once', async () => {
    const { f, move } = renderWithSelection(['U1', 'U2']);
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvent());
    await f.componentInstance.onFolderDrop(folder('proj1'), dragEvent());
    expect(move).toHaveBeenCalledTimes(1);
    const [ids, projectId] = move.mock.calls[0];
    expect([...(ids as string[])].sort()).toEqual(['U1', 'U2']);
    expect(projectId).toBe('proj1');
  });

  it('dropping the group on Ungrouped moves them all out of their folders', async () => {
    const { f, move } = renderWithSelection(['A1', 'A2']);
    f.componentInstance.onConversationDragStart(byId('A1'), dragEvent());
    await f.componentInstance.onUngroupedDrop(dragEvent());
    const [ids, projectId] = move.mock.calls[0];
    expect([...(ids as string[])].sort()).toEqual(['A1', 'A2']);
    expect(projectId).toBeNull();
  });

  it('accepts a drag of several conversations over a folder', () => {
    const { f } = renderWithSelection(['U1', 'U2']);
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvent());
    const over = dragEvent();
    f.componentInstance.onFolderDragOver('proj1', over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(f.componentInstance.dragOverTargetId).toBe('proj1');
  });

  it('keeps the selection after a drop so it can be moved again', async () => {
    const { f } = renderWithSelection(['U1', 'U2']);
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvent());
    await f.componentInstance.onFolderDrop(folder('proj1'), dragEvent());
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
    expect(f.componentInstance.isSelectionMode).toBe(true);
  });

  it('clears the drag marks once the drag ends', () => {
    const { f } = renderWithSelection(['U1', 'U2']);
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvent());
    f.componentInstance.onConversationDragEnd();
    f.detectChanges();
    expect(queryAll(f, '.conversation-item.dragging').length).toBe(0);
  });
});

describe('ConversationListComponent (DOM) — clicking empty space clears the selection', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const renderSelected = (ids: string[], fromMenu = false) => {
    const f = render({}, (c) => {
      if (fromMenu) {
        c.toggleSelectionMode();
      } else {
        // Modifier-click is what a user would do; it marks the mode auto-entered.
        c.handleConversationClick(byId(ids[0]), click('ctrl'));
      }
      ids.forEach(id => c.selectedConversationIds.add(id));
    });
    f.detectChanges();
    return f;
  };

  const clickBlankArea = (f: ReturnType<typeof renderSelected>) => {
    const listContent = query(f, '.list-content') as HTMLElement;
    listContent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();
  };

  it('clicking below the conversations clears a modifier-built selection and leaves selection mode', () => {
    const f = renderSelected(['U1', 'U2']);
    clickBlankArea(f);
    expect(selected(f.componentInstance)).toEqual([]);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('clicking below the conversations ends selection mode however it was started', () => {
    const f = renderSelected(['U1', 'U2'], true);
    clickBlankArea(f);
    expect(selected(f.componentInstance)).toEqual([]);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('does not open or close any conversation', () => {
    const f = renderSelected(['U1', 'U2']);
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    clickBlankArea(f);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the selection when the click lands on a folder row', () => {
    const f = renderSelected(['U1', 'U2']);
    const folderRow = query(f, '.folder-row') as HTMLElement;
    folderRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('keeps the selection when the click lands on a section header', () => {
    const f = renderSelected(['U1', 'U2']);
    const header = query(f, '.section-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('is harmless when nothing is selected', () => {
    const f = render();
    f.detectChanges();
    clickBlankArea(f);
    expect(f.componentInstance.isSelectionMode).toBe(false);
    expect(selected(f.componentInstance)).toEqual([]);
  });
});

describe('ConversationListComponent (DOM) — dropping onto a conversation adopts its folder', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const dragEvt = () =>
    ({
      dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as DragEvent);

  const renderDraggable = (selectedIds: string[] = []) => {
    const move = vi.fn().mockResolvedValue({ Successful: [], Failed: [] });
    const f = renderComponentFixture(ConversationListComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ConversationListComponent, StubNotificationBadgeComponent, StubShareDialogComponent],
      providers: [
        { provide: DialogService, useValue: { alert: vi.fn().mockResolvedValue(undefined) } },
        { provide: NotificationService, useValue: { markConversationAsRead: () => {} } },
        { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
        { provide: MJDialogService, useValue: {} },
      ],
      inputs: { environmentId: 'env1', currentUser },
      setup: (c) => {
        (c as unknown as { engine: unknown }).engine = stubEngine(seeded, seededProjects, {
          MoveMultipleConversationsToProject: move
        });
        (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
        if (selectedIds.length > 0) {
          c.toggleSelectionMode();
          selectedIds.forEach(id => c.selectedConversationIds.add(id));
        }
      },
    });
    f.detectChanges();
    return { f, move };
  };

  it('moves the dragged group into the folder of the conversation it was dropped on', async () => {
    const { f, move } = renderDraggable(['U1', 'U2']);
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvt());
    // A1 lives in the Work folder
    await f.componentInstance.onConversationRowDrop(byId('A1'), dragEvt());
    const [ids, projectId] = move.mock.calls[0];
    expect([...(ids as string[])].sort()).toEqual(['U1', 'U2']);
    expect(projectId).toBe('proj1');
  });

  it('moves a conversation out of its folder when dropped on an ungrouped conversation', async () => {
    const { f, move } = renderDraggable();
    f.componentInstance.onConversationDragStart(byId('A1'), dragEvt());
    await f.componentInstance.onConversationRowDrop(byId('U1'), dragEvt());
    expect(move).toHaveBeenCalledWith(['A1'], null, currentUser);
  });

  it('highlights the destination folder while dragging over one of its conversations', () => {
    const { f } = renderDraggable();
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvt());
    const over = dragEvt();
    f.componentInstance.onConversationRowDragOver(byId('A2'), over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(f.componentInstance.dragOverTargetId).toBe('proj1');
  });

  it('marks the Ungrouped section while dragging over a conversation with no folder', () => {
    const { f } = renderDraggable();
    f.componentInstance.onConversationDragStart(byId('A1'), dragEvt());
    f.componentInstance.onConversationRowDragOver(byId('U1'), dragEvt());
    expect(f.componentInstance.dragOverTargetId).toBe('ungrouped');
  });

  it('does not accept a drop onto a row that is itself being dragged', () => {
    const { f } = renderDraggable(['U1', 'U2']);
    f.componentInstance.onConversationDragStart(byId('U1'), dragEvt());
    const over = dragEvt();
    f.componentInstance.onConversationRowDragOver(byId('U2'), over);
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(f.componentInstance.dragOverTargetId).toBeNull();
  });

  it('does not accept a dragged folder onto a conversation row', () => {
    const { f } = renderDraggable();
    const node = f.componentInstance.folderTree[0];
    f.componentInstance.onFolderDragStart(node, dragEvt());
    const over = dragEvt();
    f.componentInstance.onConversationRowDragOver(byId('U1'), over);
    expect(over.preventDefault).not.toHaveBeenCalled();
  });

  it('saves nothing when the drop target is the folder the conversation is already in', async () => {
    const { f, move } = renderDraggable();
    f.componentInstance.onConversationDragStart(byId('A1'), dragEvt());
    await f.componentInstance.onConversationRowDrop(byId('A2'), dragEvt()); // both already in Work
    expect(move).not.toHaveBeenCalled();
  });
});

describe('ConversationListComponent (DOM) — the selection only holds rows on screen', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const renderSelected = (ids: string[], setup?: (c: ConversationListComponent) => void) =>
    render({}, (c) => {
      setup?.(c);
      c.toggleSelectionMode();
      ids.forEach(id => c.selectedConversationIds.add(id));
    });

  it('Select All skips rows hidden in a collapsed folder or section', () => {
    const f = render({}, (c) => {
      c.toggleFolder('proj2'); // hides B1
      c.pinnedExpanded = false; // hides P1
    });
    f.componentInstance.contextSelectAll();
    expect(selected(f.componentInstance)).toEqual(['A1', 'A2', 'U1', 'U2']);
  });

  it('Select All selects only the rows a search leaves on screen', () => {
    const f = render({}, (c) => {
      c.searchQuery = 'Loose';
    });
    f.componentInstance.contextSelectAll();
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('a search drops the selected rows it hides', () => {
    const f = renderSelected(['A1', 'U1', 'U2']);
    f.componentInstance.searchQuery = 'Loose';
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('clearing the search does not bring dropped rows back', () => {
    const f = renderSelected(['A1', 'U1']);
    f.componentInstance.searchQuery = 'Loose';
    f.componentInstance.searchQuery = '';
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('collapsing a folder drops the selected rows inside it, subfolders included', () => {
    const f = renderSelected(['A1', 'B1', 'U1']);
    f.componentInstance.toggleFolder('proj1');
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('collapsing a section drops the selected rows inside it', () => {
    const f = renderSelected(['P1', 'U1']);
    f.componentInstance.togglePinned();
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('switching to folder grouping drops selected rows that land in a collapsed folder', () => {
    const f = renderSelected(['B1', 'U1'], (c) => {
      c.toggleFolder('proj2');
      c.groupBy = 'none';
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
    });
    f.componentInstance.toggleGroupBy();
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('leaves selection mode when a view change hides every selected row', () => {
    const f = renderSelected(['A1']);
    f.componentInstance.toggleFolder('proj1');
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('drops a selected conversation once it leaves the list', () => {
    const f = renderSelected(['U1', 'U2']);
    const engine = (f.componentInstance as unknown as { engine: { Conversations: MJConversationEntity[] } }).engine;
    engine.Conversations = seeded.filter(c => c.ID !== 'U2');
    (f.componentInstance as unknown as { onConversationListChanged: () => void }).onConversationListChanged();
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('keeps selected rows that a list update only moved out of sight', () => {
    const f = renderSelected(['U1', 'U2'], (c) => c.toggleFolder('proj1'));
    const engine = (f.componentInstance as unknown as { engine: { Conversations: MJConversationEntity[] } }).engine;
    // A move into the collapsed Work folder must not undo the selection.
    engine.Conversations = seeded.map(c => (c.ID === 'U1' || c.ID === 'U2') ? conv(c.ID, c.Name!, { ProjectID: 'proj1' }) : c);
    (f.componentInstance as unknown as { onConversationListChanged: () => void }).onConversationListChanged();
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });
});

describe('ConversationListComponent (DOM) — a Ctrl-click selection includes the open conversation', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('adds the open conversation when a Ctrl-click starts the selection', () => {
    const f = render({ selectedConversationId: 'P1' });
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual(['P1', 'U1']);
  });

  it('drags the open conversation along with the rest', () => {
    const f = render({ selectedConversationId: 'P1' });
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.onConversationDragStart(byId('U1'), new MouseEvent('dragstart') as unknown as DragEvent);
    expect([...f.componentInstance.draggedConversationIds].sort()).toEqual(['P1', 'U1']);
  });

  it('selects only the clicked row when no conversation is open', () => {
    const f = render();
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });

  it('keeps the open conversation selected when it is the row that was Ctrl-clicked', () => {
    const f = render({ selectedConversationId: 'U1' });
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual(['U1']);
    expect(f.componentInstance.isSelectionMode).toBe(true);
  });

  it('does not bring the open conversation back once it has been deselected', () => {
    const f = render({ selectedConversationId: 'P1' });
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    f.componentInstance.handleConversationClick(byId('P1'), click('ctrl')); // drop the open one
    f.componentInstance.handleConversationClick(byId('U2'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual(['U1', 'U2']);
  });

  it('does not add an open conversation hidden inside a collapsed folder', () => {
    const f = render({ selectedConversationId: 'B1' }, (c) => {
      c.toggleFolder('proj2'); // B1 lives here
    });
    f.componentInstance.handleConversationClick(byId('U1'), click('ctrl'));
    expect(selected(f.componentInstance)).toEqual(['U1']);
  });
});
