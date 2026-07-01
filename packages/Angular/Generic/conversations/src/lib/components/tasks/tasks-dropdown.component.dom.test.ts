import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import type { UserInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { TasksDropdownComponent } from './tasks-dropdown.component';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';

/**
 * DOM spec for <mj-tasks-dropdown>. Injects ActiveTasksService (stubbed via the
 * providers option, emitting a fixed task list) and reads tasks$ in ngOnInit. The
 * AIEngineBase.Instance.EnsureLoaded() call in ngOnInit is fire-and-forget, and the
 * icon/logo helpers guard against an unloaded engine, so the render is safe without a
 * real engine. Covers the count badge + has-tasks class, the open/close toggle, the
 * current-vs-other grouping, the empty state, and the task-click outputs.
 */
describe('TasksDropdownComponent (DOM)', () => {
  const currentUser = { ID: 'u1' } as unknown as UserInfo;
  const currentTask: ActiveTask = { id: 't1', agentName: 'Sage', status: 'Working', relatedMessageId: 'm1', conversationId: 'c1', startTime: 1000 };
  const otherTask: ActiveTask = {
    id: 't2',
    agentName: 'Scout',
    status: 'Thinking',
    relatedMessageId: 'm2',
    conversationId: 'c2',
    conversationName: 'Other chat',
    startTime: 1000,
  };

  const render = (tasks: ActiveTask[]) =>
    renderComponentFixture(TasksDropdownComponent, {
      declarations: [TasksDropdownComponent],
      providers: [{ provide: ActiveTasksService, useValue: { tasks$: of(tasks) } }],
      inputs: { currentUser, conversationId: 'c1' },
    });

  const open = (f: ReturnType<typeof render>) => {
    (query(f, '.active-tasks-btn') as HTMLButtonElement).click();
    f.detectChanges();
    return f;
  };

  it('shows a count badge reflecting the number of active tasks', () => {
    const f = render([currentTask, otherTask]);
    expect(text(f, '.task-count-badge')).toContain('2');
    expect(query(f, '.active-tasks-btn')?.classList.contains('has-tasks')).toBe(true);
  });

  it('does not render the dropdown until the button is clicked', () => {
    const f = render([currentTask]);
    expect(query(f, '.active-tasks-dropdown')).toBeNull();
  });

  it('opens the dropdown with a header count when the button is clicked', () => {
    const f = open(render([currentTask, otherTask]));
    expect(query(f, '.active-tasks-dropdown')).not.toBeNull();
    expect(text(f, '.dropdown-header')).toContain('Active Tasks (2)');
  });

  it('groups tasks into current-conversation and other-conversation sections', () => {
    const f = open(render([currentTask, otherTask]));
    const headers = queryAll(f, '.section-header').map((h) => h.textContent?.trim());
    expect(headers.some((h) => h?.includes('Current Conversation (1)'))).toBe(true);
    expect(headers.some((h) => h?.includes('Other Conversations (1)'))).toBe(true);
    expect(text(f, '.dropdown-content')).toContain('Other chat');
  });

  it('shows the no-tasks state when there are no active tasks', () => {
    const f = open(render([]));
    expect(query(f, '.no-tasks')).not.toBeNull();
    expect(text(f, '.no-tasks')).toContain('No active tasks');
  });

  it('emits navigateToConversation and taskClicked when an other-conversation task is clicked', () => {
    const f = open(render([currentTask, otherTask]));
    const navSpy = vi.fn();
    const clickSpy = vi.fn();
    f.componentInstance.navigateToConversation.subscribe(navSpy);
    f.componentInstance.taskClicked.subscribe(clickSpy);
    // current task renders first, other-conversation task second
    (queryAll(f, '.active-task-item')[1] as HTMLElement).click();
    expect(navSpy).toHaveBeenCalledWith({ conversationId: 'c2', taskId: 't2' });
    expect(clickSpy).toHaveBeenCalledWith(otherTask);
  });
});
