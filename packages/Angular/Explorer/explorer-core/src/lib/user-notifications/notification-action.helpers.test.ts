import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import type { MJUserNotificationEntity } from '@memberjunction/core-entities';
import type { ApplicationManager } from '@memberjunction/ng-base-application';
import type { NavigationService, SharedService } from '@memberjunction/ng-shared';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  FormatRelativeNotificationTime,
  IsNotificationClickable,
  NavigateToNotificationTarget,
} from './notification-action.helpers';

function makeNotification(overrides: Partial<Record<string, unknown>> = {}): MJUserNotificationEntity {
  return {
    ID: 'n-1',
    Title: 'Test notification',
    Message: 'Body',
    Unread: true,
    NotificationTypeID: null,
    NotificationType: null,
    ResourceTypeID: null,
    ResourceRecordID: null,
    ResourceConfiguration: null,
    ...overrides,
  } as unknown as MJUserNotificationEntity;
}

describe('notification-action.helpers', () => {
  it('treats handoff-offer notifications as clickable and navigates to Conversation Console', () => {
    const openNavItem = vi.fn();
    const shared = { ResourceTypeByID: vi.fn() } as unknown as SharedService;
    const notification = makeNotification({
      ResourceConfiguration: JSON.stringify({ type: 'handoff-offer', offerId: 'offer-42' }),
    });

    expect(IsNotificationClickable(notification, shared)).toBe(true);

    const handled = NavigateToNotificationTarget(notification, {
      SharedService: shared,
      NavigationService: { OpenNavItem: openNavItem } as unknown as NavigationService,
      AppManager: {
        GetAppByName: (name: string) => (name === 'Meet' ? { ID: 'meet-1', GetColor: () => '#0891b2' } : null),
        GetActiveApp: () => null,
      } as unknown as ApplicationManager,
      Provider: {} as IMetadataProvider,
    });

    expect(handled).toBe(true);
    expect(openNavItem).toHaveBeenCalledWith(
      'meet-1',
      expect.objectContaining({
        DriverClass: 'HumanHandoffConsoleResource',
        Configuration: { offer: 'offer-42' },
      }),
      '#0891b2'
    );
  });

  it('treats meeting and Meeting Invitation notifications as clickable and navigates to Meetings', () => {
    const openNavItem = vi.fn();
    const shared = { ResourceTypeByID: vi.fn() } as unknown as SharedService;

    const meetingByConfig = makeNotification({
      ResourceConfiguration: JSON.stringify({ type: 'meeting-invitation', meetingId: 'mtg-9' }),
    });
    const meetingByType = makeNotification({
      NotificationType: 'Meeting Invitation',
    });

    expect(IsNotificationClickable(meetingByConfig, shared)).toBe(true);
    expect(IsNotificationClickable(meetingByType, shared)).toBe(true);

    const handled = NavigateToNotificationTarget(meetingByConfig, {
      SharedService: shared,
      NavigationService: { OpenNavItem: openNavItem } as unknown as NavigationService,
      AppManager: {
        GetAppByName: (name: string) => (name === 'Meet' ? { ID: 'meet-1', GetColor: () => '#0891b2' } : null),
        GetActiveApp: () => null,
      } as unknown as ApplicationManager,
      Provider: {} as IMetadataProvider,
    });

    expect(handled).toBe(true);
    expect(openNavItem).toHaveBeenCalledWith(
      'meet-1',
      expect.objectContaining({
        DriverClass: 'MeetingsResource',
        Configuration: { meeting: 'mtg-9' },
      }),
      '#0891b2'
    );
  });

  it('returns false for plain informational notifications without a resource or special config', () => {
    const shared = { ResourceTypeByID: vi.fn() } as unknown as SharedService;
    expect(IsNotificationClickable(makeNotification(), shared)).toBe(false);
  });

  it('formats relative timestamps cleanly', () => {
    const now = Date.now();
    expect(FormatRelativeNotificationTime(new Date(now - 20_000))).toBe('just now');
    expect(FormatRelativeNotificationTime(new Date(now - 12 * 60_000))).toBe('12m ago');
    expect(FormatRelativeNotificationTime(new Date(now - 3 * 3_600_000))).toBe('3h ago');
    expect(FormatRelativeNotificationTime(new Date(now - 2 * 86_400_000))).toBe('2d ago');
    expect(FormatRelativeNotificationTime(new Date(now - 10 * 86_400_000))).toBe('');
    expect(FormatRelativeNotificationTime(null)).toBe('');
  });
});
