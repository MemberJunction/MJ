// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { UserNotificationsComponent } from './user-notifications.component';
import type { MJUserNotificationEntity } from '@memberjunction/core-entities';

/**
 * A routine-run notification (`{ type: 'UserRoutine', routineId, runId, conversationId? }`) must
 * open what the run produced. The reply lives in the routine's own conversation, which the main
 * chat list hides, so the click goes to the Chat app's Conversations item with that conversation;
 * a routine with no conversation opens its page in the Routines app instead.
 */

type Open = Record<string, unknown>;

interface Harness {
  component: UserNotificationsComponent;
  openNavItemByName: ReturnType<typeof vi.fn>;
}

function createComponent(routineConversationId: string | null = null): Harness {
  const component = Object.create(UserNotificationsComponent.prototype) as UserNotificationsComponent;
  const open = component as unknown as Open;
  const openNavItemByName = vi.fn(async () => 'tab-1');
  open['navigationService'] = { OpenNavItemByName: openNavItemByName };
  open['appManager'] = {
    GetAppByName: (name: string) => name === 'Chat' ? { ID: 'chat-app' } : name === 'Routines' ? { ID: 'routines-app' } : null,
  };
  open['MarkAsRead'] = vi.fn();
  Object.defineProperty(component, 'ProviderToUse', {
    get: () => ({
      CurrentUser: { ID: 'user-1' },
      GetEntityObject: vi.fn(async () => ({
        Load: vi.fn(async () => true),
        ConversationID: routineConversationId,
      })),
    }),
    configurable: true,
  });
  return { component, openNavItemByName };
}

function notification(config: Record<string, string>): MJUserNotificationEntity {
  return {
    ID: 'n-1',
    ResourceConfiguration: JSON.stringify(config),
    ResourceTypeID: null,
    ResourceRecordID: null,
  } as unknown as MJUserNotificationEntity;
}

describe('UserNotificationsComponent — a routine-run notification opens the run output', () => {
  it('is clickable', () => {
    const { component } = createComponent();
    expect(component.IsNotificationClickable(notification({ type: 'UserRoutine', routineId: 'R1', runId: 'RUN1' }))).toBe(true);
  });

  it('opens the routine conversation in the Chat app when the notification names it', async () => {
    const { component, openNavItemByName } = createComponent();

    component.NotificationClicked(notification({ type: 'UserRoutine', routineId: 'R1', runId: 'RUN1', conversationId: 'C1' }));

    await vi.waitFor(() => expect(openNavItemByName).toHaveBeenCalledWith('Conversations', { conversationId: 'C1' }, 'chat-app'));
  });

  it('reads the conversation off the routine for a notification written before it carried one', async () => {
    const { component, openNavItemByName } = createComponent('C-from-routine');

    component.NotificationClicked(notification({ type: 'UserRoutine', routineId: 'R1', runId: 'RUN1' }));

    await vi.waitFor(() => expect(openNavItemByName).toHaveBeenCalledWith('Conversations', { conversationId: 'C-from-routine' }, 'chat-app'));
  });

  it('opens the routine in the Routines app when it has no conversation', async () => {
    const { component, openNavItemByName } = createComponent(null);

    component.NotificationClicked(notification({ type: 'UserRoutine', routineId: 'R1', runId: 'RUN1' }));

    await vi.waitFor(() => expect(openNavItemByName).toHaveBeenCalledWith('My Routines', { routine: 'R1' }, 'routines-app'));
  });
});
