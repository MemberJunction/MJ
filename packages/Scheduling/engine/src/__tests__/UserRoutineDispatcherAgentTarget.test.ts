/**
 * An Agent-target routine's run: what the user sees afterwards.
 *
 * The dispatcher hands the routine's StartingPayload (plus `_wakeContext`) to the agent, and an
 * agent that has nothing to add returns that payload unchanged. Two things then leaked wake state
 * to the user: the run's ResultSummary (and so the notification body) was the payload JSON, and
 * the conversation turn grew a "<Agent> Payload" artifact. The summary is now the agent's final
 * message, and an AgentWake run creates no payload artifact. The payload still drives OnChange
 * hashing through ResultContent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));

const { runInConversation, agentLoad } = vi.hoisted(() => ({
    runInConversation: vi.fn(),
    agentLoad: vi.fn(async () => true),
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    Metadata: class {
        Provider = {};
        GetEntityObject = vi.fn(async () => ({ ID: 'AGENT-1', Name: 'Chief of Staff', Load: agentLoad }));
    },
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgentInConversation = runInConversation; RunAgent = vi.fn(); },
}));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

interface Outcome { Success: boolean; ResultContent: string; Summary?: string | null }
type Driver = UserRoutineDispatcherDriver & {
    executeAgentTarget(routine: unknown, user: unknown): Promise<Outcome>;
    buildResultSummary(outcome: Outcome): string;
};

const WAKE_PAYLOAD = { workstreamKey: 'reminder-check', wakeReason: 'Remind Pat: check the DB', resumeState: {} };

function routine(overrides: Record<string, unknown> = {}) {
    return {
        ID: 'R-1', Name: 'Chief of Staff — Wake (reminder-check)', UserID: 'OWNER',
        RoutineType: 'AgentWake', ScheduleMode: 'OneShot', TargetType: 'Agent', TargetID: 'AGENT-1',
        InitialMessage: '[AgentWake:reminder-check] Resume', StartingPayload: JSON.stringify(WAKE_PAYLOAD),
        WakeConfiguration: null, WakeConfigurationObject: null, RequestedSkillIDs: null,
        ...overrides,
    };
}

function driver(): Driver {
    const d = new UserRoutineDispatcherDriver() as Driver;
    (d as unknown as { EnsureRoutineConversation: () => Promise<string> }).EnsureRoutineConversation = async () => 'CONV-1';
    return d;
}

beforeEach(() => {
    runInConversation.mockReset();
    runInConversation.mockResolvedValue({
        agentResult: {
            success: true,
            payload: WAKE_PAYLOAD,
            agentRun: { ID: 'RUN-A', Message: 'Reminder: check the DB.', ErrorMessage: null },
        },
    });
});

describe('UserRoutineDispatcherDriver — an Agent target run', () => {
    it('summarizes the run with the agent\'s final message, not the payload JSON', async () => {
        const d = driver();
        const outcome = await d.executeAgentTarget(routine(), { ID: 'OWNER' });

        expect(outcome.Summary).toBe('Reminder: check the DB.');
        expect(d.buildResultSummary(outcome)).toBe('Reminder: check the DB.');
        // The payload still feeds OnChange hashing.
        expect(JSON.parse(outcome.ResultContent)).toEqual(WAKE_PAYLOAD);
    });

    it('falls back to the payload when the agent left no final message', async () => {
        runInConversation.mockResolvedValueOnce({
            agentResult: { success: true, payload: { count: 3 }, agentRun: { ID: 'RUN-A', Message: null, ErrorMessage: null } },
        });
        const d = driver();
        const outcome = await d.executeAgentTarget(routine({ RoutineType: 'Scheduled' }), { ID: 'OWNER' });

        expect(d.buildResultSummary(outcome)).toBe('{"count":3}');
    });

    it('creates no payload artifact for an AgentWake run', async () => {
        await driver().executeAgentTarget(routine(), { ID: 'OWNER' });

        const options = runInConversation.mock.calls[0][1] as { createArtifacts?: boolean };
        expect(options.createArtifacts).toBe(false);
    });

    it('keeps the default artifact behavior for a scheduled agent routine', async () => {
        await driver().executeAgentTarget(routine({ RoutineType: 'Scheduled' }), { ID: 'OWNER' });

        const options = runInConversation.mock.calls[0][1] as { createArtifacts?: boolean };
        expect(options.createArtifacts).toBeUndefined();
    });
});
