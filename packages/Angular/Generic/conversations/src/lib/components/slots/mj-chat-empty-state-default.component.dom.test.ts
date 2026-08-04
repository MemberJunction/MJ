import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { MJChatEmptyStateDefaultComponent } from './mj-chat-empty-state-default.component';

/** DOM-level spec for <mj-chat-empty-state-default> — greeting, optional subtext, suggested-prompt chips. */
describe('MJChatEmptyStateDefaultComponent (DOM)', () => {
  it('renders the greeting', () => {
    const f = renderComponentFixture(MJChatEmptyStateDefaultComponent, { inputs: { Greeting: 'Hi there' } });
    expect(text(f, '.mj-chat-empty-state-default__greeting')).toBe('Hi there');
  });

  it('shows the subtext only when set', () => {
    const without = renderComponentFixture(MJChatEmptyStateDefaultComponent);
    expect(query(without, '.mj-chat-empty-state-default__subtext')).toBeNull();

    const withSub = renderComponentFixture(MJChatEmptyStateDefaultComponent, { inputs: { Subtext: 'Ask me anything' } });
    expect(text(withSub, '.mj-chat-empty-state-default__subtext')).toBe('Ask me anything');
  });

  it('renders a chip per suggested prompt', () => {
    const f = renderComponentFixture(MJChatEmptyStateDefaultComponent, { inputs: { SuggestedPrompts: ['First', 'Second'] } });
    const chips = queryAll(f, '.mj-chat-empty-state-default__prompt-chip');

    expect(chips.length).toBe(2);
    expect(chips[0].textContent?.trim()).toBe('First');
  });

  it('emits PromptSelected with the clicked prompt', () => {
    const f = renderComponentFixture(MJChatEmptyStateDefaultComponent, { inputs: { SuggestedPrompts: ['First', 'Second'] } });
    const selected = capture(f.componentInstance.PromptSelected);

    click(f, '.mj-chat-empty-state-default__prompt-chip'); // first chip

    expect(selected).toEqual(['First']);
  });
});
