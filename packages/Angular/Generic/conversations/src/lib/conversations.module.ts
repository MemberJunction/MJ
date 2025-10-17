import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Kendo UI modules
import { DialogModule, WindowModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { UploadsModule } from '@progress/kendo-angular-upload';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';

// MemberJunction modules
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';

// Markdown module
import { MarkdownModule } from 'ngx-markdown';

// Components
import { MessageItemComponent } from './components/message/message-item.component';
import { MessageListComponent } from './components/message/message-list.component';
import { MessageInputComponent } from './components/message/message-input.component';
import { SuggestedResponsesComponent } from './components/message/suggested-responses.component';
import { MentionDropdownComponent } from './components/mention/mention-dropdown.component';
import { ConversationWorkspaceComponent } from './components/workspace/conversation-workspace.component';
import { ConversationNavigationComponent } from './components/navigation/conversation-navigation.component';
import { ConversationSidebarComponent } from './components/sidebar/conversation-sidebar.component';
import { ConversationListComponent } from './components/conversation/conversation-list.component';
import { ConversationChatAreaComponent } from './components/conversation/conversation-chat-area.component';
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
import { CollectionShareModalComponent } from './components/collection/collection-share-modal.component';
import { UserPickerComponent } from './components/shared/user-picker.component';

// Directives
import { SearchShortcutDirective } from './directives/search-shortcut.directive';

// Export all components (excluding standalone components)
const COMPONENTS = [
  MessageItemComponent,
  MessageListComponent,
  MessageInputComponent,
  SuggestedResponsesComponent,
  MentionDropdownComponent,
  ConversationWorkspaceComponent,
  ConversationNavigationComponent,
  ConversationSidebarComponent,
  ConversationListComponent,
  ConversationChatAreaComponent,
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
  InputDialogComponent
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
    DialogModule,
    WindowModule,
    ButtonsModule,
    InputsModule,
    LayoutModule,
    IndicatorsModule,
    DropDownsModule,
    NotificationModule,
    UploadsModule,
    DateInputsModule,
    ContainerDirectivesModule,
    CodeEditorModule,
    ArtifactsModule,
    MarkdownModule.forRoot(),
    // Standalone components
    TasksFullViewComponent,
    CollectionShareModalComponent,
    UserPickerComponent
  ],
  exports: [
    ...COMPONENTS,
    SearchShortcutDirective,
    // Standalone components
    TasksFullViewComponent
  ]
})
export class ConversationsModule { }