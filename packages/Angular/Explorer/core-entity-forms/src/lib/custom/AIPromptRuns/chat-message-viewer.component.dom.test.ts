import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import type { ChatMessage } from '@memberjunction/ai';
import { ChatMessageViewerComponent } from './chat-message-viewer.component';

/**
 * DOM coverage for <mj-chat-message-viewer> — a pure presentational component driven only by its
 * @Input messages (no provider, no singleton). ngOnInit builds `displayMessages` (one per message,
 * with a role-derived visibility flag + sequence number). Covers: the empty state, one visible
 * `.message-card` per message with its role label + sequence number, the role filter checkboxes
 * hiding a role's cards (driven via the component's onFilterChange event path, not raw assignment),
 * and the full-screen overlay opening/closing.
 *
 * The heavy `<mj-code-editor>` (CodeMirror) child is replaced with a lightweight stub that just
 * echoes its [value] input, so message content is still assertable in the DOM.
 */

@Component({ standalone: true, selector: 'mj-code-editor', template: '<pre class="stub-editor">{{ value }}</pre>' })
class CodeEditorStub {
  @Input() value: string | null = null;
  @Input() language = '';
  @Input() readonly = false;
}

const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content }) as ChatMessage;

const MESSAGES: ChatMessage[] = [
  msg('system', 'You are a helpful assistant.'),
  msg('user', 'What is 2 + 2?'),
  msg('assistant', 'It is 4.'),
];

function render(messages: ChatMessage[] = MESSAGES): ComponentFixture<ChatMessageViewerComponent> {
  TestBed.configureTestingModule({
    imports: [FormsModule, MJEmptyStateComponent, CodeEditorStub],
    declarations: [ChatMessageViewerComponent],
  });
  const fixture = TestBed.createComponent(ChatMessageViewerComponent);
  fixture.componentRef.setInput('messages', messages);
  fixture.detectChanges(false);
  return fixture;
}

const sync = (f: ComponentFixture<ChatMessageViewerComponent>) => {
  f.componentRef.changeDetectorRef.markForCheck();
  f.detectChanges(false);
};

describe('ChatMessageViewerComponent (DOM)', () => {
  it('shows the empty state when there are no messages', () => {
    const fixture = render([]);
    expect(queryAll(fixture, '.message-card').length).toBe(0);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('renders one message card per message with its role label and sequence number', () => {
    const fixture = render();
    const cards = queryAll(fixture, '.message-card');
    expect(cards.length).toBe(3);
    const labels = queryAll(fixture, '.role-label').map((l) => l.textContent?.trim());
    expect(labels).toEqual(['System', 'User', 'Assistant']);
    expect(queryAll(fixture, '.sequence-number').map((s) => s.textContent?.trim())).toEqual(['#1', '#2', '#3']);
  });

  it('renders each message content through the code editor', () => {
    const fixture = render();
    const editors = queryAll(fixture, '.stub-editor').map((e) => e.textContent);
    expect(editors.join(' ')).toContain('You are a helpful assistant.');
    expect(editors.join(' ')).toContain('It is 4.');
  });

  it('marks each card with a data-role attribute for its role', () => {
    const roles = queryAll(render(), '.message-card').map((c) => c.getAttribute('data-role'));
    expect(roles).toEqual(['system', 'user', 'assistant']);
  });

  it('hides a role’s cards when its filter is turned off via onFilterChange', () => {
    const fixture = render();
    // the System filter checkbox is bound to `showSystem`; simulate unticking it + its handler
    fixture.componentInstance.showSystem = false;
    fixture.componentInstance.onFilterChange();
    sync(fixture);
    const labels = queryAll(fixture, '.role-label').map((l) => l.textContent?.trim());
    expect(labels).not.toContain('System');
    expect(labels).toContain('User');
  });

  it('opens the full-screen overlay when a card’s expand action is triggered and closes it', () => {
    const fixture = render();
    expect(query(fixture, '.fullscreen-overlay')).toBeNull();
    fixture.componentInstance.openFullScreen('some text', 'markdown', 'System #1');
    sync(fixture);
    const overlay = query(fixture, '.fullscreen-overlay');
    expect(overlay).not.toBeNull();
    (overlay as HTMLElement).click(); // overlay click closes
    sync(fixture);
    expect(query(fixture, '.fullscreen-overlay')).toBeNull();
  });
});
