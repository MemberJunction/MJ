import { describe, it, expect, vi } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

// The identity getters read the AIEngineBase singleton cache; pin it to a known
// agent so the precedence assertions are deterministic (no provider bootstrap).
vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: {
    Instance: {
      Agents: [{ ID: 'a1', Name: 'Sage', IconClass: 'fa-brain', Description: 'Conversation manager' }],
    },
  },
}));

import { MessageItemComponent } from './message-item.component';

/**
 * Spec for the assistant-identity overrides (assistantDisplayName /
 * assistantAvatarUrl). The component is instantiated without Angular DI
 * (Object.create — the getters under test touch no constructor-injected service
 * except agentService, which is stubbed directly): a full message-item TestBed
 * render drags in the whole artifact/reaction/run-details component tree for no
 * additional coverage of these getters. The avatar/sender template wiring is
 * pinned by the node contract spec in src/__tests__.
 */
describe('MessageItemComponent — assistant identity overrides', () => {
  const make = (fields: Record<string, unknown> = {}): MessageItemComponent => {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(item as unknown as Record<string, unknown>, {
      message: { Role: 'AI', Status: 'Complete', AgentID: 'a1' } as unknown as MJConversationDetailEntity,
      assistantDisplayName: null,
      assistantAvatarUrl: null,
      agentService: { ConversationManagerAgentName: 'Sage' },
      ...fields,
    });
    return item;
  };

  it('without an override, shows the engine-resolved agent identity', () => {
    const item = make();
    expect(item.aiAgentInfo).toEqual({ name: 'Sage', iconClass: 'fa-brain', role: 'Conversation manager' });
  });

  it('assistantDisplayName overrides the NAME while keeping the engine icon/role', () => {
    const item = make({ assistantDisplayName: 'Betty' });
    expect(item.aiAgentInfo).toEqual({ name: 'Betty', iconClass: 'fa-brain', role: 'Conversation manager' });
  });

  it('a whitespace-only override is ignored', () => {
    const item = make({ assistantDisplayName: '   ' });
    expect(item.aiAgentInfo?.name).toBe('Sage');
  });

  it('isConversationManager compares the ENGINE name — a display override never flips it', () => {
    const overridden = make({ assistantDisplayName: 'Betty' });
    expect(overridden.isConversationManager).toBe(true);
    const other = make({ message: { Role: 'AI', Status: 'Complete', AgentID: 'nope' } });
    expect(other.isConversationManager).toBe(false);
  });

  it('returns null identity for user messages regardless of overrides', () => {
    const item = make({ message: { Role: 'User' }, assistantDisplayName: 'Betty' });
    expect(item.aiAgentInfo).toBeNull();
  });

  describe('effectiveAssistantAvatarUrl (trim/error guard)', () => {
    it('trims the URL and treats whitespace-only as unset', () => {
      const item = make();
      item.assistantAvatarUrl = '  https://x/a.png  ';
      expect(item.effectiveAssistantAvatarUrl).toBe('https://x/a.png');
      item.assistantAvatarUrl = '   ';
      expect(item.effectiveAssistantAvatarUrl).toBeNull();
    });

    it('falls back to null after a load error, and recovers when the URL changes', () => {
      const item = make();
      item.assistantAvatarUrl = 'https://x/broken.png';
      item.assistantAvatarFailed = true; // the template's (error) handler
      expect(item.effectiveAssistantAvatarUrl).toBeNull();
      item.assistantAvatarUrl = 'https://x/fixed.png'; // setter resets the failure flag
      expect(item.assistantAvatarFailed).toBe(false);
      expect(item.effectiveAssistantAvatarUrl).toBe('https://x/fixed.png');
    });
  });
});
