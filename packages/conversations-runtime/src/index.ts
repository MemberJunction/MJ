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

// Re-export `ClientToolRegistry` from `@memberjunction/ai-agent-client` so consumers
// can use the runtime's tool layer (`runtime.Tools`) without importing a second package
// just to know the type. The class itself is owned by `ai-agent-client` — we are NOT
// reimplementing it, just exposing the established surface here.
export {
    ClientToolRegistry,
    type ClientToolDefinition,
    type ClientToolHandler,
} from '@memberjunction/ai-agent-client';
