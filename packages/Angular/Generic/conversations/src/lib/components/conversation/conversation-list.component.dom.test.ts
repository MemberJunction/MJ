import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationListComponent } from './conversation-list.component';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';

/**
 * DOM spec for <mj-conversation-list>'s white-label chrome toggles
 * (showSearch / showNewConversationButton / showHeaderMenu / showSectionHeaders).
 *
 * ngOnInit is prototype-mocked: it reaches ConversationEngine.Instance (a live
 * singleton that loads from the provider), which chrome-rendering tests must not
 * touch. The section groupings the template reads (pinnedConversations /
 * ungroupedConversations / folderTree) are precomputed component fields, so the
 * tests seed them directly in `setup` instead of driving the engine.
 */
@Component({ standalone: false, selector: 'mj-notification-badge', template: '' })
class StubNotificationBadgeComponent {
  @Input() conversationId: string | null = null;
}

describe('ConversationListComponent (DOM) — chrome toggles', () => {
  const currentUser = { ID: 'u1' } as unknown as UserInfo;
  const conv = (id: string, name: string) =>
    ({ ID: id, Name: name, Description: '', ProjectID: null } as unknown as MJConversationEntity);

  beforeEach(() => {
    vi.spyOn(ConversationListComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  const render = (inputs: Record<string, unknown> = {}, setup?: (c: ConversationListComponent) => void) =>
    renderComponentFixture(ConversationListComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ConversationListComponent, StubNotificationBadgeComponent],
      providers: [
        { provide: DialogService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: ActiveTasksService, useValue: {} },
        { provide: MJDialogService, useValue: {} },
      ],
      inputs: { environmentId: 'env1', currentUser, ...inputs },
      setup: (c) => {
        // Seed the precomputed groupings the template renders (pinned section
        // shows only when non-empty; default groupBy='project' renders the
        // Folders + Ungrouped sections; the FLAT branch — used when
        // showSectionHeaders=false — renders unpinnedConversations).
        c.pinnedConversations = [conv('c1', 'Pinned One')];
        c.ungroupedConversations = [conv('c2', 'Loose One')];
        c.unpinnedConversations = [conv('c2', 'Loose One')];
        setup?.(c);
      },
    });

  it('renders all chrome by default (search, ⋯ menu, New Conversation, section headers)', () => {
    const f = render();
    expect(query(f, '.search-input')).not.toBeNull();
    expect(query(f, '.btn-menu')).not.toBeNull();
    expect(query(f, '.btn-new-conversation')).not.toBeNull();
    // Pinned + Folders + Ungrouped headers with the seeded data
    expect(queryAll(f, '.section-header').length).toBe(3);
  });

  it('hides the search box when showSearch=false (header strip stays for the ⋯ menu)', () => {
    const f = render({ showSearch: false });
    expect(query(f, '.search-input')).toBeNull();
    expect(query(f, '.list-header')).not.toBeNull();
    expect(query(f, '.btn-menu')).not.toBeNull();
  });

  it('hides the ⋯ options menu when showHeaderMenu=false', () => {
    const f = render({ showHeaderMenu: false });
    expect(query(f, '.btn-menu')).toBeNull();
    expect(query(f, '.search-input')).not.toBeNull();
  });

  it('removes the whole header strip when BOTH search and the ⋯ menu are off', () => {
    const f = render({ showSearch: false, showHeaderMenu: false });
    expect(query(f, '.list-header')).toBeNull();
  });

  it('removes the header strip in selection mode when only the ⋯ menu would occupy it', () => {
    // showSearch=false leaves the ⋯ menu as the strip's only occupant — and the
    // menu hides during selection mode, so the strip must not render as an
    // empty bordered band.
    const f = render({ showSearch: false }, (c) => {
      c.isSelectionMode = true;
    });
    expect(query(f, '.list-header')).toBeNull();
  });

  it('flipping showSearch off clears an active search filter', () => {
    const f = render({}, (c) => {
      // rebuildGroups reads the live ConversationEngine — stub it; this test
      // only cares that the stale query is cleared through the setter.
      (c as unknown as { rebuildGroups: () => void }).rebuildGroups = () => {};
      c.searchQuery = 'foo';
    });
    expect(f.componentInstance.searchQuery).toBe('foo');
    f.componentRef.setInput('showSearch', false);
    expect(f.componentInstance.searchQuery).toBe('');
  });

  it('hides the New Conversation button when showNewConversationButton=false', () => {
    const f = render({ showNewConversationButton: false });
    expect(query(f, '.btn-new-conversation')).toBeNull();
  });

  it('showSectionHeaders=false removes headers, forces the FLAT list, and expands everything', () => {
    const f = render({ showSectionHeaders: false });
    expect(queryAll(f, '.section-header').length).toBe(0);
    // Folder grouping is bypassed (its root drop-zone / New Folder action live
    // in the header — a headerless tree would allow one-way folder nesting).
    expect(query(f, '.folders-section')).toBeNull();
    expect(query(f, '.ungrouped-section')).toBeNull();
    const lists = queryAll(f, '.chat-list');
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      expect(list.classList.contains('expanded')).toBe(true);
    }
    // The conversations themselves still render — pinned + flat unpinned.
    expect(queryAll(f, '.conversation-item').length).toBe(2);
  });

  it('sections honor their collapse state when headers are shown', () => {
    const f = render({}, (c) => {
      c.pinnedExpanded = false;
    });
    const pinnedList = query(f, '.pinned-section .chat-list');
    expect(pinnedList).not.toBeNull();
    expect((pinnedList as Element).classList.contains('expanded')).toBe(false);
  });

  it('New Conversation click emits newConversationRequested (no record created)', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.newConversationRequested.subscribe(spy);
    (query(f, '.btn-new-conversation') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
