/**
 * Config contract for the two background sweeps an idle MJAPI runs against its database: the AI
 * Agent Session janitor (`agentSessions.janitor`) and the agent-run watchdog (`agentRunWatchdog`).
 *
 * Pins three things: the shipped defaults are exactly the values MJAPI always ran with (so existing
 * deployments see no change), each sweep can be turned off the documented way, and the env-var
 * readers that feed `DEFAULT_SERVER_CONFIG` reject typos instead of silently running a default or
 * a zero-delay timer.
 */
import { describe, it, expect } from 'vitest';
import {
    AgentRunWatchdogDefaultsFromEnv,
    AgentRunWatchdogSchema,
    AgentSessionsDefaultsFromEnv,
    AgentSessionsSchema,
    ConversationDetailReconcilerDefaultsFromEnv,
    ConversationDetailReconcilerSchema,
    EnabledFromEnv,
    IntervalMsFromEnv,
} from '../backgroundSweepConfigUnits.js';

describe('agentSessions.janitor schema', () => {
    it('defaults to what MJAPI has always run: janitor on every 60s (15-minute idle close), bridge reconcile on every 10 min', () => {
        expect(AgentSessionsSchema.parse({})).toEqual({
            janitor: { enabled: true, sweepIntervalMs: 60_000, closeThresholdMinutes: 15 },
            bridgeReconciler: { enabled: true, sweepIntervalMs: 600_000 },
            handoffOfferExpiry: { enabled: true, sweepIntervalMs: 15_000 },
        });
    });

    it('accepts enabled: false and a longer interval', () => {
        const parsed = AgentSessionsSchema.parse({ janitor: { enabled: false, sweepIntervalMs: 3_600_000 }, bridgeReconciler: { enabled: false } });
        expect(parsed.janitor).toEqual({ enabled: false, sweepIntervalMs: 3_600_000, closeThresholdMinutes: 15 });
        expect(parsed.bridgeReconciler).toEqual({ enabled: false, sweepIntervalMs: 600_000 });
    });

    it('rejects a zero or negative interval (turn the tick off with enabled: false instead)', () => {
        expect(AgentSessionsSchema.safeParse({ janitor: { sweepIntervalMs: 0 } }).success).toBe(false);
        expect(AgentSessionsSchema.safeParse({ janitor: { closeThresholdMinutes: -1 } }).success).toBe(false);
        expect(AgentSessionsSchema.safeParse({ bridgeReconciler: { sweepIntervalMs: 0 } }).success).toBe(false);
    });
});

describe('conversationDetailReconciler schema', () => {
    it('defaults to what MJAPI has always run: on, every 5 minutes', () => {
        expect(ConversationDetailReconcilerSchema.parse({})).toEqual({ enabled: true, sweepIntervalMs: 300_000 });
    });

    it('accepts enabled: false and rejects a zero interval', () => {
        expect(ConversationDetailReconcilerSchema.parse({ enabled: false }).enabled).toBe(false);
        expect(ConversationDetailReconcilerSchema.safeParse({ sweepIntervalMs: 0 }).success).toBe(false);
    });
});

describe('DEFAULT_SERVER_CONFIG blocks from the environment', () => {
    it('an empty environment gives exactly the shipped defaults', () => {
        expect(AgentSessionsDefaultsFromEnv({})).toEqual(AgentSessionsSchema.parse({}));
        expect(ConversationDetailReconcilerDefaultsFromEnv({})).toEqual(ConversationDetailReconcilerSchema.parse({}));
        expect(AgentRunWatchdogDefaultsFromEnv({})).toEqual(AgentRunWatchdogSchema.parse({}));
    });

    it('reads every documented variable', () => {
        const env = {
            MJ_SESSION_JANITOR_ENABLED: 'false',
            MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS: '120000',
            MJ_BRIDGE_RECONCILER_ENABLED: 'off',
            MJ_BRIDGE_RECONCILER_SWEEP_INTERVAL_MS: '1200000',
            MJ_CONVERSATION_DETAIL_RECONCILER_ENABLED: '0',
            MJ_CONVERSATION_DETAIL_RECONCILER_SWEEP_INTERVAL_MS: '900000',
            MJ_HANDOFF_OFFER_EXPIRY_ENABLED: 'no',
            MJ_HANDOFF_OFFER_EXPIRY_SWEEP_INTERVAL_MS: '60000',
            MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS: '0',
        };
        expect(AgentSessionsDefaultsFromEnv(env)).toEqual({
            janitor: { enabled: false, sweepIntervalMs: 120_000, closeThresholdMinutes: 15 },
            bridgeReconciler: { enabled: false, sweepIntervalMs: 1_200_000 },
            handoffOfferExpiry: { enabled: false, sweepIntervalMs: 60_000 },
        });
        expect(ConversationDetailReconcilerDefaultsFromEnv(env)).toEqual({ enabled: false, sweepIntervalMs: 900_000 });
        expect(AgentRunWatchdogDefaultsFromEnv(env).sweepIntervalMs).toBe(0);
    });

    it('a bad value fails, naming the variable', () => {
        expect(() => AgentSessionsDefaultsFromEnv({ MJ_BRIDGE_RECONCILER_ENABLED: 'nope' }))
            .toThrow('Invalid MJ_BRIDGE_RECONCILER_ENABLED "nope". Expected true or false.');
        expect(() => ConversationDetailReconcilerDefaultsFromEnv({ MJ_CONVERSATION_DETAIL_RECONCILER_SWEEP_INTERVAL_MS: '0' }))
            .toThrow(/Invalid MJ_CONVERSATION_DETAIL_RECONCILER_SWEEP_INTERVAL_MS "0"/);
    });
});

describe('agentRunWatchdog schema', () => {
    it('defaults to the watchdog MJAPI has always run: 5-min sweep, 30s heartbeat, 5-min stale threshold', () => {
        expect(AgentRunWatchdogSchema.parse({})).toEqual({
            sweepIntervalMs: 300_000,
            heartbeatIntervalMs: 30_000,
            staleThresholdMinutes: 5,
        });
    });

    it('accepts sweepIntervalMs: 0 (startup sweep only)', () => {
        expect(AgentRunWatchdogSchema.parse({ sweepIntervalMs: 0 }).sweepIntervalMs).toBe(0);
    });

    it('rejects a zero heartbeat (other instances would force-fail this one\'s runs) and negative values', () => {
        expect(AgentRunWatchdogSchema.safeParse({ heartbeatIntervalMs: 0 }).success).toBe(false);
        expect(AgentRunWatchdogSchema.safeParse({ staleThresholdMinutes: 0 }).success).toBe(false);
        expect(AgentRunWatchdogSchema.safeParse({ sweepIntervalMs: -1 }).success).toBe(false);
    });
});

describe('EnabledFromEnv', () => {
    it('returns the fallback when the variable is unset or blank', () => {
        expect(EnabledFromEnv('X', undefined, true)).toBe(true);
        expect(EnabledFromEnv('X', null, false)).toBe(false);
        expect(EnabledFromEnv('X', '  ', true)).toBe(true);
    });

    it.each(['false', 'FALSE', '0', 'no', 'off', 'n', 'f'])('%j turns the switch off', value => {
        expect(EnabledFromEnv('X', value, true)).toBe(false);
    });

    it.each(['true', '1', 'yes', 'on', 'Y', 't'])('%j turns it on', value => {
        expect(EnabledFromEnv('X', value, false)).toBe(true);
    });

    it('fails fast on anything else, naming the variable (a typo must not silently turn a sweep off)', () => {
        expect(() => EnabledFromEnv('MJ_SESSION_JANITOR_ENABLED', 'flase', true))
            .toThrow('Invalid MJ_SESSION_JANITOR_ENABLED "flase". Expected true or false.');
    });
});

describe('IntervalMsFromEnv', () => {
    it('returns the fallback when the variable is unset or blank', () => {
        expect(IntervalMsFromEnv('X', undefined, 60_000, false)).toBe(60_000);
        expect(IntervalMsFromEnv('X', '', 60_000, false)).toBe(60_000);
    });

    it('reads a number of milliseconds', () => {
        expect(IntervalMsFromEnv('X', ' 3600000 ', 60_000, false)).toBe(3_600_000);
    });

    it('accepts 0 only where 0 means off', () => {
        expect(IntervalMsFromEnv('MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS', '0', 300_000, true)).toBe(0);
        expect(() => IntervalMsFromEnv('MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS', '0', 60_000, false))
            .toThrow('Invalid MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS "0". Expected a number of milliseconds greater than 0.');
    });

    it('fails fast on a typo, naming the variable', () => {
        expect(() => IntervalMsFromEnv('MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS', '5m', 300_000, true))
            .toThrow('Invalid MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS "5m". Expected a number of milliseconds, 0 or greater.');
        expect(() => IntervalMsFromEnv('X', '-5', 60_000, true)).toThrow(/Invalid X/);
    });
});
