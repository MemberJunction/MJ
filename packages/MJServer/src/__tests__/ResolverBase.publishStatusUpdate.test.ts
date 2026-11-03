// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { PubSubEngine } from 'type-graphql';
import { UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC, StatusUpdateOwnerID } from '../generic/PushStatusResolver.js';
import type { UserPayload } from '../types.js';

/**
 * `ResolverBase.PublishStatusUpdate` stamps the owner the caller's socket is authenticated as. For a widget guest
 * whose run is elevated to the system user, that is the guest's owner key: a push stamped with the elevated user's ID
 * never passes the subscription filter on the guest's socket.
 */

const ANONYMOUS_USER_ID = 'AAAAAAAA-0000-4000-8000-0000000000A0';
const SYSTEM_USER_ID = 'BBBBBBBB-0000-4000-8000-0000000000B0';

/** Reaches the protected publish wrapper. */
class Probe extends ResolverBase {
    public Publish(pubSub: PubSubEngine, userPayload: UserPayload): void {
        this.PublishStatusUpdate(pubSub, 'session-1', 'progress', userPayload);
    }
}

function elevatedGuestPayload(): UserPayload {
    const guest = new UserInfo(null, { ID: ANONYMOUS_USER_ID, Email: 'anonymous@magic-link.local' });
    guest.IsMagicLinkAnonymous = true;
    guest.AnonymousVisitorID = 'sid-guest-1';
    return {
        sessionId: 'session-1',
        email: 'system@example.com',
        userRecord: new UserInfo(null, { ID: SYSTEM_USER_ID, Email: 'system@example.com' }),
        ElevatedFrom: guest,
    };
}

describe('ResolverBase.PublishStatusUpdate — the owner it stamps', () => {
    it("stamps an elevated widget guest's own owner key, not the system user it was elevated to", () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const pubSub: PubSubEngine = { publish, subscribe: vi.fn(), unsubscribe: vi.fn(), asyncIterator: vi.fn() };
        const userPayload = elevatedGuestPayload();

        new Probe().Publish(pubSub, userPayload);

        expect(publish).toHaveBeenCalledOnce();
        expect(publish.mock.calls[0][0]).toBe(PUSH_STATUS_UPDATES_TOPIC);
        const payload = publish.mock.calls[0][1] as { sessionId: string; ownerUserId: string; message: string };
        expect(payload).toMatchObject({ sessionId: 'session-1', message: 'progress' });
        expect(payload.ownerUserId).toBe(StatusUpdateOwnerID(userPayload));
        expect(payload.ownerUserId).toBe(`${ANONYMOUS_USER_ID.toLowerCase()}|sid-guest-1`);
    });

    it('stamps a signed-in user with their user ID', () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const pubSub: PubSubEngine = { publish, subscribe: vi.fn(), unsubscribe: vi.fn(), asyncIterator: vi.fn() };
        const userPayload: UserPayload = {
            sessionId: 'session-1',
            email: 'user@example.com',
            userRecord: new UserInfo(null, { ID: 'CCCCCCCC-0000-4000-8000-0000000000C0', Email: 'user@example.com' }),
        };

        new Probe().Publish(pubSub, userPayload);

        expect((publish.mock.calls[0][1] as { ownerUserId: string }).ownerUserId).toBe('CCCCCCCC-0000-4000-8000-0000000000C0');
    });
});
