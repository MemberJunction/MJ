import {
    EntityPermissionType,
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
    AssertAllowsNamedPersonAgentRequests,
    NamedPersonAgentRequestRegistry,
    type ActionAudienceMode,
    type ContractJSONObject,
    type NamedPersonAgentRequestDeliveryMode,
    type NamedPersonAgentRequestHandler,
    type NamedPersonAgentRequestPayload,
    type NamedPersonAgentRequestReceipt,
} from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

const DEFAULT_REQUEST_TYPE_NAME = 'Approval';

interface NonSensitiveAgentRequestComments {
    NamedPersonRequest: true;
    SenderUserID: string;
    DeliveryMode: NamedPersonAgentRequestDeliveryMode;
    OriginatingConversationDetailID?: string;
    AudienceMode?: ActionAudienceMode;
    HasServerBoundScope?: boolean;
    ServerBoundScopeKeyCount?: number;
    Metadata?: ContractJSONObject;
}

/**
 * Default server-side {@link NamedPersonAgentRequestHandler} creating `MJ: AI Agent Requests`
 * rows for a specific named recipient (`TargetUserID`) and returning sanitized confirmation receipts
 * without leaking sensitive payload internals back to chat surfaces.
 */
export class AudienceNamedPersonAgentRequestService implements NamedPersonAgentRequestHandler {
    public async CreateNamedPersonRequest(
        payload: NamedPersonAgentRequestPayload
    ): Promise<NamedPersonAgentRequestReceipt> {
        const targetUserId = payload.TargetUserID?.trim() ?? '';
        if (!targetUserId || !payload.ContextUser?.ID || !payload.Subject?.trim() || !payload.Message?.trim()) {
            return this.fail(
                targetUserId,
                'Named-person agent request requires TargetUserID, Subject, Message, and ContextUser.',
                'Invalid NamedPersonAgentRequestPayload.'
            );
        }

        if (payload.ContextUser.IsActive === false) {
            return this.fail(
                targetUserId,
                'Caller account is inactive and cannot create agent requests.',
                'Inactive ContextUser.'
            );
        }

        if (payload.AudienceContract !== undefined) {
            const contractGate = AssertAllowsNamedPersonAgentRequests(payload.AudienceContract);
            if ('ErrorMessage' in contractGate) {
                return this.fail(
                    targetUserId,
                    'This action is not permitted to dispatch named-person agent requests.',
                    contractGate.ErrorMessage
                );
            }
        }

        const requestedAgentId = payload.TargetAgentID?.trim() ?? '';
        if (!requestedAgentId) {
            return this.fail(
                targetUserId,
                'TargetAgentID is required for named-person agent requests.',
                'Missing explicit TargetAgentID.'
            );
        }

        const provider = payload.Provider ?? Metadata.Provider;
        if (!provider) {
            return this.fail(
                targetUserId,
                'No metadata provider is available to persist the agent request.',
                'Missing metadata provider.'
            );
        }

        try {
            const callerAuthorized = this.verifyCallerCreatePermission(provider, payload.ContextUser);
            if ('Reason' in callerAuthorized) {
                return this.fail(
                    targetUserId,
                    'You do not have permission to create agent requests.',
                    callerAuthorized.Reason
                );
            }

            const tenantCheck = this.verifyTenantParity(payload, targetUserId);
            if ('Reason' in tenantCheck) {
                return this.fail(
                    targetUserId,
                    'Cross-tenant named-person agent requests are not permitted.',
                    tenantCheck.Reason
                );
            }

            const rv = RunView.FromMetadataProvider(provider);

            const targetUserActive = await this.verifyTargetUserActive(rv, payload.ContextUser, targetUserId);
            if (!targetUserActive) {
                return this.fail(
                    targetUserId,
                    'Target recipient is not an active user.',
                    `TargetUserID '${targetUserId}' was not found, is inactive, or is outside caller scope.`
                );
            }

            const requestTypeId = await this.resolveRequestTypeId(
                rv,
                payload.ContextUser,
                payload.RequestTypeName ?? DEFAULT_REQUEST_TYPE_NAME
            );
            if (!requestTypeId) {
                return this.fail(
                    targetUserId,
                    'Required agent request type metadata is unavailable.',
                    `Agent request type '${payload.RequestTypeName ?? DEFAULT_REQUEST_TYPE_NAME}' was not found.`
                );
            }

            const agentResolution = await this.resolveAuthorizedTargetAgentId(
                rv,
                provider,
                payload.ContextUser,
                requestedAgentId
            );
            if ('PublicReason' in agentResolution) {
                return this.fail(
                    targetUserId,
                    agentResolution.PublicReason,
                    agentResolution.InternalReason
                );
            }

            const saveUser = await this.resolveSaveUser(provider, payload.ContextUser, targetUserId);
            if (!saveUser) {
                return this.fail(
                    targetUserId,
                    'Unable to authorize persistence for the designated recipient.',
                    'System user is unavailable for cross-user request persistence.'
                );
            }

            const requestEntity = await provider.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                saveUser
            );
            requestEntity.NewRecord();
            requestEntity.AgentID = agentResolution.AgentID;
            requestEntity.RequestTypeID = requestTypeId;
            requestEntity.RequestedAt = new Date();
            requestEntity.RequestForUserID = targetUserId;
            requestEntity.Status = 'Requested';
            requestEntity.Priority = this.clampPriority(payload.Priority);
            requestEntity.Request = `${payload.Subject.trim()}\n\n${payload.Message.trim()}`;
            requestEntity.Comments = JSON.stringify(this.buildNonSensitiveRequestComments(payload));
            if (payload.OriginatingAgentRunID) {
                requestEntity.OriginatingAgentRunID = payload.OriginatingAgentRunID;
            }
            if (payload.ExpiresAt) {
                requestEntity.ExpiresAt = payload.ExpiresAt;
            }

            const saved = await requestEntity.Save();
            if (!saved) {
                const detail = requestEntity.LatestResult?.CompleteMessage ?? 'Failed to save MJ: AI Agent Requests.';
                return this.fail(
                    targetUserId,
                    'Failed to create agent request for the designated recipient.',
                    detail
                );
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
            return this.fail(
                targetUserId,
                'Unable to queue named-person agent request.',
                msg
            );
        }
    }

    private fail(
        targetUserId: string,
        receiptMessage: string,
        errorMessage: string
    ): NamedPersonAgentRequestReceipt {
        return {
            Success: false,
            TargetUserID: targetUserId,
            ReceiptMessage: receiptMessage,
            ErrorMessage: errorMessage,
        };
    }

    private verifyCallerCreatePermission(
        provider: IMetadataProvider,
        contextUser: UserInfo
    ): { Allowed: true } | { Allowed: false; Reason: string } {
        const isOwnerOrSystem =
            contextUser.Type?.trim().toLowerCase() === 'owner' ||
            WellKnownUserSource.Instance.IsSystemUser(contextUser);

        if (typeof provider.EntityByName !== 'function') {
            if (isOwnerOrSystem) {
                return { Allowed: true };
            }
            return {
                Allowed: false,
                Reason: 'Caller Create permission on MJ: AI Agent Requests could not be verified.',
            };
        }

        const requestEntityInfo = provider.EntityByName('MJ: AI Agent Requests');
        if (!requestEntityInfo) {
            return {
                Allowed: false,
                Reason: 'Entity metadata for MJ: AI Agent Requests was not found.',
            };
        }

        if (!requestEntityInfo.CheckPermissions(contextUser, EntityPermissionType.Create, false)) {
            return {
                Allowed: false,
                Reason: `User '${contextUser.ID}' lacks Create permission on MJ: AI Agent Requests.`,
            };
        }

        return { Allowed: true };
    }

    private verifyTenantParity(
        payload: NamedPersonAgentRequestPayload,
        targetUserId: string
    ): { Allowed: true } | { Allowed: false; Reason: string } {
        const callerTenantId = payload.ContextUser.TenantContext?.TenantID?.trim();
        if (payload.ContextUser.TenantContext && !callerTenantId) {
            return {
                Allowed: false,
                Reason: 'Caller TenantContext is present without a valid TenantID.',
            };
        }

        const explicitTargetTenantId = payload.TargetUserTenantContext?.TenantID?.trim();
        if (payload.TargetUserTenantContext && !explicitTargetTenantId) {
            return {
                Allowed: false,
                Reason: 'TargetUserTenantContext is present without a valid TenantID.',
            };
        }

        let cachedTargetTenantId: string | undefined;
        try {
            const cachedUsers = UserCache.Instance?.Users;
            if (Array.isArray(cachedUsers)) {
                const cachedTarget = cachedUsers.find((u) => UUIDsEqual(u.ID, targetUserId));
                cachedTargetTenantId = cachedTarget?.TenantContext?.TenantID?.trim() || undefined;
            }
        } catch {
            // UserCache may be uninitialized in isolated unit tests.
        }

        const targetTenantId = explicitTargetTenantId ?? cachedTargetTenantId;
        if (callerTenantId && targetTenantId && !this.tenantIdsEqual(callerTenantId, targetTenantId)) {
            return {
                Allowed: false,
                Reason: `Cross-tenant mismatch: caller tenant '${callerTenantId}' does not match target user tenant '${targetTenantId}'.`,
            };
        }

        if (!callerTenantId && targetTenantId) {
            const isOwnerOrSystem =
                payload.ContextUser.Type?.trim().toLowerCase() === 'owner' ||
                WellKnownUserSource.Instance.IsSystemUser(payload.ContextUser);
            if (!isOwnerOrSystem) {
                return {
                    Allowed: false,
                    Reason: `Unscoped caller cannot target tenant-scoped user in tenant '${targetTenantId}'.`,
                };
            }
        }

        if (callerTenantId && payload.ServerBoundScope) {
            for (const [key, value] of Object.entries(payload.ServerBoundScope)) {
                if (key.trim().toLowerCase() === 'tenantid' && typeof value === 'string' && value.trim().length > 0) {
                    if (!this.tenantIdsEqual(callerTenantId, value)) {
                        return {
                            Allowed: false,
                            Reason: `Cross-tenant mismatch: ServerBoundScope TenantID '${value}' does not match caller tenant '${callerTenantId}'.`,
                        };
                    }
                }
            }
        }

        return { Allowed: true };
    }

    private tenantIdsEqual(a: string, b: string): boolean {
        return a.trim().toLowerCase() === b.trim().toLowerCase();
    }

    private buildNonSensitiveRequestComments(
        payload: NamedPersonAgentRequestPayload
    ): NonSensitiveAgentRequestComments {
        const scopeKeys = payload.ServerBoundScope
            ? Object.entries(payload.ServerBoundScope).filter((entry) => entry[1] !== undefined)
            : [];
        return {
            NamedPersonRequest: true,
            SenderUserID: payload.ContextUser.ID,
            DeliveryMode: payload.DeliveryMode ?? 'DirectUserRequest',
            ...(payload.OriginatingConversationDetailID
                ? { OriginatingConversationDetailID: payload.OriginatingConversationDetailID }
                : {}),
            ...(payload.Audience ? { AudienceMode: payload.Audience.Mode } : {}),
            ...(scopeKeys.length > 0
                ? { HasServerBoundScope: true, ServerBoundScopeKeyCount: scopeKeys.length }
                : {}),
            ...(payload.Metadata ? { Metadata: payload.Metadata } : {}),
        };
    }

    private async verifyTargetUserActive(
        rv: RunView,
        contextUser: UserInfo,
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
            contextUser
        );
        return Boolean(res.Success && Array.isArray(res.Results) && res.Results.length > 0 && res.Results[0].IsActive);
    }

    private async resolveRequestTypeId(
        rv: RunView,
        contextUser: UserInfo,
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
            contextUser
        );
        return res.Success && res.Results.length > 0 ? res.Results[0].ID : null;
    }

    private async resolveAuthorizedTargetAgentId(
        rv: RunView,
        provider: IMetadataProvider,
        contextUser: UserInfo,
        requestedAgentId: string
    ): Promise<{ AgentID: string } | { AgentID: null; PublicReason: string; InternalReason: string }> {
        const res = await rv.RunView<Pick<MJAIAgentEntity, 'ID' | 'Status'>>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `ID='${EscapeSQLString(requestedAgentId)}' AND Status='Active'`,
                Fields: ['ID', 'Status'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            contextUser
        );
        const activeAgentId = res.Success && res.Results.length > 0 ? res.Results[0].ID : null;
        if (!activeAgentId) {
            return {
                AgentID: null,
                PublicReason: 'Target agent could not be resolved.',
                InternalReason: `Active agent '${requestedAgentId}' was not found or is not accessible to caller.`,
            };
        }

        if (!AIEngine.Instance.Loaded) {
            try {
                await AIEngine.Instance.Config(false, contextUser, provider);
            } catch (err) {
                LogError(
                    `AudienceNamedPersonAgentRequestService: AIEngine.Config failed before permission check: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }

        const canRun = await AIEngine.Instance.CanUserRunAgent(activeAgentId, contextUser);
        if (!canRun) {
            return {
                AgentID: null,
                PublicReason: 'You do not have permission to invoke the target agent.',
                InternalReason: `Caller '${contextUser.ID}' lacks CanUserRunAgent permission for agent '${activeAgentId}'.`,
            };
        }

        return { AgentID: activeAgentId };
    }

    private async resolveSaveUser(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        targetUserId: string
    ): Promise<UserInfo | null> {
        if (
            UUIDsEqual(contextUser.ID, targetUserId) ||
            contextUser.Type?.trim().toLowerCase() === 'owner' ||
            WellKnownUserSource.Instance.IsSystemUser(contextUser)
        ) {
            return contextUser;
        }
        const systemUser = await WellKnownUserSource.Instance.GetSystemUser(provider);
        if (!systemUser) {
            return null;
        }
        if (contextUser.TenantContext) {
            // Clone systemUser with caller's TenantContext so the shared systemUser instance is never mutated.
            const cloned = new UserInfo(provider, {
                ...systemUser,
                _UserRoles: undefined,
                UserRoles: systemUser.UserRoles,
            });
            cloned.TenantContext = { ...contextUser.TenantContext };
            return cloned;
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
