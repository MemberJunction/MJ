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
}));

import { ConversationsRuntime } from '../ConversationsRuntime';
import { MentionParser } from '../mentions/MentionParser';
import { ConversationBridge } from '../bridge/ConversationBridge';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';
import { SessionsObserver } from '../sessions/SessionsObserver';

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
});
