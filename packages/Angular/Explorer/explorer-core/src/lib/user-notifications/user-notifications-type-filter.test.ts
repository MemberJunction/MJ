// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  UserNotificationsComponent,
  MatchesNotificationTypeFilter,
  NO_NOTIFICATION_TYPE_FILTER,
} from './user-notifications.component';
import type { MJUserNotificationEntity } from '@memberjunction/core-entities';

/**
 * The Type dropdown has three kinds of entry: "All Types" (null) shows every notification,
 * a type shows only that type, and "Other (no type)" shows notifications with no
 * NotificationTypeID. "All Types" must be a real null: a string "null" would be truthy and
 * match nothing.
 */

const TYPE_A = 'AAAAAAAA-0000-0000-0000-000000000001';
const TYPE_B = 'BBBBBBBB-0000-0000-0000-000000000002';

describe('MatchesNotificationTypeFilter', () => {
  it('matches every notification when the filter is null (All Types)', () => {
    expect(MatchesNotificationTypeFilter(TYPE_A, null)).toBe(true);
    expect(MatchesNotificationTypeFilter(null, null)).toBe(true);
  });

  it('matches only the selected type, ignoring UUID case', () => {
    expect(MatchesNotificationTypeFilter(TYPE_A, TYPE_A.toLowerCase())).toBe(true);
    expect(MatchesNotificationTypeFilter(TYPE_B, TYPE_A)).toBe(false);
    expect(MatchesNotificationTypeFilter(null, TYPE_A)).toBe(false);
  });

  it('matches only untyped notifications for Other (no type)', () => {
    expect(MatchesNotificationTypeFilter(null, NO_NOTIFICATION_TYPE_FILTER)).toBe(true);
    expect(MatchesNotificationTypeFilter(undefined, NO_NOTIFICATION_TYPE_FILTER)).toBe(true);
    expect(MatchesNotificationTypeFilter('', NO_NOTIFICATION_TYPE_FILTER)).toBe(true);
    expect(MatchesNotificationTypeFilter(TYPE_A, NO_NOTIFICATION_TYPE_FILTER)).toBe(false);
  });
});

describe('UserNotificationsComponent — Type filter', () => {
  const notifications = [
    { ID: 'n-1', NotificationTypeID: TYPE_A, Unread: true },
    { ID: 'n-2', NotificationTypeID: TYPE_B, Unread: false },
    { ID: 'n-3', NotificationTypeID: null, Unread: true },
  ] as unknown as MJUserNotificationEntity[];

  function createComponent(): UserNotificationsComponent {
    const component = Object.create(UserNotificationsComponent.prototype) as UserNotificationsComponent;
    const open = component as unknown as Record<string, unknown>;
    open['RadioSelected'] = 'All';
    open['CurrentFilter'] = '';
    open['SelectedTypeFilter'] = null;
    open['notificationsToShowKey'] = '';
    open['notificationsToShowCache'] = [];
    Object.defineProperty(component, 'AllNotifications', { get: () => notifications, configurable: true });
    return component;
  }

  const ids = (c: UserNotificationsComponent) => c.NotificationsToShow.map(n => n.ID);

  it('shows every notification after switching back to All Types', () => {
    const component = createComponent();
    component.OnTypeFilterChange(TYPE_A);
    expect(ids(component)).toEqual(['n-1']);
    component.OnTypeFilterChange(null);
    expect(ids(component)).toEqual(['n-1', 'n-2', 'n-3']);
  });

  it('shows only untyped notifications for Other (no type)', () => {
    const component = createComponent();
    component.OnTypeFilterChange(NO_NOTIFICATION_TYPE_FILTER);
    expect(ids(component)).toEqual(['n-3']);
  });
});
