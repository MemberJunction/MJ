import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import type { MJConversationEntity, MJProjectEntity, SharedByInfo } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationListComponent } from './conversation-list.component';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';

/**
 * DOM spec for the controls that build and act on a selection without a
 * keyboard: the bar that replaces the search row while selecting, the row
 * checkbox a mouse reveals on hover, and a touch long-press.
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
  GetSharedByInfo: (): SharedByInfo | null => null,
  CanShareConversation: ConversationEngine.prototype.CanShareConversation,
  GetConversation(id: string) {
    return (this as unknown as { Conversations: MJConversationEntity[] }).Conversations.find(c => c.ID === id);
  },
  MoveMultipleConversationsToProject: vi.fn().mockResolvedValue({ Successful: [], Failed: [] }),
  PinMultipleConversations: vi.fn().mockResolvedValue({ Successful: [], Failed: [] }),
  DeleteMultipleConversations: vi.fn().mockResolvedValue({ Successful: [], Failed: [] }),
  ...overrides
});

type ListFixture = ComponentFixture<ConversationListComponent>;

const render = (
  setup?: (c: ConversationListComponent) => void,
  inputs: Record<string, unknown> = {},
  engineOverrides: Record<string, unknown> = {}
) => {
  const engine = engineStub(engineOverrides);
  const confirm = vi.fn().mockResolvedValue(true);
  const f = renderComponentFixture(ConversationListComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [ConversationListComponent, StubNotificationBadgeComponent, StubShareDialogComponent],
    providers: [
      { provide: DialogService, useValue: { alert: vi.fn().mockResolvedValue(undefined), confirm } },
      { provide: NotificationService, useValue: { markConversationAsRead: () => {} } },
      { provide: ActiveTasksService, useValue: { conversationIdsWithTasks$: { subscribe: () => {} } } },
      { provide: MJDialogService, useValue: {} },
    ],
    inputs: { environmentId: 'env1', currentUser, ...inputs },
    setup: (c) => {
      (c as unknown as { engine: unknown }).engine = engine;
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
      setup?.(c);
    },
  });
  f.detectChanges();
  return { f, confirm, engine: engine as unknown as Record<string, ReturnType<typeof vi.fn>> };
};

const selectRows = (c: ConversationListComponent, ids: string[]) => {
  c.toggleSelectionMode();
  ids.forEach(id => c.selectedConversationIds.add(id));
};

const selected = (f: ListFixture) => Array.from(f.componentInstance.selectedConversationIds).sort();
const rowFor = (f: ListFixture, name: string) =>
  queryAll(f, '.conversation-item').find(r => r.textContent?.includes(name))! as HTMLElement;
const checkboxFor = (f: ListFixture, name: string) => rowFor(f, name).querySelector('.row-check') as HTMLButtonElement;
const barButton = (f: ListFixture, label: string) =>
  query(f, `.selection-bar [aria-label="${label}"]`) as HTMLButtonElement;

/** Settles the promise chain a bulk action runs through. */
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** jsdom has no PointerEvent, so a MouseEvent carries the pointer type instead. */
const pointer = (type: string, pointerType: 'touch' | 'mouse', x = 10, y = 10) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
};

const tap = (f: ListFixture, row: HTMLElement, pointerType: 'touch' | 'mouse' = 'touch') => {
  row.dispatchEvent(pointer('pointerdown', pointerType));
  row.dispatchEvent(pointer('pointerup', pointerType));
  row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  f.detectChanges();
};

describe('ConversationListComponent (DOM) — the selection bar', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('shows the search box, not the bar, when nothing is selected', () => {
    const { f } = render();
    expect(query(f, '.selection-bar')).toBeNull();
    expect(query(f, '.search-input')).not.toBeNull();
  });

  it('replaces the search box with the bar while selecting, and shows the count', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    expect(query(f, '.search-input')).toBeNull();
    expect(query(f, '.selection-bar .selection-count')?.textContent).toContain('2 selected');
  });

  it('keeps the sort row in place so the list does not jump', () => {
    const { f } = render((c) => selectRows(c, ['U1']));
    expect(query(f, '.sort-row')).not.toBeNull();
  });

  it('shows the bar even when the host hides the search box and header menu', () => {
    const { f } = render((c) => selectRows(c, ['U1']), { showSearch: false, showHeaderMenu: false });
    expect(query(f, '.selection-bar')).not.toBeNull();
  });

  it('clears the selection and brings the search box back', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    barButton(f, 'Clear selection').click();
    f.detectChanges();
    expect(selected(f)).toEqual([]);
    expect(f.componentInstance.isSelectionMode).toBe(false);
    expect(query(f, '.search-input')).not.toBeNull();
  });

  it('pins the selection when any selected row is unpinned', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    barButton(f, 'Pin').click();
    await flush();
    expect(engine['PinMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], true, currentUser);
  });

  it('unpins the selection when every selected row is pinned', async () => {
    const { f, engine } = render((c) => {
      const stub = (c as unknown as { engine: { Conversations: MJConversationEntity[] } }).engine;
      stub.Conversations = [conv('U1', 'Loose One', { IsPinned: true }), conv('U2', 'Loose Two', { IsPinned: true })];
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
      selectRows(c, ['U1', 'U2']);
    });
    barButton(f, 'Unpin').click();
    await flush();
    expect(engine['PinMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], false, currentUser);
  });

  it('moves the selection through the folder picker', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    barButton(f, 'Move to folder').click();
    f.detectChanges();
    const work = queryAll(f, '.list-context-menu .menu-item').find(b => b.textContent?.includes('Work')) as HTMLButtonElement;
    work.click();
    await flush();
    expect(engine['MoveMultipleConversationsToProject']).toHaveBeenCalledWith(['U1', 'U2'], 'proj1', currentUser);
  });

  it('opens the share dialog with the selection', () => {
    const { f } = render((c) => selectRows(c, ['U1', 'U2']));
    barButton(f, 'Share').click();
    f.detectChanges();
    expect(f.componentInstance.shareContexts.map(s => s.ResourceID).sort()).toEqual(['U1', 'U2']);
    expect(f.componentInstance.isShareDialogOpen).toBe(true);
  });

  it('disables Share when no selected conversation can be shared', () => {
    const { f } = render((c) => {
      const stub = (c as unknown as { engine: { Conversations: MJConversationEntity[] } }).engine;
      stub.Conversations = [conv('U1', 'Loose One', { UserID: 'someone-else' })];
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups();
      selectRows(c, ['U1']);
    });
    expect(barButton(f, 'Share').disabled).toBe(true);
  });

  it('deletes the selection', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    barButton(f, 'Delete').click();
    await flush();
    expect(engine['DeleteMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], currentUser);
  });

  it('acts on the selection even while a menu for another row is open', async () => {
    const { f, engine } = render((c) => selectRows(c, ['U1', 'U2']));
    rowFor(f, 'Work One').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    f.detectChanges();
    barButton(f, 'Delete').click();
    await flush();
    expect(engine['DeleteMultipleConversations']).toHaveBeenCalledWith(['U1', 'U2'], currentUser);
  });
});

describe('ConversationListComponent (DOM) — the row checkbox', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('gives every conversation row a checkbox', () => {
    const { f } = render();
    expect(queryAll(f, '.conversation-item .row-check').length).toBe(seeded.length);
  });

  it('starts a selection with that row, without opening it', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    checkboxFor(f, 'Loose One').click();
    f.detectChanges();
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(selected(f)).toEqual(['U1']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('adds only the ticked row, not the open conversation', () => {
    const { f } = render(undefined, { selectedConversationId: 'U2' });
    checkboxFor(f, 'Loose One').click();
    expect(selected(f)).toEqual(['U1']);
  });

  it('adds more rows to the selection, and a second click takes one back out', () => {
    const { f } = render();
    checkboxFor(f, 'Loose One').click();
    checkboxFor(f, 'Loose Two').click();
    checkboxFor(f, 'Loose One').click();
    expect(selected(f)).toEqual(['U2']);
  });

  it('ends selection mode when the last row is unticked', () => {
    const { f } = render();
    checkboxFor(f, 'Loose One').click();
    checkboxFor(f, 'Loose One').click();
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('Shift-click on a checkbox selects the range from the last ticked row', () => {
    const { f } = render();
    checkboxFor(f, 'Loose One').click();
    checkboxFor(f, 'Loose Three').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(selected(f)).toEqual(['U1', 'U2', 'U3']);
  });

  it('shows which rows are ticked', () => {
    const { f } = render((c) => selectRows(c, ['U1']));
    expect(checkboxFor(f, 'Loose One').getAttribute('aria-checked')).toBe('true');
    expect(checkboxFor(f, 'Loose Two').getAttribute('aria-checked')).toBe('false');
  });

  it('marks the list as selecting so every checkbox shows', () => {
    const { f } = render((c) => selectRows(c, ['U1']));
    expect(query(f, '.conversation-list.is-selecting')).not.toBeNull();
  });
});

describe('ConversationListComponent (DOM) — long-press on touch', () => {
  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const press = (f: ListFixture, row: HTMLElement, pointerType: 'touch' | 'mouse' = 'touch') => {
    row.dispatchEvent(pointer('pointerdown', pointerType));
    vi.advanceTimersByTime(500);
    f.detectChanges();
  };

  it('selects the pressed row and starts selection mode', () => {
    const { f } = render();
    press(f, rowFor(f, 'Loose One'));
    expect(f.componentInstance.isSelectionMode).toBe(true);
    expect(selected(f)).toEqual(['U1']);
  });

  it('ignores the click that ends the press', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    const row = rowFor(f, 'Loose One');
    press(f, row);
    row.dispatchEvent(pointer('pointerup', 'touch'));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected(f)).toEqual(['U1']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when the finger lifts before the press completes', () => {
    const { f } = render();
    const row = rowFor(f, 'Loose One');
    row.dispatchEvent(pointer('pointerdown', 'touch'));
    vi.advanceTimersByTime(300);
    row.dispatchEvent(pointer('pointerup', 'touch'));
    vi.advanceTimersByTime(500);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('does nothing when the finger moves, since that is a scroll', () => {
    const { f } = render();
    const row = rowFor(f, 'Loose One');
    row.dispatchEvent(pointer('pointerdown', 'touch', 10, 10));
    row.dispatchEvent(pointer('pointermove', 'touch', 10, 40));
    vi.advanceTimersByTime(500);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('does nothing for a mouse held down on a row', () => {
    const { f } = render();
    press(f, rowFor(f, 'Loose One'), 'mouse');
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('while selecting, a tap adds or removes a row instead of opening it', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    press(f, rowFor(f, 'Loose One'));
    tap(f, rowFor(f, 'Loose Two'));
    expect(selected(f)).toEqual(['U1', 'U2']);
    tap(f, rowFor(f, 'Loose One'));
    expect(selected(f)).toEqual(['U2']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('ends selection mode when a tap removes the last row', () => {
    const { f } = render();
    press(f, rowFor(f, 'Loose One'));
    tap(f, rowFor(f, 'Loose One'));
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });

  it('a tap opens the conversation when nothing is selected', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    tap(f, rowFor(f, 'Loose One'));
    expect(spy).toHaveBeenCalledWith('U1');
  });

  it('a mouse click while selecting still collapses the selection and opens the row', () => {
    const { f } = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    press(f, rowFor(f, 'Loose One'));
    tap(f, rowFor(f, 'Loose Two'), 'mouse');
    expect(selected(f)).toEqual([]);
    expect(spy).toHaveBeenCalledWith('U2');
  });

  it('selects instead of opening the menu when the browser reports the press as a right-click', () => {
    const { f } = render();
    const row = rowFor(f, 'Loose One');
    row.dispatchEvent(pointer('pointerdown', 'touch'));
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    row.dispatchEvent(contextMenu);
    f.detectChanges();
    expect(query(f, '.list-context-menu')).toBeNull();
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(selected(f)).toEqual(['U1']);
  });

  it('selects instead of dragging when a touch press lifts the row', () => {
    const { f } = render();
    const row = rowFor(f, 'Loose One');
    row.dispatchEvent(pointer('pointerdown', 'touch'));
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    row.dispatchEvent(dragStart);
    f.detectChanges();
    expect(dragStart.defaultPrevented).toBe(true);
    expect(f.componentInstance.draggedConversationIds).toEqual([]);
    expect(selected(f)).toEqual(['U1']);
  });

  it('does not start a press on the row ⋯ button', () => {
    const { f } = render();
    const menuButton = rowFor(f, 'Loose One').querySelector('.menu-btn') as HTMLElement;
    menuButton.dispatchEvent(pointer('pointerdown', 'touch'));
    vi.advanceTimersByTime(500);
    expect(f.componentInstance.isSelectionMode).toBe(false);
  });
});
