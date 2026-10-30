import { z } from 'zod';
import { parseBooleanEnv } from '@memberjunction/config';

/**
 * Settings for the two in-process background sweeps that keep an idle MJAPI talking to its database:
 * the AI Agent Session janitor and the agent-run watchdog. Both used to start unconditionally on
 * fixed intervals, so a serverless database (Azure SQL serverless, for one) could never auto-pause.
 *
 * Like the telemetry and realtime units, the schemas and env-var readers live here rather than in
 * config.ts so they are unit-testable without config.ts's full dependency graph. The env readers
 * feed `DEFAULT_SERVER_CONFIG` (the base of the merge), so `mj.config.cjs` still wins over them.
 */

/** Shipped janitor defaults (the values MJAPI has always used). */
export const DEFAULT_SESSION_JANITOR_SETTINGS = {
    enabled: true,
    sweepIntervalMs: 60_000,
    closeThresholdMinutes: 15,
} as const;

/** Shipped watchdog defaults (the values MJAPI has always used). */
export const DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS = {
    sweepIntervalMs: 300_000,
    heartbeatIntervalMs: 30_000,
    staleThresholdMinutes: 5,
} as const;

/**
 * `agentSessions.janitor`. `enabled: false` turns off the periodic tick (stale-session and
 * max-duration close sweeps, then realtime recording recovery); the one-time startup recovery and
 * the graceful-shutdown drain still run, so this instance's own orphaned sessions are closed on restart.
 */
export const SessionJanitorSchema = z.object({
    enabled: z.boolean().optional().default(DEFAULT_SESSION_JANITOR_SETTINGS.enabled),
    sweepIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_SESSION_JANITOR_SETTINGS.sweepIntervalMs),
    closeThresholdMinutes: z.coerce.number().positive().optional().default(DEFAULT_SESSION_JANITOR_SETTINGS.closeThresholdMinutes),
});

/** `agentSessions`: settings for AI Agent Sessions (realtime/voice and other long-lived agent sessions). */
export const AgentSessionsSchema = z.object({
    janitor: SessionJanitorSchema.optional().default({}),
});

/**
 * `agentRunWatchdog`. Its timers only run while this process has an agent run in flight.
 * `sweepIntervalMs: 0` turns the periodic stale-run sweep off; the startup sweep still runs.
 */
export const AgentRunWatchdogSchema = z.object({
    sweepIntervalMs: z.coerce.number().nonnegative().optional().default(DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.sweepIntervalMs),
    heartbeatIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.heartbeatIntervalMs),
    staleThresholdMinutes: z.coerce.number().positive().optional().default(DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.staleThresholdMinutes),
});

export type SessionJanitorSettings = z.infer<typeof SessionJanitorSchema>;
export type AgentSessionsSettings = z.infer<typeof AgentSessionsSchema>;
export type AgentRunWatchdogSettings = z.infer<typeof AgentRunWatchdogSchema>;

/**
 * Resolves the shipped default for `agentSessions.janitor.enabled` from `MJ_SESSION_JANITOR_ENABLED`.
 * On by default: an unset or blank variable leaves it on (so an empty variable exported by a
 * deployment script cannot silently turn it off); anything `parseBooleanEnv` reads as false
 * (`'false'`, `'0'`, `'no'`, `'off'`) turns it off.
 */
export function SessionJanitorEnabledDefault(rawEnvValue: string | undefined | null): boolean {
    return rawEnvValue?.trim() ? parseBooleanEnv(rawEnvValue) : DEFAULT_SESSION_JANITOR_SETTINGS.enabled;
}

/**
 * Reads a millisecond interval from an env var, returning `fallback` when it is unset or blank.
 * Throws, naming the variable, on anything that is not a finite number in range, so a deployment
 * typo fails at startup instead of silently running the default (or a zero-delay timer).
 *
 * @param name The variable's name, for the error message.
 * @param rawEnvValue The variable's raw value.
 * @param fallback The value when the variable is unset or blank.
 * @param allowZero Whether `0` is accepted (it means "off" for the settings that allow it).
 */
export function IntervalMsFromEnv(name: string, rawEnvValue: string | undefined | null, fallback: number, allowZero: boolean): number {
    const trimmed = rawEnvValue?.trim();
    if (!trimmed) {
        return fallback;
    }
    const value = Number(trimmed);
    const inRange = allowZero ? value >= 0 : value > 0;
    if (!Number.isFinite(value) || !inRange) {
        const rule = allowZero ? 'a number of milliseconds, 0 or greater' : 'a number of milliseconds greater than 0';
        throw new Error(`Invalid ${name} "${rawEnvValue}". Expected ${rule}.`);
    }
    return value;
}
