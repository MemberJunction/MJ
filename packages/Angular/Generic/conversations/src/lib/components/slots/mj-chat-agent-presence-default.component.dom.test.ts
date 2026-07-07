import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { MJChatAgentPresenceDefaultComponent } from './mj-chat-agent-presence-default.component';

/** DOM-level spec for <mj-chat-agent-presence-default> — name, avatar vs. placeholder, state label, modifier classes. */
describe('MJChatAgentPresenceDefaultComponent (DOM)', () => {
  it('renders the agent name when set', () => {
    const f = renderComponentFixture(MJChatAgentPresenceDefaultComponent, { inputs: { AgentName: 'Sage' } });
    expect(text(f, '.mj-chat-agent-presence-default__name')).toBe('Sage');
  });

  it('shows the avatar image when AvatarUrl is set, else a placeholder', () => {
    const withUrl = renderComponentFixture(MJChatAgentPresenceDefaultComponent, { inputs: { AvatarUrl: 'http://x/a.png' } });
    expect(query(withUrl, 'img.mj-chat-agent-presence-default__avatar')).not.toBeNull();

    const without = renderComponentFixture(MJChatAgentPresenceDefaultComponent);
    expect(query(without, '.mj-chat-agent-presence-default__avatar-placeholder')).not.toBeNull();
  });

  it('shows the state label only when not idle', () => {
    const idle = renderComponentFixture(MJChatAgentPresenceDefaultComponent); // State defaults to 'idle'
    expect(query(idle, '.mj-chat-agent-presence-default__state')).toBeNull();

    const thinking = renderComponentFixture(MJChatAgentPresenceDefaultComponent, { inputs: { State: 'thinking' } });
    expect(text(thinking, '.mj-chat-agent-presence-default__state')).toBe('thinking');
  });

  it('applies the state and mode modifier classes', () => {
    const f = renderComponentFixture(MJChatAgentPresenceDefaultComponent, { inputs: { State: 'listening', Mode: 'prominent' } });
    expect(hasClass(f, '.mj-chat-agent-presence-default', 'mj-chat-agent-presence-default--listening')).toBe(true);
    expect(hasClass(f, '.mj-chat-agent-presence-default', 'mj-chat-agent-presence-default--prominent')).toBe(true);
  });
});
