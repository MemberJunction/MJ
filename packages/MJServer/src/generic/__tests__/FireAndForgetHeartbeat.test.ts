import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PubSubEngine } from 'type-graphql';
import {
    startLivenessPulse,
    DEFAULT_PULSE_INTERVAL_MS,
    HEARTBEAT_MESSAGE_TYPE,
} from '../FireAndForgetHeartbeat';
import { PUSH_STATUS_UPDATES_TOPIC } from '../PushStatusResolver';

/** Minimal PubSubEngine stub capturing publish calls. */
function makePubSub() {
    const publish = vi.fn().mockResolvedValue(undefined);
    return { publish } as unknown as PubSubEngine & { publish: ReturnType<typeof vi.fn> };
}

function parseLastMessage(pubSub: { publish: ReturnType<typeof vi.fn> }) {
    const [topic, payload] = pubSub.publish.mock.calls[pubSub.publish.mock.calls.length - 1];
    return { topic, payload, parsed: JSON.parse(payload.message) };
}

describe('startLivenessPulse', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('does not publish before the first interval elapses', () => {
        const pubSub = makePubSub();
        startLivenessPulse({ pubSub, sessionId: 's1', resolver: 'TestResolver' });
        vi.advanceTimersByTime(DEFAULT_PULSE_INTERVAL_MS - 1);
        expect(pubSub.publish).not.toHaveBeenCalled();
    });

    it('publishes a heartbeat on the push-status topic each interval', () => {
        const pubSub = makePubSub();
        startLivenessPulse({ pubSub, sessionId: 's1', resolver: 'TestResolver', intervalMs: 1000 });

        vi.advanceTimersByTime(3000);

        expect(pubSub.publish).toHaveBeenCalledTimes(3);
        const { topic, payload, parsed } = parseLastMessage(pubSub);
        expect(topic).toBe(PUSH_STATUS_UPDATES_TOPIC);
        expect(payload.sessionId).toBe('s1');
        expect(parsed.resolver).toBe('TestResolver');
        expect(parsed.type).toBe(HEARTBEAT_MESSAGE_TYPE);
    });

    it('includes the enriched status snapshot from readStatus', () => {
        const pubSub = makePubSub();
        startLivenessPulse({
            pubSub,
            sessionId: 's1',
            resolver: 'RunAIAgentResolver',
            intervalMs: 1000,
            readStatus: () => ({ runId: 'run-123', status: 'Running', currentStep: 'Prompt' }),
        });

        vi.advanceTimersByTime(1000);

        const { parsed } = parseLastMessage(pubSub);
        expect(parsed.data).toEqual({ runId: 'run-123', status: 'Running', currentStep: 'Prompt' });
    });

    it('publishes an empty data object when readStatus throws (loop survives)', () => {
        const pubSub = makePubSub();
        startLivenessPulse({
            pubSub,
            sessionId: 's1',
            resolver: 'RunAIAgentResolver',
            intervalMs: 1000,
            readStatus: () => {
                throw new Error('transient read failure');
            },
        });

        vi.advanceTimersByTime(2000);

        expect(pubSub.publish).toHaveBeenCalledTimes(2);
        const { parsed } = parseLastMessage(pubSub);
        expect(parsed.data).toEqual({});
    });

    it('stops publishing after stop() is called', () => {
        const pubSub = makePubSub();
        const handle = startLivenessPulse({ pubSub, sessionId: 's1', resolver: 'TestResolver', intervalMs: 1000 });

        vi.advanceTimersByTime(2000);
        expect(pubSub.publish).toHaveBeenCalledTimes(2);

        handle.stop();
        vi.advanceTimersByTime(5000);
        expect(pubSub.publish).toHaveBeenCalledTimes(2);
    });
});
