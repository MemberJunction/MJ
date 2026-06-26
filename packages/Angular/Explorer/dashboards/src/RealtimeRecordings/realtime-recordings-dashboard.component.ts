import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { MJConversationDetailEntity, ResourceData } from '@memberjunction/core-entities';
import { LoadRealtimeRecordingAudioUrl } from '@memberjunction/ng-conversations';

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
 * signed audio URL, then hands both to {@link RealtimeEvidencePlaybackComponent} in the right pane for
 * synchronized audio + transcript playback.
 *
 * Data sources:
 *  - List: `RunView('MJ: AI Agent Sessions', RecordingFileID IS NOT NULL)` — `simple` rows.
 *  - Turns: `RunView('MJ: Conversation Details', AgentSessionID = <id>)` — `entity_object` rows.
 *  - Audio: `MJFile(ID: RecordingFileID) { DownloadUrl }` GraphQL → signed URL.
 */
@RegisterClass(BaseResourceComponent, 'RealtimeRecordingsDashboard')
@Component({
  standalone: false,
  selector: 'mj-realtime-recordings-dashboard',
  templateUrl: './realtime-recordings-dashboard.component.html',
  styleUrls: ['./realtime-recordings-dashboard.component.css']
})
export class RealtimeRecordingsDashboardComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  /** All recorded sessions (master list), newest first. */
  public Sessions: RecordedSession[] = [];
  /** The session currently selected for playback, or null. */
  public SelectedSession: RecordedSession | null = null;
  /** Transcript turns for the selected session (passed to the playback component). */
  public SelectedTurns: MJConversationDetailEntity[] = [];
  /** The resolved signed audio URL for the selected session, or null. */
  public SelectedAudioUrl: string | null = null;

  /** True while the master list is loading. */
  public IsLoading = true;
  /** True while a selected session's turns + audio URL are loading. */
  public IsDetailLoading = false;
  /** Master-list load error, shown in the body when set. */
  public ErrorMessage: string | null = null;
  /** Detail-pane (turns / audio) error, shown in the right pane when set. */
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

  override ngOnDestroy(): void {
    if (this.SelectedAudioUrl) {
      URL.revokeObjectURL(this.SelectedAudioUrl);
    }
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
      this.cdr.detectChanges();
    }
  }

  /** Selects a session and loads its transcript + signed audio URL into the playback pane. */
  public async SelectSession(session: RecordedSession): Promise<void> {
    if (this.SelectedSession?.ID === session.ID) {
      return;
    }
    this.SelectedSession = session;
    this.SelectedTurns = [];
    if (this.SelectedAudioUrl) {
      URL.revokeObjectURL(this.SelectedAudioUrl); // release the prior selection's blob
    }
    this.SelectedAudioUrl = null;
    this.DetailErrorMessage = null;
    this.IsDetailLoading = true;
    this.cdr.detectChanges();

    try {
      const [turns, audioUrl] = await Promise.all([
        this.loadTurns(session.ID),
        LoadRealtimeRecordingAudioUrl(this.ProviderToUse, session.ID)
      ]);
      // Guard against a newer selection having superseded this load.
      if (this.SelectedSession?.ID !== session.ID) {
        return;
      }
      this.SelectedTurns = turns;
      this.SelectedAudioUrl = audioUrl;
      this.maybeBackfillDuration(session, turns);
    } catch (err) {
      if (this.SelectedSession?.ID === session.ID) {
        this.DetailErrorMessage = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (this.SelectedSession?.ID === session.ID) {
        this.IsDetailLoading = false;
      }
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
