/**
 * The `MJ: AI Agent Requests` row a root agent writes when it pauses for the user (a Chat step, or a
 * Plan step under Plan Mode).
 *
 * The request's `OriginatingAgentRunStepID` is a foreign key to the step that raised it, and that step
 * was created moments earlier with a FIRE-AND-FORGET INSERT. The request was saved without waiting for
 * it, so the two INSERTs raced; losing the race failed the request on `FK_AIAgentRequest_OriginatingStep`.
 * The run still ended `AwaitingFeedback`, but the log said only "Failed to save AIAgentRequest" and no
 * request existed for the dashboard, the notification or a reply to find.
 *
 * These drive the REAL `executeChatStep` → `createStepEntity` → `createFeedbackRequest` path on a real
 * BaseAgent. Only the entity layer is faked, and the fake request enforces the foreign key the way the
 * database does: it refuses to save while its originating step has not been inserted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { LogError, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { BaseAgent } from '../base-agent';

/** Shared ordering log, so a test can see which INSERT landed first. */
type EventLog = string[];

/** Stand-in for an `MJ: AI Agent Run Steps` row: an INSERT that takes a moment and can be made to fail. */
class FakeStep {
    public ID = '';
    public AgentRunID = '';
    public StepNumber = 0;
    public StepType = '';
    public StepName = '';
    public Status = '';
    public StartedAt: Date = new Date(0);
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public TargetLogID: string | null = null;
    public OutputData: string | null = null;
    public IsSaved = false;
    public LatestResult: { CompleteMessage: string } | null = null;

    constructor(private readonly log: EventLog, private readonly insertFails = false) {}

    NewRecord(): void {
        this.ID = 'step-1';
    }

    async Save(): Promise<boolean> {
        const isInsert = !this.IsSaved;
        this.log.push(isInsert ? 'step:insert:start' : 'step:update:start');
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (isInsert && this.insertFails) {
            this.LatestResult = { CompleteMessage: 'simulated step insert failure' };
            this.log.push('step:insert:failed');
            return false;
        }
        this.IsSaved = true;
        this.log.push(isInsert ? 'step:insert:end' : 'step:update:end');
        return true;
    }
}

/** Stand-in for an `MJ: AI Agent Requests` row that enforces FK_AIAgentRequest_OriginatingStep. */
class FakeRequest {
    public ID = '';
    public AgentID = '';
    public RequestedAt: Date | null = null;
    public RequestForUserID: string | null = null;
    public Status = '';
    public Request = '';
    public RequestTypeID: string | null = null;
    public ResponseSchema: string | null = null;
    public Priority = 0;
    public OriginatingAgentRunID: string | null = null;
    public OriginatingAgentRunStepID: string | null = null;
    public ExpiresAt: Date | null = null;
    public LatestResult: { CompleteMessage: string } | null = null;
    public Saved = false;

    constructor(private readonly log: EventLog, private readonly steps: FakeStep[], private readonly refuseWith?: string) {}

    NewRecord(): void {
        this.ID = 'request-1';
    }

    async Save(): Promise<boolean> {
        this.log.push('request:insert:start');
        if (this.refuseWith) {
            this.LatestResult = { CompleteMessage: this.refuseWith };
            return false;
        }
        const step = this.steps.find((s) => s.ID === this.OriginatingAgentRunStepID);
        if (this.OriginatingAgentRunStepID && !step?.IsSaved) {
            this.LatestResult = { CompleteMessage: 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_AIAgentRequest_OriginatingStep".' };
            return false;
        }
        this.Saved = true;
        return true;
    }
}

/** The run row, with only what the Chat path and the finalize path write. */
type FakeRun = {
    ID: string;
    AgentID: string;
    Steps: FakeStep[];
    Status: string;
    ErrorMessage: string | null;
    Save: () => Promise<boolean>;
};

type ChatDecision = { step: 'Chat'; message: string; terminate: boolean };

type FeedbackParams = {
    agent: { ID: string; Name: string; TypeID: string; CategoryID: null };
    contextUser: { ID: string; Name: string };
    assignmentStrategy: { type: 'RunUser' };
    provider: { GetEntityObject: (entityName: string, user?: UserLike) => Promise<FakeStep | FakeRequest> };
};

/** The identity a row was requested as — all these tests read is which user it was. */
type UserLike = { ID: string; Name: string };

/** The private BaseAgent members these tests drive — checked, so a rename fails loudly here. */
type FeedbackInternals = {
    executeChatStep(params: FeedbackParams, previousDecision: ChatDecision): Promise<{ step: string }>;
    finalizeAgentRun(finalStep: ChatDecision): Promise<{ feedbackRequestId?: string }>;
};

function drivesFeedback(value: object): value is FeedbackInternals {
    return typeof Reflect.get(value, 'executeChatStep') === 'function'
        && typeof Reflect.get(value, 'finalizeAgentRun') === 'function';
}

type Harness = {
    internals: FeedbackInternals;
    params: FeedbackParams;
    run: FakeRun;
    step: FakeStep;
    request: FakeRequest;
    log: EventLog;
    /** The user the request row was requested — and therefore saved — as. */
    requestWrittenAs: () => UserLike | undefined;
};

function harness(options: { stepInsertFails?: boolean; requestRefusesWith?: string } = {}): Harness {
    const log: EventLog = [];
    const step = new FakeStep(log, options.stepInsertFails);
    const request = new FakeRequest(log, [step], options.requestRefusesWith);
    let requestWrittenAs: UserLike | undefined;
    const provider = {
        GetEntityObject: async (entityName: string, user?: UserLike): Promise<FakeStep | FakeRequest> => {
            if (entityName !== 'MJ: AI Agent Requests') return step;
            requestWrittenAs = user;
            return request;
        },
    };
    const run: FakeRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [], Status: 'Running', ErrorMessage: null, Save: async () => true };

    const agent: object = new BaseAgent();
    Reflect.set(agent, '_activeProvider', provider);
    Reflect.set(agent, '_agentRun', run);
    Reflect.set(agent, '_requestTypeCache', []); // request types already resolved: no RunView
    if (!drivesFeedback(agent)) throw new Error('BaseAgent no longer has executeChatStep/finalizeAgentRun.');

    const params: FeedbackParams = {
        agent: { ID: 'agent-1', Name: 'Draft Writer', TypeID: 'type-1', CategoryID: null },
        contextUser: { ID: 'user-1', Name: 'Tester' },
        assignmentStrategy: { type: 'RunUser' },
        provider,
    };
    return { internals: agent, params, run, step, request, log, requestWrittenAs: () => requestWrittenAs };
}

const ASK: ChatDecision = { step: 'Chat', message: 'Which tone should the draft use?', terminate: true };

describe('BaseAgent feedback request (Chat pause)', () => {
    beforeEach(() => {
        vi.mocked(LogError).mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('records the request only after the step it points at has been inserted', async () => {
        const h = harness();

        await h.internals.executeChatStep(h.params, ASK);

        expect(h.request.Saved).toBe(true);
        expect(h.request.OriginatingAgentRunStepID).toBe(h.step.ID);
        expect(h.log.indexOf('step:insert:end')).toBeGreaterThanOrEqual(0);
        expect(h.log.indexOf('request:insert:start')).toBeGreaterThan(h.log.indexOf('step:insert:end'));
        expect(LogError).not.toHaveBeenCalled();
    });

    it('returns the request id with the run result, which is what notifies the user', async () => {
        const h = harness();

        await h.internals.executeChatStep(h.params, ASK);
        const result = await h.internals.finalizeAgentRun(ASK);

        expect(result.feedbackRequestId).toBe('request-1');
        expect(h.run.Status).toBe('AwaitingFeedback');
    });

    it('still records the pause, unlinked from the step, when the step itself could not be saved', async () => {
        const h = harness({ stepInsertFails: true });

        await h.internals.executeChatStep(h.params, ASK);

        expect(h.request.Saved).toBe(true);
        expect(h.request.OriginatingAgentRunStepID).toBeNull();
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('simulated step insert failure'));
    });

    it('still reports the failed step save in the run, although it was flushed before finalize', async () => {
        const h = harness({ stepInsertFails: true });

        await h.internals.executeChatStep(h.params, ASK);
        await h.internals.finalizeAgentRun(ASK);

        expect(h.run.ErrorMessage).toContain('step record save(s) failed');
    });

    it('records the pause as the system user, still addressed to the person it is for', async () => {
        // The UI role may only READ AI Agent Requests, so a request written as the run's user was
        // refused and the pause was lost for everyone without the Developer role.
        const systemUser = Object.assign(new UserInfo(), { ID: 'system-1', Name: 'System' });
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        const h = harness();

        await h.internals.executeChatStep(h.params, ASK);

        expect(h.request.Saved).toBe(true);
        expect(h.requestWrittenAs()).toBe(systemUser);
        expect(h.request.RequestForUserID).toBe('user-1');
    });

    it('records the pause as the run\'s user when this process has no system user', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(null);
        const h = harness();

        await h.internals.executeChatStep(h.params, ASK);

        expect(h.requestWrittenAs()).toBe(h.params.contextUser);
        expect(h.request.RequestForUserID).toBe('user-1');
    });

    it('records the pause as the run\'s user when resolving the system user throws', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockRejectedValue(new Error('no connection'));
        const h = harness();

        await h.internals.executeChatStep(h.params, ASK);

        expect(h.request.Saved).toBe(true);
        expect(h.requestWrittenAs()).toBe(h.params.contextUser);
    });

    it('logs why the request was refused, not just that it was', async () => {
        const h = harness({ requestRefusesWith: 'User Tester does not have permission to Create MJ: AI Agent Requests records' });

        await h.internals.executeChatStep(h.params, ASK);

        expect(h.request.Saved).toBe(false);
        expect(LogError).toHaveBeenCalledWith(
            expect.stringMatching(/^Failed to save AIAgentRequest for agent Draft Writer \(run run-1\): User Tester does not have permission/)
        );
    });
});
