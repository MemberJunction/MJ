import {
    IMetadataProvider,
    UserInfo,
    LogError,
    LogStatus,
    RunView,
} from '@memberjunction/core';
import {
    MJAIBridgeProviderEntity,
    MJAIAgentSessionBridgeEntity,
} from '@memberjunction/core-entities';
import { AIBridgeEngine, StartBridgeSessionParams, ActiveBridgeSession } from './ai-bridge-engine';

const SESSION_BRIDGE_ENTITY = 'MJ: AI Agent Session Bridges';

/**
 * The context the {@link ScheduledBridgeRunner} hands to the host's session factory for one due
 * bridge. The factory uses this to construct the live {@link StartBridgeSessionParams} — most
 * importantly the `IRealtimeSession` (whose construction is intentionally the host's job, never the
 * runner's, keeping the transport seam clean exactly like `AIBridgeEngine.StartBridgeSession`).
 */
export interface DueBridgeContext {
    /** The due `AIAgentSessionBridge` row to start. */
    BridgeRow: MJAIAgentSessionBridgeEntity;

    /** The resolved transport provider for the bridge (looked up from the engine cache by the runner). */
    Provider: MJAIBridgeProviderEntity;

    /** The MJ user the started session runs as. */
    ContextUser: UserInfo;

    /** The metadata provider bound to the start. */
    MetadataProvider: IMetadataProvider;
}

/**
 * The **session-construction seam** — the host-supplied factory that turns a due bridge into the
 * {@link StartBridgeSessionParams} the engine starts (notably the injected `IRealtimeSession`). This
 * is the one piece the runner cannot own: constructing the realtime model + the
 * `RealtimeSessionRunner` is the host/agent layer's responsibility (it owns the model lifecycle).
 *
 * Returning `null`/`undefined` tells the runner to skip this bridge this pass (e.g. the host can't
 * service it on this node yet) without marking it failed.
 *
 * @param ctx The due-bridge context.
 * @returns The start params, or `null`/`undefined` to skip.
 */
export type ScheduledBridgeSessionFactory = (
    ctx: DueBridgeContext,
) => Promise<StartBridgeSessionParams | null | undefined> | StartBridgeSessionParams | null | undefined;

/**
 * Configuration for {@link ScheduledBridgeRunner}.
 */
export interface ScheduledBridgeRunnerConfig {
    /** The server engine the runner triggers `StartBridgeSession` on. Defaults to {@link AIBridgeEngine.Instance}. */
    Engine?: AIBridgeEngine;

    /** The host-supplied factory that builds start params (incl. the `IRealtimeSession`) for a due bridge. */
    SessionFactory: ScheduledBridgeSessionFactory;

    /** The MJ user the runner's reads/writes + started sessions run as. */
    ContextUser: UserInfo;

    /** The request-scoped metadata provider for all entity operations. */
    MetadataProvider: IMetadataProvider;

    /** Clock seam for the due-time comparison and testability. Defaults to `Date.now`. */
    Now?: () => number;

    /** Max due bridges to start per pass (back-pressure). Defaults to 25. */
    MaxPerPass?: number;
}

/**
 * The outcome of one {@link ScheduledBridgeRunner.RunDueBridges} pass.
 */
export interface ScheduledRunResult {
    /** Due bridges examined this pass. */
    DueFound: number;

    /** Bridges successfully handed to `StartBridgeSession`. */
    Started: number;

    /** Due bridges the factory declined to service (returned null) — left `Scheduled` for a later pass. */
    Skipped: number;

    /** Due bridges whose start threw — stamped `Failed` by the engine; counted here. */
    Failed: number;

    /** Bridges skipped because their provider could not be resolved from the engine cache. */
    Unresolved: number;
}

/**
 * The **scheduled-bridge runner** — a documented host hook (mirroring the engine janitor's
 * {@link AIBridgeEngine.ReconcileOrphans}) that starts `Scheduled` bridges when their time arrives.
 *
 * Each pass it loads every `AIAgentSessionBridge` with `Status='Scheduled'` and
 * `ScheduledStartTime <= now`, resolves each one's provider, asks the host's
 * {@link ScheduledBridgeSessionFactory} to build the start params (the host constructs the
 * `IRealtimeSession` — the runner never does), and calls {@link AIBridgeEngine.StartBridgeSession}.
 *
 * Properties (per spec):
 * - **No timer.** Only {@link RunDueBridges} is exposed; the host schedules the cadence (e.g. every
 *   30s), exactly like the janitor.
 * - **Idempotent.** `StartBridgeSession` transitions the row off `Scheduled` (to `Connecting` →
 *   `Connected`, or `Failed`), so the next pass no longer sees it. A factory that declines leaves the
 *   row `Scheduled` for a later pass, never double-starting.
 * - **Clean seam.** The runner constructs no realtime session; that stays the host's job.
 * - **Tolerant.** A per-bridge failure is captured in the result and the pass continues.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §5 / §7 (Scheduled join + lifecycle).
 */
export class ScheduledBridgeRunner {
    private readonly engine: AIBridgeEngine;
    private readonly sessionFactory: ScheduledBridgeSessionFactory;
    private readonly contextUser: UserInfo;
    private readonly metadataProvider: IMetadataProvider;
    private readonly now: () => number;
    private readonly maxPerPass: number;

    constructor(config: ScheduledBridgeRunnerConfig) {
        this.engine = config.Engine ?? AIBridgeEngine.Instance;
        this.sessionFactory = config.SessionFactory;
        this.contextUser = config.ContextUser;
        this.metadataProvider = config.MetadataProvider;
        this.now = config.Now ?? (() => Date.now());
        this.maxPerPass = config.MaxPerPass ?? 25;
    }

    /**
     * Runs one pass: finds due scheduled bridges and starts each through the engine. Never throws — a
     * per-bridge failure is recorded in the returned {@link ScheduledRunResult} and the pass proceeds.
     *
     * @returns Observability counts for the pass.
     */
    public async RunDueBridges(): Promise<ScheduledRunResult> {
        const result: ScheduledRunResult = {
            DueFound: 0,
            Started: 0,
            Skipped: 0,
            Failed: 0,
            Unresolved: 0,
        };

        const due = await this.loadDueBridges();
        result.DueFound = due.length;
        for (const row of due) {
            await this.startOne(row, result);
        }

        if (result.DueFound > 0) {
            LogStatus(
                `[ScheduledBridgeRunner] Pass done: started ${result.Started}/${result.DueFound} due bridge(s) ` +
                    `(${result.Skipped} skipped, ${result.Failed} failed, ${result.Unresolved} unresolved).`,
            );
        }
        return result;
    }

    /**
     * Loads the due scheduled bridges: `Status='Scheduled'` and `ScheduledStartTime <= now`, oldest
     * first, capped at {@link ScheduledBridgeRunnerConfig.MaxPerPass}.
     *
     * @returns The due bridge rows (possibly empty).
     */
    private async loadDueBridges(): Promise<MJAIAgentSessionBridgeEntity[]> {
        const rv = RunView.FromMetadataProvider(this.metadataProvider);
        const nowIso = new Date(this.now()).toISOString();
        const result = await rv.RunView<MJAIAgentSessionBridgeEntity>(
            {
                EntityName: SESSION_BRIDGE_ENTITY,
                ExtraFilter: `Status='Scheduled' AND ScheduledStartTime <= '${nowIso}'`,
                OrderBy: 'ScheduledStartTime ASC',
                MaxRows: this.maxPerPass,
                ResultType: 'entity_object',
            },
            this.contextUser,
        );
        if (!result.Success) {
            LogError(`[ScheduledBridgeRunner] Failed to load due bridges: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    /**
     * Resolves the provider, asks the factory for start params, and starts one due bridge — capturing
     * every failure mode in the result counters.
     *
     * @param row The due bridge row.
     * @param result The running pass result to update.
     */
    private async startOne(row: MJAIAgentSessionBridgeEntity, result: ScheduledRunResult): Promise<void> {
        const provider = this.engine.Providers.find(p => p.ID === row.ProviderID);
        if (!provider) {
            result.Unresolved++;
            LogError(
                `[ScheduledBridgeRunner] No provider ${row.ProviderID} for due bridge ${row.ID}; leaving Scheduled.`,
            );
            return;
        }

        let params: StartBridgeSessionParams | null | undefined;
        try {
            params = await this.sessionFactory({
                BridgeRow: row,
                Provider: provider,
                ContextUser: this.contextUser,
                MetadataProvider: this.metadataProvider,
            });
        } catch (err) {
            result.Failed++;
            LogError(
                `[ScheduledBridgeRunner] Session factory threw for bridge ${row.ID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
            return;
        }

        if (!params) {
            result.Skipped++;
            return; // host declined to service this bridge this pass — leave it Scheduled.
        }

        await this.invokeStart(params, row, result);
    }

    /**
     * Calls {@link AIBridgeEngine.StartBridgeSession} for a due bridge, tallying success/failure. The
     * engine owns the `Scheduled → Connecting → Connected`/`Failed` transition, so the runner does not
     * mutate the row's status itself — keeping a single source of truth for the state machine.
     *
     * @param params The host-built start params.
     * @param row The due bridge row (for logging).
     * @param result The running pass result to update.
     */
    private async invokeStart(
        params: StartBridgeSessionParams,
        row: MJAIAgentSessionBridgeEntity,
        result: ScheduledRunResult,
    ): Promise<void> {
        try {
            const active: ActiveBridgeSession = await this.engine.StartBridgeSession(params);
            result.Started++;
            LogStatus(
                `[ScheduledBridgeRunner] Started scheduled bridge ${row.ID} → live session ${active.SessionBridgeID}.`,
            );
        } catch (err) {
            // StartBridgeSession already stamped the originating row Failed; the runner-created row
            // (if the factory created a fresh one) is the engine's concern. Just record + continue.
            result.Failed++;
            LogError(
                `[ScheduledBridgeRunner] StartBridgeSession failed for due bridge ${row.ID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}
