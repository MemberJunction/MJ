import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeNotification {
  ID: string;
  Unread: boolean;
}

const { notifications$, refreshItem, state } = await vi.hoisted(async () => {
  const { BehaviorSubject } = await import('rxjs');
  const notificationsState: { list: FakeNotification[] } = {
    list: [{ ID: 'n-1', Unread: false }],
  };
  return {
    notifications$: new BehaviorSubject<FakeNotification[]>(notificationsState.list),
    refreshItem: vi.fn(async (_propertyName: string) => {}),
    state: notificationsState,
  };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({ GraphQLDataProvider: class {} }));

vi.mock('@memberjunction/core-entities', () => ({
  MJUserNotificationEntity: class {},
  UserInfoEngine: {
    Instance: {
      UserNotifications$: notifications$,
      get UserNotificationsIfPermitted(): FakeNotification[] {
        return state.list;
      },
      get UnreadNotifications(): FakeNotification[] {
        return state.list.filter(n => n.Unread);
      },
      get UnreadNotificationCount(): number {
        return state.list.filter(n => n.Unread).length;
      },
      RefreshItem: refreshItem,
    },
  },
}));

import { MJNotificationService } from '../lib/notifications.service';

describe('MJNotificationService — RefreshUserNotifications and UpdateNotificationObservables', () => {
  beforeEach(() => {
    refreshItem.mockClear();
    state.list = [{ ID: 'n-1', Unread: false }];
  });

  it('calls UserInfoEngine.Instance.RefreshItem with the exact _userNotifications property name', async () => {
    await MJNotificationService.RefreshUserNotifications();
    expect(refreshItem).toHaveBeenCalledTimes(1);
    expect(refreshItem).toHaveBeenCalledWith('_userNotifications');
  });

  it('immediately re-emits Notifications$ and UnreadCount$ when UpdateNotificationObservables is called', () => {
    const counts: number[] = [];
    const sub = MJNotificationService.UnreadCount$.subscribe(count => counts.push(count));

    state.list[0].Unread = true;
    MJNotificationService.UpdateNotificationObservables();

    state.list[0].Unread = false;
    MJNotificationService.UpdateNotificationObservables();

    sub.unsubscribe();
    expect(counts.slice(-2)).toEqual([1, 0]);
  });
});
