import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseEntity, LogError, RunView } from '@memberjunction/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import {
    MJConversationEntity,
    MJEnvironmentEntityExtended,
    ResourceData,
    UserInfoEngine,
} from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import {
    BoardGameNightPlaySessionEntity,
    BoardGameNightPlaySessionPlayerEntity,
} from 'mj_generatedentities';
import { GameNightMetadataEngine } from '@memberjunction/gamenight';

/**
 * Persisted pane sizes.
 *
 * `v1` in the key because this shape will grow (collapse flags are the obvious next addition) and a
 * future reader needs to be able to tell which shape it is holding.
 */
const LAYOUT_PREFS_KEY = 'mj.boardGameNight.layout.v1';

type BoardGameNightLayoutPrefs = {
    chatPct?: number;
};

/** One row of the leaderboard. `LiftPts` is the signal; `WinPct` alone is meaningless. */
export type LeaderboardRow = {
    Nickname: string;
    SkillLevel: string;
    Plays: number;
    Wins: number;
    WinPct: number;
    ChancePct: number;
    LiftPts: number;
    AvgPlacement: number;
};

/** Actual play time against what the box claims. `DeltaPct` > 0 means the box under-promises. */
export type PlayTimeRow = {
    Game: string;
    Sessions: number;
    AvgActualMinutes: number;
    BoxMaxMinutes: number | null;
    DeltaPct: number | null;
};

/** Games per category — the collection's shape. */
export type CategoryRow = {
    Category: string;
    Games: number;
};

/** One session, as the drill-down shows it. Built from data already loaded — no extra query. */
export type SessionRow = {
    Game: string;
    PlayedOn: string;
    Outcome: string;
    DurationMinutes: number | null;
    BoxMaxMinutes: number | null;
    LocationName: string | null;
    Players: string;
    Winners: string;
};

/**
 * Board Game Night dashboard.
 *
 * Surfaces the three questions the raw entity grids cannot answer: who is actually good (as opposed
 * to who plays the most), how badly the box lies about play time, and what the collection is made of.
 *
 * The leaderboard deliberately reports **lift over a chance baseline** rather than a bare win rate.
 * Winning 1 game in 4 at a four-player table is exactly average, and a naive win-percentage column
 * would rank a player who only plays two-handed Patchwork above a shark who plays seven-handed poker.
 * The baseline is `1 / COUNT(DISTINCT Placement)` — competing *sides*, not head count — so a six-player
 * team game of Codenames correctly scores against 2 sides (50%), not 6 (16.7%). Using head count would
 * report Codenames players as twice as good as they are.
 */
@Component({
    standalone: false,
    selector: 'mj-board-game-night-dashboard',
    templateUrl: './board-game-night-dashboard.component.html',
    styleUrls: ['./board-game-night-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'BoardGameNightDashboard')
export class BoardGameNightDashboardComponent extends BaseDashboard implements AfterViewInit {
    // `navigationService` is NOT injected here — BaseResourceComponent already provides it as a
    // protected member. Re-injecting it shadowed the base property and failed to compile.

    /** Name, not ID: a hardcoded GUID would silently break on any database this wasn't created in. */
    private static readonly AGENT_NAME = 'Game Night Scorekeeper';

    public IsLoading = false;

    // ---- Resizable layout ------------------------------------------------------------------------
    //
    // ONE splitter: chat on top, the data panels below it. The data panels keep their natural stacked
    // order and scroll as one pane — the only thing you resize is how much room the agent gets.
    //
    // The size is a percentage rather than pixels so the layout survives a window resize — a pixel
    // height that was sensible on a 27" monitor is most of the viewport on a laptop.
    //
    // Persisted through UserInfoEngine (`MJ: User Settings`), NOT localStorage: a pane size the user
    // deliberately set should follow them to their next browser and machine. See the preferences rule
    // in .claude/rules/data-access.md.

    /** Chat's share of the vertical space. Enough to be usable without burying the leaderboard. */
    public ChatPct = 38;

    /**
     * Restores saved pane sizes.
     *
     * Every value is range-checked rather than trusted: a corrupt setting that sets a pane to 0 or 140
     * would render a dashboard the user cannot fix from the UI, and the recovery is obscure (find the
     * row in User Settings). Out-of-range values silently fall back to the defaults above.
     */
    private loadLayoutPrefs(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(LAYOUT_PREFS_KEY);
            if (!raw) {
                return;
            }
            const prefs = JSON.parse(raw) as BoardGameNightLayoutPrefs;
            if (this.isUsablePct(prefs.chatPct)) this.ChatPct = prefs.chatPct;
        } catch (e) {
            // A bad preference must never stop the dashboard rendering — log and use the defaults.
            LogError(`BoardGameNightDashboard.loadLayoutPrefs: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** 10–90 keeps both panes on screen; the splitter's own minSize enforces the same floor live. */
    private isUsablePct(value: number | undefined): value is number {
        return typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 90;
    }

    /** Debounced — a drag emits continuously, and each write would otherwise be a round trip. */
    private saveLayoutPrefs(): void {
        const prefs: BoardGameNightLayoutPrefs = { chatPct: this.ChatPct };
        try {
            UserInfoEngine.Instance.SetSettingDebounced(LAYOUT_PREFS_KEY, JSON.stringify(prefs));
        } catch (e) {
            LogError(`BoardGameNightDashboard.saveLayoutPrefs: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * angular-split reports sizes as `number | '*'` because an area may be auto-sized. These splitters
     * are `unit="percent"` so only numbers arrive, but the union has to be narrowed rather than cast.
     */
    private firstSize(sizes: ReadonlyArray<number | '*'> | undefined): number | null {
        const first = sizes?.[0];
        return typeof first === 'number' ? first : null;
    }

    public OnChatSplitDragEnd(event: { sizes: ReadonlyArray<number | '*'> }): void {
        const size = this.firstSize(event?.sizes);
        if (size !== null) {
            this.ChatPct = size;
            this.saveLayoutPrefs();
            this.cdr.markForCheck();
        }
    }

    // ---- Agent chat ----
    //
    // <mj-conversation-chat-area>: MJ's real conversations widget, the same one the Chat app and the
    // Form Builder dashboard mount. Streaming, agent-run details, artifacts, markdown, and a persisted
    // conversation record — the widget owns that lifecycle; we only track what it hands back.
    public ChatConversation: MJConversationEntity | null = null;
    public ChatConversationId: string | null = null;
    public ChatIsNewConversation = true;

    /**
     * The agent this panel is locked to.
     *
     * `defaultAgentId` pins it and `showAgentPicker=false` hides the selector, so the panel is a
     * Scorekeeper surface rather than a generic chat that happens to sit on this dashboard. Resolved by
     * NAME at runtime — a literal GUID would be valid only on this database.
     */
    public ScorekeeperAgentId: string | null = null;
    public ChatError: string | null = null;

    /**
     * The chat-area requires a real UserInfo at mount time, so the template gates on this with @if to
     * avoid binding null.
     */
    public get currentUser(): UserInfo | null {
        return this.ProviderToUse?.CurrentUser ?? null;
    }

    /** Conversations are environment-scoped; the default environment is correct for an embedded panel. */
    public get ChatEnvironmentId(): string {
        return MJEnvironmentEntityExtended.DefaultEnvironmentID;
    }

    public LoadError: string | null = null;

    public Leaderboard: LeaderboardRow[] = [];
    public PlayTimes: PlayTimeRow[] = [];
    public Categories: CategoryRow[] = [];

    public TotalSessions = 0;
    public TotalGames = 0;

    /** Drill-down state for the header count. Collapsed by default so the dashboard opens compact. */
    public ShowSessions = false;
    public SessionRows: SessionRow[] = [];

    /**
     * Sort state for the drill-down.
     *
     * Defaults to newest-played-first, which is what anyone opening a session log wants to see.
     */
    public SessionSortField: keyof SessionRow = 'PlayedOn';
    public SessionSortDir: 'asc' | 'desc' = 'desc';

    /**
     * The drill-down's columns, declared once.
     *
     * Driven from data rather than eight hand-written <th> blocks: the header markup, the sort binding
     * and the numeric alignment then cannot disagree with each other, which is the usual way a sortable
     * table ends up sorting the wrong column.
     */
    public readonly SessionColumns: { Field: keyof SessionRow; Label: string; Numeric?: boolean }[] = [
        { Field: 'Game', Label: 'Game' },
        { Field: 'PlayedOn', Label: 'Played' },
        { Field: 'Outcome', Label: 'Outcome' },
        { Field: 'DurationMinutes', Label: 'Mins', Numeric: true },
        { Field: 'BoxMaxMinutes', Label: 'Box', Numeric: true },
        { Field: 'LocationName', Label: 'Where' },
        { Field: 'Players', Label: 'Players' },
        { Field: 'Winners', Label: 'Winner' },
    ];

    /**
     * Which direction a column should start in when first clicked.
     *
     * Dates and durations start DESCENDING (most recent, longest first) because that is the useful end
     * of those scales; names start ASCENDING because A–Z is what "sort by game" means to a person.
     * Getting this backwards makes every first click feel wrong and require a second.
     */
    private static readonly DESC_FIRST = new Set<keyof SessionRow>([
        'PlayedOn', 'DurationMinutes', 'BoxMaxMinutes',
    ]);

    public ToggleSessions(): void {
        this.ShowSessions = !this.ShowSessions;
        this.cdr.markForCheck();
    }

    /** Click a column: same column flips direction, a new column adopts its natural starting direction. */
    public SortSessions(field: keyof SessionRow): void {
        if (this.SessionSortField === field) {
            this.SessionSortDir = this.SessionSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.SessionSortField = field;
            this.SessionSortDir = BoardGameNightDashboardComponent.DESC_FIRST.has(field) ? 'desc' : 'asc';
        }
        this.cdr.markForCheck();
    }

    /** For aria-sort and the header arrow. */
    public SortStateFor(field: keyof SessionRow): 'ascending' | 'descending' | 'none' {
        if (this.SessionSortField !== field) return 'none';
        return this.SessionSortDir === 'asc' ? 'ascending' : 'descending';
    }

    /** Free-text filter over the session log. Empty means "show everything". */
    public SessionSearch = '';

    /** Which columns the search reads. Numeric columns are included so "45" finds a 45-minute game. */
    private static readonly SEARCH_FIELDS: (keyof SessionRow)[] = [
        'Game', 'PlayedOn', 'Outcome', 'DurationMinutes', 'BoxMaxMinutes', 'LocationName', 'Players', 'Winners',
    ];

    public ClearSessionSearch(): void {
        this.SessionSearch = '';
        this.cdr.markForCheck();
    }

    /**
     * Rows surviving the search, before sorting.
     *
     * Every term must match somewhere in the row (AND, not OR), so "cait catan" narrows to sessions
     * involving both rather than widening to either — which is what a person typing two words means.
     * Matching is per-row rather than per-field: the terms may land in different columns.
     */
    private get filteredSessionRows(): SessionRow[] {
        const terms = this.SessionSearch.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
        if (terms.length === 0) {
            return this.SessionRows;
        }

        return this.SessionRows.filter((row) => {
            const haystack = BoardGameNightDashboardComponent.SEARCH_FIELDS
                .map((f) => row[f])
                .filter((v) => v !== null && v !== undefined)
                .join(' ')
                .toLowerCase();
            return terms.every((t) => haystack.includes(t));
        });
    }

    /** How many rows the search is hiding — drives the result count next to the box. */
    public get VisibleSessionCount(): number {
        return this.filteredSessionRows.length;
    }

    public get IsSessionSearchActive(): boolean {
        return this.SessionSearch.trim().length > 0;
    }

    /**
     * The rows as displayed: filtered, then sorted.
     *
     * A getter rather than sorting in place: mutating `SessionRows` would make the sort order depend on
     * how many times you had clicked, and a reload would silently reset it. This derives from the
     * untouched source every time. Filtering before sorting (rather than after) keeps the sort applied
     * to what you can actually see.
     */
    public get SortedSessionRows(): SessionRow[] {
        const field = this.SessionSortField;
        const dir = this.SessionSortDir === 'asc' ? 1 : -1;

        return [...this.filteredSessionRows].sort((a, b) => {
            const av = a[field];
            const bv = b[field];

            // Nulls always sort last regardless of direction — a missing duration is not "shortest",
            // and flipping it to the top on one click would be noise rather than information.
            const aNull = av === null || av === undefined || av === '—';
            const bNull = bv === null || bv === undefined || bv === '—';
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;

            if (typeof av === 'number' && typeof bv === 'number') {
                return (av - bv) * dir;
            }
            // localeCompare so accented names and mixed case order the way a reader expects.
            return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * dir;
        });
    }

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Board Game Night';
    }

    initDashboard(): void {
        // Nothing to set up beyond what loadData does; the provider is on this.ProviderToUse.
    }

    ngAfterViewInit(): void {
        // Before anything paints, so the panes never visibly jump from default to saved size.
        this.loadLayoutPrefs();
        this.publishAgentContext();
        // Fire-and-forget: the chat panel renders as soon as the agent id lands, and a failure here
        // must not block the dashboard's data from showing.
        void this.resolveScorekeeperAgentIdAsync();
    }

    /**
     * Resolves the agent id once, by name, for `defaultAgentId`.
     *
     * A failure is reported in the UI rather than swallowed: without an id the panel would silently fall
     * back to a generic agent picker, which is exactly the behaviour this pinning exists to prevent.
     */
    private async resolveScorekeeperAgentIdAsync(): Promise<void> {
        try {
            const agents = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<BaseEntity>(
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `Name = '${BoardGameNightDashboardComponent.AGENT_NAME}'`,
                    ResultType: 'simple',
                },
                this.ProviderToUse.CurrentUser,
            );
            if (!agents.Success) {
                throw new Error(agents.ErrorMessage ?? 'Could not read agents.');
            }
            const agent = agents.Results?.[0] as { ID?: string } | undefined;
            if (!agent?.ID) {
                throw new Error(
                    `Agent '${BoardGameNightDashboardComponent.AGENT_NAME}' was not found. ` +
                    `Run Demos/BoardGameNight/scripts/register-agent.cjs against this database.`,
                );
            }
            this.ScorekeeperAgentId = agent.ID;
        } catch (e) {
            this.ChatError = e instanceof Error ? e.message : String(e);
        } finally {
            this.cdr.markForCheck();
        }
    }

    /** The widget owns the conversation lifecycle; we only track what it hands back. */
    public OnChatConversationCreated(conversation: MJConversationEntity): void {
        this.ChatConversation = conversation;
        this.ChatConversationId = conversation?.ID ?? null;
        this.ChatIsNewConversation = false;
        this.cdr.markForCheck();
    }

    /**
     * Tells the AI agent what this surface is showing and what it can do here.
     *
     * Without this the agent can see the underlying entities but is blind to the *derived* view — it
     * would have no idea that "who is actually good" has already been computed with a chance baseline,
     * and would likely re-derive it (probably wrongly, by head count rather than sides).
     *
     * Re-published after every load so the agent never reads a stale snapshot.
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            Surface: 'Board Game Night dashboard',
            TotalSessions: this.TotalSessions,
            TotalGames: this.TotalGames,
            // Small enough to send whole; these are the numbers a question would be asked about.
            Leaderboard: this.Leaderboard.map((r) => ({
                Player: r.Nickname,
                Skill: r.SkillLevel,
                Plays: r.Plays,
                Wins: r.Wins,
                WinPct: Math.round(r.WinPct * 10) / 10,
                ChancePct: Math.round(r.ChancePct * 10) / 10,
                LiftPts: Math.round(r.LiftPts * 10) / 10,
            })),
            BoxTimeAccuracy: this.PlayTimes.slice(0, 10).map((r) => ({
                Game: r.Game,
                AvgActualMinutes: Math.round(r.AvgActualMinutes),
                BoxMaxMinutes: r.BoxMaxMinutes,
                OverUnderPct: r.DeltaPct === null ? null : Math.round(r.DeltaPct),
            })),
            CategoryMix: this.Categories.map((c) => ({ Category: c.Category, Games: c.Games })),
        });

        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshBoardGameNightDashboard',
                Description:
                    'Reload the Board Game Night dashboard from the database. Use after play sessions ' +
                    'have been added or edited so the leaderboard reflects them.',
                ParameterSchema: { type: 'object', properties: {}, required: [] },
                Handler: async () => {
                    await this.loadData();
                    this.publishAgentContext();
                    return { Success: true, TotalSessions: this.TotalSessions };
                },
            },
        ]);
    }

    public async loadData(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();

        try {
            // The catalog comes from the engine's cache (idempotent, so this is free after first load);
            // sessions and participations are the growing fact table and stay on RunView.
            await GameNightMetadataEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            // One round trip for both reads. Typed as BaseEntity because RunViews takes a single
            // generic; each result is narrowed to its concrete entity below.
            const [sessionsResult, participantsResult] = await rv.RunViews<BaseEntity>([
                { EntityName: 'Play Sessions', ResultType: 'entity_object' },
                { EntityName: 'Play Session Players', ResultType: 'entity_object' },
            ], this.ProviderToUse.CurrentUser);

            // RunView reports failure in the result rather than throwing, so an unchecked call would
            // render an empty dashboard that looks like "no data" instead of "the query broke".
            if (!sessionsResult.Success) {
                throw new Error(`Could not load play sessions: ${sessionsResult.ErrorMessage}`);
            }
            if (!participantsResult.Success) {
                throw new Error(`Could not load participations: ${participantsResult.ErrorMessage}`);
            }

            const sessions = (sessionsResult.Results ?? []) as BoardGameNightPlaySessionEntity[];
            const participants = (participantsResult.Results ?? []) as BoardGameNightPlaySessionPlayerEntity[];

            this.TotalSessions = sessions.length;
            this.TotalGames = GameNightMetadataEngine.Instance.Games.length;

            this.Leaderboard = this.buildLeaderboard(sessions, participants);
            this.PlayTimes = this.buildPlayTimes(sessions);
            this.Categories = this.buildCategories();
            this.SessionRows = this.buildSessions(sessions, participants);
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
            // Keep the agent's view of this surface in step with what the user is looking at.
            this.publishAgentContext();
        }
        // BaseDashboard calls NotifyLoadComplete() after loadData().
    }

    // ---- Derivations -----------------------------------------------------------------------------

    /**
     * Competitive rows only: `Outcome = 'Completed'` with a recorded `Placement`.
     *
     * Cooperative sessions are excluded because every participant shares one `IsWinner`, so they
     * measure the group rather than the player. The abandoned session is excluded because `Placement`
     * is null — there is no result to score.
     */
    private buildLeaderboard(
        sessions: BoardGameNightPlaySessionEntity[],
        participants: BoardGameNightPlaySessionPlayerEntity[],
    ): LeaderboardRow[] {
        const competitiveSessionIDs = new Set(
            sessions.filter((s) => s.Outcome === 'Completed').map((s) => s.ID.toLowerCase()),
        );

        const rows = participants.filter(
            (p) => competitiveSessionIDs.has(p.PlaySessionID.toLowerCase()) && p.Placement !== null,
        );

        // Competing sides per session = distinct placements. Ties share a placement, which is exactly
        // how a team game reports itself.
        const sidesBySession = new Map<string, Set<number>>();
        for (const p of rows) {
            const key = p.PlaySessionID.toLowerCase();
            const set = sidesBySession.get(key) ?? new Set<number>();
            set.add(p.Placement as number);
            sidesBySession.set(key, set);
        }

        type Acc = { plays: number; wins: number; chanceSum: number; placementSum: number };
        const byPlayer = new Map<string, Acc>();
        for (const p of rows) {
            const sides = sidesBySession.get(p.PlaySessionID.toLowerCase())?.size ?? 0;
            if (sides < 1) {
                continue;
            }
            const key = p.PlayerID.toLowerCase();
            const acc = byPlayer.get(key) ?? { plays: 0, wins: 0, chanceSum: 0, placementSum: 0 };
            acc.plays += 1;
            acc.wins += p.IsWinner ? 1 : 0;
            acc.chanceSum += 1 / sides;
            acc.placementSum += p.Placement as number;
            byPlayer.set(key, acc);
        }

        const result: LeaderboardRow[] = [];
        for (const [playerID, acc] of byPlayer) {
            const player = GameNightMetadataEngine.Instance.PlayerByID(playerID);
            const winPct = (100 * acc.wins) / acc.plays;
            const chancePct = (100 * acc.chanceSum) / acc.plays;
            result.push({
                Nickname: player?.Nickname ?? player?.FirstName ?? 'Unknown',
                SkillLevel: player?.SkillLevel ?? '-',
                Plays: acc.plays,
                Wins: acc.wins,
                WinPct: winPct,
                ChancePct: chancePct,
                LiftPts: winPct - chancePct,
                AvgPlacement: acc.placementSum / acc.plays,
            });
        }

        return result.sort((a, b) => b.LiftPts - a.LiftPts || b.Plays - a.Plays);
    }

    /** Average actual duration per game against the box's stated maximum. */
    private buildPlayTimes(sessions: BoardGameNightPlaySessionEntity[]): PlayTimeRow[] {
        const byGame = new Map<string, { total: number; count: number }>();
        for (const s of sessions) {
            if (s.DurationMinutes === null) {
                continue;
            }
            const key = s.GameID.toLowerCase();
            const acc = byGame.get(key) ?? { total: 0, count: 0 };
            acc.total += s.DurationMinutes;
            acc.count += 1;
            byGame.set(key, acc);
        }

        const rows: PlayTimeRow[] = [];
        for (const [gameID, acc] of byGame) {
            const game = GameNightMetadataEngine.Instance.GameByID(gameID);
            if (!game) {
                continue;
            }
            const avg = acc.total / acc.count;
            const boxMax = game.MaxPlayTimeMinutes;
            rows.push({
                Game: game.Name,
                Sessions: acc.count,
                AvgActualMinutes: avg,
                BoxMaxMinutes: boxMax,
                DeltaPct: boxMax && boxMax > 0 ? (100 * (avg - boxMax)) / boxMax : null,
            });
        }

        // Worst offenders first — the point of the panel is which boxes lie most.
        return rows.sort((a, b) => (b.DeltaPct ?? -Infinity) - (a.DeltaPct ?? -Infinity));
    }

    /**
     * Every session, newest first, for the header drill-down.
     *
     * Built from the arrays `loadData` already fetched rather than issuing another query — the drill-down
     * is a different *view* of data on screen, not new data. Player names come from the engine's cached
     * index, so resolving 120 participation rows costs no round trips.
     */
    private buildSessions(
        sessions: BoardGameNightPlaySessionEntity[],
        participants: BoardGameNightPlaySessionPlayerEntity[],
    ): SessionRow[] {
        // Group participants by session once, rather than filtering the full array per session.
        const bySession = new Map<string, BoardGameNightPlaySessionPlayerEntity[]>();
        for (const p of participants) {
            const key = p.PlaySessionID.toLowerCase();
            const list = bySession.get(key);
            if (list) {
                list.push(p);
            } else {
                bySession.set(key, [p]);
            }
        }

        const engine = GameNightMetadataEngine.Instance;
        const nameOf = (playerID: string): string => {
            const player = engine.PlayerByID(playerID);
            return player?.Nickname ?? player?.FirstName ?? 'Unknown';
        };

        return sessions
            .map((s) => {
                const rows = bySession.get(s.ID.toLowerCase()) ?? [];
                const game = engine.GameByID(s.GameID);
                const winners = rows.filter((r) => r.IsWinner).map((r) => nameOf(r.PlayerID));
                return {
                    Game: game?.Name ?? 'Unknown game',
                    // Date only: the time of day is noise in a list you scan.
                    PlayedOn: s.PlayedAt ? new Date(s.PlayedAt).toISOString().slice(0, 10) : '-',
                    Outcome: s.Outcome,
                    DurationMinutes: s.DurationMinutes,
                    BoxMaxMinutes: game?.MaxPlayTimeMinutes ?? null,
                    LocationName: s.LocationName,
                    Players: rows.map((r) => nameOf(r.PlayerID)).join(', '),
                    // Co-op sessions have every participant flagged, so say so rather than listing all of them.
                    Winners:
                        winners.length === 0
                            ? '—'
                            : winners.length === rows.length && rows.length > 1
                              ? `all ${rows.length} (shared)`
                              : winners.join(', '),
                };
            })
            .sort((a, b) => b.PlayedOn.localeCompare(a.PlayedOn));
    }

    /** Category mix, straight off the engine's grouped index. */
    private buildCategories(): CategoryRow[] {
        const counts = new Map<string, number>();
        for (const g of GameNightMetadataEngine.Instance.Games) {
            const category = (g.Category ?? '').trim();
            if (category.length === 0) {
                continue;
            }
            counts.set(category, (counts.get(category) ?? 0) + 1);
        }
        return [...counts.entries()]
            .map(([Category, Games]) => ({ Category, Games }))
            .sort((a, b) => b.Games - a.Games || a.Category.localeCompare(b.Category));
    }

    // ---- Bar geometry ----------------------------------------------------------------------------
    //
    // Widths are percentages of each panel's own maximum, so every panel is on ONE scale. Returned as
    // numbers for the template to turn into a width; no chart library is involved.

    /** Half-width diverging bar: the magnitude of a player's lift relative to the largest |lift|. */
    public LiftBarPct(row: LeaderboardRow): number {
        const max = Math.max(...this.Leaderboard.map((r) => Math.abs(r.LiftPts)), 1);
        return (Math.abs(row.LiftPts) / max) * 100;
    }

    public IsAboveChance(row: LeaderboardRow): boolean {
        return row.LiftPts >= 0;
    }

    /** Shared scale across both play-time series, so actual and estimate are visually comparable. */
    public PlayTimeBarPct(minutes: number | null): number {
        if (minutes === null) {
            return 0;
        }
        const max = Math.max(
            ...this.PlayTimes.flatMap((r) => [r.AvgActualMinutes, r.BoxMaxMinutes ?? 0]),
            1,
        );
        return (minutes / max) * 100;
    }

    public CategoryBarPct(row: CategoryRow): number {
        const max = Math.max(...this.Categories.map((r) => r.Games), 1);
        return (row.Games / max) * 100;
    }

    /** One decimal, with an explicit sign — a lift of exactly 0 reads as "at chance". */
    public FormatSigned(value: number): string {
        const rounded = Math.round(value * 10) / 10;
        return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
    }
}
