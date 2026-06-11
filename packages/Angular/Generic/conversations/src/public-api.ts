/*
 * Public API Surface of @memberjunction/ng-conversations
 */

// Module
export * from './lib/conversations.module';

// Models
export * from './lib/models/conversation-state.model';
export * from './lib/models/notification.model';
export * from './lib/models/lazy-artifact-info';
export * from './lib/models/navigation-request.model';

// Services - State
export * from './lib/services/data-cache.service';
export * from './lib/services/artifact-state.service';
export * from './lib/services/agent-state.service';
export * from './lib/services/conversation-agent.service';
export * from './lib/services/active-tasks.service';
export * from './lib/services/conversation-streaming.service';
export * from './lib/services/dialog.service';
export * from './lib/services/export.service';
export * from './lib/services/notification.service';
export * from './lib/services/toast.service';
export * from './lib/services/mention-parser.service';
export * from './lib/services/mention-autocomplete.service';
export * from './lib/services/collection-permission.service';
export * from './lib/services/artifact-permission.service';
export * from './lib/services/artifact-use-tracking.service';
export * from './lib/services/collection-state.service';
export * from './lib/services/conversation-attachment.service';
export * from './lib/services/ui-command-handler.service';
export * from './lib/services/conversation-bridge.service';
export * from './lib/services/voice-session.service';
export * from './lib/services/realtime-session-review.service';
export * from './lib/services/delegation-result-parser';

// Components
export * from './lib/components/workspace/conversation-workspace.component';
export * from './lib/components/navigation/conversation-navigation.component';
export * from './lib/components/sidebar/conversation-sidebar.component';
export * from './lib/components/conversation/conversation-list.component';
export * from './lib/components/conversation/conversation-chat-area.component';
export * from './lib/components/conversation/conversation-empty-state.component';
export * from './lib/components/message/message-item.component';
export * from './lib/components/message/message-list.component';
export * from './lib/components/message/message-input.component';
export * from './lib/components/message/message-input-box.component';
export * from './lib/components/message/conversation-message-rating.component';
export * from './lib/components/mention/mention-dropdown.component';
export * from './lib/components/mention/mention-editor.component';
export * from './lib/components/collection/collection-tree.component';
export * from './lib/components/collection/collection-view.component';
export * from './lib/components/collection/collections-full-view.component';
export * from './lib/components/collection/collection-artifact-card.component';
export * from './lib/components/collection/artifact-collection-picker-modal.component';
export * from './lib/components/collection/collection-share-modal.component';
export * from './lib/components/artifact/artifact-share-modal.component';
export * from './lib/components/project/project-selector.component';
export * from './lib/components/project/project-form-modal.component';
export * from './lib/components/task/tasks-full-view.component';
export * from './lib/components/tasks/task-widget.component';
export * from './lib/components/agent/agent-process-panel.component';
export * from './lib/components/agent/active-agent-indicator.component';
export * from './lib/components/active-tasks/active-tasks-panel.component';
export * from './lib/components/share/share-modal.component';
export * from './lib/components/notification/notification-badge.component';
export * from './lib/components/notification/activity-indicator.component';
export * from './lib/components/toast/toast.component';
export * from './lib/components/global-tasks/global-tasks-panel.component';
export * from './lib/components/attachment/image-viewer.component';
export * from './lib/components/overlay/chat-overlay.component';
export * from './lib/components/voice/voice-overlay.component';
export * from './lib/components/voice/voice-agent-picker.component';
// Real-time "call mode" overlay + its componentized parts
export * from './lib/components/realtime/realtime-session-overlay.component';
export * from './lib/components/realtime/realtime-session-state';
export * from './lib/components/realtime/realtime-agent-banner.component';
export * from './lib/components/realtime/realtime-session-thread.component';
export * from './lib/components/realtime/realtime-delegation-card.component';
export * from './lib/components/realtime/realtime-activity-rail.component';
export * from './lib/components/realtime/realtime-surface-tabs.component';
export * from './lib/components/realtime/realtime-surface-tabs.model';
export * from './lib/components/realtime/realtime-surface-panel-prefs';
export * from './lib/components/realtime/realtime-disclosure';
export * from './lib/components/realtime/realtime-composer.component';
export * from './lib/components/realtime/realtime-channel-strip.component';
// Conversation-timeline collapse of past realtime sessions (one card per session) + its pure grouping pass
export * from './lib/components/realtime/realtime-session-timeline-card.component';
export * from './lib/utils/realtime-session-timeline';
// Pluggable interactive-channel contract (registry-resolved client plugins) + pane host
export * from './lib/components/realtime/channels/base-realtime-channel-client';
export * from './lib/components/realtime/channels/realtime-channel-pane.component';
// Live whiteboard channel plugin + artifact viewer (thin consumers of the generic board).
// NOTE: the whiteboard itself (engine, tools, components, export builders) lives in
// @memberjunction/ng-whiteboard — import board types/components from there directly.
export * from './lib/components/realtime/whiteboard/whiteboard-channel';
export * from './lib/components/realtime/whiteboard/whiteboard-artifact-viewer.component';
