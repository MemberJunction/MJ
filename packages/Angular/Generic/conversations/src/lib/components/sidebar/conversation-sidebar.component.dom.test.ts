import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { By } from '@angular/platform-browser';
import type { UserInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { ConversationSidebarComponent } from './conversation-sidebar.component';

/**
 * DOM spec for <mj-conversation-sidebar>'s pass-through contract: the white-label
 * chrome toggles must forward verbatim to the conversation list, and the list's
 * (conversationDeleted) / (refreshRequested) outputs must RE-EMIT through the
 * sidebar (they previously died at this boundary, forcing hosts to watch
 * ConversationEngine.Conversations$ to notice their active conversation vanish).
 * The list/tree/routines children are stubbed — this spec is about the wiring,
 * not their rendering.
 */
@Component({ standalone: false, selector: 'mj-conversation-list', template: '' })
class StubConversationListComponent {
  @Input() environmentId: string | null = null;
  @Input() currentUser: UserInfo | null = null;
  @Input() selectedConversationId: string | null = null;
  @Input() renamedConversationId: string | null = null;
  @Input() isSidebarPinned = true;
  @Input() isMobileView = false;
  @Input() showSearch = true;
  @Input() showNewConversationButton = true;
  @Input() showHeaderMenu = true;
  @Input() showSectionHeaders = true;
  @Output() conversationSelected = new EventEmitter<string>();
  @Output() conversationDeleted = new EventEmitter<string>();
  @Output() newConversationRequested = new EventEmitter<void>();
  @Output() refreshRequested = new EventEmitter<void>();
  @Output() pinSidebarRequested = new EventEmitter<void>();
  @Output() unpinSidebarRequested = new EventEmitter<void>();
}

@Component({ standalone: false, selector: 'mj-collection-tree', template: '' })
class StubCollectionTreeComponent {
  @Input() environmentId: string | null = null;
  @Input() currentUser: UserInfo | null = null;
}

@Component({ standalone: false, selector: 'mj-conversation-routines-section', template: '' })
class StubRoutinesSectionComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() ShowRoutines = true;
  @Output() openEntityRecord = new EventEmitter<unknown>();
  @Output() openConversation = new EventEmitter<string>();
}

describe('ConversationSidebarComponent (DOM) — pass-throughs + re-emits', () => {
  const currentUser = { ID: 'u1' } as unknown as UserInfo;

  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(ConversationSidebarComponent, {
      imports: [CommonModule],
      declarations: [
        ConversationSidebarComponent,
        StubConversationListComponent,
        StubCollectionTreeComponent,
        StubRoutinesSectionComponent,
      ],
      inputs: { environmentId: 'env1', currentUser, ...inputs },
    });

  const listInstance = (f: ReturnType<typeof render>): StubConversationListComponent =>
    f.debugElement.query(By.directive(StubConversationListComponent)).componentInstance as StubConversationListComponent;

  it('forwards the chrome toggles to the list verbatim', () => {
    const f = render({
      showSearch: false,
      showNewConversationButton: false,
      showHeaderMenu: false,
      showSectionHeaders: false,
    });
    const list = listInstance(f);
    expect(list.showSearch).toBe(false);
    expect(list.showNewConversationButton).toBe(false);
    expect(list.showHeaderMenu).toBe(false);
    expect(list.showSectionHeaders).toBe(false);
  });

  it('defaults the chrome toggles to true (stock rendering)', () => {
    const f = render();
    const list = listInstance(f);
    expect(list.showSearch).toBe(true);
    expect(list.showNewConversationButton).toBe(true);
    expect(list.showHeaderMenu).toBe(true);
    expect(list.showSectionHeaders).toBe(true);
  });

  it("re-emits the list's conversationDeleted with the deleted ID intact", () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.conversationDeleted.subscribe(spy);
    listInstance(f).conversationDeleted.emit('c9');
    expect(spy).toHaveBeenCalledWith('c9');
  });

  it("re-emits the list's refreshRequested", () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.refreshRequested.subscribe(spy);
    listInstance(f).refreshRequested.emit();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('still re-emits conversationSelected (pre-existing contract untouched)', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.conversationSelected.subscribe(spy);
    listInstance(f).conversationSelected.emit('c1');
    expect(spy).toHaveBeenCalledWith('c1');
  });
});
