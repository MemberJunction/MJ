import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
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

/** Stubs the cached system user; lts/5's UserCache has no SetUsers. */
let getSystemUserSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getSystemUserSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(undefined as unknown as UserInfo);
});

afterEach(() => {
    vi.restoreAllMocks();
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
        getSystemUserSpy.mockReturnValue(systemUser);
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

    it('looks up the same claims again on every call', async () => {
        const { provider, runViews } = makeProvider({ 'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }] });
        const verifier = new SessionRunIDVerifier();

        await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);
        const second = await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);

        expect(second.CoAgentRunID).toBe(CO_RUN_ID);
        expect(runViews).toHaveBeenCalledTimes(2);
    });

    it('reads the runs and steps from the database, not from a cached view', async () => {
        const { provider, runViews } = makeProvider({ 'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }] });

        await new SessionRunIDVerifier().Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID, PromptRunID: PROMPT_RUN_ID }, USER, provider);

        const views = issuedViews(runViews);
        expect(views.map((view) => view.EntityName)).toEqual(['MJ: AI Agent Runs', 'MJ: AI Agent Run Steps']);
        expect(views.every((view) => view.BypassCache === true)).toBe(true);
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

/**
 * A run's `AgentSessionID` and a step's `AgentRunID` and `TargetLogID` can change after a lookup (the
 * generated update mutations accept them), so each call must decide from what the rows say now.
 */
describe('SessionRunIDVerifier.Verify — relationships that change between calls', () => {
    const CLAIMS = { CoAgentRunID: CO_RUN_ID, PromptRunID: PROMPT_RUN_ID, CoAgentRunStepID: STEP_ID, PendingFeedbackRunID: PAUSED_RUN_ID };

    /** Both runs are records of the session, and the step is the co-agent run's Prompt step for the prompt run. */
    function linkedRows(): Rows {
        return {
            'MJ: AI Agent Runs': [{ ID: CO_RUN_ID }, { ID: PAUSED_RUN_ID }],
            'MJ: AI Agent Run Steps': [{ ID: STEP_ID, StepType: 'Prompt', TargetLogID: PROMPT_RUN_ID }],
        };
    }

    it('drops runs that stopped being records of the session since the last call', async () => {
        const rows = linkedRows();
        const { provider } = makeProvider(rows);
        const verifier = new SessionRunIDVerifier();
        const first = await verifier.Verify(SESSION_ID, CLAIMS, USER, provider);

        // The runs were moved to another session, unlinked or deleted.
        rows['MJ: AI Agent Runs'] = [];
        const second = await verifier.Verify(SESSION_ID, CLAIMS, USER, provider);

        expect(first).toEqual(CLAIMS);
        expect(second).toEqual({ CoAgentRunID: undefined, PromptRunID: undefined, CoAgentRunStepID: undefined, PendingFeedbackRunID: undefined });
    });

    it('drops the prompt run and step once the step is no longer linked to the co-agent run', async () => {
        const rows = linkedRows();
        const { provider } = makeProvider(rows);
        const verifier = new SessionRunIDVerifier();
        const first = await verifier.Verify(SESSION_ID, CLAIMS, USER, provider);

        rows['MJ: AI Agent Run Steps'] = [];
        const second = await verifier.Verify(SESSION_ID, CLAIMS, USER, provider);

        expect(first).toEqual(CLAIMS);
        expect(second).toEqual({ ...CLAIMS, PromptRunID: undefined, CoAgentRunStepID: undefined });
    });

    it('still keeps a relationship that has not changed on the next call', async () => {
        const { provider } = makeProvider(linkedRows());
        const verifier = new SessionRunIDVerifier();

        await verifier.Verify(SESSION_ID, CLAIMS, USER, provider);
        const second = await verifier.Verify(SESSION_ID, CLAIMS, USER, provider);

        expect(second).toEqual(CLAIMS);
    });
});

describe('SessionRunIDVerifier.Verify — lookups as the acting user', () => {
    it('does not give a user the result of a lookup made for another user', async () => {
        // No system user is cached, so each lookup runs as the acting user, and only USER can see the run.
        const otherUser = { ID: 'd3d3d3d3-0000-4000-8000-0000000000bb' } as unknown as UserInfo;
        const runViews = vi.fn(async (paramsList: RunViewParams[], user: UserInfo) =>
            paramsList.map((params) => {
                const visible = user === USER && params.EntityName === 'MJ: AI Agent Runs';
                return { Success: true, Results: visible ? [{ ID: CO_RUN_ID }] : [], ErrorMessage: '' };
            }),
        );
        const provider = { RunViews: runViews } as unknown as IMetadataProvider;
        const verifier = new SessionRunIDVerifier();

        const forUser = await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, USER, provider);
        const forOtherUser = await verifier.Verify(SESSION_ID, { CoAgentRunID: CO_RUN_ID }, otherUser, provider);

        expect(forUser.CoAgentRunID).toBe(CO_RUN_ID);
        expect(forOtherUser.CoAgentRunID).toBeUndefined();
        expect(runViews.mock.calls[1]?.[1]).toBe(otherUser);
    });
});
