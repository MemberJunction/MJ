import { Component, ViewContainerRef, ComponentRef, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import {
    BaseResourceComponent, NavigationService, BaseDashboard, DashboardConfig, RecentAccessService,
    HomeAppPinService, SafeDetectChanges, CaptureElementJpeg, BuildDashboardPinInput, DASHBOARD_PIN_RESOURCE_TYPE
} from '@memberjunction/ng-shared';
import type { HomeAppPinInput } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RealtimeSessionService, ArtifactPermissionService } from '@memberjunction/ng-conversations';
import {
    ResourceData, MJDashboardEntity, DashboardEngine, MJDashboardUserStateEntity,
    DashboardUserPermissions, UserViewEngine, QueryEngine, ArtifactMetadataEngine, MJEnvironmentEntityExtended, UserInfoEngine
} from '@memberjunction/core-entities';
import type { MJArtifactEntity, MJArtifactVersionEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { RegisterClass, MJGlobal, SafeJSONParse , UUIDsEqual, EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DefaultAgentResolver } from '@memberjunction/conversations-runtime';
import type { NavigationRequest } from '@memberjunction/ng-artifacts';
import type { PendingAttachment } from '@memberjunction/ng-composer';
import { filter, takeUntil } from 'rxjs';
import type { DataExplorerFilter } from '@memberjunction/ng-dashboards/data-explorer-dashboards.module';
import type { DashboardEditorComponent, DashboardEditorLoadError, ShareDialogResult } from '@memberjunction/ng-dashboards/core-dashboards.module';
import { ExtractPanelsFromLayout } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardConfig as DashboardLayoutConfig, DashboardNavRequestEvent, DashboardViewerComponent } from '@memberjunction/ng-dashboard-viewer';
import { BuildDashboardTabAgentContext, BuildDashboardTabAgentTools, SummarizeDashboardPanels } from './dashboard-tab-agent';
import type { DashboardPanelSummary, DashboardTabAgentHost, DashboardTabDashboard } from './dashboard-tab-agent';
import { BuildDashboardStudioTools } from './dashboard-studio-tools';
import type { DashboardStudioHost } from './dashboard-studio-tools';
import { SearchDashboardSources, SOURCE_KINDS } from './dashboard-source-search';
import type { SourceKind, SourceSearchDeps, SourceSearchResult } from './dashboard-source-search';
import {
    ParseStudioPanePrefs, PrefsFromSplitSizes, STUDIO_PANE_COPILOT_MAX_PCT, STUDIO_PANE_COPILOT_MIN_PCT, STUDIO_PANE_DEFAULTS, STUDIO_PANE_SETTING_KEY
} from './dashboard-studio-pane';
import type { StudioPanePrefs } from './dashboard-studio-pane';

/** The permissions the tab reports while its editor shows no dashboard: nothing is allowed. */
const NO_DASHBOARD_PERMISSIONS: DashboardUserPermissions = {
    DashboardID: '', CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, IsOwner: false, PermissionSource: 'none',
};

/** Why an agent's request or edit fails while the tab shows no Config dashboard. */
const NO_CONFIG_DASHBOARD = 'No Config dashboard is open in this tab.';

/** How long, in milliseconds, an agent's confirm dialog waits for the user's answer before it closes. */
const AGENT_CONFIRM_TIMEOUT_MS = 25_000;

/** Why an agent's request failed when the user gave no answer in time. */
const AGENT_CONFIRM_TIMED_OUT = `No answer within ${AGENT_CONFIRM_TIMEOUT_MS / 1000} s; the dialog was closed. Ask the user and try again.`;

/** The most artifacts the agent's source search reads. */
const SOURCE_SEARCH_MAX_ARTIFACTS = 500;

/** The most artifact IDs one filter of the latest-version lookup lists. */
const ARTIFACT_VERSION_FILTER_CHUNK = 200;

/** Why the tab refuses an agent's edit while the editor's Save runs. */
const SAVE_IN_PROGRESS = 'A save is in progress. Try again when it finishes.';

/** What an agent's Request* tool asks the user to confirm. */
type AgentConfirmKind = Parameters<DashboardStudioHost['Confirm']>[0];

/** The name and description an agent asks a save to apply. */
type AgentConfirmDetail = Parameters<DashboardStudioHost['Confirm']>[1];

/** The confirm dialog an agent's request opens: what it asks, and the texts it shows. */
interface AgentConfirmDialog {
    Kind: AgentConfirmKind;
    Title: string;
    Message: string;
    ConfirmText: string;
}

/** The request behind an open agent confirm dialog. It settles once: with the user's answer, or aborted. */
interface AgentConfirmRequest {
    answer(confirmed: boolean): void;
    abort(reason: Error): void;
}

/**
 * The Dashboards application (metadata/applications/.dashboards-application.json). The AI pane's
 * conversations belong to it, and its default agent answers in the pane.
 */
const DASHBOARDS_APPLICATION_ID = '4B439111-B492-4936-9E33-A428CB5725B4';

/** What the AI pane shows when the Dashboards application has no default agent of its own. */
const NO_DASHBOARD_ASSISTANT = 'No dashboard assistant is configured for the Dashboards app. Ask an administrator to set its default agent.';

/** What the chat area's ConversationCreated output gives: the new conversation and the first message to send in it. */
interface ChatConversationCreated {
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
}

/** An artifact as the agent's source search reads it. */
type ArtifactRow = Pick<MJArtifactEntity, 'ID' | 'Name' | 'Description' | 'Type'>;

/** An artifact version as the latest-version lookup reads it. */
type ArtifactVersionRow = Pick<MJArtifactVersionEntity, 'ArtifactID' | 'VersionNumber'>;

/**
 * Dashboard Resource Wrapper - displays a single dashboard in a tab
 * Extends BaseResourceComponent to work with the resource type system
 * Dynamically routes between code-based and config-based dashboards based on dashboard type:
 * a Config dashboard shows in the shared dashboard editor (`mj-dashboard-editor`) with the AI pane
 * beside it, and a Code dashboard or the Data Explorer shows in the tab's own container.
 */
@RegisterClass(BaseResourceComponent, 'DashboardResource')
@Component({
  standalone: false,
    selector: 'mj-dashboard-resource',
    template: `
        <div class="dashboard-resource-wrapper">
            <!-- Error State -->
            @if (errorMessage) {
                <div class="error-state">
                    <div class="error-icon">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h2 class="error-title">Unable to Load Dashboard</h2>
                    <p class="error-message">{{ errorMessage }}</p>
                    @if (errorDetails) {
                        <details class="error-details">
                            <summary>Technical Details</summary>
                            <pre>{{ errorDetails }}</pre>
                        </details>
                    }
                </div>
            }

            <!-- A Config dashboard: the shared editor, with the AI pane on its right. The editor stays in the template while the pane opens and closes. -->
            @if (ConfigDashboardId && !errorMessage) {
                <as-split direction="horizontal" class="studio-copilot-splitter" unit="percent" [gutterSize]="ChatOpen ? 6 : 0" (dragEnd)="OnCopilotSplitDragEnd($event.sizes)">
                    <as-split-area [size]="ChatOpen ? (CopilotExpanded ? 100 - CopilotMaxPct : MainSizePct) : 100" [minSize]="100 - CopilotMaxPct">
                        <mj-dashboard-editor
                            #editor
                            [Provider]="Provider"
                            [DashboardId]="ConfigDashboardId"
                            (Loaded)="OnEditorLoaded($event)"
                            (LoadFailed)="OnEditorLoadFailed($event)"
                            (EditingChange)="OnEditorEditingChange()"
                            (NameChanged)="OnEditorNameChanged($event)"
                            (ConfigChanged)="OnEditorConfigChanged()"
                            (ReloadedFromSaved)="OnEditorReloaded()"
                            (FavoriteChange)="OnEditorFavoriteChange()"
                            (NavigationRequested)="OnEditorNavigationRequested($event)">
                            <button
                                headerTools
                                type="button"
                                mjButton
                                Variant="icon"
                                Size="sm"
                                class="dashboard-tab-ai-toggle"
                                [class.is-active]="ChatOpen"
                                title="AI assistant"
                                aria-label="AI assistant"
                                [attr.aria-expanded]="ChatOpen ? 'true' : 'false'"
                                (click)="ToggleChat()">
                                <i class="fa-solid fa-robot" aria-hidden="true"></i>
                            </button>
                            <span viewActions class="dashboard-tab-view-actions">
                                <mj-dashboard-add-to-menu
                                    [IsPinned]="IsPinnedToHome"
                                    [CanShare]="CanShare"
                                    (PinToHome)="PinToHome()"
                                    (Share)="OpenShareDialog()">
                                </mj-dashboard-add-to-menu>
                                @if (CanShare) {
                                    <button
                                        type="button"
                                        mjButton
                                        Variant="icon"
                                        Size="sm"
                                        class="dashboard-tab-share"
                                        title="Share dashboard"
                                        aria-label="Share dashboard"
                                        (click)="OpenShareDialog()">
                                        <i class="fa-solid fa-share-nodes" aria-hidden="true"></i>
                                    </button>
                                }
                            </span>
                        </mj-dashboard-editor>
                    </as-split-area>
                    @if (ChatOpen) {
                        <as-split-area [size]="CopilotExpanded ? CopilotMaxPct : CopilotSizePct" [minSize]="CopilotMinPct" [maxSize]="CopilotMaxPct">
                            <aside class="dashboard-copilot" [class.expanded]="CopilotExpanded" data-testid="dashboard-copilot" aria-label="AI assistant">
                                <div class="dashboard-copilot-head">
                                    <div class="dashboard-copilot-title"><i class="fa-solid fa-robot"></i> {{ ChatAgentName ?? 'AI assistant' }}</div>
                                    <div class="dashboard-copilot-actions">
                                        <button
                                            type="button"
                                            class="dashboard-copilot-btn copilot-expand"
                                            [title]="CopilotExpanded ? 'Collapse panel' : 'Expand panel'"
                                            [attr.aria-label]="CopilotExpanded ? 'Collapse panel' : 'Expand panel'"
                                            (click)="ToggleCopilotExpanded()">
                                            <i class="fa-solid" [class.fa-up-right-and-down-left-from-center]="!CopilotExpanded" [class.fa-down-left-and-up-right-to-center]="CopilotExpanded"></i>
                                        </button>
                                        <button type="button" class="dashboard-copilot-btn copilot-close" title="Close assistant" aria-label="Close assistant" (click)="CloseChat()">
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="dashboard-copilot-body">
                                    @if (ChatAgentId && ProviderToUse.CurrentUser) {
                                        <mj-conversation-chat-area
                                            [Provider]="Provider" [EnvironmentId]="ChatEnvironmentId" [CurrentUser]="ProviderToUse.CurrentUser"
                                            [Conversation]="ChatConversation" [ConversationId]="ChatConversationId" [IsNewConversation]="ChatIsNewConversation"
                                            [PendingMessage]="ChatPendingMessage" [PendingAttachments]="ChatPendingAttachments"
                                            [SuppressNewConversationEmptyState]="true" [AllowMentions]="false" [OverlayMode]="false"
                                            [ShowExportButton]="false" [ShowShareButton]="false" [ShowArtifactIndicator]="false"
                                            [ShowAgentPicker]="false" [ShowAgentModePicker]="false"
                                            [DefaultAgentId]="ChatAgentId" [AllowedAgentIDs]="[ChatAgentId]"
                                            ApplicationScope="Application" [ApplicationId]="ChatApplicationId" [AppContext]="ChatAppContext"
                                            EmptyStateGreeting="What should this dashboard show?"
                                            (ConversationCreated)="OnChatConversationCreated($event)"
                                            (RealtimeConversationReady)="OnChatRealtimeConversationReady($event)"
                                            (PendingMessageConsumed)="OnChatPendingMessageConsumed()"
                                            (navigationRequest)="OnChatNavigationRequest($event)"
                                            (OpenEntityRecord)="OnChatOpenEntityRecord($event)">
                                        </mj-conversation-chat-area>
                                    } @else if (ChatAgentError) {
                                        <div class="dashboard-copilot-empty" role="status">{{ ChatAgentError }}</div>
                                    } @else {
                                        <div class="dashboard-copilot-empty"><mj-loading Text="Connecting…" Size="small"></mj-loading></div>
                                    }
                                </div>
                            </aside>
                        </as-split-area>
                    }
                </as-split>
            }

            <!-- Code dashboards and the Data Explorer render here. It stays in the template, so the tab finds it when it starts. -->
            <div #container class="dashboard-resource-container" [class.is-hidden]="!!ConfigDashboardId"></div>

            <!-- Share Dashboard Dialog -->
            @if (ConfigDashboard) {
                <mj-dashboard-share-dialog
                    [Visible]="ShowShareDialog"
                    [Dashboard]="ConfigDashboard"
                    (Result)="OnShareDialogResult($event)">
                </mj-dashboard-share-dialog>
            }

            <!-- Confirmation for an agent's Request* tool: the user, not the agent, saves or pins -->
            @if (AgentConfirm) {
                <mj-confirm-dialog
                    class="agent-confirm"
                    [Visible]="true"
                    Type="info"
                    [Title]="AgentConfirm.Title"
                    [Message]="AgentConfirm.Message"
                    [ConfirmText]="AgentConfirm.ConfirmText"
                    CancelText="Not now"
                    (Confirmed)="OnAgentConfirm(true)"
                    (Cancelled)="OnAgentConfirm(false)">
                </mj-confirm-dialog>
            }

            <!-- Closing the AI pane ends a voice session, so the user confirms it first -->
            @if (ShowCloseChatConfirm) {
                <mj-confirm-dialog
                    class="close-chat-confirm"
                    [Visible]="true"
                    Type="warning"
                    Title="End the voice session?"
                    Message="Closing the AI assistant ends the voice session."
                    ConfirmText="Close"
                    CancelText="Keep open"
                    (Confirmed)="OnCloseChatConfirmed()"
                    (Cancelled)="OnCloseChatCancelled()">
                </mj-confirm-dialog>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
        }
        .dashboard-resource-wrapper {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
        }
        /* The editor and the AI pane share the tab. The global MJ splitter theme styles the gutter. */
        .studio-copilot-splitter {
            flex: 1;
            width: 100%;
            height: 100%;
            min-height: 0;
            min-width: 0;
        }
        /* Holds a Code dashboard or the Data Explorer. Hidden while the editor shows a Config dashboard. */
        .dashboard-resource-container {
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        .dashboard-resource-container.is-hidden { display: none; }

        /* The view actions sit in the editor's header row as if they were its own buttons */
        .dashboard-tab-view-actions { display: contents; }
        /* The colour goes on the icon, never on the button: button.scss owns the button */
        .dashboard-tab-ai-toggle.is-active i { color: var(--mj-brand-primary); }

        /* AI pane */
        .dashboard-copilot {
            width: 100%;
            height: 100%;
            border-left: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface);
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        .dashboard-copilot-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            border-bottom: 1px solid var(--mj-border-default);
        }
        .dashboard-copilot-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: var(--mj-text-primary);
        }
        .dashboard-copilot-title i { color: var(--mj-brand-primary); }
        .dashboard-copilot-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .dashboard-copilot-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px 8px;
            border-radius: 6px;
            color: var(--mj-text-muted);
        }
        .dashboard-copilot-btn:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-secondary);
        }
        .dashboard-copilot-body {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .dashboard-copilot-body mj-conversation-chat-area {
            flex: 1;
            min-height: 0;
            display: block;
        }
        .dashboard-copilot-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 1;
            padding: 16px;
            color: var(--mj-text-secondary);
            text-align: center;
        }

        /* Error state */
        .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 40px;
            text-align: center;
            color: var(--mj-text-secondary);
        }
        .error-icon {
            font-size: 64px;
            color: var(--mj-status-error);
            margin-bottom: 24px;
            opacity: 0.8;
        }
        .error-title {
            font-size: 24px;
            font-weight: 500;
            margin: 0 0 12px 0;
            color: var(--mj-text-primary);
        }
        .error-message {
            font-size: 16px;
            color: var(--mj-text-muted);
            margin: 0 0 24px 0;
            max-width: 500px;
            line-height: 1.5;
        }
        .error-details {
            background: var(--mj-bg-surface-sunken);
            border-radius: 8px;
            padding: 12px 16px;
            max-width: 600px;
            text-align: left;
            font-size: 13px;
        }
        .error-details summary {
            cursor: pointer;
            font-weight: 500;
            color: var(--mj-text-muted);
            margin-bottom: 8px;
        }
        .error-details pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--mj-status-error-text);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
        }
    `]
})
export class DashboardResource extends BaseResourceComponent {
    private componentRef: ComponentRef<unknown> | null = null;
    private recentAccess = inject(RecentAccessService);
    private homePins = inject(HomeAppPinService);
    private realtimeSession = inject(RealtimeSessionService);
    private artifactPermissions = inject(ArtifactPermissionService);

    /** The editor that shows the Config dashboard. Undefined while the tab shows none. */
    @ViewChild('editor') private editor?: DashboardEditorComponent;

    /** The panels last reported to the agent, as JSON. Null until the open dashboard is first reported. */
    private reportedPanelsKey: string | null = null;

    /**
     * True once the tab registered the agent tools for the dashboard the editor loaded. Until then the
     * tab reports no context, so the first report comes with the tools.
     */
    private agentStatePublished = false;

    /** True once the tab follows edit-mode requests (see watchEditModeRequests). */
    private watchingEditModeRequests = false;

    /**
     * A cache reattach moves this wrapper to another tab without recreating the dashboard inside it.
     * A child resource component (a Code dashboard, the Data Explorer) has its own tab stamp, taken
     * when we created it, and it has to move too. Without this the dashboard keeps reading and
     * writing the params of the tab it was born in, from inside a tab it no longer belongs to. The
     * editor has no tab of its own. The new tab can hold an edit-mode request (a card's Edit
     * action reopens a closed tab this way), so the tab takes it here, where no load will.
     */
    protected override onTabIdRebound(tabId: string): void {
        const child = this.componentRef?.instance;
        if (child instanceof BaseResourceComponent) {
            this.rehomeChildToTab(child, tabId);
        }
        this.takeEditModeRequest(tabId);
    }
    private dataLoaded = false;
    /** The element that holds a Code dashboard or the Data Explorer. */
    @ViewChild('container', { static: true }) ContainerElement!: ElementRef<HTMLDivElement>;

    /** @deprecated Use {@link ContainerElement}. */
    get containerElement(): ElementRef<HTMLDivElement> {
      return this.ContainerElement;
    }
    /** @deprecated Use {@link ContainerElement}. */
    set containerElement(value: ElementRef<HTMLDivElement>) {
      this.ContainerElement = value;
    }

    /** Error message to display when dashboard fails to load */
    public errorMessage: string | null = null;
    /** Technical error details (shown in expandable section) */
    public ErrorDetails: string | null = null;

    /** @deprecated Use {@link ErrorDetails}. */
    public get errorDetails(): string | null {
      return this.ErrorDetails;
    }
    /** @deprecated Use {@link ErrorDetails}. */
    public set errorDetails(value: string | null) {
      this.ErrorDetails = value;
    }

    /** The Config dashboard the editor shows. Null for a Code dashboard, the Data Explorer, or none. */
    public ConfigDashboardId: string | null = null;

    /** The Config dashboard the editor shows, or null (a Code dashboard, the Data Explorer, or none). */
    public get ConfigDashboard(): MJDashboardEntity | null {
        return this.editor?.Dashboard ?? null;
    }

    /** @deprecated Use {@link ConfigDashboard}. */
    public get configDashboard(): MJDashboardEntity | null {
      return this.ConfigDashboard;
    }

    /** True while the editor is in edit mode. */
    public get IsEditMode(): boolean {
        return this.editor?.IsEditing ?? false;
    }

    /** @deprecated Use {@link IsEditMode}. */
    public get isEditMode(): boolean {
      return this.IsEditMode;
    }

    /** True when the user may share the dashboard the editor shows. */
    public get CanShare(): boolean {
        return this.editor?.Permissions.CanShare ?? false;
    }

    /** The confirm dialog an agent's Request* tool opened, or null. The user, not the agent, saves or pins. */
    public AgentConfirm: AgentConfirmDialog | null = null;

    /** The request behind the open agent confirm dialog. Null while none is open. */
    private agentConfirmRequest: AgentConfirmRequest | null = null;

    // ── AI pane ──────────────────────────────────────────────────────

    /** True while the AI pane shows beside the dashboard. */
    public ChatOpen = false;

    /** True while the AI pane takes its largest width (CopilotMaxPct). */
    public CopilotExpanded = false;

    /** The dashboard's width while the AI pane is open, in percent of the tab's width. */
    public MainSizePct: number = STUDIO_PANE_DEFAULTS.MainSizePct;

    /** The AI pane's width, in percent of the tab's width. */
    public CopilotSizePct: number = STUDIO_PANE_DEFAULTS.CopilotSizePct;

    /** The smallest width of the AI pane, in percent of the tab's width. */
    public readonly CopilotMinPct = STUDIO_PANE_COPILOT_MIN_PCT;

    /** The largest width of the AI pane, in percent of the tab's width. */
    public readonly CopilotMaxPct = STUDIO_PANE_COPILOT_MAX_PCT;

    /** True while the dialog that asks before a voice session ends with the AI pane is open. */
    public ShowCloseChatConfirm = false;

    /** The agent the AI pane talks to: the Dashboards application's default agent. Null until it resolves. */
    public ChatAgentId: string | null = null;

    /** The name of that agent, which the AI pane shows in its header. */
    public ChatAgentName: string | null = null;

    /** Why the AI pane has no agent, or null. The pane then shows this instead of the chat. */
    public ChatAgentError: string | null = null;

    /** The AI pane's conversation, from the moment its first message created it. */
    public ChatConversation: MJConversationEntity | null = null;

    /** The ID of the AI pane's conversation. */
    public ChatConversationId: string | null = null;

    /** True until the first message creates the AI pane's conversation. */
    public ChatIsNewConversation = true;

    /** The first message, which the chat area sends once it has created the conversation. Null after it is sent. */
    public ChatPendingMessage: string | null = null;

    /** The files attached to the first message, sent with it. */
    public ChatPendingAttachments: PendingAttachment[] | null = null;

    /** The shell's app context snapshot, as the chat area's AppContext input takes it. The agent reads it. */
    public ChatAppContext: Record<string, unknown> | null = null;

    /** The application the AI pane's conversations belong to, and whose default agent answers in it. */
    public readonly ChatApplicationId = DASHBOARDS_APPLICATION_ID;

    /** True while the AI pane resolves its agent. */
    private resolvingChatAgent = false;

    /** The environment of the AI pane's conversations and of the artifacts the agent searches: the tab's, else the default. */
    public get ChatEnvironmentId(): string {
        const environmentId = this.Data?.Configuration?.['environmentId'];
        return typeof environmentId === 'string' && environmentId ? environmentId : MJEnvironmentEntityExtended.DefaultEnvironmentID;
    }

    // ── Members the editor owns ──────────────────────────────────────

    /** @deprecated Use {@link DashboardEditorComponent.EditingName}. */
    public get EditingName(): string { return this.editor?.EditingName ?? ''; }
    /** @deprecated Use {@link DashboardEditorComponent.EditingName}. */
    public set EditingName(value: string) { if (this.editor) this.editor.EditingName = value; }

    /** @deprecated Use {@link DashboardEditorComponent.EditingName}. */
    public get editingName(): string { return this.EditingName; }
    /** @deprecated Use {@link DashboardEditorComponent.EditingName}. */
    public set editingName(value: string) { this.EditingName = value; }

    /** @deprecated Use {@link DashboardEditorComponent.EditingDescription}. */
    public get EditingDescription(): string { return this.editor?.EditingDescription ?? ''; }
    /** @deprecated Use {@link DashboardEditorComponent.EditingDescription}. */
    public set EditingDescription(value: string) { if (this.editor) this.editor.EditingDescription = value; }

    /** @deprecated Use {@link DashboardEditorComponent.EditingDescription}. */
    public get editingDescription(): string { return this.EditingDescription; }
    /** @deprecated Use {@link DashboardEditorComponent.EditingDescription}. */
    public set editingDescription(value: string) { this.EditingDescription = value; }

    /** @deprecated Use {@link DashboardEditorComponent.Permissions}. */
    public get DashboardPermissions(): DashboardUserPermissions { return this.editor?.Permissions ?? NO_DASHBOARD_PERMISSIONS; }

    /** @deprecated Use {@link DashboardEditorComponent.Permissions}. */
    public get dashboardPermissions(): DashboardUserPermissions { return this.DashboardPermissions; }

    /** @deprecated Use {@link DashboardEditorComponent.ToggleEditMode}. */
    public ToggleEditMode(): void { this.editor?.ToggleEditMode(); }

    /** @deprecated Use {@link DashboardEditorComponent.ToggleEditMode}. */
    public toggleEditMode(): void { this.ToggleEditMode(); }

    /** @deprecated Use {@link DashboardEditorComponent.CancelEdit}. */
    public CancelEdit(): void { this.editor?.CancelEdit(); }

    /** @deprecated Use {@link DashboardEditorComponent.CancelEdit}. */
    public cancelEdit(): void { this.CancelEdit(); }

    /** @deprecated Use {@link DashboardEditorComponent.SaveDashboard}. */
    public SaveDashboard(): Promise<void> { return this.editor?.SaveDashboard() ?? Promise.resolve(); }

    /** @deprecated Use {@link DashboardEditorComponent.SaveDashboard}. */
    public saveDashboard(): Promise<void> { return this.SaveDashboard(); }

    /** @deprecated Use {@link DashboardEditorComponent.OpenAddPartDialog}. */
    public OpenAddPartDialog(): void { this.editor?.OpenAddPartDialog(); }

    /** @deprecated Use {@link DashboardEditorComponent.OpenAddPartDialog}. */
    public openAddPartDialog(): void { this.OpenAddPartDialog(); }

    // ── Share and pin ────────────────────────────────────────────────

    /** Whether the share dialog is visible */
    public ShowShareDialog = false;

    /** @deprecated Use {@link ShowShareDialog}. */
    public get showShareDialog() {
      return this.ShowShareDialog;
    }
    /** @deprecated Use {@link ShowShareDialog}. */
    public set showShareDialog(value) {
      this.ShowShareDialog = value;
    }

    /** True when the open Config dashboard is pinned to Home. */
    public get IsPinnedToHome(): boolean {
        return this.readPlacement(this.ConfigDashboard?.ID, id => this.homePins.IsPinned(DASHBOARD_PIN_RESOURCE_TYPE, { dashboardId: id }));
    }

    /**
     * Sets the error state with a user-friendly message and optional technical details
     */
    private setError(message: string, error?: unknown): void {
        this.errorMessage = message;
        if (error instanceof Error) {
            this.ErrorDetails = error.message;
            if (error.stack) {
                this.ErrorDetails += '\n\nStack trace:\n' + error.stack;
            }
        } else if (error) {
            this.ErrorDetails = String(error);
        }
    }

    /**
     * Clears any previous error state
     */
    private clearError(): void {
        this.errorMessage = null;
        this.ErrorDetails = null;
    }

    constructor(
        private viewContainer: ViewContainerRef,
        private cdr: ChangeDetectorRef
    ) {
        super();
    }

    override set Data(value: ResourceData) {
        const previousRecordId = super.Data?.ResourceRecordID;
        super.Data = value;

        const newRecordId = value?.ResourceRecordID;

        // Load on first set, or when the dashboard has changed
        if (!this.dataLoaded || newRecordId !== previousRecordId) {
            this.dataLoaded = true;
            // Destroy previous component before loading new one
            if (this.componentRef) {
                this.componentRef.destroy();
                this.componentRef = null;
            }
            this.clearError();
            this.abortAgentConfirm('The tab opened another dashboard before the user answered.');
            this.ConfigDashboardId = null;
            this.agentStatePublished = false;
            this.loadDashboard();
        }
    }

    // Need to override the getter too in TS otherwise the override to the setter alone above would break things
    override get Data(): ResourceData {
        return super.Data;
    }

    override ngOnInit(): void {
        super.ngOnInit();
        this.watchAppContext();
    }

    ngOnDestroy(): void {
        this.abortAgentConfirm('The dashboard tab was closed before the user answered.');
        super.ngOnDestroy();
        if (this.componentRef) {
            this.componentRef.destroy();
        }
    }

    // ========================================
    // The Editor
    // ========================================

    /**
     * Shows a Config dashboard in the editor, which reads it from DashboardEngine. The editor's Loaded
     * or LoadFailed event finishes the load (OnEditorLoaded, OnEditorLoadFailed).
     */
    private showConfigDashboard(dashboard: MJDashboardEntity): void {
        this.ContainerElement.nativeElement.innerHTML = '';
        this.reportedPanelsKey = null;
        this.ConfigDashboardId = dashboard.ID;
        void this.loadHomePins();
        this.watchEditModeRequests();
        SafeDetectChanges(this.cdr);
    }

    /**
     * The editor shows the dashboard and its layout is ready. The loading screen goes, the tab takes an
     * edit-mode request (a new dashboard, or a card's Edit action) when it has one, and the agent gets
     * its tools and the dashboard. NavigationService removes the request when the tab takes it, so a
     * later load of the tab opens for viewing.
     */
    public OnEditorLoaded(dashboard: MJDashboardEntity): void {
        this.NotifyLoadComplete();
        if (this.navigationService.TakeDashboardEditModeRequest(this.getTabId(), dashboard.ID, this.tabApplicationId())) {
            this.editor?.EnterEditMode();
        }
        SafeDetectChanges(this.cdr);
        this.publishAgentState();
    }

    /** The editor could not show the dashboard: the tab shows why, and the loading screen goes. */
    public OnEditorLoadFailed(error: DashboardEditorLoadError): void {
        const name = this.cachedDashboardName(error.DashboardId);
        const subject = name ? `The dashboard "${name}"` : 'The dashboard';
        this.setError(`${subject} could not be loaded. There may be an issue with the dashboard configuration.`, error.Message);
        this.NotifyLoadComplete();
        SafeDetectChanges(this.cdr);
    }

    /**
     * The dashboard's saved name changed, by a save here or elsewhere. The tab takes the name as its
     * title and keeps its dashboard ID: ResourceRecordSaved would rewrite the record ID in a form the
     * tab configuration does not have, and the tab would reload on each Save.
     */
    public OnEditorNameChanged(name: string): void {
        if (name) {
            this.NotifyDisplayNameChanged(name);
        }
    }

    /** The editor entered or left edit mode: the tab reports it to the agent. */
    public OnEditorEditingChange(): void {
        this.emitAgentContext();
    }

    /** The editor's parts or layout changed: the tab reports the panels to the agent when they changed. */
    public OnEditorConfigChanged(): void {
        this.onViewerConfigChanged();
    }

    /** The editor rebuilt the saved layout after a save elsewhere: the rebuild reports nothing to the agent. */
    public OnEditorReloaded(): void {
        this.treatPanelsAsReported();
    }

    /** The user starred or unstarred the dashboard in the editor. */
    public OnEditorFavoriteChange(): void {
        this.onPlacementChanged();
    }

    /** A part of the dashboard asked to open something: a record, another dashboard, a query. */
    public OnEditorNavigationRequested(event: DashboardNavRequestEvent): void {
        this.handleNavigationRequest(event);
    }

    /**
     * Takes the tab's edit-mode request, if it has one for this tab's dashboard, and enters edit mode in
     * the editor. A tab that has not finished loading leaves the request for its load (see
     * OnEditorLoaded). A tab that is already editing keeps its changes. A request for what the tab shows
     * now stays for that tab's component: a cached component can still be bound to a tab ID that OpenTab
     * gave to another dashboard, or to this dashboard in another application.
     */
    private takeEditModeRequest(tabId: string): void {
        const editor = this.editor;
        const dashboard = editor?.Dashboard;
        if (!this.LoadComplete || !editor || !dashboard || !UUIDsEqual(dashboard.ID, this.ConfigDashboardId)) return;
        if (this.navigationService.TakeDashboardEditModeRequest(tabId, dashboard.ID, this.tabApplicationId()) && !editor.IsEditing) {
            editor.EnterEditMode();
        }
    }

    /** The application of the tab this component was loaded for, from the resource data the tab container gives it. */
    private tabApplicationId(): string {
        const applicationId = this.Data?.Configuration?.['applicationId'];
        return typeof applicationId === 'string' ? applicationId : '';
    }

    /**
     * Enters edit mode when OpenDashboard asks this open tab to (NavigationService.DashboardEditModeRequested$).
     * Starts once per tab, and stops when the tab is destroyed.
     */
    private watchEditModeRequests(): void {
        if (this.watchingEditModeRequests) return;
        this.watchingEditModeRequests = true;
        this.navigationService.DashboardEditModeRequested$.pipe(
            filter(tabId => UUIDsEqual(tabId, this.getTabId())),
            takeUntil(this.destroy$)
        ).subscribe(tabId => this.takeEditModeRequest(tabId));
    }

    /**
     * Takes the viewer's current panels as the ones last reported to the agent, so the change events
     * of a reloaded layout report nothing. Does nothing before the first report.
     */
    private treatPanelsAsReported(): void {
        if (this.reportedPanelsKey !== null) {
            this.reportedPanelsKey = JSON.stringify(this.livePanels());
        }
    }

    /**
     * Open the share dialog for this dashboard
     */
    public OpenShareDialog(): void {
        this.ShowShareDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenShareDialog}. */
    public openShareDialog(): void {
      return this.OpenShareDialog();
    }

    /**
     * Close the share dialog
     */
    public CloseShareDialog(): void {
        this.ShowShareDialog = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseShareDialog}. */
    public closeShareDialog(): void {
      return this.CloseShareDialog();
    }

    /**
     * Handle share dialog result. After a save the editor reads the user's permissions again, since
     * sharing can change them.
     */
    public OnShareDialogResult(result: ShareDialogResult): void {
        this.ShowShareDialog = false;

        if (result.Action === 'save') {
            this.editor?.RefreshPermissions();
        }

        this.cdr.detectChanges();
        if (result.Action === 'save') {
            this.emitAgentContext();
        }
    }

    // ========================================
    // Add to menu
    // ========================================

    /** Pins the open dashboard to Home as a card, then adds a thumbnail of it in the background. */
    public async PinToHome(): Promise<void> {
        const dashboard = this.ConfigDashboard;
        if (!dashboard) return;
        try {
            await this.homePins.LoadPins();
            if (this.homePins.AddPin(this.homePinFor(dashboard))) {
                MJNotificationService.Instance.CreateSimpleNotification(`Pinned "${dashboard.Name}" to Home`, 'success', 2000);
                void this.attachPinThumbnail(dashboard.ID);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(`"${dashboard.Name}" is already pinned to Home`, 'info', 2000);
            }
        } catch (error) {
            LogError(`Dashboard tab: could not pin the dashboard to Home: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification('Could not pin the dashboard to Home', 'error', 3000);
        }
        this.onPlacementChanged();
    }

    /**
     * Reads one placement flag (the pin) for a dashboard. False without a dashboard,
     * or when the user cannot read that data (the engine throws PermissionConstrainedError).
     */
    private readPlacement(dashboardId: string | undefined, read: (dashboardId: string) => boolean): boolean {
        if (!dashboardId) return false;
        try {
            return read(dashboardId);
        } catch {
            return false;
        }
    }

    /** The Home pin for a dashboard, in the shared dashboard pin shape. */
    private homePinFor(dashboard: MJDashboardEntity): HomeAppPinInput {
        return BuildDashboardPinInput(dashboard);
    }

    /**
     * Adds a thumbnail of the dashboard (the editor's body) to its pin. Best effort: without one, Home
     * shows the pin's icon. Logs a failure and never rejects, because the caller does not wait for it.
     */
    private async attachPinThumbnail(dashboardId: string): Promise<void> {
        try {
            const element = this.editor?.BodyElement;
            const thumbnail = element ? await this.homePins.CaptureThumbnail(element) : undefined;
            const pin = thumbnail ? this.homePins.FindPin(DASHBOARD_PIN_RESOURCE_TYPE, { dashboardId }) : undefined;
            if (pin && thumbnail) {
                this.homePins.UpdatePin(pin.Id, { Thumbnail: thumbnail });
            }
        } catch (error) {
            LogError(`Dashboard tab: could not add a thumbnail to the Home pin: ${errorMessage(error)}`);
        }
    }

    /** Loads the user's Home pins, so the Add to menu can show whether this dashboard is pinned. */
    private async loadHomePins(): Promise<void> {
        try {
            await this.homePins.LoadPins();
        } catch (error) {
            LogError(`Dashboard tab: could not load the Home pins: ${errorMessage(error)}`);
        }
    }

    /** Updates the header buttons and reports the new placement to the agent. */
    private onPlacementChanged(): void {
        SafeDetectChanges(this.cdr);
        this.emitAgentContext();
    }

    // ========================================
    // AI Pane
    // ========================================

    /** Opens the AI pane with the widths the user saved, or closes it as CloseChat does. */
    public ToggleChat(): void {
        if (this.ChatOpen) {
            this.CloseChat();
            return;
        }
        this.applyPanePrefs(this.savedPanePrefs());
        this.ChatOpen = true;
        void this.ensureChatAgentResolved();
        SafeDetectChanges(this.cdr);
    }

    /**
     * Closes the AI pane. Its conversation stays, so the pane shows it again when it opens. Closing the pane
     * ends a voice session, so while one runs the user confirms first (OnCloseChatConfirmed).
     */
    public CloseChat(): void {
        if (this.realtimeSession.IsActive) {
            this.ShowCloseChatConfirm = true;
        } else {
            this.closeChatPane();
        }
        SafeDetectChanges(this.cdr);
    }

    /** The user confirmed: the AI pane closes, and the voice session ends with it. */
    public OnCloseChatConfirmed(): void {
        this.ShowCloseChatConfirm = false;
        this.closeChatPane();
        SafeDetectChanges(this.cdr);
    }

    /** The user keeps the AI pane open, and the voice session with it. */
    public OnCloseChatCancelled(): void {
        this.ShowCloseChatConfirm = false;
        SafeDetectChanges(this.cdr);
    }

    /** Gives the AI pane its largest width, or its own width again. */
    public ToggleCopilotExpanded(): void {
        this.CopilotExpanded = !this.CopilotExpanded;
        SafeDetectChanges(this.cdr);
    }

    /**
     * Keeps the widths the user dragged the split to, in this tab and in the user's settings. The AI pane then
     * has that width, not its largest one. Sizes that are not two numbers change nothing.
     */
    public OnCopilotSplitDragEnd(sizes: readonly (number | '*')[]): void {
        const prefs = PrefsFromSplitSizes(sizes);
        if (!prefs) return;
        this.applyPanePrefs(prefs);
        this.CopilotExpanded = false;
        UserInfoEngine.Instance.SetSettingDebounced(STUDIO_PANE_SETTING_KEY, JSON.stringify(prefs));
        SafeDetectChanges(this.cdr);
    }

    /**
     * The chat area created the AI pane's conversation for the first message. The pane keeps the conversation
     * and gives the message back to the chat area, which then sends it in that conversation.
     */
    public OnChatConversationCreated(event: ChatConversationCreated): void {
        this.ChatConversation = event.conversation;
        this.ChatConversationId = event.conversation.ID;
        this.ChatIsNewConversation = false;
        this.ChatPendingMessage = event.pendingMessage ?? null;
        this.ChatPendingAttachments = event.pendingAttachments ?? null;
        SafeDetectChanges(this.cdr);
    }

    /**
     * A voice call started before any message, so the server created the AI pane's conversation. When the
     * call ends, the pane adopts that conversation, so the chat area shows the call's transcript and the
     * next message goes to it. The start of the call reports the same conversation without `select`; the
     * pane leaves the chat area alone until the call ends, as the Conversations app does.
     */
    public async OnChatRealtimeConversationReady(event: { conversationId: string; select: boolean }): Promise<void> {
        if (!event.select || !event.conversationId || this.ChatConversationId) return;
        const conversation = await this.loadChatConversation(event.conversationId);
        if (!conversation || this.ChatConversationId) return;
        this.ChatConversation = conversation;
        this.ChatConversationId = conversation.ID;
        this.ChatIsNewConversation = false;
        SafeDetectChanges(this.cdr);
    }

    /** The conversation with `conversationId` that the user can read, or null. */
    private async loadChatConversation(conversationId: string): Promise<MJConversationEntity | null> {
        const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJConversationEntity>({
            EntityName: 'MJ: Conversations',
            ExtraFilter: `ID='${EscapeSQLString(conversationId)}'`,
            ResultType: 'entity_object',
        });
        if (!result.Success) {
            LogError(`DashboardResource: the AI pane could not load conversation ${conversationId}: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results?.[0] ?? null;
    }

    /** The chat area sent the first message. The pane drops it, so the chat area does not send it again. */
    public OnChatPendingMessageConsumed(): void {
        this.ChatPendingMessage = null;
        this.ChatPendingAttachments = null;
        SafeDetectChanges(this.cdr);
    }

    /** Opens the app page that an artifact in the chat asks for. An app the metadata does not name opens the page in the current app. */
    public OnChatNavigationRequest(request: NavigationRequest): void {
        const appId = request.appName ? this.applicationIdByName(request.appName) : undefined;
        void this.navigationService.OpenNavItemByName(request.navItemName, undefined, appId, { queryParams: request.queryParams })
            .catch((error: unknown) => LogError(`Dashboard tab: could not open ${request.navItemName}: ${errorMessage(error)}`));
    }

    /** Opens a record that the chat links to. */
    public OnChatOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
        this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
    }

    /** Keeps the shell's latest app context snapshot for the chat, until the tab is destroyed. Renders only while the pane is open. */
    private watchAppContext(): void {
        this.navigationService.AppContextSnapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
            this.ChatAppContext = snapshot ? { ...snapshot } : null;
            if (this.ChatOpen) {
                SafeDetectChanges(this.cdr);
            }
        });
    }

    /** The AI pane widths in the user's settings, or the defaults when the settings cannot be read. */
    private savedPanePrefs(): StudioPanePrefs {
        try {
            return ParseStudioPanePrefs(UserInfoEngine.Instance.GetSetting(STUDIO_PANE_SETTING_KEY));
        } catch {
            return ParseStudioPanePrefs(null); // the user cannot read their settings
        }
    }

    private applyPanePrefs(prefs: StudioPanePrefs): void {
        this.MainSizePct = prefs.MainSizePct;
        this.CopilotSizePct = prefs.CopilotSizePct;
    }

    private closeChatPane(): void {
        this.ChatOpen = false;
        this.CopilotExpanded = false;
    }

    /** The ID of the application with this name, in any case, or undefined when the metadata has none. */
    private applicationIdByName(appName: string): string | undefined {
        const name = appName.trim().toLowerCase();
        return this.ProviderToUse.Applications.find(app => app.Name.trim().toLowerCase() === name)?.ID;
    }

    /**
     * Resolves the agent the AI pane talks to: the Dashboards application's default agent
     * (Application.AgentSettings.DefaultAgentID). When the resolver falls back to Sage, the application has no
     * agent of its own, and the pane says so instead of showing a chat. After a failure the next open tries again.
     */
    private async ensureChatAgentResolved(): Promise<void> {
        if (this.ChatAgentId || this.resolvingChatAgent) return;
        this.resolvingChatAgent = true;
        this.ChatAgentError = null;
        try {
            const provider = this.ProviderToUse;
            const agent = await new DefaultAgentResolver().Resolve({ applicationId: this.ChatApplicationId, contextUser: provider.CurrentUser, provider });
            if (agent.Name === DefaultAgentResolver.FALLBACK_AGENT_NAME) {
                this.ChatAgentError = NO_DASHBOARD_ASSISTANT;
            } else {
                this.ChatAgentId = agent.ID;
                this.ChatAgentName = agent.Name;
            }
        } catch (error) {
            LogError(`Dashboard tab: could not resolve the dashboard assistant: ${errorMessage(error)}`);
            this.ChatAgentError = `The dashboard assistant could not be loaded: ${errorMessage(error)}`;
        } finally {
            this.resolvingChatAgent = false;
        }
        SafeDetectChanges(this.cdr);
    }

    // ========================================
    // Agent Context & Client Tools
    //
    // 🔒 BOUNDARY: the tab's agent tools change the open dashboard in memory only. Save, Share,
    // Favorite and Pin stay user actions; the Request* tools in dashboard-studio-tools.ts ask
    // for them through a confirm dialog and never perform them.
    // A Code dashboard is its own resource component and reports its own context and tools, so
    // this tab reports nothing for it.
    // ========================================

    /**
     * Registers the tab's tools and reports the open Config dashboard to the agent. The studio tools
     * of one registration share an edit queue, so the tab registers them once for each dashboard load.
     */
    private publishAgentState(): void {
        this.navigationService.SetAgentClientTools(this, [
            ...BuildDashboardTabAgentTools(this.agentHost()),
            ...BuildDashboardStudioTools(this.studioHost()),
        ]);
        this.agentStatePublished = true;
        this.emitAgentContext();
    }

    /**
     * Reports the Config dashboard the editor shows to the agent. Does nothing while none is shown, and
     * before the tab registered the tools for it: an edit-mode request taken on the load reports nothing
     * of its own, so the load reports once.
     */
    private emitAgentContext(): void {
        const editor = this.editor;
        const dashboard = editor?.Dashboard;
        if (!this.agentStatePublished || !editor || !dashboard) return;
        const panels = this.livePanels();
        this.reportedPanelsKey = JSON.stringify(panels);
        this.navigationService.SetAgentContext(this, BuildDashboardTabAgentContext({
            Dashboard: dashboard,
            IsEditing: editor.IsEditing,
            CanEdit: editor.CanEdit,
            Panels: panels,
            IsFavorite: editor.IsFavorite,
            IsPinnedToHome: this.IsPinnedToHome,
        }));
    }

    /** Reports the dashboard again when its panels change. A layout move or resize reports nothing. */
    private onViewerConfigChanged(): void {
        if (this.reportedPanelsKey !== null && JSON.stringify(this.livePanels()) !== this.reportedPanelsKey) {
            this.emitAgentContext();
        }
    }

    /** The reads the agent tools make from this tab. */
    private agentHost(): DashboardTabAgentHost {
        return {
            CurrentDashboard: () => this.ConfigDashboard,
            AccessibleDashboards: () => DashboardEngine.Instance.GetAccessibleDashboards(this.ProviderToUse.CurrentUser.ID),
            Panels: dashboard => this.isOpenDashboard(dashboard) ? this.livePanels() : this.savedPanels(dashboard),
            Permissions: dashboardId => DashboardEngine.Instance.GetDashboardPermissions(dashboardId, this.ProviderToUse.CurrentUser.ID),
        };
    }

    private isOpenDashboard(dashboard: DashboardTabDashboard): boolean {
        return !!this.ConfigDashboard && UUIDsEqual(dashboard.ID, this.ConfigDashboard.ID);
    }

    /**
     * The open dashboard's panels, read from the editor's viewer and its live layout, so unsaved edits
     * count. Empty while the viewer is not ready. Best effort: a failed read never stops the context report.
     */
    private livePanels(): DashboardPanelSummary[] {
        const viewer = this.editor?.Viewer;
        if (!viewer) return [];
        try {
            return SummarizeDashboardPanels(ExtractPanelsFromLayout(viewer.getConfig()?.layout ?? null), viewer.GetPartTypes());
        } catch {
            return [];
        }
    }

    /** The panels saved in a dashboard's layout. Empty when the layout or the part types cannot be read. */
    private savedPanels(dashboard: DashboardTabDashboard): DashboardPanelSummary[] {
        try {
            const config = SafeJSONParse<Pick<DashboardLayoutConfig, 'layout'>>(dashboard.UIConfigDetails);
            return SummarizeDashboardPanels(ExtractPanelsFromLayout(config?.layout ?? null), DashboardEngine.Instance.DashboardPartTypes);
        } catch {
            return [];
        }
    }

    // ========================================
    // Studio Tools Host
    // ========================================

    /**
     * The reads and edits the studio tools make on this tab, through its editor, and the requests they
     * put to the user. DashboardStudioHost says what each member must do.
     */
    private studioHost(): DashboardStudioHost {
        return {
            Dashboard: () => {
                const dashboard = this.ConfigDashboard;
                return dashboard ? { ID: dashboard.ID, Name: dashboard.Name, Description: dashboard.Description ?? null } : null;
            },
            GetConfig: () => this.editor?.Viewer?.getConfig() ?? null,
            GetPartTypes: () => this.editor?.PartTypes ?? [],
            IsEditing: () => this.editor?.IsEditing ?? false,
            CanEdit: () => this.editor?.CanEdit ?? false,
            HasUnsavedChanges: () => this.editor?.Viewer?.HasUnsavedChanges ?? false,
            IsSaving: () => this.editor?.IsSaving ?? false,
            EnterEditMode: () => this.editor?.EnterEditMode() ?? false,
            ...this.studioEdits(),
            GetPanelPath: panelId => this.editor?.Viewer?.GetPanelPath(panelId) ?? null,
            CaptureScreenshot: maxWidth => this.editor
                ? CaptureElementJpeg(this.editor.BodyElement, { maxWidth })
                : Promise.reject(new Error(NO_CONFIG_DASHBOARD)),
            PanelBounds: () => this.panelBounds(),
            IsVoiceSessionActive: () => this.realtimeSession.IsActive,
            SendVoiceFrame: (base64, mimeType) => this.realtimeSession.SendVideoFrame(base64, mimeType),
            Confirm: (kind, detail) => this.askAgentConfirm(kind, detail),
            SearchSources: (query, kinds, limit) => this.searchSources(query, kinds, limit),
        };
    }

    /**
     * The studio host's edits. Each runs through runAgentEdit, so it rejects with the reason when it
     * cannot be made, and an edit the viewer can skip without an error is checked afterwards.
     */
    private studioEdits(): Pick<DashboardStudioHost, 'AddPanel' | 'RemovePanel' | 'UpdatePanelConfig' | 'ApplyLayout'> {
        return {
            AddPanel: (partTypeId, config, title, icon, position) =>
                this.runAgentEdit('The assistant could not add the part', viewer => viewer.AddPanel(partTypeId, config, title, icon, position)),
            RemovePanel: panelId =>
                this.runAgentEdit('The assistant could not remove the part', viewer => {
                    viewer.RemovePanel(panelId);
                    if (viewer.GetPanel(panelId)) throw new Error('The dashboard did not remove the panel.');
                }),
            UpdatePanelConfig: (panelId, config, title, icon) =>
                this.runAgentEdit('The assistant could not change the part', async viewer => {
                    await viewer.UpdatePanelConfig(panelId, config, title, icon);
                    if (JSON.stringify(viewer.GetPanel(panelId)?.config) !== JSON.stringify(config)) {
                        throw new Error('The dashboard did not change the panel.');
                    }
                }),
            ApplyLayout: layout =>
                this.runAgentEdit('The assistant could not change the layout', async viewer => {
                    if (!viewer.getConfig()) throw new Error('The dashboard has not loaded its layout yet.');
                    await viewer.ApplyLayout(layout);
                }),
        };
    }

    /**
     * Makes one agent edit on the editor's viewer, then reports the dashboard's parts to the agent again.
     * The edit waits until the viewer's layout is ready: entering edit mode can reload the saved
     * dashboard. Rejects with an Error that says why when no viewer is open, the editor's Save runs, or
     * the edit fails; the user also sees a failed edit.
     */
    private async runAgentEdit<T>(failureMessage: string, edit: (viewer: DashboardViewerComponent) => T | Promise<T>): Promise<T> {
        const viewer = this.editor?.Viewer;
        if (!viewer) throw new Error(NO_CONFIG_DASHBOARD);
        try {
            await viewer.WaitForLayoutReady();
            if (this.editor?.IsSaving) throw new Error(SAVE_IN_PROGRESS);
            return await edit(viewer);
        } catch (error) {
            LogError(`Dashboard tab: ${failureMessage}: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification(failureMessage, 'error', 3000);
            throw error instanceof Error ? error : new Error(errorMessage(error));
        } finally {
            this.onViewerConfigChanged();
        }
    }

    /**
     * The box of each panel the tab shows, in CSS pixels from the top left corner of the element that
     * CaptureScreenshot captures (the editor's body). A panel whose content is hidden, such as one in a
     * stack's inactive tab, is left out. html-to-image draws a scrolled container from its top, so each
     * box adds the container's scroll offset. None while the editor shows no dashboard.
     */
    private panelBounds(): ReturnType<DashboardStudioHost['PanelBounds']> {
        const editor = this.editor;
        if (!editor) return [];
        const container = editor.BodyElement;
        const origin = container.getBoundingClientRect();
        const contents = new Map(Array.from(container.querySelectorAll<HTMLElement>('[data-panel-id]'), element => [element.dataset['panelId'], element] as const));
        return ExtractPanelsFromLayout(editor.Viewer?.getConfig()?.layout ?? null).flatMap(panel => {
            const content = contents.get(panel.id);
            if (!content || content.offsetParent === null) return [];
            const box = content.getBoundingClientRect();
            return [{
                panelId: panel.id,
                x: Math.round(box.left - origin.left + container.scrollLeft),
                y: Math.round(box.top - origin.top + container.scrollTop),
                width: Math.round(box.width),
                height: Math.round(box.height),
            }];
        });
    }

    // ========================================
    // Source Search for the Agent
    // ========================================

    /**
     * Searches the sources the user may show in a panel. First loads the engines that the searched kinds
     * read: the tab starts these loads with the dashboard, and a load that failed then runs again here.
     */
    private async searchSources(query: string, kinds: readonly SourceKind[], limit: number): Promise<SourceSearchResult[]> {
        await this.loadSourceEngines(kinds);
        return SearchDashboardSources(this.sourceSearchDeps(), query, kinds, limit);
    }

    /** The lists the source search reads, each limited to what the user may use. */
    private sourceSearchDeps(): SourceSearchDeps {
        const provider = this.ProviderToUse;
        return {
            ListArtifacts: query => this.artifactSources(query),
            ListViews: () => viewSources(),
            ListQueries: () => querySources(provider.CurrentUser),
            ListEntities: () => entitySources(provider),
        };
    }

    /**
     * Loads the engines the source search reads for `kinds`: user views for 'view' and queries for
     * 'query'. Artifacts and entities need neither. A loaded engine returns at once.
     */
    private async loadSourceEngines(kinds: readonly SourceKind[]): Promise<void> {
        const provider = this.ProviderToUse;
        const loads: Promise<void>[] = [];
        if (kinds.includes('view')) loads.push(UserViewEngine.Instance.Config(false, provider.CurrentUser, provider));
        if (kinds.includes('query')) loads.push(QueryEngine.Instance.Config(false, provider.CurrentUser, provider));
        await Promise.all(loads);
    }

    /**
     * Starts to load the source search engines with a Config dashboard, so that the agent's first search
     * usually finds them loaded. The dashboard does not wait for it. Never rejects: a failure is logged,
     * and the search loads the engines again.
     */
    private async preloadSourceEngines(): Promise<void> {
        try {
            await this.loadSourceEngines(SOURCE_KINDS);
        } catch (error) {
            LogError(`Dashboard tab: could not load the views and queries for the assistant's source search: ${errorMessage(error)}`);
        }
    }

    /**
     * The artifacts the user can read in the tab's environment (ChatEnvironmentId) whose name or description
     * contains `query` in any case (all of them for a blank query), the first SOURCE_SEARCH_MAX_ARTIFACTS by
     * name, each with its latest version number. An artifact whose versions cannot be read has none, so
     * its panel shows the latest version. Rejects when the artifacts cannot be read.
     */
    private async artifactSources(query: string): Promise<Awaited<ReturnType<SourceSearchDeps['ListArtifacts']>>> {
        const provider = this.ProviderToUse;
        const user = provider.CurrentUser;
        await ArtifactMetadataEngine.Instance.Config(false, user, provider);
        const readable = await this.artifactPermissions.GetReadableArtifactsFilter(user.ID, user);
        const environmentId = EscapeSQLString(this.ChatEnvironmentId);
        const result = await RunView.FromMetadataProvider(provider).RunView<ArtifactRow>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `${readable} AND EnvironmentID='${environmentId}' AND (Visibility IS NULL OR Visibility='Always')${artifactQueryFilter(query)}`,
            Fields: ['ID', 'Name', 'Description', 'Type'],
            OrderBy: 'Name',
            MaxRows: SOURCE_SEARCH_MAX_ARTIFACTS,
            ResultType: 'simple',
        }, user);
        if (!result.Success) throw new Error(`Could not read the artifacts: ${result.ErrorMessage || 'no reason given'}`);
        const artifacts = result.Results ?? [];
        const latest = await this.latestArtifactVersions(artifacts.map(artifact => artifact.ID));
        return artifacts.map(artifact => ({
            ID: artifact.ID,
            Name: artifact.Name,
            Description: artifact.Description,
            Type: artifact.Type,
            LatestVersion: latest.get(NormalizeUUID(artifact.ID)) ?? null,
        }));
    }

    /**
     * The highest version number of each artifact, by normalized artifact ID. One RunViews call reads
     * every version of the artifacts, highest first and without the entity's row cap, with at most
     * ARTIFACT_VERSION_FILTER_CHUNK IDs in each filter. The artifacts whose versions cannot be read are
     * not in the map, and the failure is logged.
     */
    private async latestArtifactVersions(artifactIds: readonly string[]): Promise<Map<string, number>> {
        const latest = new Map<string, number>();
        if (artifactIds.length === 0) return latest;
        const provider = this.ProviderToUse;
        try {
            const results = await RunView.FromMetadataProvider(provider).RunViews<ArtifactVersionRow>(
                chunked(artifactIds, ARTIFACT_VERSION_FILTER_CHUNK).map(ids => ({
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID IN (${ids.map(id => `'${EscapeSQLString(id)}'`).join(',')})`,
                    Fields: ['ArtifactID', 'VersionNumber'],
                    OrderBy: 'VersionNumber DESC',
                    IgnoreMaxRows: true,
                    ResultType: 'simple',
                })),
                provider.CurrentUser,
            );
            for (const result of results) {
                if (result.Success) addLatestVersions(latest, result.Results ?? []);
                else LogError(`Dashboard tab: could not read the artifact versions: ${result.ErrorMessage || 'no reason given'}`);
            }
        } catch (error) {
            LogError(`Dashboard tab: could not read the artifact versions: ${errorMessage(error)}`);
        }
        return latest;
    }

    // ========================================
    // Requests from the Agent
    // ========================================

    /**
     * Opens the confirm dialog for an agent's request and settles with the user's answer: true once the
     * confirmed action is done, false when the user cancels. Rejects when no Config dashboard is open,
     * when another confirmation is open, when the confirmed action fails, and when no answer comes
     * within AGENT_CONFIRM_TIMEOUT_MS; the dialog closes first.
     */
    private askAgentConfirm(kind: AgentConfirmKind, detail: AgentConfirmDetail): Promise<boolean> {
        const dashboard = this.ConfigDashboard;
        if (!dashboard) return Promise.reject(new Error(NO_CONFIG_DASHBOARD));
        if (this.agentConfirmRequest) {
            return Promise.reject(new Error('Another confirmation is already open. Wait for the user to answer it, then try again.'));
        }
        return new Promise<boolean>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.abortAgentConfirm(AGENT_CONFIRM_TIMED_OUT);
                SafeDetectChanges(this.cdr);
            }, AGENT_CONFIRM_TIMEOUT_MS);
            this.agentConfirmRequest = {
                answer: confirmed => {
                    clearTimeout(timer);
                    if (!confirmed) {
                        resolve(false);
                        return;
                    }
                    this.performAgentRequest(kind, detail).then(() => resolve(true), reject);
                },
                abort: reason => {
                    clearTimeout(timer);
                    reject(reason);
                },
            };
            this.AgentConfirm = { Kind: kind, ...agentConfirmText(kind, dashboard.Name, detail) };
            SafeDetectChanges(this.cdr);
        });
    }

    /** Takes the user's answer to the agent's confirm dialog. Does nothing when no dialog is open. */
    public OnAgentConfirm(confirmed: boolean): void {
        const request = this.closeAgentConfirm();
        SafeDetectChanges(this.cdr);
        request?.answer(confirmed);
    }

    /** Closes the agent's confirm dialog, if one is open, and fails its request with `reason`. */
    private abortAgentConfirm(reason: string): void {
        this.closeAgentConfirm()?.abort(new Error(reason));
    }

    /** Closes the agent's confirm dialog and returns its request, or null when none is open. */
    private closeAgentConfirm(): AgentConfirmRequest | null {
        const request = this.agentConfirmRequest;
        this.agentConfirmRequest = null;
        this.AgentConfirm = null;
        return request;
    }

    /** Does what the user confirmed, as the editor's Save and the Add to menu do it. Rejects when it did not take effect. */
    private async performAgentRequest(kind: AgentConfirmKind, detail: AgentConfirmDetail): Promise<void> {
        switch (kind) {
            case 'save':
                return this.saveForAgent(detail);
            case 'pin':
                return this.pinForAgent();
            default:
                throw new Error(`The tab cannot do the request "${String(kind)}".`);
        }
    }

    /**
     * Saves the dashboard through the editor, as its Save does, with the new name and description the
     * agent gave. Rejects with the reason the save did not happen. While a Save runs the editor refuses
     * at once and leaves its name and description fields as they are, because that Save reads them.
     */
    private async saveForAgent(detail: AgentConfirmDetail): Promise<void> {
        const editor = this.editor;
        const failure = editor ? await editor.Save({ Name: detail.name, Description: detail.description }) : NO_CONFIG_DASHBOARD;
        if (failure) throw new Error(failure);
    }

    /** Pins the dashboard to Home as the Add to menu does. Rejects when it is not pinned afterwards. */
    private async pinForAgent(): Promise<void> {
        await this.PinToHome();
        if (!this.IsPinnedToHome) throw new Error(`Could not pin "${this.ConfigDashboard?.Name ?? 'the dashboard'}" to Home.`);
    }

    /** @deprecated Use {@link OnShareDialogResult}. */
    public onShareDialogResult(result: ShareDialogResult): void {
      return this.OnShareDialogResult(result);
    }

    /**
     * Load the appropriate dashboard component based on dashboard type
     * Routes between code-based dashboards (registered classes) and config-based dashboards
     */
    private async loadDashboard(): Promise<void> {
        // Clear any previous error state
        this.clearError();

        const data = this.Data;

        if (!data?.ResourceRecordID) {
            this.NotifyLoadStarted();
            this.NotifyLoadComplete();
            return;
        }

        this.NotifyLoadStarted();

        try {
            // Check if this is a special dashboard type (not a database record)
            const config = data.Configuration || {};

            if (this.isDataExplorer(data)) {
                // Special case: Data Explorer dashboard with optional entity filter
                await this.loadDataExplorer(
                    config['entityFilter'],
                    config['appName'] as string | undefined,
                    config['appIcon'] as string | undefined
                );
                return;
            }

            await DashboardEngine.Instance.Config(false); // make sure it is configured, if already configured does nothing
            const dashboard = DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, data.ResourceRecordID));
            if (!dashboard) {
                throw new Error(`Dashboard with ID ${data.ResourceRecordID} not found.`);
            }

            void this.recentAccess.LogAccess('MJ: Dashboards', dashboard.ID, 'dashboard');

            // Determine which dashboard component to load based on dashboard type
            if (dashboard.Type === 'Code') {
                // CODE-BASED DASHBOARD: Use registered class via DriverClass
                await this.loadCodeBasedDashboard(dashboard);
            } else {
                // CONFIG-BASED DASHBOARD: the shared dashboard editor shows it. Its studio tools
                // search views and queries, so their engines start to load now; the dashboard does not wait.
                void this.preloadSourceEngines();
                this.showConfigDashboard(dashboard);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.setError('The dashboard could not be loaded. This may be due to a missing component or configuration issue.', error);
            this.NotifyLoadComplete();
        }
    }

    /**
     * Load the Data Explorer dashboard component with optional entity filter and context info
     * @param entityFilter Optional filter to constrain which entities are shown
     * @param contextName Optional name to display in the header (e.g., "CRM", "Association Demo")
     * @param contextIcon Optional Font Awesome icon class for the header
     */
    private async loadDataExplorer(
        entityFilter?: DataExplorerFilter,
        contextName?: string,
        contextIcon?: string
    ): Promise<void> {
        try {
            // Lazy-load the Data Explorer component to keep it out of the initial bundle
            const { DataExplorerDashboardComponent } = await import('@memberjunction/ng-dashboards/data-explorer-dashboards.module');
            this.ContainerElement.nativeElement.innerHTML = '';
            const componentRef = this.viewContainer.createComponent(DataExplorerDashboardComponent);
            this.componentRef = componentRef;
            const instance = componentRef.instance;

            // Scope the child's query-param reads/writes to THIS tab. A dashboard we instantiate
            // ourselves has no ResourceData and therefore no tab id of its own; without this it
            // cannot update the URL at all (BaseResourceComponent refuses tab-less writes rather
            // than corrupting whichever tab the user is viewing). Set before any await below —
            // Angular can run the child's ngOnInit, which binds its param subscription, while we
            // are suspended.
            instance.ParentTabId = this.getTabId();

            // Set the entity filter - ngOnInit will use this when it runs
            if (entityFilter) {
                instance.entityFilter = entityFilter;
            }

            // Set context name and icon for customized header display
            if (contextName) {
                instance.contextName = contextName;
            }
            if (contextIcon) {
                instance.contextIcon = contextIcon;
            }

            // Manually append the component's native element inside the div
            const nativeElement = (componentRef.hostView as any).rootNodes[0];
            nativeElement.style.width = '100%';
            nativeElement.style.height = '100%';
            this.ContainerElement.nativeElement.appendChild(nativeElement);

            // Handle open entity record events
            instance.OpenEntityRecord.subscribe((eventData: { EntityName: string; RecordPKey: CompositeKey }) => {
                if (eventData && eventData.EntityName && eventData.RecordPKey) {
                    this.navigationService.OpenEntityRecord(eventData.EntityName, eventData.RecordPKey);
                }
            });

            // Setup LoadCompleteEvent to know when the dashboard is ready
            instance.LoadCompleteEvent = () => {
                this.NotifyLoadComplete();
            };

            // Surface the dashboard's own load failures — but only for the INITIAL load. Wrap the
            // completion hook to learn when the first load has settled, so a later Refresh() that
            // fails does NOT replace an already-rendered Data Explorer with a sticky error card.
            let initialLoadSettled = false;
            const onComplete = instance.LoadCompleteEvent;
            instance.LoadCompleteEvent = () => { initialLoadSettled = true; onComplete?.(); };
            instance.Error.subscribe((err: Error) => {
                if (initialLoadSettled) return; // post-mount refresh failure — already logged by BaseDashboard.runGuardedLoad
                this.setError('The Data Explorer could not be loaded.', err);
                this.cdr.markForCheck();
            });

            // Initialize dashboard (no database config needed for DataExplorer)
            const config: DashboardConfig = {
                dashboard: null as unknown as MJDashboardEntity, // No database record
                userState: {}
            };
            instance.Config = config;
            instance.Refresh();

            // Trigger change detection to ensure the component updates
            componentRef.changeDetectorRef.detectChanges();
        } catch (error) {
            console.error('Error loading Data Explorer:', error);
            this.setError('The Data Explorer could not be loaded.', error);
            this.NotifyLoadComplete();
        }
    }

    /**
     * Load a code-based dashboard by looking up the registered class
     */
    private async loadCodeBasedDashboard(dashboard: MJDashboardEntity): Promise<void> {
        try {
            if (!dashboard.DriverClass) {
                throw new Error(`Dashboard '${dashboard.Name}' is marked as Code type but has no DriverClass specified`);
            }

            // Look up the registered class using the DriverClass name (with lazy loading fallback via ClassFactory)
            const classReg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
                BaseDashboard,
                dashboard.DriverClass
            );

            if (!classReg?.SubClass) {
                throw new Error(`Dashboard class '${dashboard.DriverClass}' is not registered. Please check the class registration.`);
            }

            // Create the component instance
            this.ContainerElement.nativeElement.innerHTML = '';
            this.componentRef = this.viewContainer.createComponent<BaseDashboard>(classReg.SubClass);
            const instance = this.componentRef.instance as BaseDashboard;

            // Scope the child's query-param reads/writes to THIS tab. Code dashboards resolved via
            // ClassFactory (every Open App dashboard, MCPDashboard, DataExplorer) get no
            // ResourceData and so have no tab id of their own; without this their UpdateQueryParams
            // calls are refused (and previously — worse — landed in whatever tab the user happened
            // to be looking at). Set before the awaits below: Angular can run the child's ngOnInit,
            // which binds its param subscription, while we are suspended.
            instance.ParentTabId = this.getTabId();

            // Setup LoadCompleteEvent() to know when the dashboard is ready
            instance.LoadCompleteEvent = () => {
                this.NotifyLoadComplete();
            };

            // Surface the dashboard's own load failures in the host's error card — but only for the
            // INITIAL load. BaseDashboard guarantees the loading screen is released even when
            // initDashboard()/loadData() throws (it emits Error, then NotifyLoadComplete in a
            // finally). Wrap the completion hook to learn when the first load has settled, so a later
            // Refresh() failure keeps the rendered dashboard instead of blanking it to a sticky error
            // card. Wired BEFORE the first await below, so an Error during the instance's own
            // ngOnInit isn't missed.
            let initialLoadSettled = false;
            const onComplete = instance.LoadCompleteEvent;
            instance.LoadCompleteEvent = () => { initialLoadSettled = true; onComplete?.(); };
            instance.Error.subscribe((err: Error) => {
                if (initialLoadSettled) return; // post-mount refresh failure — already logged by BaseDashboard.runGuardedLoad
                this.setError(`The dashboard "${dashboard.Name}" could not be loaded.`, err);
                this.cdr.markForCheck();
            });

            // Initialize with dashboard data
            const userStateEntity = await this.loadDashboardUserState(dashboard.ID);
            const config: DashboardConfig = {
                dashboard,
                userState: userStateEntity.UserState ? SafeJSONParse(userStateEntity.UserState) : {}
            };

            instance.Config = config;

            // Manually append the component's native element inside the div
            const nativeElement = (this.componentRef.hostView as any).rootNodes[0];
            nativeElement.style.width = '100%';
            nativeElement.style.height = '100%';
            this.ContainerElement.nativeElement.appendChild(nativeElement);

            // handle open entity record events in MJ Explorer with routing
            instance.OpenEntityRecord.subscribe((data: { EntityName: string; RecordPKey: CompositeKey }) => {
                // check to see if the data has entityname/pkey
                if (data && data.EntityName && data.RecordPKey) {
                    // Use NavigationService to open entity record in new tab
                    this.navigationService.OpenEntityRecord(data.EntityName, data.RecordPKey);
                } else {
                    console.warn('DashboardResource - invalid data, missing EntityName or RecordPKey:', data);
                }
            });

            instance.UserStateChanged.subscribe(async (userState: any) => {
                if (!userState) {
                    // if the user state is null, we need to remove it from the user state
                    userState = {};
                }
                // save the user state to the dashboard user state entity
                userStateEntity.UserState = JSON.stringify(userState);
                if (!await userStateEntity.Save()) {
                    LogError('Error saving user state', null, userStateEntity.LatestResult?.CompleteMessage);
                }
            });

            instance.Refresh();
        } catch (error) {
            console.error('Error loading code-based dashboard:', error);
            this.setError(`The dashboard "${dashboard.Name}" could not be loaded. The dashboard class may not be registered or may have failed to initialize.`, error);
            this.NotifyLoadComplete();
        }
    }

    protected async loadDashboardUserState(dashboardId: string): Promise<MJDashboardUserStateEntity> {
        // handle user state changes for the dashboard
        const md = this.ProviderToUse;
        const stateResult = DashboardEngine.Instance.DashboardUserStates.filter(dus => UUIDsEqual(dus.DashboardID, dashboardId) && UUIDsEqual(dus.UserID, md.CurrentUser.ID));
        let stateObject: MJDashboardUserStateEntity;
        if (stateResult && stateResult.length > 0) {
            stateObject = stateResult[0];
        }
        else {
            stateObject = await md.GetEntityObject<MJDashboardUserStateEntity>('MJ: Dashboard User States');
            stateObject.DashboardID = dashboardId;
            stateObject.UserID = md.CurrentUser.ID;
            // don't save becuase we don't care about the state until something changes
        }
        return stateObject;
    }

    /**
     * Handle navigation requests from a part of the dashboard (the editor passes them on)
     */
    private handleNavigationRequest(event: DashboardNavRequestEvent): void {
        const request = event.request;

        switch (request.type) {
            case 'OpenEntityRecord': {
                const entityRequest = request as { type: 'OpenEntityRecord'; entityName: string; recordId: string };
                // `recordId` is documented as URL-segment format (see OpenEntityRecordNavRequest in
                // @memberjunction/ng-dashboard-viewer). E.g. a single-PK record is `"ID|11055"`; a
                // composite-PK record is `"Field1|Value1||Field2|Value2"`. Senders in
                // dashboard-viewer (artifact-part, view-part) intentionally call
                // `compositeKey.ToURLSegment()` to produce this shape.
                //
                // Wrapping that string verbatim into `{ FieldName: 'ID', Value: <segment> }` makes
                // ToURLSegment serialize it a second time as `ID|<segment>` and produces a
                // malformed `Field|Field|Value` URL the host parser silently mis-reads (manifesting
                // downstream as `BaseEntity.Load(... Key: ID=ID)` and `Primary Key value is not a
                // valid number`). Parse the segment with `FromURLSegment` against the entity's PK
                // metadata instead, so single-PK and composite-PK both round-trip correctly (it also
                // owns the last-resort `ID` fallback for an entity name metadata can't resolve).
                const md = this.ProviderToUse;
                const pkey = CompositeKey.FromURLSegment(md.EntityByName(entityRequest.entityName), entityRequest.recordId);
                this.navigationService.OpenEntityRecord(entityRequest.entityName, pkey);
                break;
            }
            case 'OpenDashboard': {
                const dashRequest = request as { type: 'OpenDashboard'; dashboardId: string };
                // Load dashboard name from engine cache
                const targetDashboard = DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, dashRequest.dashboardId));
                const name = targetDashboard?.Name || 'Dashboard';
                this.navigationService.OpenDashboard(dashRequest.dashboardId, name);
                break;
            }
            case 'OpenQuery': {
                const queryRequest = request as { type: 'OpenQuery'; queryId: string };
                this.navigationService.OpenQuery(queryRequest.queryId, 'Query');
                break;
            }
            default:
                console.warn('Unhandled navigation request type:', request.type);
        }
    }

    /**
     * The tab title: the dashboard's name from the DashboardEngine cache, else its record name from
     * the server, else the given name. A Data Explorer tab keeps the name of the app it belongs to.
     */
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (this.isDataExplorer(data)) {
            const config: Record<string, unknown> = data.Configuration ?? {};
            const appName = typeof config['appName'] === 'string' ? config['appName'] : '';
            return data.Name || appName || 'Data Explorer';
        }
        const dashboardId = typeof data.ResourceRecordID === 'string' ? data.ResourceRecordID : '';
        const name = dashboardId ? (this.cachedDashboardName(dashboardId) ?? await this.loadDashboardName(dashboardId)) : null;
        return name || data.Name || 'Dashboard';
    }

    /** True for the Data Explorer, which this wrapper hosts but which is not a dashboard record. */
    private isDataExplorer(data: ResourceData): boolean {
        const config: Record<string, unknown> = data.Configuration ?? {};
        return config['dashboardType'] === 'DataExplorer' || data.ResourceRecordID === 'DataExplorer';
    }

    /** The dashboard's name from the DashboardEngine cache, or null when the cache does not have it. */
    private cachedDashboardName(dashboardId: string): string | null {
        try {
            return DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, dashboardId))?.Name || null;
        } catch {
            return null; // the user cannot read the dashboards cache
        }
    }

    /** The dashboard's record name from the server, or null when it cannot be read. */
    private async loadDashboardName(dashboardId: string): Promise<string | null> {
        try {
            return (await this.ProviderToUse.GetEntityRecordName('MJ: Dashboards', CompositeKey.FromID(dashboardId))) || null;
        } catch {
            return null;
        }
    }

    /**
     * Get the icon class for dashboard resources
     */
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-table-columns';
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** The title, question and confirm button text of the dialog that asks the user to do what the agent requests. */
function agentConfirmText(kind: AgentConfirmKind, dashboardName: string, detail: AgentConfirmDetail): Omit<AgentConfirmDialog, 'Kind'> {
    const name = `"${dashboardName}"`;
    switch (kind) {
        case 'save': {
            const rename = detail.name ? ` Its new name will be "${detail.name}".` : '';
            const describe = detail.description ? ` Its new description will be "${detail.description}".` : '';
            return { Title: 'Save dashboard?', Message: `The assistant asks to save ${name}.${rename}${describe}`, ConfirmText: 'Save' };
        }
        case 'pin':
            return { Title: 'Pin to Home?', Message: `The assistant asks to pin ${name} to your Home app.`, ConfirmText: 'Pin' };
    }
}

/** The user's own views and the shared views the user may see. None when the user cannot read views. */
function viewSources(): ReturnType<SourceSearchDeps['ListViews']> {
    const engine = UserViewEngine.Instance;
    if (engine.IsPermissionConstrained) return [];
    const shared = engine.GetSharedViews().filter(view => view.UserCanView);
    return [...engine.GetViewsForCurrentUser(), ...shared].map(view => ({
        ID: view.ID,
        Name: view.Name,
        Description: view.Description,
        Entity: view.Entity,
        EntityID: view.EntityID,
    }));
}

/** The queries the user can run. None when the user cannot read queries. */
function querySources(user: UserInfo): ReturnType<SourceSearchDeps['ListQueries']> {
    const engine = QueryEngine.Instance;
    if (engine.IsPermissionConstrained) return [];
    return engine.Queries.filter(query => query.UserCanRun(user).canRun).map(query => ({
        ID: query.ID,
        Name: query.Name,
        Description: query.Description,
        Category: query.Category,
    }));
}

/** The entities the user can read. */
function entitySources(provider: IMetadataProvider): ReturnType<SourceSearchDeps['ListEntities']> {
    const user = provider.CurrentUser;
    return provider.Entities.filter(entity => entity.GetUserPermisions(user).CanRead).map(entity => ({
        ID: entity.ID,
        Name: entity.Name,
        DisplayName: entity.DisplayName,
        Description: entity.Description,
    }));
}

/**
 * The filter clause that keeps the artifacts whose name or description, in lower case, matches the query
 * as a LIKE pattern (see likeNarrowingPattern), or '' when the query is blank. The clause only narrows
 * the list: RankByQuery makes the exact match in the browser.
 */
function artifactQueryFilter(query: string): string {
    const pattern = likeNarrowingPattern(query);
    return pattern ? ` AND (LOWER(Name) LIKE '%${pattern}%' OR LOWER(Description) LIKE '%${pattern}%')` : '';
}

/**
 * The query without its outer spaces as a lower-case LIKE pattern that matches the query, and can match
 * more, in the same way on SQL Server and PostgreSQL. It needs no ESCAPE clause, which the server refuses
 * in a client's filter. Each quote, backslash and LIKE wildcard (`%`, `_`, `[`, `]`) becomes `_`, which
 * matches any one character. Each parenthesis becomes `_` too: the PostgreSQL provider rewrites date
 * functions such as `GETDATE()` in the whole filter, string literals included. Each other character that is
 * not ASCII becomes `_`, so the literal needs no `N` prefix, with two exceptions that become `%` (see
 * nonAsciiWildcard). The text is put in lower case last, when it holds only ASCII.
 */
function likeNarrowingPattern(query: string): string {
    const ascii = query
        .trim()
        .replace(/[\\%_[\]'()]/g, '_')
        .replace(/[\u0080-\u{10FFFF}]/gu, char => nonAsciiWildcard(char));
    return EscapeSQLString(ascii.toLowerCase());
}

/**
 * The LIKE wildcard for a character that is not ASCII: `_`, which matches one character, or `%` where one
 * character can be two on some database. SQL Server counts a character outside the BMP as two characters and
 * PostgreSQL as one. `İ` (U+0130) is one character, but ICU collations put it in lower case as `i` and a
 * combining dot.
 */
function nonAsciiWildcard(char: string): '%' | '_' {
    return char.length > 1 || char === '\u0130' ? '%' : '_';
}

/** Records in `latest` the highest version number of each artifact in `rows`, by normalized artifact ID. */
function addLatestVersions(latest: Map<string, number>, rows: readonly ArtifactVersionRow[]): void {
    for (const row of rows) {
        const key = NormalizeUUID(row.ArtifactID);
        latest.set(key, Math.max(latest.get(key) ?? 0, row.VersionNumber));
    }
}

/** The items in consecutive groups of at most `size`. */
function chunked<T>(items: readonly T[], size: number): T[][] {
    const groups: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        groups.push(items.slice(start, start + size));
    }
    return groups;
}
