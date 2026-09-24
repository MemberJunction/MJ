import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import type { MJConversationEntity, MJProjectEntity, SharedByInfo } from '@memberjunction/core-entities';
import { ComponentFixture } from '@angular/core/testing';
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
  GetSharedByInfo: (_id: string): SharedByInfo | null => null,
  CanShareConversation: ConversationEngine.prototype.CanShareConversation,
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
type ListFixture = ComponentFixture<ConversationListComponent>;

const rowFor = (f: ListFixture, name: string) =>
  queryAll(f, '.conversation-item').find(r => r.textContent?.includes(name))!;
const menuLabels = (f: ListFixture) =>
  queryAll(f, '.list-context-menu .menu-item').map(b => b.textContent?.trim() ?? '');
const findItem = (f: ListFixture, text: string) =>
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
    const event = rightClickOn(f, rowFor(f, 'Loose One'));
    expect(query(f, '.list-context-menu')).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  it('the old bottom selection bar is gone', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    expect(query(f, '.selection-action-bar')).toBeNull();
  });

  it('acts on the whole selection when the clicked row is part of it', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']));
    rightClickOn(f, rowFor(f, 'Loose Two'));
    expect(query(f, '.list-context-menu .context-menu-header')?.textContent).toContain('3 selected');
    expect(menuLabels(f).some(l => l.includes('Delete 3'))).toBe(true);
  });

  it('offers no Rename for a multi-conversation menu', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    expect(menuLabels(f).some(l => l.includes('Rename'))).toBe(false);
  });

  it('acts on the clicked row alone when it is not part of the selection', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Work One'));
    expect(query(f, '.list-context-menu .context-menu-header')).toBeNull();
    expect(menuLabels(f).some(l => l.includes('Rename'))).toBe(true);
    expect(menuLabels(f).some(l => l === 'Delete')).toBe(true);
    // the selection is left alone
    expect(Array.from(f.componentInstance.selectedConversationIds).sort()).toEqual(['U1', 'U2']);
  });

  it('pins every selected conversation from the menu', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Pin').click();
    await Promise.resolve();
    expect(engine['PinMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], true, currentUser);
  });

  it('offers both Pin and Unpin for a multi-conversation menu', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    const labels = menuLabels(f);
    expect(labels.some(l => l === 'Pin')).toBe(true);
    expect(labels.some(l => l === 'Unpin')).toBe(true);
  });

  it('moves the whole selection through the Move to folder submenu', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Move to folder').click();
    f.detectChanges();
    findItem(f, 'Work').click();
    await Promise.resolve();
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['U1', 'U2'], 'proj1', currentUser);
  });

  it('moves only the clicked row when it is not part of the selection', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Work One'));
    findItem(f, 'Move to folder').click();
    f.detectChanges();
    findItem(f, 'No folder').click();
    await Promise.resolve();
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['A1'], null, currentUser);
  });

  it('closes on Escape', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f, 'Loose One'));
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
    findItem(f, 'Select All').click();
    f.detectChanges();
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(Array.from(f.componentInstance.selectedConversationIds).sort()).toEqual(['A1', 'U1', 'U2', 'U3']);
  });

  it('New Conversation from the empty-space menu asks for a new conversation', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.newConversationRequested.subscribe(spy);
    rightClickOn(f, query(f, '.list-content') as Element);
    findItem(f, 'New Conversation').click();
    expect(spy).toHaveBeenCalled();
  });
});

describe('ConversationListComponent (DOM) — sharing from the menu', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('offers Share on a single conversation', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f, 'Loose One'));
    expect(menuLabels(f).some(l => l === 'Share')).toBe(true);
  });

  it('names the count when several conversations are selected', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    expect(menuLabels(f).some(l => l.includes('Share 3 conversations'))).toBe(true);
  });

  it('opens the bulk dialog with every selected conversation', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(c => c.ResourceID).sort()).toEqual(['U1', 'U2', 'U3']);
    expect(f.componentInstance.isShareDialogOpen).toBe(true);
  });

  it('opens the dialog with just the clicked row when it is not part of the selection', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Work One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(c => c.ResourceID)).toEqual(['A1']);
  });

  it('closes the menu when Share is chosen', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    expect(query(f, '.list-context-menu')).toBeNull();
  });

  it('closes the dialog when the share finishes', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
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
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(c => c.ResourceID)).toEqual(['U1']);
    expect(f.componentInstance.shareNotice).toContain('1 of 2');
  });

  it('closes the dialog on cancel', () => {
    const { f } = render();
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    f.componentInstance.onShareDialogResult({ Action: 'cancel' });
    expect(f.componentInstance.isShareDialogOpen).toBe(false);
  });
});

describe('ConversationListComponent (DOM) — who can share from the menu', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const grantLevels: Record<string, SharedByInfo['Level']> = {};
  const sharedWithMe = (id: string): SharedByInfo | null =>
    grantLevels[id] ? { UserID: 'someone-else', Name: 'Someone', Email: null, Level: grantLevels[id] } : null;

  /** U1 is mine; U2 belongs to someone else and reaches me through a grant at `level`. */
  const renderWithGrant = (level: SharedByInfo['Level'], setup?: (c: ConversationListComponent) => void) => {
    Object.keys(grantLevels).forEach(k => delete grantLevels[k]);
    grantLevels['U2'] = level;
    return render((c) => {
      const engine = (c as unknown as { engine: { Conversations: MJConversationEntity[] } }).engine;
      engine.Conversations = [conv('U1', 'Loose One'), conv('U2', 'Loose Two', { UserID: 'someone-else', User: 'Someone' })];
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
      setup?.(c);
    }, { GetSharedByInfo: sharedWithMe });
  };

  it('shares a conversation you hold Owner access to, like the chat header does', () => {
    const { f } = renderWithGrant('Owner', (c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(s => s.ResourceID).sort()).toEqual(['U1', 'U2']);
    expect(f.componentInstance.shareNotice).toBeNull();
  });

  it('leaves out a conversation you hold only Edit access to', () => {
    const { f } = renderWithGrant('Edit', (c) => selectRows(c, ['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(s => s.ResourceID)).toEqual(['U1']);
    expect(f.componentInstance.shareNotice).toContain('1 of 2');
  });

  it('disables Share when none of the targets can be shared', () => {
    const { f } = renderWithGrant('View');
    rightClickOn(f, rowFor(f, 'Loose Two'));
    expect(findItem(f, 'Share').disabled).toBe(true);
  });

  it('says why, instead of doing nothing, when asked to share what it cannot', () => {
    const { f } = renderWithGrant('View');
    rightClickOn(f, rowFor(f, 'Loose Two'));
    // The button was drawn enabled, then access changed before the click landed.
    const share = findItem(f, 'Share');
    share.disabled = false;
    share.click();
    f.detectChanges();
    const alert = f.debugElement.injector.get(DialogService).alert as unknown as ReturnType<typeof vi.fn>;
    expect(alert).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.isShareDialogOpen).toBe(false);
  });
});

describe('ConversationListComponent (DOM) — deleting from the menu keeps the rest of the selection', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  const deleteResult = (successful: string[], failed: string[] = []) => ({
    DeleteMultipleConversations: vi.fn().mockResolvedValue({
      Successful: successful,
      Failed: failed.map(id => ({ ID: id, Name: byId(id).Name, Error: 'Permission denied' }))
    })
  });

  it('deleting a row outside the selection leaves the selection alone', async () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']), deleteResult(['A1']));
    rightClickOn(f, rowFor(f, 'Work One'));
    findItem(f, 'Delete').click();
    await flush();
    expect(Array.from(f.componentInstance.selectedConversationIds).sort()).toEqual(['U1', 'U2']);
    expect(f.componentInstance.isSelectionMode).toBe(true);
  });

  it('keeps the rows a partly failed delete could not remove selected', async () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2', 'U3']), deleteResult(['U1'], ['U2', 'U3']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Delete 3').click();
    await flush();
    expect(Array.from(f.componentInstance.selectedConversationIds).sort()).toEqual(['U2', 'U3']);
  });

  it('ends selection mode once the whole selection is deleted', async () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']), deleteResult(['U1', 'U2']));
    rightClickOn(f, rowFor(f, 'Loose One'));
    findItem(f, 'Delete 2').click();
    await flush();
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });
});

describe('ConversationListComponent (DOM) — the menu stays inside the window', () => {
  const viewport = { width: 1000, height: 600 };
  let menuSize = { width: 200, height: 300 };
  const menuButtonRect = { left: 100, top: 520, width: 28, height: 28 };

  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect);

  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    menuSize = { width: 200, height: 300 };
    Object.defineProperty(window, 'innerWidth', { value: viewport.width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: viewport.height, configurable: true });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('list-context-menu')) return rect(0, 0, menuSize.width, menuSize.height);
      if (this.classList.contains('menu-btn')) {
        return rect(menuButtonRect.left, menuButtonRect.top, menuButtonRect.width, menuButtonRect.height);
      }
      return rect(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const rightClickAt = (f: ListFixture, element: Element, x: number, y: number) => {
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    f.detectChanges();
  };
  const menuPosition = (f: ListFixture) => {
    const menu = query(f, '.list-context-menu') as HTMLElement;
    return { left: menu.style.left, top: menu.style.top };
  };

  it('opens at the pointer when it fits', () => {
    const { f } = render();
    rightClickAt(f, rowFor(f, 'Loose One'), 120, 100);
    expect(menuPosition(f)).toEqual({ left: '120px', top: '100px' });
  });

  it('opens upward from the pointer when there is no room below', () => {
    const { f } = render();
    rightClickAt(f, rowFor(f, 'Loose One'), 120, 500);
    expect(menuPosition(f).top).toBe('200px'); // 500 - 300
  });

  it('moves left when there is no room to the right', () => {
    const { f } = render();
    rightClickAt(f, rowFor(f, 'Loose One'), 950, 100);
    expect(menuPosition(f).left).toBe('792px'); // 1000 - 8 margin - 200
  });

  it('opens above the ⋯ button when there is no room below it', () => {
    const { f } = render();
    (query(f, '.conversation-item .menu-btn') as HTMLButtonElement).click();
    f.detectChanges();
    expect(menuPosition(f).top).toBe('218px'); // button top 520 - 2 gap - 300
  });

  it('keeps the taller folder picker inside the window', () => {
    const { f } = render();
    rightClickAt(f, rowFor(f, 'Loose One'), 120, 200);
    expect(menuPosition(f).top).toBe('200px');
    menuSize = { width: 200, height: 450 };
    findItem(f, 'Move to folder').click();
    f.detectChanges();
    expect(menuPosition(f).top).toBe('142px'); // pinned to the bottom: 600 - 8 - 450
  });
});
