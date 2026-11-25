// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SharedService } from '@memberjunction/ng-shared';
import { UserNotificationsComponent } from './user-notifications.component';
import type { MJUserNotificationEntity } from '@memberjunction/core-entities';

/**
 * Mark All Read / Mark All Unread batch their saves in one transaction group. A grouped Save()
 * runs validation and pre-save hooks before it joins the group, so the group may only be
 * submitted once every save has been queued; submitting earlier sends an empty group that reports
 * success and leaves every notification unchanged on the server.
 */

type Open = Record<string, unknown>;

interface FakeGroup {
  Queued: number;
  QueuedAtSubmit: number | null;
  Submit: () => Promise<boolean>;
}

interface Harness {
  component: UserNotificationsComponent;
  group: FakeGroup;
  refresh: ReturnType<typeof vi.fn>;
}

function createComponent(notifications: MJUserNotificationEntity[]): Harness {
  const group: FakeGroup = {
    Queued: 0,
    QueuedAtSubmit: null,
    Submit: async () => {
      group.QueuedAtSubmit = group.Queued;
      return true;
    },
  };
  const component = Object.create(UserNotificationsComponent.prototype) as UserNotificationsComponent;
  const open = component as unknown as Open;
  // Stands in for a grouped Save(): it yields (validation, hooks) before joining the group.
  open['MarkAsRead'] = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    group.Queued++;
    return true;
  });
  open['SharedService'] = { CreateSimpleNotification: vi.fn() };
  Object.defineProperty(component, 'ProviderToUse', {
    get: () => ({ CreateTransactionGroup: vi.fn(async () => group) }),
    configurable: true,
  });
  Object.defineProperty(component, 'AllNotifications', { get: () => notifications, configurable: true });
  const refresh = vi.fn();
  vi.spyOn(SharedService, 'RefreshUserNotifications').mockImplementation(async () => { refresh(); });
  return { component, group, refresh };
}

function notifications(unread: boolean[]): MJUserNotificationEntity[] {
  return unread.map((u, i) => ({ ID: `n-${i}`, Unread: u }) as unknown as MJUserNotificationEntity);
}

describe('UserNotificationsComponent — Mark All submits only after every save is queued', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Mark All Read submits a group holding every unread notification', async () => {
    const { component, group, refresh } = createComponent(notifications([true, true, false, true]));

    await component.MarkAllAsRead();

    expect(group.QueuedAtSubmit).toBe(3);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Mark All Unread submits a group holding every read notification', async () => {
    const { component, group } = createComponent(notifications([true, false, false]));

    await component.MarkAllAsUnread();

    expect(group.QueuedAtSubmit).toBe(2);
  });
});
