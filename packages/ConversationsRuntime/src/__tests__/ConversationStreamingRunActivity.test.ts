/**
 * @fileoverview Tests for ConversationStreaming's per-run and per-message activity record.
 *
 * The message pill decides whether a run is still alive from how long the server has been silent
 * about it. The run object that progress frames carry is the server's in-memory entity, which is
 * saved only at creation and at the end, so its timestamps never move during a healthy run. The
 * only honest signal is that a frame for the run arrived at all — including the 60s liveness
 * pulse, which names the run but carries no progress text.
 *
 * Frames are fed through the real `handlePushStatusUpdate` entry point as the JSON strings the
 * push subscription delivers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ConversationStreaming } from '../streaming/ConversationStreaming';
import type { IConversationsRuntimeContext } from '../context/IConversationsRuntimeContext';

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: {
            PushStatusUpdates: vi.fn(),
        },
    },
}));

const RUN_ID = '4F1C2A9E-7B3D-4E21-9A55-0C6D8E2F1B77';
const DETAIL_ID = '9D0E3B41-2C6A-4F18-8B7E-5A1F0C3D2E96';
const T0 = new Date('2026-09-30T12:00:00.000Z').getTime();

function buildStreaming(): ConversationStreaming {
    const context: IConversationsRuntimeContext = {
        Notification: { Notify: vi.fn() },
        Tasks: { RemoveByAgentRunId: vi.fn().mockReturnValue(true) },
    };
    return new ConversationStreaming(context);
}

async function deliver(streaming: ConversationStreaming, frame: Record<string, unknown>): Promise<void> {
    const priv = streaming as unknown as { handlePushStatusUpdate(s: unknown): Promise<void> };
    await priv.handlePushStatusUpdate(JSON.stringify(frame));
}

function progressFrame(runId: string): Record<string, unknown> {
    return {
        resolver: 'RunAIAgentResolver',
        type: 'ExecutionProgress',
        status: 'ok',
        data: {
            agentRunId: runId,
            type: 'progress',
            agentRun: { ID: runId, ConversationDetailID: DETAIL_ID },
            progress: { message: 'Asking Skip', percentage: 0 },
        },
    };
}

function heartbeatFrame(runId: string): Record<string, unknown> {
    return {
        resolver: 'RunAIAgentResolver',
        type: 'Heartbeat',
        status: 'ok',
        data: { runId, status: 'Running' },
    };
}

function completeFrame(runId: string): Record<string, unknown> {
    return {
        resolver: 'RunAIAgentResolver',
        type: 'ExecutionProgress',
        status: 'ok',
        data: { agentRunId: runId, type: 'complete', conversationDetailId: DETAIL_ID, success: true },
    };
}

describe('ConversationStreaming run activity', () => {
    let streaming: ConversationStreaming;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        streaming = buildStreaming();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('knows nothing about a run it has not heard from', () => {
        expect(streaming.LastHeardFromRun(RUN_ID)).toBeUndefined();
    });

    it('records the browser time a progress frame for the run arrived', async () => {
        await deliver(streaming, progressFrame(RUN_ID));
        expect(streaming.LastHeardFromRun(RUN_ID)).toBe(T0);
    });

    it('counts a liveness pulse for the run, which carries no progress text', async () => {
        // A long Skip request can go minutes without a status message. The pulse is the only thing
        // that proves the server is still working on it.
        await deliver(streaming, progressFrame(RUN_ID));

        vi.setSystemTime(T0 + 60_000);
        await deliver(streaming, heartbeatFrame(RUN_ID));

        expect(streaming.LastHeardFromRun(RUN_ID)).toBe(T0 + 60_000);
    });

    it('matches the run regardless of UUID case', async () => {
        // SQL Server returns upper-case UUIDs and other paths lower-case them; the pill must not
        // miss its run over casing.
        await deliver(streaming, heartbeatFrame(RUN_ID.toLowerCase()));
        expect(streaming.LastHeardFromRun(RUN_ID)).toBe(T0);
    });

    it('ignores the placeholder id used by background error events', async () => {
        await deliver(streaming, heartbeatFrame('unknown'));
        expect(streaming.LastHeardFromRun('unknown')).toBeUndefined();
    });

    it('forgets a run once it completes', async () => {
        await deliver(streaming, progressFrame(RUN_ID));
        await deliver(streaming, completeFrame(RUN_ID));
        expect(streaming.LastHeardFromRun(RUN_ID)).toBeUndefined();
    });
});

describe('ConversationStreaming message activity', () => {
    /**
     * A row written by a host's own turn handler can have no MJ agent run for the pill to look up.
     * The host still reports the row's progress through the same publisher, and those frames name
     * the row. Hearing about the row is as good a sign of life as hearing about its run.
     */
    let streaming: ConversationStreaming;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        streaming = buildStreaming();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('records a progress frame for the message it names', async () => {
        await deliver(streaming, progressFrame(RUN_ID));
        expect(streaming.LastHeardForMessage(DETAIL_ID)).toBe(T0);
    });

    it('matches the message regardless of UUID case', async () => {
        await deliver(streaming, progressFrame(RUN_ID));
        expect(streaming.LastHeardForMessage(DETAIL_ID.toLowerCase())).toBe(T0);
    });

    it('records a task progress frame for the message it names', async () => {
        vi.setSystemTime(T0 + 1_000);
        await deliver(streaming, {
            resolver: 'TaskOrchestrator',
            type: 'TaskProgress',
            status: 'ok',
            data: { taskName: 'Build', message: 'working', conversationDetailId: DETAIL_ID },
        });
        expect(streaming.LastHeardForMessage(DETAIL_ID)).toBe(T0 + 1_000);
    });

    it('forgets the message once it completes', async () => {
        await deliver(streaming, progressFrame(RUN_ID));
        await deliver(streaming, completeFrame(RUN_ID));
        expect(streaming.LastHeardForMessage(DETAIL_ID)).toBeUndefined();
    });
});
