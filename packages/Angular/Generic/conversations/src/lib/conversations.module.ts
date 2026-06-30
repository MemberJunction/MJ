import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';

// MJ UI Components
import { MJButtonDirective, MJDatepickerComponent, MJDialogComponent, MJDialogActionsComponent, MJEmptyStateComponent, MJAlertComponent } from '@memberjunction/ng-ui-components';

// MemberJunction modules
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { TestingModule } from '@memberjunction/ng-testing';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Markdown module
import { MarkdownModule } from '@memberjunction/ng-markdown';

// Resource permissions (generic share dialog)
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';

// Components
import { MessageItemComponent } from './components/message/message-item.component';
import { MessageListComponent } from './components/message/message-list.component';
import { MessageInputComponent } from './components/message/message-input.component';
import { MessageInputBoxComponent } from './components/message/message-input-box.component';
import { DynamicFormsModule } from '@memberjunction/ng-forms';
import { ActionableCommandsComponent } from './components/message/actionable-commands.component';
import { MentionDropdownComponent } from './components/mention/mention-dropdown.component';
import { MentionEditorComponent } from './components/mention/mention-editor.component';
import { ConversationMessageRatingComponent } from './components/message/conversation-message-rating.component';
import { ConversationWorkspaceComponent } from './components/workspace/conversation-workspace.component';
import { ConversationNavigationComponent } from './components/navigation/conversation-navigation.component';
import { ConversationSidebarComponent } from './components/sidebar/conversation-sidebar.component';
import { ConversationListComponent } from './components/conversation/conversation-list.component';
import { ConversationChatAreaComponent } from './components/conversation/conversation-chat-area.component';
import { ConversationEmptyStateComponent } from './components/conversation/conversation-empty-state.component';
import { ConversationAgentPickerComponent } from './components/conversation/conversation-agent-picker.component';
import { ConversationModePickerComponent } from './components/conversation/conversation-mode-picker.component';
import { ThreadPanelComponent } from './components/thread/thread-panel.component';
import { CollectionTreeComponent } from './components/collection/collection-tree.component';
import { CollectionViewComponent } from './components/collection/collection-view.component';
import { CollectionArtifactCardComponent } from './components/collection/collection-artifact-card.component';
import { LibraryFullViewComponent } from './components/library/library-full-view.component';
import { CollectionFormModalComponent } from './components/collection/collection-form-modal.component';
import { ArtifactCreateModalComponent } from './components/collection/artifact-create-modal.component';
import { CollectionsFullViewComponent } from './components/collection/collections-full-view.component';
import { ProjectSelectorComponent } from './components/project/project-selector.component';
import { ProjectFormModalComponent } from './components/project/project-form-modal.component';
import { TasksFullViewComponent } from './components/task/tasks-full-view.component';
import { TasksDropdownComponent } from './components/tasks/tasks-dropdown.component';
import { TaskWidgetComponent } from './components/tasks/task-widget.component';
import { AgentProcessPanelComponent } from './components/agent/agent-process-panel.component';
import { ActiveAgentIndicatorComponent } from './components/agent/active-agent-indicator.component';
import { ActiveTasksPanelComponent } from './components/active-tasks/active-tasks-panel.component';
import { ShareModalComponent } from './components/share/share-modal.component';
import { MembersModalComponent } from './components/members/members-modal.component';
import { ExportModalComponent } from './components/export/export-modal.component';
import { SearchPanelComponent } from './components/search/search-panel.component';
import { NotificationBadgeComponent } from './components/notification/notification-badge.component';
import { ActivityIndicatorComponent } from './components/notification/activity-indicator.component';
import { ToastComponent } from './components/toast/toast.component';
import { InputDialogComponent } from './components/dialogs/input-dialog.component';
import { RatingDialogComponent } from './components/dialogs/rating-dialog.component';
import { CollectionShareModalComponent } from './components/collection/collection-share-modal.component';
import { UserPickerComponent } from './components/shared/user-picker.component';
import { ArtifactCollectionPickerModalComponent } from './components/collection/artifact-collection-picker-modal.component';
import { ArtifactShareModalComponent } from './components/artifact/artifact-share-modal.component';
import { GlobalTasksPanelComponent } from './components/global-tasks/global-tasks-panel.component';
import { ImageViewerComponent } from './components/attachment/image-viewer.component';
import { PinnedMessagesPanelComponent } from './components/conversation/pinned-messages-panel.component';
import { ChatAgentsOverlayComponent } from './components/overlay/chat-overlay.component';
import { RealtimeAgentPickerComponent } from './components/realtime/realtime-agent-picker.component';
import { RealtimeSessionOverlayComponent } from './components/realtime/realtime-session-overlay.component';
import { RealtimeWhiteboardHostComponent } from '@memberjunction/ng-whiteboard';
import { LoadRealtimeWhiteboardChannel } from './components/realtime/whiteboard/whiteboard-channel';
import { LoadWhiteboardArtifactViewer } from './components/realtime/whiteboard/whiteboard-artifact-viewer.component';
import { LoadRealtimeRemoteBrowserChannel } from './components/realtime/remote-browser/remote-browser-channel';
import { RemoteBrowserSurfaceComponent } from './components/realtime/remote-browser/remote-browser-surface.component';
import { LoadRealtimeMediaChannel } from './components/realtime/media/media-channel';
import { LoadClientContextChannel } from './components/realtime/channels/client-context-channel';
import { RealtimeMediaSurfaceComponent } from './components/realtime/media/realtime-media-surface.component';
import { RealtimeEvidencePlaybackComponent } from './components/realtime/evidence-playback/realtime-evidence-playback.component';

// Directives
import { SearchShortcutDirective } from './directives/search-shortcut.directive';

// PR 2c — Widget extension surface (standalone)
import { ChatSlotDirective } from './directives/chat-slot.directive';
import { MJChatEmptyStateDefaultComponent } from './components/slots/mj-chat-empty-state-default.component';
import { MJChatAgentPresenceDefaultComponent } from './components/slots/mj-chat-agent-presence-default.component';
import { MJChatHeaderDefaultComponent } from './components/slots/mj-chat-header-default.component';
import { MJChatMessageExtraDefaultComponent } from './components/slots/mj-chat-message-extra-default.component';
import { MJChatDemonstrationSurfaceDefaultComponent } from './components/slots/mj-chat-demonstration-surface-default.component';
import { MJChatMessageBubbleDefaultComponent } from './components/slots/mj-chat-message-bubble-default.component';

// Tree-shaking prevention for interactive-channel CLIENT PLUGINS: they are resolved
// dynamically through the MJ ClassFactory (keyed by the `MJ: AI Agent Channels` registry's
// ClientPluginClass), so these static calls are what keep their @RegisterClass side effects
// from being eliminated by the bundler. They live here (not in RealtimeSessionService) because
// channel plugins carry Angular surface components — the service stays component-free.
LoadRealtimeWhiteboardChannel();
// Remote Browser channel plugin — same registry-driven resolution (ClientPluginClass
// 'RealtimeRemoteBrowserChannel'); the static call defeats tree-shaking of its @RegisterClass.
LoadRealtimeRemoteBrowserChannel();
// Media channel plugin — same registry-driven resolution (ClientPluginClass
// 'RealtimeMediaChannel'); the static call defeats tree-shaking of its @RegisterClass.
LoadRealtimeMediaChannel();
LoadClientContextChannel();
// Whiteboard ARTIFACT VIEWER plugin — resolved by the artifact plugin host via the
// ClassFactory (keyed by the artifact type's DriverClass), same tree-shaking concern.
LoadWhiteboardArtifactViewer();

// Export all components (excluding standalone components)
const COMPONENTS = [
  MessageItemComponent,
  MessageListComponent,
  MessageInputComponent,
  MessageInputBoxComponent,
  ActionableCommandsComponent,
  MentionDropdownComponent,
  MentionEditorComponent,
  ConversationMessageRatingComponent,
  ConversationWorkspaceComponent,
  ConversationNavigationComponent,
  ConversationSidebarComponent,
  ConversationListComponent,
  ConversationChatAreaComponent,
  ConversationEmptyStateComponent,
  ConversationAgentPickerComponent,
  ConversationModePickerComponent,
  ThreadPanelComponent,
  CollectionTreeComponent,
  CollectionViewComponent,
  CollectionArtifactCardComponent,
  LibraryFullViewComponent,
  CollectionFormModalComponent,
  ArtifactCreateModalComponent,
  CollectionsFullViewComponent,
  ProjectSelectorComponent,
  ProjectFormModalComponent,
  // TasksFullViewComponent - now standalone, imported below
  TasksDropdownComponent,
  TaskWidgetComponent,
  AgentProcessPanelComponent,
  ActiveAgentIndicatorComponent,
  ActiveTasksPanelComponent,
  ShareModalComponent,
  MembersModalComponent,
  ExportModalComponent,
  SearchPanelComponent,
  NotificationBadgeComponent,
  ActivityIndicatorComponent,
  ToastComponent,
  InputDialogComponent,
  RatingDialogComponent,
  GlobalTasksPanelComponent,
  ImageViewerComponent,
  PinnedMessagesPanelComponent,
  ChatAgentsOverlayComponent
];

@NgModule({
  declarations: [
    ...COMPONENTS,
    SearchShortcutDirective
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    OverlayModule,
    MJButtonDirective,
    MJDatepickerComponent,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJEmptyStateComponent,
    MJAlertComponent,
    ContainerDirectivesModule,
    CodeEditorModule,
    ArtifactsModule,
    TestingModule,
    SharedGenericModule,
    MarkdownModule,
    DynamicFormsModule,
    ResourcePermissionsModule,
    // Standalone components
    TasksFullViewComponent,
    CollectionShareModalComponent,
    UserPickerComponent,
    ArtifactCollectionPickerModalComponent,
    ArtifactShareModalComponent,
    // PR 2c — Widget extension surface (standalone)
    ChatSlotDirective,
    MJChatEmptyStateDefaultComponent,
    MJChatAgentPresenceDefaultComponent,
    MJChatHeaderDefaultComponent,
    MJChatMessageExtraDefaultComponent,
    MJChatDemonstrationSurfaceDefaultComponent,
    MJChatMessageBubbleDefaultComponent,
    // Realtime / voice (PR #2787)
    RealtimeAgentPickerComponent,
    RealtimeSessionOverlayComponent,
    RealtimeWhiteboardHostComponent,
    RemoteBrowserSurfaceComponent,
    RealtimeMediaSurfaceComponent,
    RealtimeEvidencePlaybackComponent
  ],
  exports: [
    ...COMPONENTS,
    SearchShortcutDirective,
    // Standalone components
    TasksFullViewComponent,
    // PR 2c — Widget extension surface
    ChatSlotDirective,
    MJChatEmptyStateDefaultComponent,
    MJChatAgentPresenceDefaultComponent,
    MJChatHeaderDefaultComponent,
    MJChatMessageExtraDefaultComponent,
    MJChatDemonstrationSurfaceDefaultComponent,
    MJChatMessageBubbleDefaultComponent,
    // Realtime / voice (PR #2787)
    RealtimeAgentPickerComponent,
    RealtimeSessionOverlayComponent,
    RealtimeWhiteboardHostComponent,
    RemoteBrowserSurfaceComponent,
    RealtimeMediaSurfaceComponent,
    RealtimeEvidencePlaybackComponent
  ]
})
export class ConversationsModule { }