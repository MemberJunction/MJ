/**
 * @fileoverview Public entry point for `@memberjunction/conversations-runtime`.
 *
 * Pure-TypeScript, framework-agnostic runtime for MemberJunction conversational AI
 * experiences. Consumable from browser (Angular widget, React, Vue, Node-side workers)
 * or server (Node tests, CLI tools).
 *
 * @module @memberjunction/conversations-runtime
 */

// Top-level runtime singleton
export { ConversationsRuntime } from './ConversationsRuntime';

// Sub-components and their public types
export { MentionParser, type Mention, type MentionParseResult } from './mentions/MentionParser';
export {
    ConversationBridge,
    type ConversationSwitchEvent,
    type ConversationDeepLink,
} from './bridge/ConversationBridge';
export {
    DefaultAgentResolver,
    type DefaultAgentResolveOptions,
} from './default-agent/DefaultAgentResolver';
export {
    SessionsObserver,
    type SessionLifecycleEvent,
    type SessionChannelState,
} from './sessions/SessionsObserver';
export {
    ConversationStreaming,
    type CompletionEvent,
    type MessageProgressUpdate,
    type MessageProgressMetadata,
    type MessageProgressCallback,
    type StreamingConnectionStatus,
} from './streaming/ConversationStreaming';
export {
    ConversationAgentRunner,
    type ProcessMessageInput,
} from './agent-runner/ConversationAgentRunner';

// Adapter interfaces + defaults
export {
    type INotificationAdapter,
    type NotificationLevel,
    ConsoleNotificationAdapter,
} from './adapters/INotificationAdapter';
export {
    type IActiveTaskTracker,
    NoOpActiveTaskTracker,
} from './adapters/IActiveTaskTracker';

// Context interface — exported so hosts implementing custom runtime
// composition can use it. The runtime itself implements it.
export type { IConversationsRuntimeContext } from './context/IConversationsRuntimeContext';

// Re-export `ClientToolRegistry` from `@memberjunction/ai-agent-client` so consumers
// can use the runtime's tool layer (`runtime.Tools`) without importing a second package
// just to know the type. The class itself is owned by `ai-agent-client` — we are NOT
// reimplementing it, just exposing the established surface here.
export {
    ClientToolRegistry,
    type ClientToolDefinition,
    type ClientToolHandler,
} from '@memberjunction/ai-agent-client';
