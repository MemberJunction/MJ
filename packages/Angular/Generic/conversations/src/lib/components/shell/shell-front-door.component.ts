/**
 * @fileoverview mj-shell-front-door — the composed shell's landing surface (SLICE-S3).
 *
 * D-S2 (one-way door): app open lands here — a hero composer, then EXACTLY three
 * earned sections (Needs you · Continue · Ran overnight), each rendering only
 * when it has content. Faithful to the functional mockup (`renderFrontDoor` /
 * `fdNeedsYou` / `fdCard` / `fdRan`), with real data:
 *
 *   Needs you     — pending `MJ: AI Agent Requests` + failed `MJ: AI Agent Runs`
 *                   (last 7 days) in the user's scope, over the wire (client-first).
 *   Continue      — top 4 recents from the ConversationEngine cache (instant).
 *   Ran overnight — `MJ: User Routine Runs` from the last 48h (cap 3), with the
 *                   run's conversation resolved via its AgentRunID when possible.
 *
 * The hero composer is the REAL `mj-message-input` in `emptyStateMode` (the same
 * send-to-create seam the product's empty state uses); the frame turns
 * `ComposerSubmitted` into a new conversation via the pendingMessage contract.
 *
 * EXCLUDED on record (SLICE-S3): "since you left" lines (D-S9), provisional-note
 * review items (P1.6), workflow rows in Ran overnight (D-S6 — S4's Runs section),
 * temporary chip (P1.6).
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ConversationEngine, MJConversationEntity } from '@memberjunction/core-entities';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { NotificationService } from '../../services/notification.service';
import { ShellView } from './shell-types';

/** A "Needs you" row (agent request or failed run). */
export interface FrontDoorNeedsItem {
  Kind: 'request' | 'failed-run';
  Icon: string;
  IconClass: '' | 'err' | 'warn' | 'ok';
  /** Leading text (before the bold segment). */
  Lead: string;
  /** Bold segment (agent/conversation identifier). */
  Strong: string;
  ActionLabel: string;
  ConversationId: string | null;
}

/** A "Ran overnight" row (routine run). */
export interface FrontDoorRanItem {
  RoutineName: string;
  When: string;
  Note: string;
  ConversationId: string | null;
}

/** Raw simple-row shapes from the RunViews (narrow Fields lists). */
interface AgentRequestRow {
  ID: string;
  Agent: string | null;
  RequestType: string | null;
  Status: string;
  OriginatingAgentRunID: string | null;
}
interface FailedRunRow {
  ID: string;
  ConversationID: string | null;
  Agent: string | null;
  StartedAt: Date | string;
}
interface RoutineRunRow {
  ID: string;
  Routine: string | null;
  StartedAt: Date | string;
  Status: string;
  ResultSummary: string | null;
  AgentRunID: string | null;
}

/** First-run starter prompts (mockup STARTERS; overridable by hosts later). */
export const FRONT_DOOR_STARTERS: Array<{ Text: string; Sub: string }> = [
  { Text: 'Which members are at risk of lapsing this quarter?', Sub: 'Sage reads your membership and engagement data' },
  { Text: "Summarize last week's event registrations", Sub: 'Trends, totals, and anything unusual' },
  { Text: 'Draft a renewal reminder email in our voice', Sub: 'You can save the result and reuse it' },
];

@Component({
  selector: 'mj-shell-front-door',
  // Module-declared (like the frame): mounts mj-message-input, a ConversationsModule
  // declaration — a standalone component importing its own exporting module would
  // be circular.
  standalone: false,
  templateUrl: './shell-front-door.component.html',
  styleUrls: ['./shell-front-door.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellFrontDoorComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() EnvironmentId: string | null = null;
  @Input() CurrentUser!: UserInfo;
  @Input() ShowProjects = true;

  @Output() ConversationSelected = new EventEmitter<MJConversationEntity>();
  @Output() ViewRequested = new EventEmitter<ShellView>();
  @Output() ComposerSubmitted = new EventEmitter<{ text: string; attachments: PendingAttachment[] }>();

  public NeedsYou: FrontDoorNeedsItem[] = [];
  public Ran: FrontDoorRanItem[] = [];
  public DynamicLoading = true;
  public LoadError = false;
  /** Needs-you shows 3 rows at rest; "All (N)" expands inline (Matt, S3 review). */
  public ShowAllNeeds = false;
  public readonly NeedsAtRest = 3;
  public readonly Starters = FRONT_DOOR_STARTERS;

  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  private get engine(): ConversationEngine {
    return this.Provider
      ? (ConversationEngine.GetProviderInstance(this.Provider, ConversationEngine) as ConversationEngine)
      : ConversationEngine.Instance;
  }

  async ngOnInit(): Promise<void> {
    await this.engine.Config(false, undefined, this.Provider ?? undefined);
    this.engine.Conversations$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.notificationService.notifications$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.cdr.markForCheck();
    void this.LoadDynamic();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Hero ──

  public get Greeting(): string {
    return `${ShellFrontDoorComponent.GreetingForHour(new Date().getHours())}, ${this.CurrentUser?.FirstName || this.CurrentUser?.Name || 'there'}`;
  }

  /** Pure for tests. */
  public static GreetingForHour(hour: number): string {
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  public OnComposerSubmit(event: { text: string; attachments: PendingAttachment[] }): void {
    this.ComposerSubmitted.emit(event);
  }

  public OnStarterClicked(text: string): void {
    this.ComposerSubmitted.emit({ text, attachments: [] });
  }

  public get VisibleNeedsYou(): FrontDoorNeedsItem[] {
    return this.ShowAllNeeds ? this.NeedsYou : this.NeedsYou.slice(0, this.NeedsAtRest);
  }

  public ToggleAllNeeds(): void {
    this.ShowAllNeeds = !this.ShowAllNeeds;
    this.cdr.markForCheck();
  }

  // ── First-run + Continue (engine cache, instant) ──

  private get scopedConversations(): MJConversationEntity[] {
    return this.engine.Conversations.filter(
      (c) => !c.IsArchived && (!this.EnvironmentId || c.EnvironmentID === this.EnvironmentId)
    );
  }

  public get IsFirstRun(): boolean {
    return this.scopedConversations.length === 0;
  }

  public get ContinueCards(): MJConversationEntity[] {
    return [...this.scopedConversations]
      .sort((a, b) => (b.__mj_UpdatedAt?.getTime() ?? 0) - (a.__mj_UpdatedAt?.getTime() ?? 0))
      .slice(0, 4);
  }

  public ProjectColor(c: MJConversationEntity): string | null {
    if (!c.ProjectID) return null;
    return this.engine.Projects.find((p) => p.ID === c.ProjectID)?.Color || 'var(--mj-brand-primary)';
  }

  public ProjectName(c: MJConversationEntity): string {
    if (!c.ProjectID) return 'Ungrouped';
    return this.engine.Projects.find((p) => p.ID === c.ProjectID)?.Name ?? 'Project';
  }

  public HasActivity(c: MJConversationEntity): boolean {
    return this.notificationService.getBadgeConfig(c.ID).show;
  }

  public TimeLabel(c: MJConversationEntity): string {
    return ShellFrontDoorComponent.RelativeLabel(c.__mj_UpdatedAt);
  }

  public static RelativeLabel(date: Date | string | null | undefined): string {
    const at = date ? new Date(date).getTime() : 0;
    if (!at) return '';
    const mins = Math.max(0, Math.floor((Date.now() - at) / 60000));
    if (mins < 60) return mins < 2 ? 'now' : `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}d ago` : `${Math.floor(days / 7)}w ago`;
  }

  // ── Dynamic sections (over the wire) ──

  public async LoadDynamic(): Promise<void> {
    this.DynamicLoading = true;
    this.LoadError = false;
    this.cdr.markForCheck();
    try {
      const uid = this.CurrentUser.ID;
      const nowIso = new Date().toISOString();
      const weekAgoIso = new Date(Date.now() - 7 * 86400_000).toISOString();
      const twoDaysAgoIso = new Date(Date.now() - 48 * 3600_000).toISOString();

      const rv = this.RunViewToUse;
      // Routine RUNS carry no UserID — ownership goes through the routine, so
      // the user's routines ride in the first batch and scope the runs query.
      const [requests, failedRuns, myRoutines] = await rv.RunViews([
        {
          EntityName: 'MJ: AI Agent Requests',
          Fields: ['ID', 'Agent', 'RequestType', 'Status', 'OriginatingAgentRunID'],
          ExtraFilter: `Status='Requested' AND (RequestForUserID='${uid}' OR RequestForUserID IS NULL) AND (ExpiresAt IS NULL OR ExpiresAt > '${nowIso}')`,
          OrderBy: 'RequestedAt DESC',
          MaxRows: 15,
          ResultType: 'simple',
        },
        {
          EntityName: 'MJ: AI Agent Runs',
          Fields: ['ID', 'ConversationID', 'Agent', 'StartedAt'],
          ExtraFilter: `Status='Failed' AND UserID='${uid}' AND ConversationID IS NOT NULL AND StartedAt >= '${weekAgoIso}'`,
          OrderBy: 'StartedAt DESC',
          MaxRows: 15,
          ResultType: 'simple',
        },
        {
          EntityName: 'MJ: User Routines',
          Fields: ['ID', 'Name'],
          ExtraFilter: `UserID='${uid}'`,
          ResultType: 'simple',
        },
      ]);
      if (!requests.Success || !failedRuns.Success || !myRoutines.Success) {
        const detail = [
          !requests.Success ? `AgentRequests: ${requests.ErrorMessage || 'unknown'}` : null,
          !failedRuns.Success ? `FailedRuns: ${failedRuns.ErrorMessage || 'unknown'}` : null,
          !myRoutines.Success ? `Routines: ${myRoutines.ErrorMessage || 'unknown'}` : null,
        ].filter(Boolean).join(' | ');
        throw new Error(detail || 'load failed');
      }

      const routineRows: RoutineRunRow[] = [];
      const routines = (myRoutines.Results ?? []) as Array<{ ID: string; Name: string }>;
      if (routines.length) {
        const routineIds = routines.map((r) => `'${r.ID}'`).join(',');
        const runsResult = await rv.RunView({
          EntityName: 'MJ: User Routine Runs',
          Fields: ['ID', 'RoutineID', 'StartedAt', 'Status', 'ResultSummary', 'AgentRunID'],
          ExtraFilter: `RoutineID IN (${routineIds}) AND StartedAt >= '${twoDaysAgoIso}'`,
          OrderBy: 'StartedAt DESC',
          MaxRows: 3,
          ResultType: 'simple',
        });
        if (!runsResult.Success) {
          throw new Error(`RoutineRuns: ${runsResult.ErrorMessage || 'unknown'}`);
        }
        const nameById = new Map(routines.map((r) => [r.ID.toLowerCase(), r.Name]));
        for (const row of (runsResult.Results ?? []) as Array<RoutineRunRow & { RoutineID: string }>) {
          routineRows.push({ ...row, Routine: nameById.get(row.RoutineID.toLowerCase()) ?? row.Routine ?? null });
        }
      }

      // Resolve conversations for request-originating runs + routine agent runs (one batch).
      const requestRows = (requests.Results ?? []) as AgentRequestRow[];
      const runIds = [
        ...requestRows.map((r) => r.OriginatingAgentRunID),
        ...routineRows.map((r) => r.AgentRunID),
      ].filter((id): id is string => !!id);
      let runConversations = new Map<string, string>();
      if (runIds.length) {
        const idList = [...new Set(runIds)].map((id) => `'${id}'`).join(',');
        const resolve = await rv.RunView({
          EntityName: 'MJ: AI Agent Runs',
          Fields: ['ID', 'ConversationID'],
          ExtraFilter: `ID IN (${idList})`,
          ResultType: 'simple',
        });
        if (resolve.Success) {
          runConversations = new Map(
            ((resolve.Results ?? []) as Array<{ ID: string; ConversationID: string | null }>)
              .filter((r) => r.ConversationID)
              .map((r) => [r.ID.toLowerCase(), r.ConversationID as string])
          );
        }
      }

      this.NeedsYou = ShellFrontDoorComponent.BuildNeedsYou(
        requestRows,
        (failedRuns.Results ?? []) as FailedRunRow[],
        runConversations
      );
      this.Ran = ShellFrontDoorComponent.BuildRan(routineRows, runConversations);
      this.DynamicLoading = false;
    } catch (error) {
      console.error('[ShellFrontDoor] dynamic-section load failed:', error);
      this.LoadError = true;
      this.DynamicLoading = false;
    }
    this.cdr.markForCheck();
  }

  /** Pure assembly (unit-tested): agent requests + failed runs → Needs-you rows. */
  public static BuildNeedsYou(
    requests: AgentRequestRow[],
    failedRuns: FailedRunRow[],
    runConversations: Map<string, string>
  ): FrontDoorNeedsItem[] {
    const items: FrontDoorNeedsItem[] = [];
    for (const r of requests) {
      items.push({
        Kind: 'request',
        Icon: 'fa-list-check',
        IconClass: '',
        Lead: `${r.RequestType || 'Request'} awaiting your response — `,
        Strong: r.Agent || 'Agent',
        ActionLabel: 'Review',
        ConversationId: r.OriginatingAgentRunID
          ? runConversations.get(r.OriginatingAgentRunID.toLowerCase()) ?? null
          : null,
      });
    }
    for (const f of failedRuns) {
      items.push({
        Kind: 'failed-run',
        Icon: 'fa-circle-exclamation',
        IconClass: 'err',
        Lead: 'Run failed — ',
        Strong: f.Agent || 'Agent run',
        ActionLabel: 'Open',
        ConversationId: f.ConversationID,
      });
    }
    return items;
  }

  /** Pure assembly (unit-tested): routine runs → Ran-overnight rows (cap 3). */
  public static BuildRan(
    runs: RoutineRunRow[],
    runConversations: Map<string, string>
  ): FrontDoorRanItem[] {
    return runs.slice(0, 3).map((r) => ({
      RoutineName: r.Routine || 'Routine',
      When: ShellFrontDoorComponent.RelativeLabel(r.StartedAt),
      Note: r.Status === 'Failed' ? 'failed' : r.ResultSummary || 'completed',
      ConversationId: r.AgentRunID ? runConversations.get(r.AgentRunID.toLowerCase()) ?? null : null,
    }));
  }

  // ── Navigation ──

  public OpenConversationById(conversationId: string | null, fallback: ShellView): void {
    if (conversationId) {
      const entity = this.engine.Conversations.find(
        (c) => c.ID.toLowerCase() === conversationId.toLowerCase()
      );
      if (entity) {
        this.notificationService.markConversationAsRead(entity.ID);
        this.ConversationSelected.emit(entity);
        return;
      }
    }
    this.ViewRequested.emit(fallback);
  }

  public OnCardClicked(c: MJConversationEntity): void {
    this.notificationService.markConversationAsRead(c.ID);
    this.ConversationSelected.emit(c);
  }
}
