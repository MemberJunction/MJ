/**
 * An agent request raised through a human-task provider: the provider answers it through
 * `AnswerAgentRequestFromProvider`, and an answer given anywhere else withdraws the provider's copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal, ValidationResult } from '@memberjunction/global';
import { UserInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import {
    BaseHumanTaskProvider,
    type HumanTaskRaiseResult,
    type HumanTaskWithdrawContext,
} from '@memberjunction/ai-core-plus';
import { UserCache } from '@memberjunction/generic-database-provider';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

/** Rows the mocked RunView returns, by entity name. */
const viewRows = new Map<string, Record<string, unknown>[]>();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public static FromMetadataProvider(): MockRunView {
            return new MockRunView();
        }
        public async RunView(params: RunViewParams): Promise<{ Success: boolean; Results: Record<string, unknown>[] }> {
            return { Success: true, Results: viewRows.get(params.EntityName ?? '') ?? [] };
        }
    }
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), RunView: MockRunView };
});

interface FieldState {
    Dirty?: boolean;
    OldValue?: unknown;
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    class MockMJAIAgentRequestEntity {
        public ID = '11111111-0000-4000-8000-000000000001';
        public RequestForUserID: string | null = null;
        public Status = 'Requested';
        public Response: string | null = null;
        public ResponseData: string | null = null;
        public RespondedAt: Date | null = null;
        public ResponseSource: string | null = null;
        public ResponseByUserID: string | null = null;
        public OriginatingTaskID: string | null = null;
        public OriginatingAgentRunID: string | null = null;
        public ResumingAgentRunID: string | null = null;
        public AgentID: string | null = null;
        public HumanTaskProvider: string | null = null;
        public HumanTaskExternalReference: string | null = null;
        public IsSaved = true;
        public ContextCurrentUser: UserInfo | null = null;
        public SaveCount = 0;
        private fieldState: Record<string, FieldState> = {};
        public SetFieldState(name: string, state: FieldState): void {
            this.fieldState[name] = state;
        }
        public GetFieldByName(name: string): FieldState {
            return this.fieldState[name] ?? { Dirty: false, OldValue: null };
        }
        public async Load(): Promise<boolean> {
            return true;
        }
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
        public async Save(): Promise<boolean> {
            this.SaveCount++;
            return this.Validate().Success;
        }
    }
    return { ...actual, MJAIAgentRequestEntity: MockMJAIAgentRequestEntity };
});

import { MJAIAgentRequestEntityServer } from '../MJAIAgentRequestEntityServer';
import { AgentRequestAnswerRefusal, AnswerAgentRequestFromProvider } from '../agent-request-human-task';

interface MockHooks {
    IsSaved: boolean;
    ContextCurrentUser: UserInfo | null;
    SaveCount: number;
    SetFieldState(name: string, state: FieldState): void;
}
type TestRequest = MJAIAgentRequestEntityServer & MockHooks;

const PROVIDER_KEY = 'AgentRequestHumanTaskTestProvider';
const REQUEST_ID = '11111111-0000-4000-8000-000000000001';
const RUN_ID = '22222222-0000-4000-8000-000000000002';
const OWNER = new UserInfo(undefined, { ID: '33333333-0000-4000-8000-000000000003', Name: 'Owner', Type: 'User', UserRoles: [] });
const DECIDER = new UserInfo(undefined, { ID: '44444444-0000-4000-8000-000000000004', Name: 'Decider', Type: 'User', UserRoles: [] });
const SYSTEM = new UserInfo(undefined, { ID: UserCache.Instance.SYSTEM_USER_ID, Name: 'System', Type: 'Owner', UserRoles: [] });

const withdrawn: HumanTaskWithdrawContext[] = [];
class TestProvider extends BaseHumanTaskProvider {
    public async RaiseTask(): Promise<HumanTaskRaiseResult> {
        return { Outcome: 'raised' };
    }
    public override async WithdrawTask(context: HumanTaskWithdrawContext): Promise<void> {
        withdrawn.push(context);
    }
}
MJGlobal.Instance.ClassFactory.Register(BaseHumanTaskProvider, TestProvider, PROVIDER_KEY);

/** A request raised through the test provider, now being answered by this save. */
function answeredRequest(user: UserInfo): TestRequest {
    const r = new MJAIAgentRequestEntityServer() as TestRequest;
    r.RequestForUserID = OWNER.ID;
    r.HumanTaskProvider = PROVIDER_KEY;
    r.HumanTaskExternalReference = 'TASK-9';
    r.ContextCurrentUser = user;
    r.Status = 'Approved';
    r.SetFieldState('Status', { Dirty: true, OldValue: 'Requested' });
    return r;
}

/** Lets the not-awaited withdraw call run. */
async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    withdrawn.length = 0;
    viewRows.clear();
    UserCache.Instance.SetUsers([SYSTEM, OWNER, DECIDER]);
});

afterEach(() => {
    UserCache.Instance.SetUsers([]);
});

describe('MJAIAgentRequestEntityServer — a request raised through a provider', () => {
    it("withdraws the provider's copy when the request is answered elsewhere", async () => {
        const r = answeredRequest(OWNER);
        expect(await r.Save()).toBe(true);
        await settle();
        expect(withdrawn).toHaveLength(1);
        expect(withdrawn[0]).toMatchObject({
            Subject: { Kind: 'AgentRequest', AgentRequestID: REQUEST_ID, AgentRunID: null },
            Reason: 'completed-elsewhere',
            ExternalReference: 'TASK-9',
            ContextUser: OWNER,
        });
        expect(r.ResponseByUserID).toBe(OWNER.ID);
    });

    it("does not withdraw when the provider itself answered, and records who decided there", async () => {
        const r = answeredRequest(OWNER);
        r.MarkAnsweredByProvider(PROVIDER_KEY.toLowerCase(), DECIDER.ID);
        expect(await r.Save()).toBe(true);
        await settle();
        expect(withdrawn).toHaveLength(0);
        expect(r.ResponseByUserID).toBe(DECIDER.ID);
    });

    it('forgets the provider mark after the save it was for', async () => {
        const r = answeredRequest(OWNER);
        r.MarkAnsweredByProvider(PROVIDER_KEY, DECIDER.ID);
        await r.Save();
        r.Status = 'Rejected';
        r.SetFieldState('Status', { Dirty: true, OldValue: 'Requested' });
        await r.Save();
        await settle();
        expect(withdrawn).toHaveLength(1);
    });

    it('withdraws nothing for a request no provider raised', async () => {
        const r = answeredRequest(OWNER);
        r.HumanTaskProvider = null;
        await r.Save();
        await settle();
        expect(withdrawn).toHaveLength(0);
    });
});

describe('AgentRequestAnswerRefusal', () => {
    const open = { ID: REQUEST_ID, Status: 'Requested' as const, HumanTaskProvider: PROVIDER_KEY, OriginatingTaskID: null, RequestForUserID: null, OriginatingAgentRunID: RUN_ID };

    it('lets the provider the request was raised through answer it while it is open', () => {
        expect(AgentRequestAnswerRefusal(open, ` ${PROVIDER_KEY.toUpperCase()} `)).toBeNull();
    });
    it('refuses another provider, and a request no provider raised', () => {
        expect(AgentRequestAnswerRefusal(open, 'Other')).toMatchObject({ Refusal: 'not-raised-by-provider' });
        expect(AgentRequestAnswerRefusal({ ...open, HumanTaskProvider: null }, PROVIDER_KEY)).toMatchObject({ Refusal: 'not-raised-by-provider' });
    });
    it('refuses a request that is already answered', () => {
        expect(AgentRequestAnswerRefusal({ ...open, Status: 'Approved' }, PROVIDER_KEY)).toMatchObject({ Refusal: 'already-answered' });
    });
    it("refuses a workflow step's request, which is completed through the step", () => {
        expect(AgentRequestAnswerRefusal({ ...open, OriginatingTaskID: 'task-1' }, PROVIDER_KEY)).toMatchObject({ Refusal: 'workflow-request' });
    });
});

describe('AnswerAgentRequestFromProvider', () => {
    let loadedAs: UserInfo | undefined;
    let request: TestRequest;
    const provider = {
        GetEntityObject: async (_name: string, user?: UserInfo) => {
            loadedAs = user;
            request = new MJAIAgentRequestEntityServer() as TestRequest;
            request.ContextCurrentUser = user ?? null;
            request.HumanTaskProvider = PROVIDER_KEY;
            request.OriginatingAgentRunID = RUN_ID;
            return request;
        },
    } as unknown as IMetadataProvider;

    beforeEach(() => {
        loadedAs = undefined;
    });

    function openRow(overrides: Record<string, unknown> = {}): void {
        viewRows.set('MJ: AI Agent Requests', [{
            ID: REQUEST_ID, Status: 'Requested', HumanTaskProvider: PROVIDER_KEY, OriginatingTaskID: null,
            RequestForUserID: null, OriginatingAgentRunID: RUN_ID, ...overrides,
        }]);
    }

    it("answers as the user who ran the agent, records the decider, and leaves the provider's copy alone", async () => {
        openRow();
        viewRows.set('MJ: AI Agent Runs', [{ ID: RUN_ID, UserID: OWNER.ID }]);
        const result = await AnswerAgentRequestFromProvider({
            AgentRequestID: REQUEST_ID, ProviderKey: PROVIDER_KEY, Status: 'Responded',
            Response: 'Looks good', ResponseData: { choice: 'yes' }, RespondingUserID: DECIDER.ID, Provider: provider,
        });
        await settle();
        expect(result).toEqual({ Success: true });
        expect(loadedAs).toBe(OWNER);
        expect(request.Status).toBe('Responded');
        expect(request.Response).toBe('Looks good');
        expect(request.ResponseData).toBe('{"choice":"yes"}');
        expect(request.ResponseSource).toBe('API');
        expect(request.ResponseByUserID).toBe(DECIDER.ID);
        expect(withdrawn).toHaveLength(0);
    });

    it('answers as the user the request is for, when it names one', async () => {
        openRow({ RequestForUserID: OWNER.ID });
        await AnswerAgentRequestFromProvider({ AgentRequestID: REQUEST_ID, ProviderKey: PROVIDER_KEY, Status: 'Approved', Provider: provider });
        expect(loadedAs).toBe(OWNER);
    });

    it('records the owner when the provider names a responder that is not an MJ user', async () => {
        openRow({ RequestForUserID: OWNER.ID });
        await AnswerAgentRequestFromProvider({
            AgentRequestID: REQUEST_ID, ProviderKey: PROVIDER_KEY, Status: 'Approved',
            RespondingUserID: '99999999-0000-4000-8000-000000000009', Provider: provider,
        });
        expect(request.ResponseByUserID).toBe(OWNER.ID);
    });

    it('refuses without saving when the request has no user to answer as', async () => {
        openRow();
        viewRows.set('MJ: AI Agent Runs', [{ ID: RUN_ID, UserID: null }]);
        const result = await AnswerAgentRequestFromProvider({ AgentRequestID: REQUEST_ID, ProviderKey: PROVIDER_KEY, Status: 'Approved', Provider: provider });
        expect(result).toMatchObject({ Success: false, Refusal: 'no-owner' });
        expect(loadedAs).toBeUndefined();
    });

    it('refuses a missing request and malformed input', async () => {
        expect(await AnswerAgentRequestFromProvider({ AgentRequestID: REQUEST_ID, ProviderKey: PROVIDER_KEY, Status: 'Approved', Provider: provider }))
            .toMatchObject({ Refusal: 'not-found' });
        expect(await AnswerAgentRequestFromProvider({ AgentRequestID: 'nope', ProviderKey: PROVIDER_KEY, Status: 'Approved', Provider: provider }))
            .toMatchObject({ Refusal: 'invalid-input' });
    });

    it('refuses a provider the request was not raised through', async () => {
        openRow();
        const result = await AnswerAgentRequestFromProvider({ AgentRequestID: REQUEST_ID, ProviderKey: 'Other', Status: 'Approved', Provider: provider });
        expect(result).toMatchObject({ Refusal: 'not-raised-by-provider' });
    });
});
