import {
    IMetadataProvider,
    UserInfo,
    LogError,
    LogStatus,
    RunView,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJAIBridgeProviderEntity,
    MJAIBridgeAgentIdentityEntity,
    MJAIAgentSessionBridgeEntity,
    MJAIAgentSessionEntity,
} from '@memberjunction/core-entities';
import { AIBridgeEngineBase } from '@memberjunction/ai-bridge-base';
import {
    ICalendarSource,
    NormalizedCalendarInvite,
    CalendarInviteAttendee,
} from './calendar-source';
import { ResolveProviderFromJoinUrl } from './join-url-resolver';

const SESSION_BRIDGE_ENTITY = 'MJ: AI Agent Session Bridges';
const AGENT_SESSION_ENTITY = 'MJ: AI Agent Sessions';

/**
 * How a {@link CalendarWatcher} obtains the {@link ICalendarSource} for one agent identity. The
 * resolver receives the identity row (and its provider) and returns the bound calendar source, or
 * `null`/`undefined` when no source is configured for it (that identity is then skipped this sweep).
 *
 * Production binds a `GraphCalendarSource` / `GoogleCalendarSource` keyed by the identity's provider
 * + credential; tests inject an in-memory mock. This is the seam that keeps the watcher free of any
 * concrete calendar API.
 */
export type CalendarSourceResolver = (
    identity: MJAIBridgeAgentIdentityEntity,
    provider: MJAIBridgeProviderEntity | undefined,
) => ICalendarSource | null | undefined;

/**
 * Per-identity cursor store the watcher uses to ask each source only for invites *new since last
 * sweep*. Pluggable so a host can persist cursors (survive restarts) — the default is an in-memory
 * map, which is correct for a single long-lived process and harmless (re-scan + dedupe) across
 * restarts.
 */
export interface ICalendarCursorStore {
    /** Returns the stored cursor for an identity, or `undefined` if none. */
    Get(identityID: string): string | undefined;
    /** Stores the cursor for an identity. */
    Set(identityID: string, cursor: string): void;
}

/**
 * A trivial in-memory {@link ICalendarCursorStore} (the default). Cursors live for the process
 * lifetime; on restart the watcher re-polls from scratch and the dedupe check prevents double-creating
 * bridges for invites it already scheduled.
 */
export class InMemoryCalendarCursorStore implements ICalendarCursorStore {
    private readonly cursors = new Map<string, string>();

    /** @inheritdoc */
    public Get(identityID: string): string | undefined {
        return this.cursors.get(identityID.toLowerCase());
    }

    /** @inheritdoc */
    public Set(identityID: string, cursor: string): void {
        this.cursors.set(identityID.toLowerCase(), cursor);
    }
}

/**
 * Constructor configuration for {@link CalendarWatcher}.
 */
export interface CalendarWatcherConfig {
    /** Resolves the {@link ICalendarSource} for each agent identity (the injectable calendar-API seam). */
    SourceResolver: CalendarSourceResolver;

    /** The MJ user the watcher's reads/writes run as (every created bridge is owned + audited by a user). */
    ContextUser: UserInfo;

    /** The request-scoped metadata provider for all entity operations (multi-provider safe). */
    MetadataProvider: IMetadataProvider;

    /**
     * The bridge metadata cache the watcher reads identities + providers from. Defaults to
     * {@link AIBridgeEngineBase.Instance}; injectable so tests supply a stub with no `BaseEngine` load.
     */
    Engine?: Pick<AIBridgeEngineBase, 'AgentIdentities' | 'Providers'>;

    /** The cursor store. Defaults to a fresh {@link InMemoryCalendarCursorStore}. */
    CursorStore?: ICalendarCursorStore;

    /**
     * Clock seam for "is this invite in the past?" checks and testability. Defaults to `Date.now`.
     */
    Now?: () => number;
}

/**
 * The outcome of one {@link CalendarWatcher.Sweep} — counts for observability + the host scheduler.
 */
export interface CalendarSweepResult {
    /** Active Email identities considered this sweep. */
    IdentitiesScanned: number;

    /** Identities skipped because no calendar source was resolved for them. */
    IdentitiesWithoutSource: number;

    /** Identities whose source poll threw (logged + skipped — the sweep continued). */
    IdentitiesFailed: number;

    /** Invites examined across all identities. */
    InvitesSeen: number;

    /** New `Scheduled` bridges created this sweep. */
    BridgesCreated: number;

    /** Invites skipped because a bridge already existed (idempotent dedupe). */
    Duplicates: number;

    /** Invites skipped for an unresolved/unconfigured join URL (no provider for the platform). */
    Unroutable: number;
}

/**
 * The **calendar watcher** — the headline "invite the agent like a person" join method.
 *
 * For each active agent identity of `IdentityType='Email'`, the watcher polls that identity's
 * calendar (via the injected {@link ICalendarSource}) for new invites, and for every invite where the
 * agent is an attendee it creates a **Scheduled** {@link MJAIAgentSessionBridgeEntity}
 * (`JoinMethod='Invite'`, `Status='Scheduled'`, `ScheduledStartTime=invite.StartTime`,
 * `Address=joinUrl`, `ProviderID` resolved from the join URL) plus the linked `AIAgentSession` the
 * bridge attaches to. The {@link ScheduledBridgeRunner} later starts these at their start time.
 *
 * Design properties (all per spec):
 * - **Provider-agnostic.** All calendar-API specifics live behind {@link ICalendarSource}; this class
 *   knows only the normalized {@link NormalizedCalendarInvite} shape.
 * - **Idempotent.** Before creating a bridge it checks for an existing one with the same
 *   `ExternalConnectionID` (set to the invite's `ExternalEventID`). The same invite never double-books.
 * - **Tolerant.** A failing identity or source is logged and the sweep continues to the next identity;
 *   one bad calendar never blocks the others.
 * - **No timer.** The watcher only exposes {@link Sweep}; the host schedules the polling loop (matching
 *   the engine janitor's "documented hook, not a hard timer" posture).
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §5 (Invite/Calendar join + agent identity).
 */
export class CalendarWatcher {
    private readonly sourceResolver: CalendarSourceResolver;
    private readonly contextUser: UserInfo;
    private readonly metadataProvider: IMetadataProvider;
    private readonly engine: Pick<AIBridgeEngineBase, 'AgentIdentities' | 'Providers'>;
    private readonly cursorStore: ICalendarCursorStore;
    private readonly now: () => number;

    constructor(config: CalendarWatcherConfig) {
        this.sourceResolver = config.SourceResolver;
        this.contextUser = config.ContextUser;
        this.metadataProvider = config.MetadataProvider;
        this.engine = config.Engine ?? AIBridgeEngineBase.Instance;
        this.cursorStore = config.CursorStore ?? new InMemoryCalendarCursorStore();
        this.now = config.Now ?? (() => Date.now());
    }

    /**
     * Runs one full sweep across every active `Email` agent identity. The host schedules this on its
     * own cadence (e.g. every minute). Never throws — a per-identity failure is captured in the
     * returned {@link CalendarSweepResult} and the sweep proceeds.
     *
     * @returns Observability counts for the sweep.
     */
    public async Sweep(): Promise<CalendarSweepResult> {
        const result: CalendarSweepResult = {
            IdentitiesScanned: 0,
            IdentitiesWithoutSource: 0,
            IdentitiesFailed: 0,
            InvitesSeen: 0,
            BridgesCreated: 0,
            Duplicates: 0,
            Unroutable: 0,
        };

        for (const identity of this.activeEmailIdentities()) {
            result.IdentitiesScanned++;
            await this.sweepIdentity(identity, result);
        }

        LogStatus(
            `[CalendarWatcher] Sweep done: ${result.BridgesCreated} new bridge(s) across ` +
                `${result.IdentitiesScanned} identity(ies) (${result.Duplicates} dup, ` +
                `${result.Unroutable} unroutable, ${result.IdentitiesFailed} failed).`,
        );
        return result;
    }

    /** The active `Email`-type agent identities from the cache (the only ones a calendar watcher serves). */
    private activeEmailIdentities(): MJAIBridgeAgentIdentityEntity[] {
        return this.engine.AgentIdentities.filter(
            i => i.IsActive === true && i.IdentityType === 'Email',
        );
    }

    /**
     * Sweeps a single identity: resolves its source, polls it, and processes each new invite. All
     * failures are caught here so one identity never aborts the whole sweep.
     *
     * @param identity The agent identity to sweep.
     * @param result The running sweep result to update.
     */
    private async sweepIdentity(
        identity: MJAIBridgeAgentIdentityEntity,
        result: CalendarSweepResult,
    ): Promise<void> {
        const provider = this.engine.Providers.find(p => UUIDsEqual(p.ID, identity.ProviderID));
        const source = this.sourceResolver(identity, provider);
        if (!source) {
            result.IdentitiesWithoutSource++;
            return; // no calendar bound for this identity — nothing to poll.
        }

        try {
            const cursor = this.cursorStore.Get(identity.ID);
            const poll = await source.ListUpcomingInvites(identity.IdentityValue, cursor);
            if (poll.NextCursor) {
                this.cursorStore.Set(identity.ID, poll.NextCursor);
            }
            for (const invite of poll.Invites) {
                result.InvitesSeen++;
                await this.processInvite(identity, invite, result);
            }
        } catch (err) {
            result.IdentitiesFailed++;
            LogError(
                `[CalendarWatcher] Source poll failed for identity ${identity.IdentityValue} ` +
                    `(${identity.ID}); skipping: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Processes one invite for an identity: validates attendance + join URL + start time, resolves the
     * provider, dedupes, and creates the scheduled bridge. A failure on one invite is logged and the
     * next invite is still processed.
     *
     * @param identity The agent identity the invite was polled for.
     * @param invite The normalized invite.
     * @param result The running sweep result to update.
     */
    private async processInvite(
        identity: MJAIBridgeAgentIdentityEntity,
        invite: NormalizedCalendarInvite,
        result: CalendarSweepResult,
    ): Promise<void> {
        if (!this.isAttendee(identity, invite.Attendees)) {
            return; // the agent isn't actually invited — ignore (defensive against over-broad sources).
        }
        if (!invite.JoinUrl || invite.JoinUrl.trim().length === 0) {
            return; // nothing to bridge to (not an online meeting).
        }
        if (this.isPast(invite)) {
            return; // the meeting already ended/started in the past — don't schedule a stale join.
        }

        const provider = ResolveProviderFromJoinUrl(invite.JoinUrl, this.engine.Providers);
        if (!provider) {
            result.Unroutable++;
            return; // platform unrecognised or no active provider configured for it.
        }

        try {
            if (await this.bridgeExistsForEvent(invite.ExternalEventID)) {
                result.Duplicates++;
                return; // idempotent — already scheduled this invite.
            }
            await this.createScheduledBridge(identity, invite, provider);
            result.BridgesCreated++;
            LogStatus(
                `[CalendarWatcher] Scheduled bridge for invite '${invite.Subject ?? invite.ExternalEventID}' ` +
                    `→ ${provider.Name} at ${invite.StartTime.toISOString()} (agent ${identity.AgentID}).`,
            );
        } catch (err) {
            LogError(
                `[CalendarWatcher] Failed to schedule bridge for invite ${invite.ExternalEventID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /** True when the identity's address is among the invite's attendees (case-insensitive, trim-tolerant). */
    private isAttendee(
        identity: MJAIBridgeAgentIdentityEntity,
        attendees: CalendarInviteAttendee[],
    ): boolean {
        const target = (identity.IdentityValue ?? '').trim().toLowerCase();
        if (target.length === 0) {
            return false;
        }
        return attendees.some(a => (a.Email ?? '').trim().toLowerCase() === target);
    }

    /** True when the invite's start time is at/before now (clock-injected) — a stale invite to skip. */
    private isPast(invite: NormalizedCalendarInvite): boolean {
        return invite.StartTime.getTime() <= this.now();
    }

    /**
     * Dedupe check: is there already an `AIAgentSessionBridge` for this calendar event? The watcher
     * stamps the invite's `ExternalEventID` onto `ExternalConnectionID` at creation, so a match means
     * the invite was already scheduled (this sweep or a previous one / a prior process).
     *
     * @param externalEventID The invite's platform event id.
     * @returns `true` when a bridge already exists for the event.
     */
    private async bridgeExistsForEvent(externalEventID: string): Promise<boolean> {
        const rv = RunView.FromMetadataProvider(this.metadataProvider);
        const escaped = externalEventID.replace(/'/g, "''");
        const existing = await rv.RunView<MJAIAgentSessionBridgeEntity>(
            {
                EntityName: SESSION_BRIDGE_ENTITY,
                ExtraFilter: `ExternalConnectionID='${escaped}' AND JoinMethod='Invite'`,
                ResultType: 'simple',
                MaxRows: 1,
            },
            this.contextUser,
        );
        // On a read failure, treat as "not existing" would risk a duplicate; instead fail safe by
        // reporting existence so we skip creation and log — a missed join is recoverable, a double
        // bridge is noisier. But a failed RunView usually means a transient issue; we surface it.
        if (!existing.Success) {
            LogError(`[CalendarWatcher] Dedupe check failed: ${existing.ErrorMessage}`);
            return true; // fail safe: skip creating to avoid a possible duplicate.
        }
        return existing.Results.length > 0;
    }

    /**
     * Creates the linked `AIAgentSession` and the `Scheduled` `AIAgentSessionBridge` for an invite.
     * The session is the durable record the bridge attaches to (mirroring the on-demand path); the
     * bridge row carries everything the {@link ScheduledBridgeRunner} needs to start it at its time.
     *
     * @param identity The agent identity invited.
     * @param invite The normalized invite.
     * @param provider The resolved transport provider.
     * @returns The saved bridge row.
     * @throws When the session or bridge row cannot be saved.
     */
    private async createScheduledBridge(
        identity: MJAIBridgeAgentIdentityEntity,
        invite: NormalizedCalendarInvite,
        provider: MJAIBridgeProviderEntity,
    ): Promise<MJAIAgentSessionBridgeEntity> {
        const agentSessionID = await this.createAgentSession(identity);

        const row = await this.metadataProvider.GetEntityObject<MJAIAgentSessionBridgeEntity>(
            SESSION_BRIDGE_ENTITY,
            this.contextUser,
        );
        row.NewRecord();
        row.AgentSessionID = agentSessionID;
        row.ProviderID = provider.ID;
        row.Direction = 'Inbound';
        row.JoinMethod = 'Invite';
        row.TurnMode = 'Passive';
        row.Status = 'Scheduled';
        row.ScheduledStartTime = invite.StartTime;
        row.Address = invite.JoinUrl ?? null;
        // Stamp the calendar event id as the external connection id — this is the dedupe key.
        row.ExternalConnectionID = invite.ExternalEventID;

        const saved = await row.Save();
        if (!saved) {
            throw new Error(
                `Failed to create Scheduled AIAgentSessionBridge: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return row;
    }

    /**
     * Creates the `AIAgentSession` the scheduled bridge attaches to, in the pre-active `Idle` state
     * (it is fully hydrated when the {@link ScheduledBridgeRunner} actually starts the bridge at its
     * time). Owned + audited by the watcher's context user. Returns the new session id.
     *
     * @param identity The agent identity (carries the `AgentID`).
     * @returns The new agent-session id.
     * @throws When the session row cannot be saved.
     */
    private async createAgentSession(identity: MJAIBridgeAgentIdentityEntity): Promise<string> {
        const session = await this.metadataProvider.GetEntityObject<MJAIAgentSessionEntity>(
            AGENT_SESSION_ENTITY,
            this.contextUser,
        );
        session.NewRecord();
        session.AgentID = identity.AgentID;
        session.UserID = this.contextUser.ID;
        session.Status = 'Idle'; // pre-active — the runner brings it Active when it connects the bridge.

        const saved = await session.Save();
        if (!saved) {
            throw new Error(
                `Failed to create AIAgentSession for agent ${identity.AgentID}: ` +
                    `${session.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return session.ID;
    }
}
