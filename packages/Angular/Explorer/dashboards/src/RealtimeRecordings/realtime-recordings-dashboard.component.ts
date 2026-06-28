import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { MJConversationDetailEntity, ResourceData } from '@memberjunction/core-entities';
import { MediaTranscriptCue } from '@memberjunction/ng-media-player';
import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';
import {
  buildRealtimeRecordingsAgentContext,
  sessionMatchesQuery,
} from './realtime-recordings-agent-context';

/**
 * A recorded realtime session, projected from `MJ: AI Agent Sessions` for the list pane.
 * Only the fields the master list needs are kept (the detail pane loads turns on demand).
 */
interface RecordedSession {
  /** The `MJ: AI Agent Sessions` id. */
  ID: string;
  /** Denormalized agent name (view field), or a friendly fallback. */
  AgentName: string;
  /** Denormalized conversation name (view field), or null. */
  ConversationName: string | null;
  /** The `MJ: Files` id of the recording audio (always non-null here — we filter on it). */
  RecordingFileID: string;
  /** What was captured (`Audio` / `AudioVideo`). */
  RecordingMedia: string | null;
  /** Recording alignment origin (t0), used by the playback transcript sync. */
  RecordingStartedAt: Date | null;
  /** When the session row was created — the list's primary sort + date column. */
  CreatedAt: Date | null;
  /** Human-readable duration derived from t0 → last turn, or null when not derivable. */
  DurationLabel: string | null;
}


/**
 * REALTIME RECORDINGS — an Explorer resource dashboard for reviewing & replaying historical realtime
 * sessions that were recorded. The left pane lists every recorded session (agent · date · duration ·
 * conversation); selecting one loads its time-aligned transcript turns and resolves the recording's
 * builds transcript cues, then hands the recording's `RecordingFileID` + cues to
 * {@link MJStorageMediaPlayerComponent} in the right pane — the player resolves the authenticated
 * audio itself for synchronized audio + transcript playback.
 *
 * Data sources:
 *  - List: `RunView('MJ: AI Agent Sessions', RecordingFileID IS NOT NULL)` — `simple` rows.
 *  - Turns: `RunView('MJ: Conversation Details', AgentSessionID = <id>)` — `entity_object` rows.
 *  - Audio: resolved by the storage media player from `RecordingFileID` (authenticated bytes → blob).
 */
@RegisterClass(BaseResourceComponent, 'RealtimeRecordingsDashboard')
@Component({
  standalone: false,
  selector: 'mj-realtime-recordings-dashboard',
  templateUrl: './realtime-recordings-dashboard.component.html',
  styleUrls: ['./realtime-recordings-dashboard.component.css']
})
export class RealtimeRecordingsDashboardComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
  /** All recorded sessions (master list), newest first. */
  public Sessions: RecordedSession[] = [];
  /** The session currently selected for playback, or null. */
  public SelectedSession: RecordedSession | null = null;
  /** Transcript turns for the selected session (used to build the cues). */
  public SelectedTurns: MJConversationDetailEntity[] = [];
  /** Transcript cues for the selected session, built from its turns (passed to the media player). */
  public SelectedCues: MediaTranscriptCue[] = [];

  /** True while the master list is loading. */
  public IsLoading = true;
  /** True while a selected session's turns are loading. */
  public IsDetailLoading = false;
  /** Master-list load error, shown in the body when set. */
  public ErrorMessage: string | null = null;
  /** Detail-pane (turns) error, shown in the right pane when set. */
  public DetailErrorMessage: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Realtime Recordings';
  }

  override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-circle-play';
  }

  override async ngOnInit(): Promise<void> {
    super.ngOnInit();
    await this.LoadData();
    this.NotifyLoadComplete();
  }

  /**
   * After the view initializes, publish the initial agent context and register the read-only
   * playback-navigation tools the AI agent can invoke against this surface. The ongoing context
   * re-emit happens after every meaningful state change (load, select, deselect).
   */
  ngAfterViewInit(): void {
    this.publishAgentContext();
    this.registerAgentClientTools();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  /** Loads the master list of recorded sessions. */
  public async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.cdr.detectChanges();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<RecordedSessionRow>({
        EntityName: 'MJ: AI Agent Sessions',
        ExtraFilter: 'RecordingFileID IS NOT NULL',
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple'
      });

      if (!result.Success) {
        this.ErrorMessage = result.ErrorMessage || 'Failed to load recorded sessions.';
        this.Sessions = [];
        return;
      }

      this.Sessions = (result.Results ?? []).map(row => this.toRecordedSession(row));
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      this.Sessions = [];
    } finally {
      this.IsLoading = false;
      this.publishAgentContext();
      this.cdr.detectChanges();
    }
  }

  /** Selects a session and loads its transcript into the playback pane (the player resolves audio). */
  public async SelectSession(session: RecordedSession): Promise<void> {
    if (UUIDsEqual(this.SelectedSession?.ID, session.ID)) {
      return;
    }
    this.SelectedSession = session;
    this.SelectedTurns = [];
    this.SelectedCues = [];
    this.DetailErrorMessage = null;
    this.IsDetailLoading = true;
    this.publishAgentContext();
    this.cdr.detectChanges();

    try {
      const turns = await this.loadTurns(session.ID);
      // Guard against a newer selection having superseded this load.
      if (!UUIDsEqual(this.SelectedSession?.ID, session.ID)) {
        return;
      }
      this.SelectedTurns = turns;
      this.SelectedCues = this.buildCues(turns, session);
      this.maybeBackfillDuration(session, turns);
    } catch (err) {
      if (UUIDsEqual(this.SelectedSession?.ID, session.ID)) {
        this.DetailErrorMessage = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (UUIDsEqual(this.SelectedSession?.ID, session.ID)) {
        this.IsDetailLoading = false;
      }
      this.publishAgentContext();
      this.cdr.detectChanges();
    }
  }

  /** Keyboard activation for a list row (Enter / Space select it). */
  public OnRowKeydown(event: KeyboardEvent, session: RecordedSession): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void this.SelectSession(session);
    }
  }

  /** Stable `@for` track for the session list. */
  public TrackBySession(_index: number, session: RecordedSession): string {
    return session.ID;
  }

  /** A short, localized date/time label for a session row. */
  public SessionDateLabel(session: RecordedSession): string {
    if (!session.CreatedAt) {
      return '—';
    }
    return session.CreatedAt.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  /** Clears the current playback selection, returning the surface to the empty playback state. */
  public DeselectSession(): void {
    if (this.SelectedSession === null) {
      return;
    }
    this.SelectedSession = null;
    this.SelectedTurns = [];
    this.SelectedCues = [];
    this.DetailErrorMessage = null;
    this.IsDetailLoading = false;
    this.publishAgentContext();
    this.cdr.detectChanges();
  }

  // ========================================
  // AI AGENT CONTEXT & CLIENT TOOLS
  //
  // 🚨 SAFETY BOUNDARY: This is a read-only session-playback surface. Only playback-navigation
  // tools are exposed to the agent (select / deselect a recording, refresh the list, narrow the
  // list by a client-side text filter). NO tool mutates, deletes, or exports a recording, a
  // session, or its transcript.
  // ========================================

  /**
   * Publish the current Realtime Recordings state to the AI agent via NavigationService.
   * The shaping lives in the pure {@link buildRealtimeRecordingsAgentContext} helper so it stays
   * unit-testable. Called on init and after every meaningful state change (load, select, deselect).
   */
  private publishAgentContext(): void {
    const selected = this.SelectedSession;
    const context = buildRealtimeRecordingsAgentContext({
      SessionCount: this.Sessions.length,
      SelectedSession: selected
        ? {
            ID: selected.ID,
            AgentName: selected.AgentName,
            ConversationName: selected.ConversationName,
            RecordingMedia: selected.RecordingMedia,
            DurationLabel: selected.DurationLabel,
          }
        : null,
      TurnCount: this.SelectedTurns.length,
      IsDetailLoading: this.IsDetailLoading,
    });
    this.navigationService.SetAgentContext(this, context);
  }

  /**
   * Register the read-only playback-navigation tools the AI agent can invoke against this surface.
   * Each handler delegates to the same component method a user interaction would call, and returns
   * `{ Success: true, Data? }` on success or `{ Success: false, ErrorMessage }` on failure.
   * Handlers are tolerant — they never throw.
   *
   * Tools (read-only — see the SAFETY BOUNDARY comment above):
   * - SelectSession: select a recording by its session id and load its transcript for playback.
   * - DeselectSession: clear the current playback selection.
   * - RefreshSessionList: reload the master list of recorded sessions.
   * - SearchSessions: client-side filter of the loaded recordings by agent / conversation / media.
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SelectSession',
        Description: 'Select a recorded realtime session by its session ID and load its transcript for playback.',
        ParameterSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] },
        Handler: async (params: Record<string, unknown>) => this.toolSelectSession(params),
      },
      {
        Name: 'DeselectSession',
        Description: 'Clear the currently selected recording, returning playback to the empty state.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.DeselectSession();
          return { Success: true } satisfies AgentToolResult;
        },
      },
      {
        Name: 'RefreshSessionList',
        Description: 'Reload the master list of recorded realtime sessions.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.LoadData();
          return { Success: true, Data: { SessionCount: this.Sessions.length } };
        },
      },
      {
        Name: 'SearchSessions',
        Description: 'Filter the loaded recordings by a free-text query, matched against the agent name, conversation name, and captured-media type. Returns the matching sessions (read-only; does not change the selection).',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearchSessions(params),
      },
    ]);
  }

  /** Resolve a session id (case-insensitively) to a loaded recording and select it for playback. */
  private async toolSelectSession(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
    const validation = validateStringParam(params['sessionId'], 'sessionId');
    if (!validation.ok) {
      return validation.result;
    }
    const sessionId = validation.value.trim();
    if (sessionId.length === 0) {
      return { Success: false, ErrorMessage: 'A sessionId is required.' };
    }
    const session = this.Sessions.find(s => UUIDsEqual(s.ID, sessionId));
    if (!session) {
      return { Success: false, ErrorMessage: `No recorded session with id "${sessionId}" is loaded.` };
    }
    await this.SelectSession(session);
    return { Success: true, Data: { SelectedSessionId: session.ID, AgentName: session.AgentName } };
  }

  /** Client-side filter of the loaded recordings; reports the matches without changing selection. */
  private toolSearchSessions(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const validation = validateStringParam(params['query'], 'query');
    if (!validation.ok) {
      return validation.result;
    }
    const matches = this.Sessions.filter(s => sessionMatchesQuery(s, validation.value));
    return {
      Success: true,
      Data: {
        MatchCount: matches.length,
        Matches: matches.map(s => ({
          ID: s.ID,
          AgentName: s.AgentName,
          ConversationName: s.ConversationName,
          RecordingMedia: s.RecordingMedia,
          DurationLabel: s.DurationLabel,
        })),
      },
    };
  }

  // ----- helpers ----------------------------------------------------------------------------

  /** Loads the transcript turns for a session as full entity objects (for the playback component). */
  private async loadTurns(sessionId: string): Promise<MJConversationDetailEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJConversationDetailEntity>({
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `AgentSessionID='${sessionId}'`,
      OrderBy: '__mj_CreatedAt ASC',
      ResultType: 'entity_object'
    });
    if (!result.Success) {
      throw new Error(result.ErrorMessage || 'Failed to load transcript turns.');
    }
    return result.Results ?? [];
  }

  /**
   * Builds time-aligned {@link MediaTranscriptCue}s from the loaded turns, for the media player's
   * transcript panel. Skips turns with no text; derives each cue's start from `UtteranceStartMs`,
   * falling back to (turn-created − recording-start) ms, else 0. Cues sort by start ascending.
   */
  private buildCues(turns: MJConversationDetailEntity[], session: RecordedSession): MediaTranscriptCue[] {
    const startedAt = session.RecordingStartedAt;
    const cues: MediaTranscriptCue[] = [];
    turns.forEach((turn, index) => {
      const text = turn.Message?.trim() ?? '';
      if (text.length === 0) {
        return;
      }
      cues.push({
        Id: turn.ID || `turn-${index}`,
        StartMs: this.cueStartMs(turn, startedAt),
        EndMs: turn.UtteranceEndMs ?? undefined,
        SpeakerLabel: turn.Role === 'User' ? 'You' : session.AgentName,
        Text: text
      });
    });
    cues.sort((a, b) => a.StartMs - b.StartMs);
    return cues;
  }

  /** A turn's media-relative start (ms): precise offset when present, else derived from t0, else 0. */
  private cueStartMs(turn: MJConversationDetailEntity, startedAt: Date | null): number {
    if (turn.UtteranceStartMs != null) {
      return turn.UtteranceStartMs;
    }
    if (startedAt && turn.__mj_CreatedAt) {
      return Math.max(0, turn.__mj_CreatedAt.getTime() - startedAt.getTime());
    }
    return 0;
  }

  /** Projects a raw `simple` view row into the list model, deriving display fields. */
  private toRecordedSession(row: RecordedSessionRow): RecordedSession {
    const startedAt = this.toDate(row.RecordingStartedAt);
    const createdAt = this.toDate(row.__mj_CreatedAt);
    return {
      ID: row.ID,
      AgentName: row.Agent || 'Realtime Agent',
      ConversationName: row.Conversation ?? null,
      RecordingFileID: row.RecordingFileID,
      RecordingMedia: row.RecordingMedia ?? null,
      RecordingStartedAt: startedAt,
      CreatedAt: createdAt,
      DurationLabel: null
    };
  }

  /**
   * Once turns are loaded, derive a duration (t0 → last turn's end/start) and stamp it on the row
   * so the list shows it. Best-effort: skipped when we lack a recording start time or any turns.
   */
  private maybeBackfillDuration(session: RecordedSession, turns: MJConversationDetailEntity[]): void {
    if (session.DurationLabel || !session.RecordingStartedAt || turns.length === 0) {
      return;
    }
    const endMs = this.lastTurnOffsetMs(turns, session.RecordingStartedAt);
    if (endMs != null && endMs > 0) {
      session.DurationLabel = this.formatDuration(endMs);
    }
  }

  /** The end offset (ms) of the last turn relative to the recording start, or null. */
  private lastTurnOffsetMs(turns: MJConversationDetailEntity[], startedAt: Date): number | null {
    const last = turns[turns.length - 1];
    if (last.UtteranceEndMs != null) {
      return last.UtteranceEndMs;
    }
    if (last.UtteranceStartMs != null) {
      return last.UtteranceStartMs;
    }
    if (last.__mj_CreatedAt) {
      return last.__mj_CreatedAt.getTime() - startedAt.getTime();
    }
    return null;
  }

  /** Formats a ms span as `m:ss` (or `h:mm:ss` past an hour). */
  private formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /** Coerces a `simple` row's date-ish value (string | Date | null) to a Date or null. */
  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}

/**
 * The raw `simple` row shape from the `MJ: AI Agent Sessions` view — denormalized name fields plus
 * the recording columns. `simple` rows carry plain values (dates may arrive as ISO strings).
 */
interface RecordedSessionRow {
  ID: string;
  Agent: string | null;
  Conversation: string | null;
  RecordingFileID: string;
  RecordingMedia: string | null;
  RecordingStartedAt: string | Date | null;
  __mj_CreatedAt: string | Date | null;
}

/**
 * Tree-shaking guard — referenced from the feature module's public-api so the bundler can't drop the
 * `@RegisterClass`-decorated component (which is only ever instantiated dynamically via the class factory).
 */
export function LoadRealtimeRecordingsDashboard(): void {
  // intentionally empty
}
