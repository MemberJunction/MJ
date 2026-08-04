import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { UserInfo } from '@memberjunction/core';
import type { NavigationTab } from '../../models/conversation-state.model';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationNavigationComponent } from './conversation-navigation.component';

/**
 * DOM spec for <mj-conversation-navigation>. The component is pure inputs/outputs but
 * embeds the service-backed <mj-tasks-dropdown> child, so we declare a lightweight stub
 * for that selector (matching its bindings) and assert only THIS component's own chrome:
 * the three nav tabs + active class, and the sidebar/search/refresh/tab outputs.
 */
@Component({ standalone: false, selector: 'mj-tasks-dropdown', template: '' })
class StubTasksDropdownComponent {
  @Input() currentUser?: UserInfo;
  @Input() conversationId: string | null = null;
  @Output() navigateToConversation = new EventEmitter<{ conversationId: string; taskId: string }>();
}

describe('ConversationNavigationComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(ConversationNavigationComponent, {
      imports: [CommonModule],
      declarations: [ConversationNavigationComponent, StubTasksDropdownComponent],
      inputs: { activeTab: 'conversations' as NavigationTab, ...inputs },
    });

  it('renders the three navigation tabs', () => {
    const f = render();
    const tabs = queryAll(f, '.nav-tab').map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Chats', 'Collections', 'Tasks']);
  });

  it('marks the active tab from the activeTab input', () => {
    const f = render({ activeTab: 'collections' as NavigationTab });
    const tabs = queryAll(f, '.nav-tab');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(tabs[2].classList.contains('active')).toBe(false);
  });

  it('emits tabChanged with the tab key when a tab is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.tabChanged.subscribe(spy);
    (queryAll(f, '.nav-tab')[2] as HTMLButtonElement).click(); // Tasks
    expect(spy).toHaveBeenCalledWith('tasks');
  });

  it('emits sidebarToggled when the sidebar toggle is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.sidebarToggled.subscribe(spy);
    (query(f, '.sidebar-toggle') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('emits searchTriggered when the search button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.searchTriggered.subscribe(spy);
    (query(f, '.search-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('emits refreshTriggered when the refresh button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.refreshTriggered.subscribe(spy);
    (query(f, '.refresh-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
