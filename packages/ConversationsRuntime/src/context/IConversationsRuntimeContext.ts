/**
 * @fileoverview Shared context interface — what sub-components see of the runtime.
 *
 * Sub-components (`ConversationStreaming`, `ConversationAgentRunner`, etc.) need to
 * reach the currently-registered adapters at the moment they fire, NOT at the
 * moment they were constructed. The host may call
 * `runtime.UseNotificationAdapter(...)` after sub-components already exist.
 *
 * Rather than have each sub-component import `ConversationsRuntime` (which would
 * create a circular module import — runtime imports sub-component to construct it,
 * sub-component imports runtime to read adapters), we extract this narrow contract.
 * The runtime implements it; sub-components take it as a constructor parameter.
 *
 * Because the runtime is passed by reference and the methods are getters, every
 * sub-component call reads the *current* adapter — adapter swaps take effect
 * immediately without rebuilding sub-components.
 *
 * @module @memberjunction/conversations-runtime
 */

import { INotificationAdapter } from '../adapters/INotificationAdapter';
import { IActiveTaskTracker } from '../adapters/IActiveTaskTracker';

/** Read-only view of the runtime's adapter slots, as seen by sub-components. */
export interface IConversationsRuntimeContext {
    /** Currently registered notification adapter (or the console default). */
    readonly Notification: INotificationAdapter;

    /** Currently registered active-task tracker (or the no-op default). */
    readonly Tasks: IActiveTaskTracker;
}
