/**
 * @fileoverview Host wiring for the scheduled/invite-driven meeting join loop (program M2).
 *
 * Composes the offline-complete seams from `@memberjunction/ai-bridge-server` into a running
 * background loop, mirroring the {@link SessionJanitor} startup pattern (run once at boot, then on an
 * interval):
 *
 *   1. {@link CalendarWatcher} polls each agent identity's calendar (via the injected
 *      {@link CalendarSourceResolver}, bound here to the real {@link GraphCalendarClient} /
 *      {@link GoogleCalendarClient}) and creates a `Scheduled` `AIAgentSessionBridge` for every invite
 *      addressed to the agent.
 *   2. {@link ScheduledBridgeRunner} starts each bridge whose `ScheduledStartTime` is due, building the
 *      realtime session + the provider bind-sdk via the per-provider meeting service (Teams today).
 *
 * Calendar credentials are PRE-RESOLVED upstream (the bot's Graph access token comes from the Teams
 * meetings config — `botAccessToken`, resolved via MJ config, never inline). Google calendar polling
 * binds only when a Google auth client is supplied; otherwise those identities are skipped (the watcher
 * tolerates a `null` source per identity). Live verification requires a real tenant + the Azure app /
 * Google service account — the same access the meeting bridges need.
 *
 * @module @memberjunction/server/telephony
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
import type { TeamsMeetingsConfig } from '../config.js';
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
 * Builds the {@link CalendarSourceResolver} that binds the real calendar clients per identity. Graph
 * (Teams/Microsoft) identities bind a {@link GraphCalendarClient} authenticated with the bot's
 * pre-resolved Graph token; any identity without configured credentials resolves to `null` and is
 * skipped this sweep (the watcher tolerates that). Google binding activates when a Google auth client
 * is wired into the deployment (none configured today → Google-backed identities are skipped).
 */
export function buildCalendarSourceResolver(teamsConfig: TeamsMeetingsConfig): CalendarSourceResolver {
    return (_identity, provider) => {
        const driver = provider?.DriverClass?.trim();
        if (driver === TEAMS_PROVIDER_DRIVER && teamsConfig.botAccessToken) {
            return new GraphCalendarSource(new GraphCalendarClient({ Credentials: { AccessToken: teamsConfig.botAccessToken } }));
        }
        // Google Calendar is a deliberate, CLOSED seam — intentionally not bound here. The
        // GoogleCalendarClient is built + unit-tested, but binding it would be dead code today:
        //   1. there is no Google Meet *join* path for a detected invite to trigger (the scheduled-join
        //      factory is Teams-only), and
        //   2. Google's Meet Media API is Developer-Preview + allowlist-gated regardless (every meeting
        //      participant must be enrolled), so it isn't a shippable target.
        // To activate: define a Google auth client from config AND wire a Google Meet join. Until then
        // Google identities are skipped rather than erroring the sweep.
        return null;
    };
}

/**
 * Builds the {@link ScheduledBridgeSessionFactory} that turns a due bridge into start params. Resolves
 * the bridge's agent (via its `AIAgentSession`) and, for a Teams bridge, delegates to the shared
 * {@link TeamsMeetingsService} so the scheduled join reuses the exact provider/session/bind-sdk path as
 * an on-demand join. Returns `null` (skip) for a provider with no scheduled-join wiring yet, or when the
 * bridge has no join address.
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
 * then on a fixed interval. Mirrors {@link SessionJanitor.Start}. A sweep/run failure is logged and the
 * loop continues — a transient calendar/transport error never kills the scheduler.
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
    // Don't let the poll timer keep the process alive at shutdown (the loop is best-effort background work).
    timer.unref?.();
    LogStatus(`[CalendarScheduler] started (every ${(options.PollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS) / 1000}s).`);

    return {
        Stop(): void {
            clearInterval(timer);
        },
    };
}
