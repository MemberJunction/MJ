/**
 * Tests for cross-instance fan-out of push-status updates (MJ #4222).
 *
 * Behind a load balancer the browser's WebSocket lives on one replica while the mutation driving
 * the agent may be handled by another, so a completion can be published to a topic that has no
 * subscriber. Replicating progress and completion closes that.
 *
 * Three properties are pinned here because each one, if wrong, produces a bug that looks like
 * something else entirely:
 *
 * - **Streaming content is not replicated.** It is hundreds of messages per second, each carrying
 *   a full serialized agent run. Replicating it would look like a network problem, not a bug here.
 * - **Every publish carries `SourceServerId`.** Without it, echo suppression on the receiving side
 *   has nothing to match and every push is delivered twice.
 * - **A hook that throws does not break local delivery.** The message bus is an optimization over
 *   the durable tail query; the local path must work when it is down.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    publishStatusUpdate,
    shouldReplicateStatusUpdate,
    SetPushStatusPublishHook,
    type PushStatusNotificationPayload,
} from '../generic/PushStatusResolver.js';
import { MJGlobal } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';

const SESSION = 'session-1';
const OWNER = 'U0000000-0000-0000-0000-000000000000';

function fakePubSub() {
    const published: Array<{ topic: string; payload: PushStatusNotificationPayload }> = [];
    const engine = {
        publish: (topic: string, payload: PushStatusNotificationPayload) => {
            published.push({ topic, payload });
            return Promise.resolve();
        },
    } as unknown as PubSubEngine;
    return { engine, published };
}

const envelope = (type: string) => JSON.stringify({ resolver: 'RunAIAgentResolver', type, status: 'ok', data: {} });

afterEach(() => {
    SetPushStatusPublishHook(undefined);
});

describe('shouldReplicateStatusUpdate', () => {
    it('replicates execution progress', () => {
        expect(shouldReplicateStatusUpdate(envelope('ExecutionProgress'))).toBe(true);
    });

    it('does not replicate streaming content', () => {
        expect(shouldReplicateStatusUpdate(envelope('StreamingContent'))).toBe(false);
    });

    it('replicates a plain-string message, which is rare and low-rate', () => {
        expect(shouldReplicateStatusUpdate('agent finished')).toBe(true);
    });

    it('does not replicate an empty message', () => {
        expect(shouldReplicateStatusUpdate(undefined)).toBe(false);
        expect(shouldReplicateStatusUpdate('')).toBe(false);
    });

    it('replicates JSON that is not the resolver envelope', () => {
        expect(shouldReplicateStatusUpdate(JSON.stringify({ hello: 'world' }))).toBe(true);
    });
});

describe('publishStatusUpdate fan-out', () => {
    beforeEach(() => {
        SetPushStatusPublishHook(undefined);
    });

    it('stamps the publishing instance on every payload', () => {
        const { engine, published } = fakePubSub();

        publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('ExecutionProgress') });

        expect(published).toHaveLength(1);
        expect(published[0].payload.SourceServerId).toBe(MJGlobal.Instance.ProcessUUID);
    });

    it('still publishes locally when no hook is registered', () => {
        const { engine, published } = fakePubSub();

        publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('ExecutionProgress') });

        expect(published[0].payload.ownerUserId).toBe(OWNER);
    });

    it('forwards a replicable update to the hook', () => {
        const hook = vi.fn();
        SetPushStatusPublishHook(hook);
        const { engine } = fakePubSub();

        publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('ExecutionProgress') });

        expect(hook).toHaveBeenCalledTimes(1);
        const forwarded = hook.mock.calls[0][0] as PushStatusNotificationPayload;
        expect(forwarded.sessionId).toBe(SESSION);
        expect(forwarded.ownerUserId).toBe(OWNER);
        expect(forwarded.SourceServerId).toBe(MJGlobal.Instance.ProcessUUID);
    });

    it('does not forward streaming content, but still delivers it locally', () => {
        const hook = vi.fn();
        SetPushStatusPublishHook(hook);
        const { engine, published } = fakePubSub();

        publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('StreamingContent') });

        expect(hook).not.toHaveBeenCalled();
        expect(published).toHaveLength(1);
    });

    it('delivers locally even when the hook throws', () => {
        SetPushStatusPublishHook(() => {
            throw new Error('redis is down');
        });
        const { engine, published } = fakePubSub();

        expect(() =>
            publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('ExecutionProgress') })
        ).not.toThrow();
        expect(published).toHaveLength(1);
    });

    it('publishes locally before attempting fan-out', () => {
        const order: string[] = [];
        SetPushStatusPublishHook(() => order.push('hook'));
        const engine = {
            publish: () => {
                order.push('local');
                return Promise.resolve();
            },
        } as unknown as PubSubEngine;

        publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('ExecutionProgress') });

        expect(order).toEqual(['local', 'hook']);
    });

    it('clears the hook when set with no argument', () => {
        const hook = vi.fn();
        SetPushStatusPublishHook(hook);
        SetPushStatusPublishHook(undefined);
        const { engine } = fakePubSub();

        publishStatusUpdate(engine, { sessionId: SESSION, ownerUserId: OWNER, message: envelope('ExecutionProgress') });

        expect(hook).not.toHaveBeenCalled();
    });
});
