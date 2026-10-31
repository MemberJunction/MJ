import { z } from 'zod';

/**
 * Settings for the in-process background sweeps that keep an idle MJAPI talking to its database:
 * the AI Agent Session janitor, the realtime bridge orphan reconciler, the human-handoff offer
 * expiry sweep, the orphaned conversation detail reconciler and the agent-run watchdog. Each used to start unconditionally on a fixed
 * interval, so a serverless database (Azure SQL serverless, for one) could never auto-pause. Every
 * switch is described, with what turning it off costs, in the Serverless Database Auto-Pause guide
 * (`guides/SERVERLESS_DATABASE_AUTO_PAUSE_GUIDE.md`).
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

/** Shipped realtime bridge orphan reconciler defaults (the values MJAPI has always used). */
export const DEFAULT_BRIDGE_RECONCILER_SETTINGS = {
    enabled: true,
    sweepIntervalMs: 600_000,
} as const;

/** Shipped human-handoff offer expiry sweep defaults (the values MJAPI has always used). */
export const DEFAULT_HANDOFF_OFFER_SWEEP_SETTINGS = {
    enabled: true,
    sweepIntervalMs: 15_000,
} as const;

/** Shipped orphaned conversation detail reconciler defaults (the values MJAPI has always used). */
export const DEFAULT_CONVERSATION_DETAIL_RECONCILER_SETTINGS = {
    enabled: true,
    sweepIntervalMs: 300_000,
} as const;

/** Shipped watchdog defaults (the values MJAPI has always used). */
export const DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS = {
    sweepIntervalMs: 300_000,
    heartbeatIntervalMs: 30_000,
    staleThresholdMinutes: 5,
} as const;

/**
 * `agentSessions.janitor` (env `MJ_SESSION_JANITOR_ENABLED`, `MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS`).
 * `enabled: false` turns off the periodic tick (stale-session and max-duration close sweeps, then
 * realtime recording recovery); the one-time startup recovery and the graceful-shutdown drain still
 * run, so this instance's own orphaned sessions are closed on restart. See the Serverless Database
 * Auto-Pause guide.
 */
export const SessionJanitorSchema = z.object({
    enabled: z.boolean().optional().default(DEFAULT_SESSION_JANITOR_SETTINGS.enabled),
    sweepIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_SESSION_JANITOR_SETTINGS.sweepIntervalMs),
    closeThresholdMinutes: z.coerce.number().positive().optional().default(DEFAULT_SESSION_JANITOR_SETTINGS.closeThresholdMinutes),
});

/**
 * `agentSessions.bridgeReconciler` (env `MJ_BRIDGE_RECONCILER_ENABLED`,
 * `MJ_BRIDGE_RECONCILER_SWEEP_INTERVAL_MS`): closes the realtime bridges an earlier boot of this
 * instance left open. `enabled: false` keeps the one pass at startup and schedules no repeat. See
 * the Serverless Database Auto-Pause guide.
 */
export const BridgeReconcilerSchema = z.object({
    enabled: z.boolean().optional().default(DEFAULT_BRIDGE_RECONCILER_SETTINGS.enabled),
    sweepIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_BRIDGE_RECONCILER_SETTINGS.sweepIntervalMs),
});

/**
 * `agentSessions.handoffOfferExpiry` (env `MJ_HANDOFF_OFFER_EXPIRY_ENABLED`,
 * `MJ_HANDOFF_OFFER_EXPIRY_SWEEP_INTERVAL_MS`): marks agent-to-person handoff offers (`MJ: Interaction
 * Offers`) `Expired` once past their deadline and tells the person's browser. `enabled: false` stops
 * the periodic read; overdue offers still read as expired everywhere, but their rows stay `Pending`
 * and no expiry notice is pushed. See the Serverless Database Auto-Pause guide.
 */
export const HandoffOfferSweepSchema = z.object({
    enabled: z.boolean().optional().default(DEFAULT_HANDOFF_OFFER_SWEEP_SETTINGS.enabled),
    sweepIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_HANDOFF_OFFER_SWEEP_SETTINGS.sweepIntervalMs),
});

/** `agentSessions`: settings for AI Agent Sessions (realtime/voice and other long-lived agent sessions). */
export const AgentSessionsSchema = z.object({
    janitor: SessionJanitorSchema.optional().default({}),
    bridgeReconciler: BridgeReconcilerSchema.optional().default({}),
    handoffOfferExpiry: HandoffOfferSweepSchema.optional().default({}),
});

/**
 * `conversationDetailReconciler` (env `MJ_CONVERSATION_DETAIL_RECONCILER_ENABLED`,
 * `MJ_CONVERSATION_DETAIL_RECONCILER_SWEEP_INTERVAL_MS`): closes conversation details a run that
 * already ended left `In-Progress`. `enabled: false` keeps the one pass at startup and schedules no
 * repeat. See the Serverless Database Auto-Pause guide.
 */
export const ConversationDetailReconcilerSchema = z.object({
    enabled: z.boolean().optional().default(DEFAULT_CONVERSATION_DETAIL_RECONCILER_SETTINGS.enabled),
    sweepIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_CONVERSATION_DETAIL_RECONCILER_SETTINGS.sweepIntervalMs),
});

/**
 * `agentRunWatchdog` (env `MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS`). The heartbeat runs only while
 * this process has an agent run in flight; once any run has been tracked, the stale-run sweep keeps
 * running every `sweepIntervalMs` so it also closes runs other, crashed instances left `Running`.
 * `sweepIntervalMs: 0` turns the periodic sweep off; the startup sweep still runs. See the
 * Serverless Database Auto-Pause guide.
 */
export const AgentRunWatchdogSchema = z.object({
    sweepIntervalMs: z.coerce.number().nonnegative().optional().default(DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.sweepIntervalMs),
    heartbeatIntervalMs: z.coerce.number().positive().optional().default(DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.heartbeatIntervalMs),
    staleThresholdMinutes: z.coerce.number().positive().optional().default(DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.staleThresholdMinutes),
});

export type SessionJanitorSettings = z.infer<typeof SessionJanitorSchema>;
export type BridgeReconcilerSettings = z.infer<typeof BridgeReconcilerSchema>;
export type HandoffOfferSweepSettings = z.infer<typeof HandoffOfferSweepSchema>;
export type AgentSessionsSettings = z.infer<typeof AgentSessionsSchema>;
export type ConversationDetailReconcilerSettings = z.infer<typeof ConversationDetailReconcilerSchema>;
export type AgentRunWatchdogSettings = z.infer<typeof AgentRunWatchdogSchema>;

const TRUE_VALUES: ReadonlySet<string> = new Set(['true', '1', 'yes', 'y', 'on', 't']);
const FALSE_VALUES: ReadonlySet<string> = new Set(['false', '0', 'no', 'n', 'off', 'f']);

/**
 * Reads an on/off switch from an env var, returning `fallback` when it is unset or blank (so an
 * empty variable exported by a deployment script cannot silently flip it). Accepts
 * `true/false`, `1/0`, `yes/no`, `y/n`, `on/off`, `t/f` in any case; throws, naming the variable,
 * on anything else, so a typo fails at startup instead of silently turning a sweep off.
 *
 * @param name The variable's name, for the error message.
 * @param rawEnvValue The variable's raw value.
 * @param fallback The value when the variable is unset or blank.
 */
export function EnabledFromEnv(name: string, rawEnvValue: string | undefined | null, fallback: boolean): boolean {
    const normalized = rawEnvValue?.trim().toLowerCase();
    if (!normalized) {
        return fallback;
    }
    if (TRUE_VALUES.has(normalized)) {
        return true;
    }
    if (FALSE_VALUES.has(normalized)) {
        return false;
    }
    throw new Error(`Invalid ${name} "${rawEnvValue}". Expected true or false.`);
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

/** The env vars each background sweep reads, keyed by what they set. */
type SweepEnv = Readonly<Record<string, string | undefined>>;

/** `enabled` + `sweepIntervalMs` for one sweep, read from `<prefix>_ENABLED` and `<prefix>_SWEEP_INTERVAL_MS`. */
function enabledSweepFromEnv(env: SweepEnv, prefix: string, defaults: { enabled: boolean; sweepIntervalMs: number }): { enabled: boolean; sweepIntervalMs: number } {
    return {
        enabled: EnabledFromEnv(`${prefix}_ENABLED`, env[`${prefix}_ENABLED`], defaults.enabled),
        sweepIntervalMs: IntervalMsFromEnv(`${prefix}_SWEEP_INTERVAL_MS`, env[`${prefix}_SWEEP_INTERVAL_MS`], defaults.sweepIntervalMs, false),
    };
}

/** The `agentSessions` block of `DEFAULT_SERVER_CONFIG`, from the environment and the shipped defaults. */
export function AgentSessionsDefaultsFromEnv(env: SweepEnv): AgentSessionsSettings {
    return {
        janitor: {
            ...enabledSweepFromEnv(env, 'MJ_SESSION_JANITOR', DEFAULT_SESSION_JANITOR_SETTINGS),
            closeThresholdMinutes: DEFAULT_SESSION_JANITOR_SETTINGS.closeThresholdMinutes,
        },
        bridgeReconciler: enabledSweepFromEnv(env, 'MJ_BRIDGE_RECONCILER', DEFAULT_BRIDGE_RECONCILER_SETTINGS),
        handoffOfferExpiry: enabledSweepFromEnv(env, 'MJ_HANDOFF_OFFER_EXPIRY', DEFAULT_HANDOFF_OFFER_SWEEP_SETTINGS),
    };
}

/** The `conversationDetailReconciler` block of `DEFAULT_SERVER_CONFIG`. */
export function ConversationDetailReconcilerDefaultsFromEnv(env: SweepEnv): ConversationDetailReconcilerSettings {
    return enabledSweepFromEnv(env, 'MJ_CONVERSATION_DETAIL_RECONCILER', DEFAULT_CONVERSATION_DETAIL_RECONCILER_SETTINGS);
}

/** The `agentRunWatchdog` block of `DEFAULT_SERVER_CONFIG`. */
export function AgentRunWatchdogDefaultsFromEnv(env: SweepEnv): AgentRunWatchdogSettings {
    return {
        sweepIntervalMs: IntervalMsFromEnv(
            'MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS',
            env.MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS,
            DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.sweepIntervalMs,
            true
        ),
        heartbeatIntervalMs: DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.heartbeatIntervalMs,
        staleThresholdMinutes: DEFAULT_AGENT_RUN_WATCHDOG_SETTINGS.staleThresholdMinutes,
    };
}
