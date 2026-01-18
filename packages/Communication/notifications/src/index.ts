/**
 * @memberjunction/notifications
 *
 * Unified notification engine for MemberJunction with multi-channel delivery support.
 * Extends BaseEngine for cached notification types and auto-refresh capabilities.
 *
 * Features:
 * - Cached notification types (loaded once, auto-refreshed on changes)
 * - User delivery preferences (In-App, Email, SMS per channel)
 * - Template-based email/SMS formatting
 * - Integration with CommunicationEngine for external delivery
 * - Automatic in-app notification creation
 *
 * @example
 * ```typescript
 * import { NotificationEngine } from '@memberjunction/notifications';
 *
 * // Initialize at server startup
 * await NotificationEngine.Instance.Config(false, contextUser);
 *
 * // Send a notification
 * const result = await NotificationEngine.Instance.SendNotification({
 *   userId: contextUser.ID,
 *   typeNameOrId: 'Agent Completion',
 *   title: 'Task Complete',
 *   message: 'Your AI agent has finished processing',
 *   templateData: {
 *     agentName: 'My Agent',
 *     conversationUrl: 'https://...'
 *   }
 * }, contextUser);
 * ```
 */

export { NotificationEngine } from './NotificationEngine';
export { SendNotificationParams, NotificationResult, DeliveryChannels } from './types';
