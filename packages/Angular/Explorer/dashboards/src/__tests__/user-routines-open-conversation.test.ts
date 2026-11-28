// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';

const notify = vi.fn();
vi.mock('@memberjunction/ng-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ng-notifications')>()),
  MJNotificationService: { get Instance() { return { CreateSimpleNotification: notify }; } },
}));

import { UserRoutinesResourceComponent } from '../UserRoutines/user-routines-resource.component';
import { ConversationOpenedEventArgs } from '@memberjunction/ng-user-routines';
import type { MJUserRoutineEntity } from '@memberjunction/core-entities';

/**
 * The Routines app's "Conversation" button raises ConversationOpened; the Explorer surface must
 * turn it into navigation. A routine's conversation is application-scoped, so it is not in the
 * chat sidebar; the only way to it is a deep link into the Chat app's Conversations item.
 */

function createComponent(chatApp: { ID: string } | null): {
  component: UserRoutinesResourceComponent;
  openNavItemByName: ReturnType<typeof vi.fn>;
} {
  const component = Object.create(UserRoutinesResourceComponent.prototype) as UserRoutinesResourceComponent;
  const open = component as unknown as Record<string, unknown>;
  const openNavItemByName = vi.fn(async () => 'tab-1');
  open['navigationService'] = { OpenNavItemByName: openNavItemByName };
  open['appManager'] = { GetAppByName: (name: string) => (name === 'Chat' ? chatApp : null) };
  return { component, openNavItemByName };
}

const routine = { ID: 'R1', Name: 'Chief of Staff — Wake (default)' } as MJUserRoutineEntity;

describe('UserRoutinesResourceComponent — opening a routine conversation', () => {
  it('deep-links into the Chat app with the routine conversation', () => {
    const { component, openNavItemByName } = createComponent({ ID: 'chat-app' });

    component.OnConversationOpened(new ConversationOpenedEventArgs('C1', routine));

    expect(openNavItemByName).toHaveBeenCalledWith('Conversations', { conversationId: 'C1' }, 'chat-app', { queryParams: { conversationId: 'C1' } });
  });

  it('tells the user when the Chat app is not installed', () => {
    notify.mockClear();
    const { component, openNavItemByName } = createComponent(null);

    component.OnConversationOpened(new ConversationOpenedEventArgs('C1', routine));

    expect(openNavItemByName).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Chat'), 'error', expect.any(Number));
  });
});
