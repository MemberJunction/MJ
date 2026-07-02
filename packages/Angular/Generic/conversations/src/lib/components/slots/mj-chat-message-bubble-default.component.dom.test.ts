import { describe, it, expect } from 'vitest';
import { renderComponentFixture, text, hasClass } from '@memberjunction/ng-test-utils';
import { MJChatMessageBubbleDefaultComponent } from './mj-chat-message-bubble-default.component';

/**
 * DOM-level spec for <mj-chat-message-bubble-default> — message text, and the
 * user/agent style driven by IsUser (Message.Role === 'User'). The Message @Input is
 * typed as an entity; a plain object with the fields the template reads is enough here.
 */
describe('MJChatMessageBubbleDefaultComponent (DOM)', () => {
  it('renders the message text', () => {
    const f = renderComponentFixture(MJChatMessageBubbleDefaultComponent, {
      inputs: { Message: { Message: 'Hello there', Role: 'AI' } },
    });
    expect(text(f, '.mj-chat-bubble')).toBe('Hello there');
  });

  it('uses the user style for a user message', () => {
    const f = renderComponentFixture(MJChatMessageBubbleDefaultComponent, {
      inputs: { Message: { Message: 'hi', Role: 'User' } },
    });
    expect(hasClass(f, '.mj-chat-bubble', 'mj-chat-bubble--user')).toBe(true);
    expect(hasClass(f, '.mj-chat-bubble', 'mj-chat-bubble--agent')).toBe(false);
  });

  it('uses the agent style for a non-user message', () => {
    const f = renderComponentFixture(MJChatMessageBubbleDefaultComponent, {
      inputs: { Message: { Message: 'hi', Role: 'AI' } },
    });
    expect(hasClass(f, '.mj-chat-bubble', 'mj-chat-bubble--agent')).toBe(true);
    expect(hasClass(f, '.mj-chat-bubble', 'mj-chat-bubble--user')).toBe(false);
  });
});
