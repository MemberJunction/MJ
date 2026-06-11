/**
 * @fileoverview Notification adapter — boundary between the runtime and the host's
 * notification UI.
 *
 * The runtime needs to surface user-facing messages ("Sage agent not found",
 * "Agent execution failed", etc.) but must NOT depend on any specific UI library.
 * Consumers supply an adapter that bridges to whatever notification system the host
 * uses — Angular's `MJNotificationService`, a React toaster, a Node logger, etc.
 *
 * Default (when no adapter is registered): {@link ConsoleNotificationAdapter} logs
 * to the console. That keeps the runtime usable out of the box without requiring
 * every consumer to wire something up.
 *
 * @module @memberjunction/conversations-runtime
 */

/** Severity level for a notification — maps cleanly to most toaster systems. */
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

/**
 * Boundary the runtime calls to surface a user-facing message.
 *
 * Apps supply an implementation that bridges to their UI toaster (Angular's
 * `MJNotificationService.CreateSimpleNotification`, a custom React/Vue system,
 * server-side log sink, etc.) via {@link ConversationsRuntime.UseNotificationAdapter}.
 *
 * @example
 * ```typescript
 * // Angular host bootstrap
 * runtime.UseNotificationAdapter({
 *     Notify: (level, message, ttlMs) => {
 *         const style = level === 'warning' ? 'warn' : level;  // map names
 *         MJNotificationService.Instance.CreateSimpleNotification(message, style, ttlMs ?? 5000);
 *     },
 * });
 * ```
 */
export interface INotificationAdapter {
    /**
     * Surface a notification to the user.
     *
     * @param level Severity of the notification.
     * @param message Human-readable text to display.
     * @param ttlMs Optional duration in milliseconds. When omitted, the host decides
     *     (typically 5 seconds for non-error, longer for errors).
     */
    Notify(level: NotificationLevel, message: string, ttlMs?: number): void;
}

/**
 * Default {@link INotificationAdapter} that logs to the console. Used when no adapter
 * has been registered, so the runtime never silently swallows messages.
 *
 * - `info` and `success` → `console.log`
 * - `warning` → `console.warn`
 * - `error` → `console.error`
 *
 * Replace with a UI-backed adapter at host bootstrap for production use.
 */
export class ConsoleNotificationAdapter implements INotificationAdapter {
    public Notify(level: NotificationLevel, message: string, ttlMs?: number): void {
        const ttlNote = ttlMs ? ` (ttl=${ttlMs}ms)` : '';
        const prefixed = `[conversations-runtime] ${message}${ttlNote}`;
        switch (level) {
            case 'error':
                console.error(prefixed);
                return;
            case 'warning':
                console.warn(prefixed);
                return;
            case 'success':
            case 'info':
            default:
                console.log(prefixed);
                return;
        }
    }
}
