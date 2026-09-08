/**
 * Tests for the task-graph live signal.
 *
 * `taskGraphFrameFilter` is the security-critical gate and is tested in isolation for the same
 * reason `statusUpdatesFilter` is: a `parentTaskId` is a discoverable value, so without an identity
 * check anyone holding one could watch another user's workflow — including its per-step error
 * messages. It must fail **closed**.
 *
 * The broadcaster's contract is that it can never disturb the work it is describing: a frame is
 * commentary on execution, never a step of it.
 */
// type-graphql's decorators evaluate at module load, and they need the metadata polyfill. Without
// this the file fails to COLLECT — which vitest reports as zero tests rather than as a failure.
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));

import {
    TASK_GRAPH_FRAMES_TOPIC,
    TaskGraphFrameBroadcaster,
    taskGraphFrameFilter,
    type TaskGraphFramePayload,
} from '../resolvers/TaskGraphFrameResolver';
import type { TaskGraphFrame } from '@memberjunction/task-graph';
import type { PubSubEngine } from 'type-graphql';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const GRAPH = '33333333-3333-3333-3333-333333333333';

const payload = (over: Partial<TaskGraphFramePayload> = {}): TaskGraphFramePayload => ({
    Kind: 'TaskCompleted',
    ParentTaskID: GRAPH,
    TaskID: 'task-1',
    TaskName: 'Summarize',
    Status: 'Complete',
    ownerUserId: OWNER,
    ...over,
});

// `null` rather than `undefined` for "no identity": passing `undefined` explicitly triggers a
// default parameter, so the case would silently test the opposite of what it claims.
const context = (userId: string | null) => (userId ? { userPayload: { userRecord: { ID: userId } } } : {});

const check = (over: Partial<TaskGraphFramePayload> = {}, args = GRAPH, userId: string | null = OWNER) =>
    taskGraphFrameFilter({ payload: payload(over), args: { parentTaskId: args }, context: context(userId) });

describe('taskGraphFrameFilter — the delivery gate', () => {
    it('delivers a frame for the watched graph to its owner', () => {
        expect(check()).toBe(true);
    });

    it('matches graph IDs case-insensitively — UUID casing varies by source', () => {
        expect(check({}, GRAPH.toUpperCase())).toBe(true);
    });

    it('does NOT deliver frames from another graph', () => {
        expect(check({ ParentTaskID: '44444444-4444-4444-4444-444444444444' })).toBe(false);
    });

    it('does NOT deliver another user\'s workflow to a subscriber holding its ID', () => {
        // The whole reason identity is checked: parentTaskId is discoverable, and the frames carry
        // per-step error messages.
        expect(check({}, GRAPH, OTHER)).toBe(false);
    });

    it('fails closed when the connection has no identity', () => {
        expect(check({}, GRAPH, null)).toBe(false);
    });

    it('fails closed when the frame has no owner', () => {
        expect(check({ ownerUserId: '' as unknown as string })).toBe(false);
    });

    it('fails closed on a missing graph ID on either side', () => {
        expect(check({ ParentTaskID: '' })).toBe(false);
        expect(check({}, '')).toBe(false);
    });
});

describe('TaskGraphFrameBroadcaster', () => {
    let published: Array<[string, unknown]>;
    let pubSub: PubSubEngine;

    beforeEach(() => {
        published = [];
        pubSub = {
            publish: vi.fn().mockImplementation(async (topic: string, p: unknown) => { published.push([topic, p]); }),
        } as unknown as PubSubEngine;
    });

    const frame = (over: Partial<TaskGraphFrame> = {}): TaskGraphFrame => ({
        Kind: 'TaskStarted', ParentTaskID: GRAPH, OwnerUserID: OWNER, TaskID: 'task-1', TaskName: 'Gather', ...over,
    });

    it('publishes the frame with the owner attached as the filter key', () => {
        new TaskGraphFrameBroadcaster(pubSub).OnFrame(frame());

        expect(published).toHaveLength(1);
        const [topic, p] = published[0];
        expect(topic).toBe(TASK_GRAPH_FRAMES_TOPIC);
        expect((p as TaskGraphFramePayload).ownerUserId).toBe(OWNER);
        expect((p as TaskGraphFramePayload).Kind).toBe('TaskStarted');
    });

    it('drops a frame with no owner rather than publishing one the filter would refuse', () => {
        // Reachable for graphs submitted before ownership was recorded on the parent.
        new TaskGraphFrameBroadcaster(pubSub).OnFrame(frame({ OwnerUserID: null }));
        expect(published).toHaveLength(0);
    });

    it('never throws when publishing fails — a frame must not disturb the work it describes', () => {
        const exploding = { publish: vi.fn(() => { throw new Error('pubsub down'); }) } as unknown as PubSubEngine;
        expect(() => new TaskGraphFrameBroadcaster(exploding).OnFrame(frame())).not.toThrow();
    });

    it('carries the whole frame through, so a viewer can render without re-reading rows', () => {
        new TaskGraphFrameBroadcaster(pubSub).OnFrame(
            frame({ Kind: 'TaskFailed', Status: 'Failed', ErrorMessage: 'model timed out' }),
        );
        const p = published[0][1] as TaskGraphFramePayload;
        expect(p.Status).toBe('Failed');
        expect(p.ErrorMessage).toBe('model timed out');
        expect(p.TaskName).toBe('Gather');
    });

    it('carries graph-level progress on a settled frame', () => {
        new TaskGraphFrameBroadcaster(pubSub).OnFrame(
            frame({ Kind: 'GraphSettled', TaskID: undefined, Status: 'Complete', CompletedCount: 7, TotalCount: 7 }),
        );
        const p = published[0][1] as TaskGraphFramePayload;
        expect(p.CompletedCount).toBe(7);
        expect(p.TotalCount).toBe(7);
    });
});
