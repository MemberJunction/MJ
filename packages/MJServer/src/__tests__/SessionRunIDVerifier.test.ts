import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SessionRunIDVerifier } from '../agentSessions/SessionRunIDVerifier.js';

const SESSION_ID = 'd3d3d3d3-0000-4000-8000-000000000001';
const CO_RUN_ID = 'd3d3d3d3-0000-4000-8000-000000000002';
const PROMPT_RUN_ID = 'd3d3d3d3-0000-4000-8000-000000000003';
const STEP_ID = 'd3d3d3d3-0000-4000-8000-000000000004';
const PAUSED_RUN_ID = 'd3d3d3d3-0000-4000-8000-000000000005';
const USER = { ID: 'd3d3d3d3-0000-4000-8000-0000000000aa' } as unknown as UserInfo;

/** Rows each lookup returns, keyed by entity name. */
type Rows = Record<string, Array<Record<string, unknown>>>;

function makeProvider(rows: Rows, success = true): { provider: IMetadataProvider; runViews: ReturnType<typeof vi.fn> } {
    const runViews = vi.fn(async (paramsList: RunViewParams[]) =>
        paramsList.map((params) => ({
            Success: success,
            Results: success ? rows[params.EntityName ?? ''] ?? [] : [],
            ErrorMessage: success ? '' : 'lookup failed',
        })),
    );
    return { provider: { RunViews: runViews } as unknown as IMetadataProvider, runViews };
}

function issuedViews(runViews: ReturnType<typeof vi.fn>): RunViewParams[] {
    return runViews.mock.calls.flatMap(([paramsList]) => paramsList as RunViewParams[]);
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    UserCache.Instance.SetUsers([]);
});

describe('SessionRunIDVerifier.Verify', () => {
    it('keeps nothing, and runs no lookup, when no claim is a UUID', async () => {
        const { provider, runViews } = makeProvider({});

        const result = await new SessionRunIDVerifier().Verify(
            SESSION_ID,
            { CoAgentRunID: "x' OR '1'='1", PromptRunID: 'prompt-run-1', PendingFeedbackRunID: '' },
            USER,
            provider,
        );

        expect(result).toEqual({});
        expect(runViews).not.toHaveBeenCalled();
    });

    it('looks up the claimed runs within the session and keeps only the ones it finds', async () => {
        const { provider, runViews } = makeProvider({ 'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }] });

        const result = await new SessionRunIDVerifier().Verify(
            SESSION_ID,
            { CoAgentRunID: CO_RUN_ID, PendingFeedbackRunID: PAUSED_RUN_ID },
            USER,
            provider,
        );

        expect(result.CoAgentRunID).toBe(CO_RUN_ID);
        expect(result.PendingFeedbackRunID).toBeUndefined();
        const [runsView] = issuedViews(runViews);
        expect(runsView.EntityName).toBe('MJ: AI Agent Runs');
        expect(runsView.ExtraFilter).toBe(`AgentSessionID='${SESSION_ID}' AND ID IN ('${CO_RUN_ID}', '${PAUSED_RUN_ID}')`);
        // No system user is cached here, so the lookup runs as the acting user.
        expect(runViews.mock.calls[0][1]).toBe(USER);
    });

    it('runs the lookup as the system user when one is available', async () => {
        // Row-level security can hide a session's own runs from its owner: a web-widget guest's
        // delegated runs carry no ConversationID, so the guest's run filter does not match them.
        const systemUser = { ID: UserCache.Instance.SYSTEM_USER_ID, Email: 'system@example.com' } as unknown as UserInfo;
        UserCache.Instance.SetUsers([systemUser]);
        const { provider, runViews } = makeProvider({ 'MJ: AI Agent Runs': [{ ID: PAUSED_RUN_ID }] });

        const result = await new SessionRunIDVerifier().Verify(SESSION_ID, { PendingFeedbackRunID: PAUSED_RUN_ID }, USER, provider);

        expect(result.PendingFeedbackRunID).toBe(PAUSED_RUN_ID);
        expect(runViews.mock.calls[0][1]).toBe(systemUser);
    });

    it('keeps the prompt run and step that belong to the session\'s co-agent run', async () => {
        const { provider, runViews } = makeProvider({
            'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }],
            'MJ: AI Agent Run Steps': [{ ID: STEP_ID, StepType: 'Prompt', TargetLogID: PROMPT_RUN_ID }],
        });

        const result = await new SessionRunIDVerifier().Verify(
            SESSION_ID,
            { CoAgentRunID: CO_RUN_ID, PromptRunID: PROMPT_RUN_ID, CoAgentRunStepID: STEP_ID },
            USER,
            provider,
        );

        expect(result).toEqual({ CoAgentRunID: CO_RUN_ID, PromptRunID: PROMPT_RUN_ID, CoAgentRunStepID: STEP_ID, PendingFeedbackRunID: undefined });
        const stepsView = issuedViews(runViews).find((view) => view.EntityName === 'MJ: AI Agent Run Steps');
        expect(stepsView?.ExtraFilter).toBe(`AgentRunID='${CO_RUN_ID}' AND (ID='${STEP_ID}' OR TargetLogID='${PROMPT_RUN_ID}')`);
    });

    it('drops a prompt run that is the target of a step other than a Prompt step', async () => {
        const { provider } = makeProvider({
            'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }],
            'MJ: AI Agent Run Steps': [{ ID: STEP_ID, StepType: 'Tool', TargetLogID: PROMPT_RUN_ID }],
        });

        const result = await new SessionRunIDVerifier().Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID, PromptRunID: PROMPT_RUN_ID }, USER, provider);

        expect(result.PromptRunID).toBeUndefined();
    });

    it('drops the prompt run and step when the co-agent run is not the session\'s', async () => {
        const { provider } = makeProvider({
            'MJ: AI Agent Runs': [],
            'MJ: AI Agent Run Steps': [{ ID: STEP_ID, StepType: 'Prompt', TargetLogID: PROMPT_RUN_ID }],
        });

        const result = await new SessionRunIDVerifier().Verify(
            SESSION_ID,
            { CoAgentRunID: CO_RUN_ID, PromptRunID: PROMPT_RUN_ID, CoAgentRunStepID: STEP_ID },
            USER,
            provider,
        );

        expect(result).toEqual({ CoAgentRunID: undefined, PromptRunID: undefined, CoAgentRunStepID: undefined, PendingFeedbackRunID: undefined });
    });

    it('matches ids case-insensitively', async () => {
        const { provider } = makeProvider({ 'MJ: AI Agent Runs': [{ ID: PAUSED_RUN_ID.toUpperCase() }] });

        const result = await new SessionRunIDVerifier().Verify(SESSION_ID, { PendingFeedbackRunID: PAUSED_RUN_ID }, USER, provider);

        expect(result.PendingFeedbackRunID).toBe(PAUSED_RUN_ID);
    });

    it('reuses a successful lookup for the same claims', async () => {
        const { provider, runViews } = makeProvider({ 'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }] });
        const verifier = new SessionRunIDVerifier();

        await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);
        const second = await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);

        expect(second.CoAgentRunID).toBe(CO_RUN_ID);
        expect(runViews).toHaveBeenCalledTimes(1);
    });

    it('keeps nothing when a lookup fails, and looks up again next time', async () => {
        const { provider, runViews } = makeProvider({}, false);
        const verifier = new SessionRunIDVerifier();

        const first = await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);
        await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);

        expect(first).toEqual({});
        expect(runViews).toHaveBeenCalledTimes(2);
    });

    it('keeps nothing, without throwing, when the provider throws', async () => {
        const provider = { RunViews: vi.fn(async () => { throw new Error('connection lost'); }) } as unknown as IMetadataProvider;

        await expect(new SessionRunIDVerifier().Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider)).resolves.toEqual({});
    });
});
