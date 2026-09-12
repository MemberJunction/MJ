/**
 * @fileoverview Host wiring for the scheduled/invite-driven meeting join loop (program M2).
 *
 * @module @memberjunction/telephony-adapters
 */

import { UserInfo, IMetadataProvider, LogStatus, LogError } from '@memberjunction/core';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import {
    CalendarWatcher,
    ScheduledBridgeRunner,
    GraphCalendarSource,
    GraphCalendarClient,
    type CalendarSourceResolver,
    type ScheduledBridgeSessionFactory,
    type StartBridgeSessionParams,
} from '@memberjunction/ai-bridge-server';
import type { TeamsMeetingsConfig } from '../types.js';
import { TeamsMeetingsService } from './TeamsMeetingsService.js';

/** The Teams bridge driver class — identities/bridges on this provider poll Graph + join via the Teams service. */
const TEAMS_PROVIDER_DRIVER = 'TeamsBridge';

/** Default cadence (ms) for the calendar sweep + due-bridge run. 60s balances freshness vs. API quota. */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** Options for {@link StartCalendarScheduler}. */
export interface CalendarSchedulerOptions {
    /** The server metadata provider all reads/writes run under. */
    Provider: IMetadataProvider;
    /** The system user the watcher + runner (and every created/started bridge) run as. */
    ContextUser: UserInfo;
    /** The Teams meetings service (shared with the ingress) — supplies the scheduled-join bind-sdk. */
    TeamsService: TeamsMeetingsService;
    /** The Teams meetings config — supplies the bot Graph access token for calendar polling. */
    TeamsConfig: TeamsMeetingsConfig;
    /** Poll cadence (ms). Defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
    PollIntervalMs?: number;
}

/** A running scheduler handle — call {@link CalendarSchedulerHandle.Stop} to clear the interval. */
export interface CalendarSchedulerHandle {
    /** Stops the periodic sweep/run loop (clears the timer). Safe to call more than once. */
    Stop(): void;
}

/**
 * Builds the {@link CalendarSourceResolver} that binds the real calendar clients per identity.
 */
export function buildCalendarSourceResolver(teamsConfig: TeamsMeetingsConfig): CalendarSourceResolver {
    return (_identity, provider) => {
        const driver = provider?.DriverClass?.trim();
        if (driver === TEAMS_PROVIDER_DRIVER && teamsConfig.botAccessToken) {
            return new GraphCalendarSource(new GraphCalendarClient({ Credentials: { AccessToken: teamsConfig.botAccessToken } }));
        }
        return null;
    };
}

/**
 * Builds the {@link ScheduledBridgeSessionFactory} that turns a due bridge into start params.
 */
export function buildScheduledSessionFactory(teamsService: TeamsMeetingsService): ScheduledBridgeSessionFactory {
    return async (ctx) => {
        const joinUrl = ctx.BridgeRow.Address?.trim();
        if (!joinUrl) {
            LogStatus(`[CalendarScheduler] bridge ${ctx.BridgeRow.ID} has no join address; skipping.`);
            return null;
        }
        if (ctx.Provider.DriverClass?.trim() !== TEAMS_PROVIDER_DRIVER) {
            LogStatus(`[CalendarScheduler] no scheduled-join wiring for provider '${ctx.Provider.Name}'; skipping bridge ${ctx.BridgeRow.ID}.`);
            return null;
        }
        const agentID = await resolveAgentID(ctx.BridgeRow.AgentSessionID, ctx.ContextUser, ctx.MetadataProvider);
        if (!agentID) {
            LogStatus(`[CalendarScheduler] could not resolve agent for session ${ctx.BridgeRow.AgentSessionID}; skipping.`);
            return null;
        }
        const params: StartBridgeSessionParams = await teamsService.BuildScheduledStartParams({
            agentID,
            joinUrl,
            agentSessionID: ctx.BridgeRow.AgentSessionID,
            contextUser: ctx.ContextUser,
            provider: ctx.MetadataProvider,
        });
        return params;
    };
}

/** Loads the `AIAgentSession` to resolve the agent the scheduled bridge belongs to. */
async function resolveAgentID(
    agentSessionID: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    const session = await provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', contextUser);
    if (!(await session.Load(agentSessionID))) {
        return null;
    }
    return session.AgentID;
}

/**
 * Starts the calendar/scheduled-bridge loop: sweeps calendars and runs due bridges once immediately,
 * then on a fixed interval.
 */
export function StartCalendarScheduler(options: CalendarSchedulerOptions): CalendarSchedulerHandle {
    const watcher = new CalendarWatcher({
        SourceResolver: buildCalendarSourceResolver(options.TeamsConfig),
        ContextUser: options.ContextUser,
        MetadataProvider: options.Provider,
    });
    const runner = new ScheduledBridgeRunner({
        SessionFactory: buildScheduledSessionFactory(options.TeamsService),
        ContextUser: options.ContextUser,
        MetadataProvider: options.Provider,
    });

    const tick = async (): Promise<void> => {
        try {
            const swept = await watcher.Sweep();
            const ran = await runner.RunDueBridges();
            if (swept.BridgesCreated > 0 || ran.Started > 0) {
                LogStatus(`[CalendarScheduler] swept ${swept.BridgesCreated} new bridge(s); started ${ran.Started} due bridge(s).`);
            }
        } catch (err) {
            LogError(`[CalendarScheduler] sweep/run pass failed (continuing): ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    void tick(); // run-once at boot
    const timer = setInterval(() => void tick(), options.PollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    timer.unref?.();
    LogStatus(`[CalendarScheduler] started (every ${(options.PollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS) / 1000}s).`);

    return {
        Stop(): void {
            clearInterval(timer);
        },
    };
}
