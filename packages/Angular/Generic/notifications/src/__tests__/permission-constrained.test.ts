import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';

/**
 * Explorer's shell subscribes to MJNotificationService.UnreadCount$ at boot. For an external
 * magic-link session UserInfoEngine is permission-constrained by design, and the stream mapped
 * through the throwing `UserNotifications` getter: an uncaught PermissionConstrainedError that
 * also terminated the shared replay. The stream must emit an empty list instead.
 */

const { notifications$ } = await vi.hoisted(async () => {
    const { BehaviorSubject: Subject } = await import('rxjs');
    return { notifications$: new Subject<unknown[]>([]) };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({ GraphQLDataProvider: class {} }));

vi.mock('@memberjunction/core-entities', () => ({
    MJUserNotificationEntity: class {},
    UserInfoEngine: {
        Instance: {
            UserNotifications$: notifications$,
            get UserNotifications(): never {
                throw new Error('PermissionConstrainedError: UserInfoEngine data is not available');
            },
            UserNotificationsIfPermitted: [],
            UnreadNotifications: [],
            UnreadNotificationCount: 0,
        },
    },
}));

import { MJNotificationService } from '../lib/notifications.service';

describe('MJNotificationService — permission-constrained session', () => {
    it('Notifications$ and UnreadCount$ emit empty instead of erroring', async () => {
        const errors: unknown[] = [];
        const counts: number[] = [];
        const sub = MJNotificationService.UnreadCount$.subscribe({ next: c => counts.push(c), error: e => errors.push(e) });
        notifications$.next([]); // a later cache emission must still flow — the stream is alive
        sub.unsubscribe();
        expect(errors).toEqual([]);
        expect(counts).toEqual([0, 0]);
    });

    it('the static UserNotifications accessor answers empty', () => {
        expect(MJNotificationService.UserNotifications).toEqual([]);
    });
});
