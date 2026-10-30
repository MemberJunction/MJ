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
    AgentRunWatchdogSchema,
    AgentSessionsSchema,
    IntervalMsFromEnv,
    SessionJanitorEnabledDefault,
} from '../backgroundSweepConfigUnits.js';

describe('agentSessions.janitor schema', () => {
    it('defaults to the janitor MJAPI has always run: on, every 60s, closing sessions idle 15 minutes', () => {
        expect(AgentSessionsSchema.parse({})).toEqual({
            janitor: { enabled: true, sweepIntervalMs: 60_000, closeThresholdMinutes: 15 },
        });
    });

    it('accepts enabled: false and a longer interval', () => {
        const parsed = AgentSessionsSchema.parse({ janitor: { enabled: false, sweepIntervalMs: 3_600_000 } });
        expect(parsed.janitor).toEqual({ enabled: false, sweepIntervalMs: 3_600_000, closeThresholdMinutes: 15 });
    });

    it('rejects a zero or negative interval (turn the tick off with enabled: false instead)', () => {
        expect(AgentSessionsSchema.safeParse({ janitor: { sweepIntervalMs: 0 } }).success).toBe(false);
        expect(AgentSessionsSchema.safeParse({ janitor: { closeThresholdMinutes: -1 } }).success).toBe(false);
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

describe('SessionJanitorEnabledDefault (MJ_SESSION_JANITOR_ENABLED)', () => {
    it('is on when the variable is unset or blank', () => {
        expect(SessionJanitorEnabledDefault(undefined)).toBe(true);
        expect(SessionJanitorEnabledDefault(null)).toBe(true);
        expect(SessionJanitorEnabledDefault('  ')).toBe(true);
    });

    it.each(['false', 'FALSE', '0', 'no', 'off'])('MJ_SESSION_JANITOR_ENABLED=%j turns the tick off', value => {
        expect(SessionJanitorEnabledDefault(value)).toBe(false);
    });

    it.each(['true', '1', 'yes', 'on'])('MJ_SESSION_JANITOR_ENABLED=%j keeps it on', value => {
        expect(SessionJanitorEnabledDefault(value)).toBe(true);
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
