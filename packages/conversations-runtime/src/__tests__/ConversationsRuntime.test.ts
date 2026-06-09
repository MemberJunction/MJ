/**
 * @fileoverview Smoke tests for the ConversationsRuntime composition root.
 *
 * Asserts:
 * - Singleton semantics (BaseSingleton via Global Object Store).
 * - Sub-component getters return stable instances.
 * - Config delegates to the dependent engines.
 * - Dispose cleans up SessionsObserver without errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above module-level `const` declarations, so the spies they
// reference must be created via vi.hoisted(). That gives both the factory and the test
// bodies access to the same spy instances.
const hoisted = vi.hoisted(() => ({
    aiConfig: vi.fn().mockResolvedValue(undefined),
    settingsConfig: vi.fn().mockResolvedValue(undefined),
    conversationsConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: hoisted.aiConfig,
            Agents: [],
        },
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    ApplicationSettingEngine: {
        Instance: {
            Config: hoisted.settingsConfig,
            GetSetting: vi.fn().mockReturnValue(undefined),
        },
    },
    ConversationEngine: {
        Instance: {
            Config: hoisted.conversationsConfig,
        },
    },
}));

const { aiConfig, settingsConfig, conversationsConfig } = hoisted;

vi.mock('@memberjunction/ai-core-plus', () => ({}));

// Note: deliberately NOT mocking @memberjunction/global — BaseSingleton (used by BaseEngine,
// which our runtime extends) needs the real implementation. UUIDsEqual is pure and harmless
// in a node environment.

vi.mock('@memberjunction/ai-agent-client', () => ({
    ClientToolRegistry: class {
        Register() {}
    },
    AgentClientSession: class {
        public Provider: unknown = null;
        constructor(_toolRegistry?: unknown) {}
        GetRegisteredTools() {
            return [];
        }
        async RunAgentFromConversationDetail() {
            return { Success: true, Result: {} };
        }
    },
}));

// Streaming only touches GraphQLDataProvider inside `.initialize()`, which we never
// call in this test. But the import side-effect needs to resolve.
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: { Instance: { PushStatusUpdates: vi.fn() } },
}));

import { ConversationsRuntime } from '../ConversationsRuntime';
import { MentionParser } from '../mentions/MentionParser';
import { ConversationBridge } from '../bridge/ConversationBridge';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';
import { SessionsObserver } from '../sessions/SessionsObserver';
import { ConversationStreaming } from '../streaming/ConversationStreaming';
import { ConversationAgentRunner } from '../agent-runner/ConversationAgentRunner';
import {
    ConsoleNotificationAdapter,
    type INotificationAdapter,
} from '../adapters/INotificationAdapter';
import {
    NoOpActiveTaskTracker,
    type IActiveTaskTracker,
} from '../adapters/IActiveTaskTracker';

describe('ConversationsRuntime', () => {
    beforeEach(() => {
        aiConfig.mockClear();
        settingsConfig.mockClear();
        conversationsConfig.mockClear();
    });

    it('is a singleton — Instance returns the same object across calls', () => {
        const a = ConversationsRuntime.Instance;
        const b = ConversationsRuntime.Instance;
        expect(a).toBe(b);
    });

    it('exposes Mentions as a MentionParser', () => {
        expect(ConversationsRuntime.Instance.Mentions).toBeInstanceOf(MentionParser);
    });

    it('exposes Bridge as a ConversationBridge', () => {
        expect(ConversationsRuntime.Instance.Bridge).toBeInstanceOf(ConversationBridge);
    });

    it('exposes DefaultAgent as a DefaultAgentResolver', () => {
        expect(ConversationsRuntime.Instance.DefaultAgent).toBeInstanceOf(DefaultAgentResolver);
    });

    it('exposes Sessions as a SessionsObserver', () => {
        expect(ConversationsRuntime.Instance.Sessions).toBeInstanceOf(SessionsObserver);
    });

    it('exposes Tools (the ClientToolRegistry from ai-agent-client)', () => {
        expect(ConversationsRuntime.Instance.Tools).toBeDefined();
        // The mocked class has Register on it
        expect(typeof (ConversationsRuntime.Instance.Tools as unknown as { Register: unknown })
            .Register).toBe('function');
    });

    it('Sub-component getters are stable — repeated calls return the same instance', () => {
        const runtime = ConversationsRuntime.Instance;
        expect(runtime.Mentions).toBe(runtime.Mentions);
        expect(runtime.Bridge).toBe(runtime.Bridge);
        expect(runtime.DefaultAgent).toBe(runtime.DefaultAgent);
        expect(runtime.Sessions).toBe(runtime.Sessions);
        expect(runtime.Tools).toBe(runtime.Tools);
    });

    it('Config delegates to AIEngineBase, ApplicationSettingEngine, and ConversationEngine', async () => {
        await ConversationsRuntime.Instance.Config(false);
        expect(aiConfig).toHaveBeenCalledTimes(1);
        expect(settingsConfig).toHaveBeenCalledTimes(1);
        expect(conversationsConfig).toHaveBeenCalledTimes(1);
    });

    it('Config forwards forceRefresh, contextUser, and provider to dependent engines', async () => {
        const contextUser = { ID: 'u1' } as never;
        const provider = { kind: 'mock-provider' } as never;
        await ConversationsRuntime.Instance.Config(true, contextUser, provider);
        expect(aiConfig).toHaveBeenCalledWith(true, contextUser, provider);
        expect(settingsConfig).toHaveBeenCalledWith(true, contextUser, provider);
        expect(conversationsConfig).toHaveBeenCalledWith(true, contextUser, provider);
    });

    it('Dispose is safe to call', () => {
        expect(() => ConversationsRuntime.Instance.Dispose()).not.toThrow();
    });

    // ────────────────────────────────────────────────────────────────────
    // Adapter slots (added in PR 2a)
    // ────────────────────────────────────────────────────────────────────

    describe('adapter slots', () => {
        it('Notification defaults to a ConsoleNotificationAdapter', () => {
            expect(ConversationsRuntime.Instance.Notification).toBeInstanceOf(
                ConsoleNotificationAdapter
            );
        });

        it('Tasks defaults to a NoOpActiveTaskTracker', () => {
            expect(ConversationsRuntime.Instance.Tasks).toBeInstanceOf(NoOpActiveTaskTracker);
        });

        it('UseNotificationAdapter swaps the registered adapter', () => {
            const fake: INotificationAdapter = { Notify: () => undefined };
            ConversationsRuntime.Instance.UseNotificationAdapter(fake);
            expect(ConversationsRuntime.Instance.Notification).toBe(fake);

            // Restore default for other tests
            ConversationsRuntime.Instance.UseNotificationAdapter(new ConsoleNotificationAdapter());
        });

        it('UseActiveTaskTracker swaps the registered tracker', () => {
            const fake: IActiveTaskTracker = { RemoveByAgentRunId: () => false };
            ConversationsRuntime.Instance.UseActiveTaskTracker(fake);
            expect(ConversationsRuntime.Instance.Tasks).toBe(fake);

            ConversationsRuntime.Instance.UseActiveTaskTracker(new NoOpActiveTaskTracker());
        });

        it('Streaming and AgentRunner can be retrieved (lazy-constructed) and are stable', () => {
            const streaming = ConversationsRuntime.Instance.Streaming;
            const runner = ConversationsRuntime.Instance.AgentRunner;
            expect(streaming).toBeInstanceOf(ConversationStreaming);
            expect(runner).toBeInstanceOf(ConversationAgentRunner);
            expect(ConversationsRuntime.Instance.Streaming).toBe(streaming);
            expect(ConversationsRuntime.Instance.AgentRunner).toBe(runner);
        });
    });
});
