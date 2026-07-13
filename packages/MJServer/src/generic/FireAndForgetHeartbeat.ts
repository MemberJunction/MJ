import { PubSubEngine } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import { PUSH_STATUS_UPDATES_TOPIC } from './PushStatusResolver.js';

/** Default cadence for fire-and-forget liveness pulses (5 minutes). */
export const DEFAULT_PULSE_INTERVAL_MS = 5 * 60 * 1000;

/** The `type` discriminator carried by liveness pulse messages. */
export const HEARTBEAT_MESSAGE_TYPE = 'Heartbeat';

/**
 * Lightweight status snapshot included in an enriched pulse so the client can
 * correlate the pulse with a run record and surface a coarse "still running"
 * signal. Read from the in-memory run entity — never a DB query.
 */
export interface PulseStatus {
    /** Primary key of the persisted run record (AIAgentRun, TestRun, TestSuiteRun). */
    runId?: string;
    /** Current run status, e.g. 'Running'. */
    status?: string;
    /** Optional human-readable current step for UI display. */
    currentStep?: string;
}

/** Handle returned by {@link startLivenessPulse}; call `stop()` when the work settles. */
export interface LivenessPulseHandle {
    stop(): void;
}

export interface LivenessPulseOptions {
    /** PubSub engine used to publish on the shared push-status topic. */
    pubSub: PubSubEngine;
    /** Session the client is subscribed on (used by the subscription filter). */
    sessionId: string;
    /** Resolver label echoed in the message envelope (e.g. 'RunAIAgentResolver'). */
    resolver: string;
    /** Pulse cadence in ms. Defaults to {@link DEFAULT_PULSE_INTERVAL_MS}. */
    intervalMs?: number;
    /**
     * Optional cheap status reader invoked on each tick. Should read from an
     * in-memory ref, not the database. Errors are swallowed so a transient read
     * never kills the pulse loop.
     */
    readStatus?: () => PulseStatus | undefined;
}

/**
 * Publishes a periodic liveness pulse on {@link PUSH_STATUS_UPDATES_TOPIC} while a
 * fire-and-forget background operation runs. Each pulse resets the client's idle
 * timer, so a long-but-active operation never spuriously times out. The pulse
 * stops when the caller invokes `stop()` (typically in the background promise's
 * `finally` block).
 *
 * The envelope matches the resolvers' existing push-status messages
 * (`{ message: JSON.stringify({ resolver, type, status, data }), sessionId }`),
 * so the client receives it through the same subscription with no special parsing.
 */
export function startLivenessPulse(options: LivenessPulseOptions): LivenessPulseHandle {
    const { pubSub, sessionId, resolver, readStatus } = options;
    const intervalMs = options.intervalMs ?? DEFAULT_PULSE_INTERVAL_MS;

    const timer = setInterval(() => {
        let data: PulseStatus | undefined;
        try {
            data = readStatus?.();
        } catch (e) {
            // A status read failure must not break the liveness loop.
            LogError(`[LivenessPulse:${resolver}] readStatus failed: ${(e as Error).message}`);
        }

        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver,
                type: HEARTBEAT_MESSAGE_TYPE,
                status: 'ok',
                data: data ?? {},
            }),
            sessionId,
        });
    }, intervalMs);

    return {
        stop: () => clearInterval(timer),
    };
}
