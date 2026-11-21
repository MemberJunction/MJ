// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ChatConversationsResource } from './chat-conversations-resource.component';
import type { MJConversationEntity } from '@memberjunction/core-entities';

/**
 * Selecting a conversation by ID must work for one the sidebar does not list. A routine's wake
 * conversation is application-scoped, so the engine's main-chat list never holds it; a deep link
 * to it used to select the ID with no entity behind it (no title, no pinned agent). The resource
 * now loads the row through the engine when the list has no entry for it.
 */

type Open = Record<string, unknown>;
type Select = (id: string) => Promise<void>;

function createComponent(listed: MJConversationEntity | undefined, loaded: MJConversationEntity | null): {
  component: ChatConversationsResource;
  ensure: ReturnType<typeof vi.fn>;
} {
  const component = Object.create(ChatConversationsResource.prototype) as ChatConversationsResource;
  const open = component as unknown as Open;
  const ensure = vi.fn(async () => loaded);
  open['engine'] = { GetConversation: vi.fn(() => listed), EnsureConversationLoaded: ensure };
  open['bridge'] = { SetActiveFromWorkspace: vi.fn() };
  open['cdr'] = { detectChanges: vi.fn() };
  open['skipUrlUpdate'] = true;
  open['updateTabTitle'] = vi.fn();
  component.CurrentUser = { ID: 'user-1' };
  component.SelectedConversationId = null;
  component.SelectedConversation = null;
  return { component, ensure };
}

const row = (id: string): MJConversationEntity => ({ ID: id, Name: `Conversation ${id}` } as unknown as MJConversationEntity);

describe('ChatConversationsResource — selecting a conversation the list does not hold', () => {
  it('loads the conversation through the engine and shows it', async () => {
    const wake = row('C1');
    const { component, ensure } = createComponent(undefined, wake);
    const select = (component as unknown as Record<string, Select>)['selectConversation'];

    await select.call(component, 'C1');

    expect(ensure).toHaveBeenCalledWith('C1', component.CurrentUser);
    expect(component.SelectedConversation).toBe(wake);
  });

  it('uses the listed entity without a load when the list has it', async () => {
    const listed = row('C2');
    const { component, ensure } = createComponent(listed, null);
    const select = (component as unknown as Record<string, Select>)['selectConversation'];

    await select.call(component, 'C2');

    expect(ensure).not.toHaveBeenCalled();
    expect(component.SelectedConversation).toBe(listed);
  });

  it('drops a load that finishes after the selection moved on', async () => {
    const { component } = createComponent(undefined, row('C3'));
    const open = component as unknown as Open;
    open['engine'] = {
      GetConversation: vi.fn(() => undefined),
      EnsureConversationLoaded: vi.fn(async () => { component.SelectedConversationId = 'C4'; return row('C3'); }),
    };
    const select = (component as unknown as Record<string, Select>)['selectConversation'];

    await select.call(component, 'C3');

    expect(component.SelectedConversation).toBeNull();
  });
});
