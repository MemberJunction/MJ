/**
 * @fileoverview Routing an agent's feedback request to the install's default human-task provider,
 * and the way back: a provider answering it.
 *
 * An agent that asks a person something mid-run (a Chat step) always gets an `MJ: AI Agent Requests`
 * row. That row stays the source of truth: answering it is what resumes the agent, and the built-in
 * inbox keeps showing it. When the install has chosen a default provider
 * (`HumanTaskProviderDefaults`, `@memberjunction/ai-core-plus`), the request is also raised through
 * that provider, so the person sees it where they already work. Whichever side is answered first
 * wins: the provider answers through {@link AnswerAgentRequestFromProvider}, and an answer given in
 * the inbox or the conversation withdraws the provider's copy (`MJAIAgentRequestEntityServer`).
 *
 * Plan approvals are not routed: the reviewer edits the plan, and that reply has no place in the
 * provider contract yet.
 *
 * @module @memberjunction/ai-agents
 */
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentRequestEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';
import {
    AgentResponseForm,
    HumanTaskRaiseResult,
    HumanTaskSubject,
    ResolveHumanTaskProvider,
    SameHumanTaskProvider,
} from '@memberjunction/ai-core-plus';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, IsValidUUID } from '@memberjunction/global';
import { MJAIAgentRequestEntityServer } from './MJAIAgentRequestEntityServer';

/** An answer a person can give an agent request. */
export type AgentRequestAnswerStatus = Extract<MJAIAgentRequestEntity['Status'], 'Approved' | 'Rejected' | 'Responded'>;

/** What {@link AnswerAgentRequestFromProvider} needs. */
export type AgentRequestProviderAnswer = {
    AgentRequestID: string;
    /** The key the provider is registered under. Must be the provider the request was raised through. */
    ProviderKey: string;
    Status: AgentRequestAnswerStatus;
    /** The person's free-text answer. */
    Response?: string | null;
    /** The person's answers to the request's form (`ResponseSchema`), keyed by question id. */
    ResponseData?: Record<string, unknown> | null;
    /**
     * The MJ user who decided in the provider's system, when it knows one. Recorded as the request's
     * responder. An id that is not an MJ user is ignored (logged), and the request's owner is recorded.
     */
    RespondingUserID?: string | null;
    Provider: IMetadataProvider;
};

/** Why {@link AnswerAgentRequestFromProvider} did not answer the request. */
export type AgentRequestProviderAnswerRefusal =
    | 'invalid-input'
    | 'not-found'
    | 'not-raised-by-provider'
    | 'workflow-request'
    | 'already-answered'
    | 'no-owner'
    | 'save-failed';

export type AgentRequestProviderAnswerResult =
    | { Success: true }
    | { Success: false; Refusal: AgentRequestProviderAnswerRefusal; Message: string };

/** The request as the answer path reads it before loading it as its owner. */
type AnswerableRequestRow = Pick<
    MJAIAgentRequestEntity,
    'ID' | 'Status' | 'HumanTaskProvider' | 'OriginatingTaskID' | 'RequestForUserID' | 'OriginatingAgentRunID'
>;

/** Everything {@link RaiseAgentRequestThroughProvider} needs about a request that was just saved. */
export type AgentRequestRaise = {
    Request: MJAIAgentRequestEntity;
    ProviderKey: string;
    AgentName: string;
    ResponseForm: AgentResponseForm | null | undefined;
    /** Who ran the agent. The provider's fallback when the request names no one. */
    OwnerUserID: string | null;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
};

/** The subject a provider is handed for an agent request. */
export function AgentRequestSubject(request: Pick<MJAIAgentRequestEntity, 'ID' | 'OriginatingAgentRunID'>): HumanTaskSubject {
    return { Kind: 'AgentRequest', AgentRequestID: request.ID, AgentRunID: request.OriginatingAgentRunID ?? null };
}

/**
 * Raise a saved request through the provider named on it (`HumanTaskProvider`, set before the save
 * so an answer that comes back at once is recognised). Records the provider's reference when it
 * raised the ask; on any failure, clears the provider from the request so it is answered in the
 * inbox alone. Never throws: the request is already in the inbox whatever happens here.
 */
export async function RaiseAgentRequestThroughProvider(raise: AgentRequestRaise): Promise<HumanTaskRaiseResult> {
    const { Request: request } = raise;
    const result = await callRaise(raise);
    if (result.Outcome === 'raised') {
        if (result.ExternalReference) {
            request.HumanTaskExternalReference = result.ExternalReference;
            await saveProviderFields(request, 'record the provider reference of');
        }
        LogStatus(`📋 Raised agent request ${request.ID} through human-task provider "${raise.ProviderKey}"`);
        return result;
    }
    LogError(`Agent request ${request.ID} stays in the built-in inbox only: human-task provider "${raise.ProviderKey}" did not raise it (${result.Message})`);
    request.HumanTaskProvider = null;
    request.HumanTaskExternalReference = null;
    await saveProviderFields(request, 'clear the provider from');
    return result;
}

async function callRaise(raise: AgentRequestRaise): Promise<HumanTaskRaiseResult> {
    const humanProvider = ResolveHumanTaskProvider(raise.ProviderKey);
    if (!humanProvider) {
        return { Outcome: 'permanent-failure', Message: `no provider is registered under "${raise.ProviderKey}"` };
    }
    const { Request: request } = raise;
    try {
        return await humanProvider.RaiseTask({
            Subject: AgentRequestSubject(request),
            Name: raise.AgentName,
            Instructions: request.Request,
            AssignedUserID: request.RequestForUserID,
            OwnerUserID: raise.OwnerUserID,
            DueAt: request.ExpiresAt,
            Payload: { agentName: raise.AgentName, responseSchema: raise.ResponseForm ?? null },
            ProviderConfiguration: {},
            ContextUser: raise.ContextUser,
            Provider: raise.Provider,
        });
    } catch (error) {
        return { Outcome: 'transient-failure', Message: error instanceof Error ? error.message : String(error) };
    }
}

async function saveProviderFields(request: MJAIAgentRequestEntity, what: string): Promise<void> {
    if (!(await request.Save())) {
        LogError(`Could not ${what} agent request ${request.ID}: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/**
 * Answer an agent request raised through a human-task provider: the way a provider reports the
 * person's decision. Answering resumes the agent, exactly as an answer in the inbox does.
 *
 * Only the provider the request was raised through may answer it, and only while it is open. The
 * answer is saved as the request's owner (the user it is for, else the user who ran the agent), so
 * the resumed run has that user's permissions, not the provider's or the system user's.
 */
export async function AnswerAgentRequestFromProvider(answer: AgentRequestProviderAnswer): Promise<AgentRequestProviderAnswerResult> {
    const id = answer.AgentRequestID?.trim() ?? '';
    if (!IsValidUUID(id) || !answer.ProviderKey?.trim()) {
        return refuse('invalid-input', 'A valid agent request ID and provider key are required.');
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    const row = await readAnswerableRequest(id, answer.Provider, systemUser);
    if (!row) {
        return refuse('not-found', `Agent request ${id} does not exist or could not be read.`);
    }
    const refusal = AgentRequestAnswerRefusal(row, answer.ProviderKey);
    if (refusal) {
        return refusal;
    }
    const owner = await resolveRequestOwner(row, answer.Provider, systemUser);
    if (!owner) {
        return refuse('no-owner', `Agent request ${id} has no user to answer it as: it names no one and its agent run has no user.`);
    }
    return saveAnswer(id, answer, owner);
}

function refuse(refusal: AgentRequestProviderAnswerRefusal, message: string): AgentRequestProviderAnswerResult {
    return { Success: false, Refusal: refusal, Message: message };
}

/** Pure: why this provider may not answer this request, or null when it may. */
export function AgentRequestAnswerRefusal(row: AnswerableRequestRow, providerKey: string): AgentRequestProviderAnswerResult | null {
    if (row.OriginatingTaskID) {
        return refuse('workflow-request', `Agent request ${row.ID} belongs to a workflow step; a provider completes the step instead.`);
    }
    if (!SameHumanTaskProvider(row.HumanTaskProvider, providerKey)) {
        return refuse('not-raised-by-provider', `Agent request ${row.ID} was not raised through the provider "${providerKey}".`);
    }
    if (row.Status !== 'Requested') {
        return refuse('already-answered', `Agent request ${row.ID} is no longer open (it is ${row.Status}).`);
    }
    return null;
}

async function readAnswerableRequest(id: string, provider: IMetadataProvider, user: UserInfo): Promise<AnswerableRequestRow | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<AnswerableRequestRow>({
        EntityName: 'MJ: AI Agent Requests',
        Fields: ['ID', 'Status', 'HumanTaskProvider', 'OriginatingTaskID', 'RequestForUserID', 'OriginatingAgentRunID'],
        ExtraFilter: `ID='${EscapeSQLString(id)}'`,
        ResultType: 'simple',
        BypassCache: true,
        MaxRows: 1,
    }, user);
    if (!result.Success) {
        LogError(`Could not read agent request ${id}: ${result.ErrorMessage}`);
        return null;
    }
    return result.Results?.[0] ?? null;
}

/** The user an answer is saved as: the one the request is for, else the one who ran the agent. */
async function resolveRequestOwner(row: AnswerableRequestRow, provider: IMetadataProvider, systemUser: UserInfo): Promise<UserInfo | null> {
    const ownerID = row.RequestForUserID ?? (await originatingRunUserID(row.OriginatingAgentRunID, provider, systemUser));
    return ownerID ? (UserCache.Instance.UserByID(ownerID) ?? null) : null;
}

async function originatingRunUserID(runID: string | null, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    if (!runID) return null;
    const result = await RunView.FromMetadataProvider(provider).RunView<Pick<MJAIAgentRunEntity, 'ID' | 'UserID'>>({
        EntityName: 'MJ: AI Agent Runs',
        Fields: ['ID', 'UserID'],
        ExtraFilter: `ID='${EscapeSQLString(runID)}'`,
        ResultType: 'simple',
        MaxRows: 1,
    }, user);
    if (!result.Success) {
        LogError(`Could not read agent run ${runID}: ${result.ErrorMessage}`);
        return null;
    }
    return result.Results?.[0]?.UserID ?? null;
}

async function saveAnswer(id: string, answer: AgentRequestProviderAnswer, owner: UserInfo): Promise<AgentRequestProviderAnswerResult> {
    const request = await answer.Provider.GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', owner);
    if (!(await request.Load(id))) {
        return refuse('not-found', `Agent request ${id} could not be loaded as its owner.`);
    }
    request.Status = answer.Status;
    request.Response = answer.Response ?? null;
    request.ResponseData = answer.ResponseData ? JSON.stringify(answer.ResponseData) : null;
    request.RespondedAt = new Date();
    request.ResponseSource = 'API';
    if (request instanceof MJAIAgentRequestEntityServer) {
        request.MarkAnsweredByProvider(answer.ProviderKey, knownUserID(answer.RespondingUserID));
    }
    if (!(await request.Save())) {
        return refuse('save-failed', `Agent request ${id} could not be answered: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    LogStatus(`📋 Agent request ${id} answered (${answer.Status}) through human-task provider "${answer.ProviderKey}"`);
    return { Success: true };
}

/** The id when it names an MJ user, else null (logged): the responder column references `MJ: Users`. */
function knownUserID(userID: string | null | undefined): string | null {
    const trimmed = userID?.trim();
    if (!trimmed) return null;
    const user = IsValidUUID(trimmed) ? UserCache.Instance.UserByID(trimmed) : undefined;
    if (!user) {
        LogError(`Human-task provider named responder "${trimmed}", which is not an MJ user; recording the request's owner instead`);
        return null;
    }
    return user.ID;
}
