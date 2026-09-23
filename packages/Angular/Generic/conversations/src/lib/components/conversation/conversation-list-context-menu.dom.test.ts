import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationEntity, MJProjectEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationListComponent } from './conversation-list.component';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';

/**
 * DOM spec for <mj-conversation-list>'s right-click menu — one menu for
 * conversation rows (single or whole selection), folder rows and empty space,
 * replacing the per-row ⋯ menu's content and the old bottom selection bar.
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
    UserID: 'u1',
    User: 'Me',
    Description: '',
    ProjectID: null,
    IsPinned: false,
    __mj_UpdatedAt: new Date('2026-01-01'),
    ...extra
  } as unknown as MJConversationEntity);

const project = (id: string, name: string) =>
  ({ ID: id, Name: name, ParentID: null, Icon: null, Color: null } as unknown as MJProjectEntity);

const seeded = [
  conv('A1', 'Work One', { ProjectID: 'proj1' }),
  conv('U1', 'Loose One'),
  conv('U2', 'Loose Two'),
  conv('U3', 'Loose Three')
];
const seededProjects = [project('proj1', 'Work')];

const engineStub = (overrides: Record<string, unknown> = {}) => ({
  Conversations: seeded,
  Projects: seededProjects,
  GetSharedByInfo: () => null,
  GetConversation(id: string) {
    return (this as unknown as { Conversations: MJConversationEntity[] }).Conversations.find(c => c.ID === id);
  },
  MoveMultipleConversationsToProject: vi.fn().mockResolvedValue({ Successful: [], Failed: [] }),
  PinMultipleConversations: vi.fn().mockResolvedValue({ Successful: [], Failed: [] }),
  DeleteMultipleConversations: vi.fn().mockResolvedValue({ Successful: [], Failed: [] }),
  ...overrides
});

/** A real contextmenu event, so Angular runs its own change detection on the binding. */
const contextMenuEvent = () =>
  new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 240 });

/** Right-clicks a rendered element and settles the view. */
const rightClickOn = (f: { detectChanges: () => void }, element: Element) => {
  const event = contextMenuEvent();
  element.dispatchEvent(event);
  f.detectChanges();
  return event;
};

const render = (
  setup?: (c: ConversationListComponent) => void,
  engineOverrides: Record<string, unknown> = {}
) => {
  const engine = engineStub(engineOverrides);
  const f = renderComponentFixture(ConversationListComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [ConversationListComponent, StubNotificationBadgeComponent, StubShareDialogComponent],
    providers: [
      {
        provide: DialogService,
        useValue: { alert: vi.fn().mockResolvedValue(undefined), confirm: vi.fn().mockResolvedValue(true) }
      },
      { provide: NotificationService, useValue: { markConversationAsRead: () => {} } },
      { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
      { provide: MJDialogService, useValue: {} },
    ],
    inputs: { environmentId: 'env1', currentUser },
    setup: (c) => {
      (c as unknown as { engine: unknown }).engine = engine;
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
      setup?.(c);
    },
  });
  f.detectChanges();
  return { f, engine: engine as unknown as Record<string, ReturnType<typeof vi.fn>> };
};

const byId = (id: string) => seeded.find(c => c.ID === id)!;
const rowFor = (f: never, name: string) =>
  queryAll(f, '.conversation-item').find(r => r.textContent?.includes(name))!;
const menuLabels = (f: { nativeElement: HTMLElement }) =>
  queryAll(f as never, '.list-context-menu .menu-item').map(b => b.textContent?.trim() ?? '');
const findItem = (f: never, text: string) =>
  queryAll(f, '.list-context-menu .menu-item').find(b => b.textContent?.includes(text)) as HTMLButtonElement;

const selectRows = (c: ConversationListComponent, ids: string[]) => {
  c.toggleSelectionMode();
  ids.forEach(id => c.selectedConversationIds.add(id));
};

describe('ConversationListComponent (DOM) — right-click menu on conversations', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('opens a menu at the pointer and suppresses the browser menu', () => {
    const { f } = render();
    const event = rightClickOn(f, rowFor(f as never, 'Loose One'));
    expect(query(f, '.list-context-menu')).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  it('the old bottom selection bar is gone', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    expect(query(f, '.selection-action-bar')).toBeNull();
  });

  it('acts on the whole selection when the clicked row is part of it', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']));
    rightClickOn(f, rowFor(f as never, 'Loose Two'));
    expect(query(f, '.list-context-menu .context-menu-header')?.textContent).toContain('3 selected');
    expect(menuLabels(f).some(l => l.includes('Delete 3'))).toBe(true);
  });

  it('offers no Rename for a multi-conversation menu', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    expect(menuLabels(f).some(l => l.includes('Rename'))).toBe(false);
  });

  it('acts on the clicked row alone when it is not part of the selection', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Work One'));
    expect(query(f, '.list-context-menu .context-menu-header')).toBeNull();
    expect(menuLabels(f).some(l => l.includes('Rename'))).toBe(true);
    expect(menuLabels(f).some(l => l === 'Delete')).toBe(true);
    // the selection is left alone
    expect(Array.from(f.componentInstance.selectedConversationIds).sort()).toEqual(['U1', 'U2']);
  });

  it('pins every selected conversation from the menu', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Pin').click();
    await Promise.resolve();
    expect(engine['PinMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], true, currentUser);
  });

  it('offers both Pin and Unpin for a multi-conversation menu', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    const labels = menuLabels(f);
    expect(labels.some(l => l === 'Pin')).toBe(true);
    expect(labels.some(l => l === 'Unpin')).toBe(true);
  });

  it('moves the whole selection through the Move to folder submenu', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Move to folder').click();
    f.detectChanges();
    findItem(f as never, 'Work').click();
    await Promise.resolve();
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['U1', 'U2'], 'proj1', currentUser);
  });

  it('moves only the clicked row when it is not part of the selection', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Work One'));
    findItem(f as never, 'Move to folder').click();
    f.detectChanges();
    findItem(f as never, 'No folder').click();
    await Promise.resolve();
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['A1'], null, currentUser);
  });

  it('closes on Escape', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(query(f, '.list-context-menu')).toBeNull();
  });

  it('the row ⋯ button opens the same menu', () => {
    const { f } = render();
    const menuBtn = query(f, '.conversation-item .menu-btn') as HTMLButtonElement;
    menuBtn.click();
    f.detectChanges();
    expect(query(f, '.list-context-menu')).not.toBeNull();
  });
});

describe('ConversationListComponent (DOM) — right-click menu on folders and empty space', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('offers the folder actions on a folder row', () => {
    const { f } = render();
    rightClickOn(f, query(f, '.folder-row') as Element);
    const labels = menuLabels(f);
    expect(labels.some(l => l.includes('New Subfolder'))).toBe(true);
    expect(labels.some(l => l.includes('Rename'))).toBe(true);
    expect(labels.some(l => l.includes('Delete'))).toBe(true);
  });

  it('drops the hover action icons from folder rows', () => {
    const { f } = render();
    expect(query(f, '.folder-action-btn')).toBeNull();
  });

  it('offers New Conversation, New Folder and Select All on empty space', () => {
    const { f } = render();
    rightClickOn(f, query(f, '.list-content') as Element);
    const labels = menuLabels(f);
    expect(labels.some(l => l.includes('New Conversation'))).toBe(true);
    expect(labels.some(l => l.includes('New Folder'))).toBe(true);
    expect(labels.some(l => l.includes('Select All'))).toBe(true);
  });

  it('Select All from the empty-space menu selects every conversation', () => {
    const { f } = render();
    rightClickOn(f, query(f, '.list-content') as Element);
    findItem(f as never, 'Select All').click();
    f.detectChanges();
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(Array.from(f.componentInstance.selectedConversationIds).sort()).toEqual(['A1', 'U1', 'U2', 'U3']);
  });

  it('New Conversation from the empty-space menu asks for a new conversation', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.newConversationRequested.subscribe(spy);
    rightClickOn(f, query(f, '.list-content') as Element);
    findItem(f as never, 'New Conversation').click();
    expect(spy).toHaveBeenCalled();
  });
});

describe('ConversationListComponent (DOM) — sharing from the menu', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('offers Share on a single conversation', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    expect(menuLabels(f).some(l => l === 'Share')).toBe(true);
  });

  it('names the count when several conversations are selected', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']));
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    expect(menuLabels(f).some(l => l.includes('Share 3 conversations'))).toBe(true);
  });

  it('opens the bulk dialog with every selected conversation', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']));
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(c => c.ResourceID).sort()).toEqual(['U1', 'U2', 'U3']);
    expect(f.componentInstance.isShareDialogOpen).toBe(true);
  });

  it('opens the dialog with just the clicked row when it is not part of the selection', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f as never, 'Work One'));
    findItem(f as never, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(c => c.ResourceID)).toEqual(['A1']);
  });

  it('closes the menu when Share is chosen', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Share').click();
    f.detectChanges();
    expect(query(f, '.list-context-menu')).toBeNull();
  });

  it('closes the dialog when the share finishes', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Share').click();
    f.detectChanges();
    f.componentInstance.onShareDialogResult({ Action: 'save' });
    expect(f.componentInstance.isShareDialogOpen).toBe(false);
  });

  it('leaves out conversations you do not own and says how many', () => {
    const { f } = render((c) => {
      const engine = (c as unknown as { engine: { Conversations: MJConversationEntity[] } }).engine;
      engine.Conversations = [conv('U1', 'Loose One'), conv('U2', 'Loose Two', { UserID: 'someone-else' })];
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
      selectRows(c, ['U1', 'U2']);
    });
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(c => c.ResourceID)).toEqual(['U1']);
    expect(f.componentInstance.shareNotice).toContain('1 of 2');
  });

  it('closes the dialog on cancel', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f as never, 'Loose One'));
    findItem(f as never, 'Share').click();
    f.detectChanges();
    f.componentInstance.onShareDialogResult({ Action: 'cancel' });
    expect(f.componentInstance.isShareDialogOpen).toBe(false);
  });
});
