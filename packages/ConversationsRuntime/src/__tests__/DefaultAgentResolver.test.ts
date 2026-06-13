/**
 * @fileoverview Tests for the 3-step + code-const-fallback default-agent resolution chain.
 *
 * Mocks both `AIEngineBase` and `ApplicationSettingEngine` so we can drive each chain step
 * deterministically without a real database or metadata provider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const FALLBACK_AGENT_ID = 'sage-uuid-0000';
const APP_SCOPED_AGENT_ID = 'app-agent-uuid-1111';
const EXPLICIT_AGENT_ID = 'explicit-uuid-2222';

// vi.mock factories are hoisted ABOVE module-level `const` declarations, so anything the
// factories reference must be created via vi.hoisted(). That gives both the factory and the
// test bodies access to the same mutable state (agents array + settings spy).
const hoisted = vi.hoisted(() => {
    const FALLBACK_AGENT_ID_H = 'sage-uuid-0000';
    const APP_SCOPED_AGENT_ID_H = 'app-agent-uuid-1111';
    const EXPLICIT_AGENT_ID_H = 'explicit-uuid-2222';

    return {
        allAgents: [
            { ID: FALLBACK_AGENT_ID_H, Name: 'Sage' },
            { ID: APP_SCOPED_AGENT_ID_H, Name: 'AppScopedAgent' },
            { ID: EXPLICIT_AGENT_ID_H, Name: 'ExplicitAgent' },
        ] as Array<{ ID: string; Name: string }>,
        getSettingMock: vi.fn<[string, string?], string | undefined>(),
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Agents: hoisted.allAgents,
        },
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    ApplicationSettingEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            GetSetting: (name: string, applicationId?: string): string | undefined =>
                hoisted.getSettingMock(name, applicationId),
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string): boolean =>
        (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
}));

vi.mock('@memberjunction/core', () => ({}));

const { allAgents, getSettingMock } = hoisted;

import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';

describe('DefaultAgentResolver', () => {
    let resolver: DefaultAgentResolver;

    beforeEach(() => {
        resolver = new DefaultAgentResolver();
        getSettingMock.mockReset();
    });

    describe('Step 1 — explicit agent ID', () => {
        it('returns the explicit agent when it resolves to a known agent', async () => {
            // Even if a setting is configured, explicit should win
            getSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const agent = await resolver.resolve({
                explicitAgentId: EXPLICIT_AGENT_ID,
                applicationId: 'some-app',
            });

            expect(agent.ID).toBe(EXPLICIT_AGENT_ID);
            expect(agent.Name).toBe('ExplicitAgent');
            // We never needed to consult the settings engine
            expect(getSettingMock).not.toHaveBeenCalled();
        });

        it('falls through to settings if the explicit ID does not match any known agent', async () => {
            getSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const agent = await resolver.resolve({
                explicitAgentId: 'unknown-uuid',
                applicationId: 'some-app',
            });

            // Still got a result (the app-scoped setting)
            expect(agent.ID).toBe(APP_SCOPED_AGENT_ID);
        });
    });

    describe('Steps 2 + 3 — Application Setting (app-scoped, then global)', () => {
        it('uses the setting value when it resolves to a known agent', async () => {
            getSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const agent = await resolver.resolve({ applicationId: 'some-app' });

            expect(agent.ID).toBe(APP_SCOPED_AGENT_ID);
            expect(getSettingMock).toHaveBeenCalledWith(
                DefaultAgentResolver.SETTING_NAME,
                'some-app'
            );
        });

        it('forwards undefined applicationId to GetSetting when no app context is supplied', async () => {
            getSettingMock.mockReturnValue(FALLBACK_AGENT_ID);

            await resolver.resolve({});

            expect(getSettingMock).toHaveBeenCalledWith(
                DefaultAgentResolver.SETTING_NAME,
                undefined
            );
        });

        it('falls through to the code-const fallback if the setting value resolves to nothing', async () => {
            // Setting points at an agent ID that does not exist
            getSettingMock.mockReturnValue('stale-uuid-that-no-longer-matches');

            const agent = await resolver.resolve({ applicationId: 'some-app' });

            expect(agent.Name).toBe(DefaultAgentResolver.FALLBACK_AGENT_NAME);
            expect(agent.ID).toBe(FALLBACK_AGENT_ID);
        });
    });

    describe('Step 4 — code-const Sage fallback', () => {
        it('returns the Sage agent when no setting is configured', async () => {
            getSettingMock.mockReturnValue(undefined);

            const agent = await resolver.resolve({});

            expect(agent.Name).toBe('Sage');
        });
    });

    describe('Hard failure', () => {
        it('throws a descriptive error when even the fallback agent is missing', async () => {
            getSettingMock.mockReturnValue(undefined);
            // Drop Sage from the agents array for this test
            allAgents.splice(0, allAgents.length, { ID: 'other', Name: 'Other' });

            await expect(resolver.resolve({})).rejects.toThrow(
                /could not resolve a default conversation manager agent/
            );

            // Restore for subsequent tests
            allAgents.push(
                { ID: FALLBACK_AGENT_ID, Name: 'Sage' },
                { ID: APP_SCOPED_AGENT_ID, Name: 'AppScopedAgent' },
                { ID: EXPLICIT_AGENT_ID, Name: 'ExplicitAgent' }
            );
            allAgents.shift();
        });
    });

    describe('Constants', () => {
        it('exposes SETTING_NAME and FALLBACK_AGENT_NAME for consumer reference', () => {
            expect(DefaultAgentResolver.SETTING_NAME).toBe('Conversations.DefaultAgentID');
            expect(DefaultAgentResolver.FALLBACK_AGENT_NAME).toBe('Sage');
        });
    });
});
