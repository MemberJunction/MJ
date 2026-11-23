import {
    IMetadataProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentRequestEntity,
    MJAIAgentRequestTypeEntity,
    MJUserEntity,
} from '@memberjunction/core-entities';
import {
    NamedPersonAgentRequestRegistry,
    type NamedPersonAgentRequestHandler,
    type NamedPersonAgentRequestPayload,
    type NamedPersonAgentRequestReceipt,
} from '@memberjunction/actions-base';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

const DEFAULT_REQUEST_TYPE_NAME = 'Approval';

/**
 * Default server-side {@link NamedPersonAgentRequestHandler} creating `MJ: AI Agent Requests`
 * rows for a specific named recipient (`TargetUserID`) and returning sanitized confirmation receipts
 * without leaking sensitive payload internals back to chat surfaces.
 */
export class AudienceNamedPersonAgentRequestService implements NamedPersonAgentRequestHandler {
    public async CreateNamedPersonRequest(
        payload: NamedPersonAgentRequestPayload
    ): Promise<NamedPersonAgentRequestReceipt> {
        const targetUserId = payload.TargetUserID?.trim();
        if (!targetUserId || !payload.ContextUser?.ID || !payload.Subject?.trim() || !payload.Message?.trim()) {
            return {
                Success: false,
                TargetUserID: targetUserId ?? '',
                ReceiptMessage: 'Named-person agent request requires TargetUserID, Subject, Message, and ContextUser.',
                ErrorMessage: 'Invalid NamedPersonAgentRequestPayload.',
            };
        }

        const provider = payload.Provider ?? Metadata.Provider;
        if (!provider) {
            return {
                Success: false,
                TargetUserID: targetUserId,
                ReceiptMessage: 'No metadata provider is available to persist the agent request.',
                ErrorMessage: 'Missing metadata provider.',
            };
        }

        try {
            const systemUser =
                (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? payload.ContextUser;
            const rv = RunView.FromMetadataProvider(provider);

            const targetUserActive = await this.verifyTargetUserActive(rv, systemUser, targetUserId);
            if (!targetUserActive) {
                return {
                    Success: false,
                    TargetUserID: targetUserId,
                    ReceiptMessage: 'Target recipient is not an active user.',
                    ErrorMessage: `TargetUserID '${targetUserId}' was not found or is inactive.`,
                };
            }

            const requestTypeId = await this.resolveRequestTypeId(
                rv,
                systemUser,
                payload.RequestTypeName ?? DEFAULT_REQUEST_TYPE_NAME
            );
            if (!requestTypeId) {
                return {
                    Success: false,
                    TargetUserID: targetUserId,
                    ReceiptMessage: 'Required agent request type metadata is unavailable.',
                    ErrorMessage: `Agent request type '${payload.RequestTypeName ?? DEFAULT_REQUEST_TYPE_NAME}' was not found.`,
                };
            }

            const agentId = await this.resolveTargetAgentId(rv, systemUser, payload.TargetAgentID);
            if (!agentId) {
                return {
                    Success: false,
                    TargetUserID: targetUserId,
                    ReceiptMessage: 'Target agent could not be resolved.',
                    ErrorMessage: 'No active agent matched TargetAgentID or default agent.',
                };
            }

            const saveUser = this.resolveSaveUser(payload.ContextUser, systemUser, targetUserId);
            const requestEntity = await provider.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                saveUser
            );
            requestEntity.NewRecord();
            requestEntity.AgentID = agentId;
            requestEntity.RequestTypeID = requestTypeId;
            requestEntity.RequestedAt = new Date();
            requestEntity.RequestForUserID = targetUserId;
            requestEntity.Status = 'Requested';
            requestEntity.Priority = this.clampPriority(payload.Priority);
            requestEntity.Request = `${payload.Subject.trim()}\n\n${payload.Message.trim()}`;
            requestEntity.Comments = JSON.stringify({
                NamedPersonRequest: true,
                SenderUserID: payload.ContextUser.ID,
                DeliveryMode: payload.DeliveryMode ?? 'DirectUserRequest',
                ...(payload.OriginatingConversationDetailID
                    ? { OriginatingConversationDetailID: payload.OriginatingConversationDetailID }
                    : {}),
                ...(payload.Audience ? { AudienceMode: payload.Audience.Mode } : {}),
                ...(payload.ServerBoundScope ? { ServerBoundScope: payload.ServerBoundScope } : {}),
                ...(payload.Metadata ? { Metadata: payload.Metadata } : {}),
            });
            if (payload.OriginatingAgentRunID) {
                requestEntity.OriginatingAgentRunID = payload.OriginatingAgentRunID;
            }
            if (payload.ExpiresAt) {
                requestEntity.ExpiresAt = payload.ExpiresAt;
            }

            const saved = await requestEntity.Save();
            if (!saved) {
                const detail = requestEntity.LatestResult?.CompleteMessage ?? 'Failed to save MJ: AI Agent Requests.';
                return {
                    Success: false,
                    TargetUserID: targetUserId,
                    ReceiptMessage: 'Failed to create agent request for the designated recipient.',
                    ErrorMessage: detail,
                };
            }

            return {
                Success: true,
                AgentRequestID: requestEntity.ID,
                TargetUserID: targetUserId,
                Status: requestEntity.Status,
                ReceiptMessage: `Agent request queued for recipient ${payload.TargetUserDisplayName?.trim() || targetUserId}.`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AudienceNamedPersonAgentRequestService.CreateNamedPersonRequest failed: ${msg}`);
            return {
                Success: false,
                TargetUserID: targetUserId,
                ReceiptMessage: 'Unable to queue named-person agent request.',
                ErrorMessage: msg,
            };
        }
    }

    private async verifyTargetUserActive(
        rv: RunView,
        systemUser: UserInfo,
        targetUserId: string
    ): Promise<boolean> {
        const res = await rv.RunView<Pick<MJUserEntity, 'ID' | 'IsActive'>>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `ID='${EscapeSQLString(targetUserId)}' AND IsActive=1`,
                Fields: ['ID', 'IsActive'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            systemUser
        );
        return Boolean(res.Success && Array.isArray(res.Results) && res.Results.length > 0 && res.Results[0].IsActive);
    }

    private async resolveRequestTypeId(
        rv: RunView,
        systemUser: UserInfo,
        typeName: string
    ): Promise<string | null> {
        const res = await rv.RunView<Pick<MJAIAgentRequestTypeEntity, 'ID'>>(
            {
                EntityName: 'MJ: AI Agent Request Types',
                ExtraFilter: `Name='${EscapeSQLString(typeName.trim())}'`,
                Fields: ['ID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            systemUser
        );
        return res.Success && res.Results.length > 0 ? res.Results[0].ID : null;
    }

    private async resolveTargetAgentId(
        rv: RunView,
        systemUser: UserInfo,
        requestedAgentId: string | undefined
    ): Promise<string | null> {
        if (requestedAgentId && requestedAgentId.trim().length > 0) {
            const res = await rv.RunView<Pick<MJAIAgentEntity, 'ID' | 'Status'>>(
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `ID='${EscapeSQLString(requestedAgentId.trim())}' AND Status='Active'`,
                    Fields: ['ID', 'Status'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple',
                },
                systemUser
            );
            return res.Success && res.Results.length > 0 ? res.Results[0].ID : null;
        }
        const fallbackRes = await rv.RunView<Pick<MJAIAgentEntity, 'ID'>>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `Status='Active'`,
                OrderBy: `__mj_CreatedAt ASC`,
                Fields: ['ID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            systemUser
        );
        return fallbackRes.Success && fallbackRes.Results.length > 0 ? fallbackRes.Results[0].ID : null;
    }

    private resolveSaveUser(contextUser: UserInfo, systemUser: UserInfo, targetUserId: string): UserInfo {
        if (UUIDsEqual(contextUser.ID, targetUserId)) {
            return contextUser;
        }
        if (contextUser.Type?.trim().toLowerCase() === 'owner') {
            return contextUser;
        }
        return systemUser;
    }

    private clampPriority(priority: number | undefined): number {
        if (typeof priority !== 'number' || !Number.isFinite(priority)) {
            return 50;
        }
        return Math.min(100, Math.max(1, Math.trunc(priority)));
    }
}

/**
 * Registers {@link AudienceNamedPersonAgentRequestService} in {@link NamedPersonAgentRequestRegistry.Instance}.
 * Idempotent and safe to call at server bootstrap.
 */
export function RegisterDefaultNamedPersonAgentRequestHandler(): AudienceNamedPersonAgentRequestService {
    const service = new AudienceNamedPersonAgentRequestService();
    NamedPersonAgentRequestRegistry.Instance.Register(service);
    return service;
}
