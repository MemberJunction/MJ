import { Component, ViewEncapsulation, OnDestroy, ViewChild } from '@angular/core';
import { CompositeKey, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { BuildConversationTasksFilter, TasksFullViewComponent } from '@memberjunction/ng-conversations';
/**
 * Chat Agent Activity Resource (`ChatTasksResource`) — displays live multi-agent orchestrations,
 * step dependency DAGs, and background agent activity launched from conversations.
 * Extends BaseResourceComponent to work with the resource type system and supports URL
 * deep-linking via the `taskId` query parameter.
 */
@RegisterClass(BaseResourceComponent, 'ChatTasksResource')
@Component({
  standalone: false,
  selector: 'mj-chat-tasks-resource',
  template: `
    <div class="chat-tasks-container">
      @if (currentUser) {
        <mj-tasks-full-view
          #tasksView
          [environmentId]="environmentId"
          [currentUser]="currentUser"
          [baseFilter]="AgentActivityBaseFilter"
          [BaseFilterResolver]="AgentActivityFilterResolver"
          [activeTaskId]="activeTaskId"
          (taskSelected)="onTaskSelected($event)"
          (openEntityRecord)="OnOpenEntityRecord($event)"
          style="height: 100%;">
        </mj-tasks-full-view>
      }
    </div>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-tasks-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      flex: 1;
      overflow: hidden;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ChatTasksResource extends BaseResourceComponent implements OnDestroy {
  @ViewChild('tasksView') TasksView?: TasksFullViewComponent;

  /** @deprecated Use {@link TasksView}. */
  get tasksView(): TasksFullViewComponent | undefined {
    return this.TasksView;
  }
  /** @deprecated Use {@link TasksView}. */
  set tasksView(value: TasksFullViewComponent | undefined) {
    this.TasksView = value;
  }

  public CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  public get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }
  /** @deprecated Use {@link CurrentUser}. */
  public set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  public activeTaskId?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  /**
   * Default synchronous fallback filter scoping `MJ: Tasks` to top-level tasks owned by the user
   * or originated from conversations / agents so human deliverables from other apps do not bleed in.
   */
  public get AgentActivityBaseFilter(): string {
    const userClause = this.CurrentUser?.ID
      ? `UserID = '${EscapeSQLString(this.CurrentUser.ID)}' OR `
      : '';
    return `ParentID IS NULL AND (${userClause}ConversationDetailID IS NOT NULL OR AgentID IS NOT NULL OR AgentRunID IS NOT NULL)`;
  }

  /**
   * Resolves the user-scoped conversation + agent activity filter for `TasksFullViewComponent`,
   * preserving the user's own top-level tasks (`UserID`) and any task surfaced by Chat search.
   */
  public readonly AgentActivityFilterResolver: () => Promise<string> = () =>
    this.ResolveAgentActivityFilter();

  public async ResolveAgentActivityFilter(): Promise<string> {
    if (!this.CurrentUser) {
      return this.AgentActivityBaseFilter;
    }
    const safeUserId = EscapeSQLString(this.CurrentUser.ID);
    const userConversationFilter = await BuildConversationTasksFilter(this.ProviderToUse, this.CurrentUser);
    const tasksEntity = this.ProviderToUse.EntityByName('MJ: Tasks');
    const childStepClause = tasksEntity
      ? ` OR ID IN (SELECT [ParentID] FROM [${tasksEntity.SchemaName}].[${tasksEntity.BaseView}] WHERE [ParentID] IS NOT NULL AND ([UserID] = '${safeUserId}' OR [AgentID] IS NOT NULL OR [AgentRunID] IS NOT NULL OR [ConversationDetailID] IS NOT NULL))`
      : '';
    return `(${userConversationFilter}) AND (UserID = '${safeUserId}' OR ConversationDetailID IS NOT NULL OR AgentID IS NOT NULL OR AgentRunID IS NOT NULL${childStepClause})`;
  }

  ngOnInit() {
    super.ngOnInit();
    const md = this.ProviderToUse;
    this.CurrentUser = md.CurrentUser;

    // Apply initial state from query params or tab config without clobbering URL on cold mount
    const params = this.GetQueryParams();
    const config = this.Data?.Configuration;
    const configTaskId = typeof config?.['taskId'] === 'string' ? config['taskId'] : undefined;
    const taskId = params['taskId'] || configTaskId;
    if (taskId) {
      this.activeTaskId = taskId;
      if (!params['taskId']) {
        this.UpdateQueryParams({ taskId });
      }
    }

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  ngOnDestroy() {
    super.ngOnDestroy();
  }

  protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    this.activeTaskId = params['taskId'] || undefined;
  }

  /**
   * Handle task selection from the tasks view.
   */
  OnTaskSelected(taskId: string | null): void {
    this.activeTaskId = taskId || undefined;
    this.UpdateQueryParams({ taskId: this.activeTaskId ?? null });
  }

  /** @deprecated Use {@link OnTaskSelected}. */
  onTaskSelected(taskId: string | null): void {
    return this.OnTaskSelected(taskId);
  }

  /**
   * Handle entity record navigation requests from the AI Agent Workflows & Tasks Command Center
   * (e.g. opening an AI Agent or AI Agent Run record in Explorer).
   */
  OnOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    if (!event?.entityName || !event?.recordId) {
      return;
    }
    // The entity arrives at runtime, so the key is built against its real primary key; a
    // composite key's "F1|v1||F2|v2" segment round-trips too.
    const key = CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(event.entityName), event.recordId);
    this.navigationService.OpenEntityRecord(event.entityName, key);
  }


  /**
   * Get the environment ID from configuration or use default
   */
  get EnvironmentId(): string {
    return this.Data?.Configuration?.environmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }

  /**
   * Get the display name for Chat Agent Activity
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return data?.Name || 'Agent Activity';
  }

  /**
   * Get the icon class for Chat Agent Activity
   */
  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-diagram-project';
  }
}
