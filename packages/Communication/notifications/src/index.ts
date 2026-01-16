/**
 * @memberjunction/notifications
 *
 * Unified notification system for MemberJunction with multi-channel delivery support.
 *
 * Features:
 * - Notification type categorization
 * - User delivery preferences (In-App, Email, SMS, All, None)
 * - Template-based email/SMS formatting
 * - Integration with CommunicationEngine for external delivery
 * - Automatic in-app notification creation
 *
 * @example
 * ```typescript
 * import { NotificationService } from '@memberjunction/notifications';
 *
 * const result = await NotificationService.Instance.SendNotification({
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

export { NotificationService } from './NotificationService';
export {
    SendNotificationParams,
    NotificationResult,
    DeliveryMethod
} from './types';
