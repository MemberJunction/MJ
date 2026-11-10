import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { EscapeSQLString, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { UserCache } from '@memberjunction/generic-database-provider';


/**
 * Structured payload stored inside `MJAIAgentRequestEntity.Comments` (and reflected in `Request`)
 * for Chief-of-Staff-to-Chief-of-Staff or Chief-of-Staff-to-User follow-ups across workstreams.
 */
export interface InterAgentCoordinationEnvelope {
    protocolVersion: '1.0';
    interAgentCoordination: true;
    senderUserID: string;
    senderUserName: string;
    senderAgentID: string;
    senderAgentName?: string;
    targetUserID: string;
    targetAgentID?: string;
    targetAgentName?: string;
    deliveryMode?: 'InterAgent' | 'DirectUserRequest';
    workstreamKey?: string;
    taskID?: string;
    issueID?: string;
    subject: string;
    message: string;
    requestedFields?: string[];
    dueByISO?: string;
}

/**
 * Action that sends a structured inter-agent coordination request from the calling agent (defaulting
 * to the executing agent in `params.Context`, or Chief of Staff outside an agent run) to another user
 * or a specific target agent for that user via `MJ: AI Agent Requests`.
 *
 * Security & Policy Guardrails:
 * 1. Verifies the sender's `MJ: AI Agent User Policies` allows active follow-ups (`CoordinationMode`
 *    must not be `'Observer'`, and `AllowInterAgentCoordination` must not be `false`).
 * 2. Resolves the recipient's target agent (`TargetAgentID` / `TargetAgentName`, defaulting to
 *    Chief of Staff) and checks the recipient's policy for that agent: if active with
 *    `AllowInterAgentCoordination !== false`, marks `DeliveryMode = 'InterAgent'` so the recipient's
 *    target agent wakes on arrival; otherwise delivers as `'DirectUserRequest'`.
 */
@RegisterClass(BaseAction, 'Send Inter-Agent Request')
export class SendInterAgentRequestAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Send Inter-Agent Request requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const targetUserId = this.getStringParam(params, 'TargetUserID');
            const explicitRequestForUserId = this.getStringParam(params, 'RequestForUserID');
            const subject = this.getStringParam(params, 'Subject');
            const message =
                this.getStringParam(params, 'Message') ?? this.getStringParam(params, 'RequestBody');
            if (!targetUserId || !subject || !message) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'TargetUserID, Subject, and Message (or RequestBody) are required parameters.',
                    Params: params.Params,
                };
            }

            const isSystemOrOwner = this.isSystemOrOwnerUser(contextUser);
            const effectiveRequestForUserId = explicitRequestForUserId
                ? isSystemOrOwner
                    ? explicitRequestForUserId
                    : contextUser.ID
                : targetUserId;

            await AIEngine.Instance.Config(false, contextUser);
            const senderResolution = this.resolveSenderAgent(params);
            if ('errorResult' in senderResolution) {
                return senderResolution.errorResult;
            }
            const senderAgent = senderResolution.agent;

            if (!AIEngine.Instance.CanUserRunAgent(senderAgent.ID, contextUser)) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `User "${contextUser.Name || contextUser.ID}" does not have permission to run sender agent "${senderAgent.Name}".`,
                    Params: params.Params,
                };
            }

            const targetUserActive = await this.verifyActiveTargetUser(targetUserId, contextUser, params);
            if (!targetUserActive) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `TargetUserID "${targetUserId}" does not match an active MJ user.`,
                    Params: params.Params,
                };
            }

            const targetResolution = this.resolveRecipientAgent(params, senderAgent);
            if ('errorResult' in targetResolution) {
                return targetResolution.errorResult;
            }
            const targetAgent = targetResolution.agent;

            const senderPolicyLookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                senderAgent.ID,
                contextUser.ID,
                contextUser,
                { provider: params.Provider }
            );
            if (senderPolicyLookup.status === 'error') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_LOOKUP_FAILED',
                    Message: `Failed to verify sender agent policy: ${senderPolicyLookup.errorMessage}`,
                    Params: params.Params,
                };
            }
            const senderPolicy = senderPolicyLookup.policy;
            if (senderPolicy) {
                if (senderPolicy.Status === 'Disabled' || senderPolicy.Status === 'Paused') {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_DENIED',
                        Message: `Your "${ senderAgent.Name }" policy status is "${ senderPolicy.Status }".`,
                        Params: params.Params,
                    };
                }
                if (senderPolicy.AllowInterAgentCoordination === false) {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_DENIED',
                        Message: `Your "${ senderAgent.Name }" policy has AllowInterAgentCoordination disabled.`,
                        Params: params.Params,
                    };
                }
                if (senderPolicy.CoordinationMode === 'Observer') {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_APPROVAL_REQUIRED',
                        Message: `Your "${ senderAgent.Name }" CoordinationMode is "Observer" (tracks and reports only). Outbound follow-ups to other users require upgrading CoordinationMode to Coordinator/Autonomous or explicit approval.`,
                        Params: params.Params,
                    };
                }
            }

            const targetPolicyLookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                targetAgent.ID,
                targetUserId,
                contextUser,
                { provider: params.Provider }
            );
            if (targetPolicyLookup.status === 'error') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_LOOKUP_FAILED',
                    Message: `Failed to verify recipient agent policy: ${targetPolicyLookup.errorMessage}`,
                    Params: params.Params,
                };
            }
            const targetPolicy = targetPolicyLookup.policy;
            const deliveryMode: 'InterAgent' | 'DirectUserRequest' =
                targetPolicy &&
                targetPolicy.Status === 'Active' &&
                targetPolicy.AllowInterAgentCoordination !== false
                    ? 'InterAgent'
                    : 'DirectUserRequest';

            const priority = this.clampPriority(this.getNumericParam(params, 'Priority') ?? 50);
            const dueByISO = this.getStringParam(params, 'DueByISO');
            const workstreamKey = this.getStringParam(params, 'WorkstreamKey');
            const taskId = this.getStringParam(params, 'TaskID');
            const issueId = this.getStringParam(params, 'IssueID');
            const requestedFields = this.parseObjectParam<string[]>(params, 'RequestedFields');

            const envelope: InterAgentCoordinationEnvelope = {
                protocolVersion: '1.0',
                interAgentCoordination: true,
                senderUserID: contextUser.ID,
                senderUserName: contextUser.Name || contextUser.Email || contextUser.ID,
                senderAgentID: senderAgent.ID,
                senderAgentName: senderAgent.Name,
                targetUserID: targetUserId,
                targetAgentID: targetAgent.ID,
                targetAgentName: targetAgent.Name,
                deliveryMode,
                ...(workstreamKey ? { workstreamKey } : {}),
                ...(taskId ? { taskID: taskId } : {}),
                ...(issueId ? { issueID: issueId } : {}),
                subject,
                message,
                ...(requestedFields ? { requestedFields } : {}),
                ...(dueByISO ? { dueByISO } : {}),
            };

            const approvalTypeId = await AIEngine.Instance.ResolveAgentRequestTypeID('Approval', contextUser);
            if (!approvalTypeId) {
                return {
                    Success: false,
                    ResultCode: 'REQUEST_TYPE_NOT_FOUND',
                    Message: 'Agent request type "Approval" is not in metadata; cannot create the coordination request.',
                    Params: params.Params,
                };
            }

            const md = params.Provider ?? new Metadata();
            const requestSaveUser = this.resolveRequestSaveUser(contextUser, effectiveRequestForUserId);
            const requestEntity = await md.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                requestSaveUser
            );
            requestEntity.AgentID = targetAgent.ID;
            requestEntity.RequestTypeID = approvalTypeId;
            requestEntity.RequestedAt = new Date();
            requestEntity.RequestForUserID = effectiveRequestForUserId;
            requestEntity.Status = 'Requested';
            requestEntity.Priority = priority;
            requestEntity.Request = `[${ senderAgent.Name } Follow-Up from ${ envelope.senderUserName }] ${ subject }\n\n${ message }`;
            requestEntity.Comments = JSON.stringify(envelope);
            if (dueByISO) {
                const parsedDue = new Date(dueByISO);
                if (!Number.isNaN(parsedDue.getTime())) {
                    requestEntity.ExpiresAt = parsedDue;
                }
            }

            const saved = await requestEntity.Save();
            if (!saved) {
                const errMsg =
                    requestEntity.LatestResult?.CompleteMessage ?? 'Unknown error saving MJ: AI Agent Requests';
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: `Failed to create inter-agent coordination request: ${ errMsg }`,
                    Params: params.Params,
                };
            }

            this.setOutputParam(params, 'AgentRequestID', requestEntity.ID);
            this.setOutputParam(params, 'TargetUserID', targetUserId);
            this.setOutputParam(params, 'TargetAgentID', targetAgent.ID);
            this.setOutputParam(params, 'DeliveryMode', deliveryMode);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Created inter-agent coordination request (${ requestEntity.ID }) for user ${ targetUserId } targeting "${ targetAgent.Name }" via ${ deliveryMode }.`,
                Params: params.Params,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`SendInterAgentRequestAction error: ${ message }`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error sending inter-agent request: ${ message }`,
                Params: params.Params,
            };
        }
    }

    private async verifyActiveTargetUser(
        targetUserId: string,
        contextUser: UserInfo,
        params: RunActionParams
    ): Promise<boolean> {
        if (UUIDsEqual(contextUser.ID, targetUserId)) {
            return contextUser.IsActive !== false;
        }
        try {
            const cached = await UserCache.Instance.FindUser({ ID: targetUserId });
            if (cached) {
                return cached.IsActive !== false;
            }
        } catch (err) {
            LogError(
                `SendInterAgentRequestAction.verifyActiveTargetUser UserCache lookup failed for "${targetUserId}": ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
        const rv = params.Provider ? RunView.FromMetadataProvider(params.Provider) : new RunView();
        const res = await rv.RunView<{ ID: string; IsActive?: boolean }>(
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
        return Boolean(
            res.Success &&
                Array.isArray(res.Results) &&
                res.Results.length > 0 &&
                res.Results[0].IsActive !== false
        );
    }

    private isSystemOrOwnerUser(user: UserInfo): boolean {
        if (user.Type?.trim().toLowerCase() === 'owner') {
            return true;
        }
        const roles = user.UserRoles ?? [];
        return roles.some((r) => {
            const roleName = r.Role?.trim().toLowerCase();
            return roleName === 'system' || roleName === 'owner' || roleName === 'administrator';
        });
    }

    private resolveRequestSaveUser(contextUser: UserInfo, requestForUserId: string): UserInfo {
        if (UUIDsEqual(contextUser.ID, requestForUserId)) {
            return contextUser;
        }
        try {
            const systemUser = UserCache.Instance.GetSystemUser();
            if (systemUser) {
                return systemUser;
            }
        } catch (err) {
            LogError(
                `SendInterAgentRequestAction.resolveRequestSaveUser failed to read UserCache system user: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
        return contextUser;
    }

    private resolveSenderAgent(
        params: RunActionParams
    ): { agent: (typeof AIEngine.Instance.Agents)[number] } | { errorResult: ActionResultSimple } {
        const rawAgentId = this.getStringParam(params, 'AgentID');
        const rawAgentName = this.getStringParam(params, 'AgentName');
        const contextAgentId = (params.Context as { AgentID?: string } | undefined)?.AgentID?.trim() || null;

        let agent: (typeof AIEngine.Instance.Agents)[number] | undefined;
        let requestedLabel: string;
        if (contextAgentId) {
            requestedLabel = contextAgentId;
            agent = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, contextAgentId));
            if (agent) {
                if (rawAgentId && !UUIDsEqual(rawAgentId, agent.ID)) {
                    return {
                        errorResult: {
                            Success: false,
                            ResultCode: 'PERMISSION_DENIED',
                            Message: `Sender agent cannot spoof AgentID "${rawAgentId}" while running as "${agent.Name}".`,
                            Params: params.Params,
                        },
                    };
                }
                if (rawAgentName && rawAgentName.trim().toLowerCase() !== agent.Name.trim().toLowerCase()) {
                    return {
                        errorResult: {
                            Success: false,
                            ResultCode: 'PERMISSION_DENIED',
                            Message: `Sender agent cannot spoof AgentName "${rawAgentName}" while running as "${agent.Name}".`,
                            Params: params.Params,
                        },
                    };
                }
            }
        } else if (rawAgentName) {
            requestedLabel = rawAgentName;
            agent = AIEngine.Instance.Agents.find(
                (a) => a.Name.trim().toLowerCase() === rawAgentName.trim().toLowerCase()
            );
        } else {
            const byId = rawAgentId
                ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, rawAgentId))
                : undefined;
            const defaultCos = AIEngine.Instance.Agents.find(
                (a) => a.Name.trim().toLowerCase() === 'chief of staff'
            );
            agent = byId ?? defaultCos;
            requestedLabel = rawAgentId ?? 'Chief of Staff';
        }

        if (!agent) {
            return {
                errorResult: {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: `Agent "${ requestedLabel }" not found.`,
                    Params: params.Params,
                },
            };
        }
        return { agent };
    }

    private resolveRecipientAgent(
        params: RunActionParams,
        senderAgent: (typeof AIEngine.Instance.Agents)[number]
    ): { agent: (typeof AIEngine.Instance.Agents)[number] } | { errorResult: ActionResultSimple } {
        const targetAgentId = this.getStringParam(params, 'TargetAgentID');
        const targetAgentName = this.getStringParam(params, 'TargetAgentName');
        if (targetAgentName) {
            const found = AIEngine.Instance.Agents.find(
                (a) => a.Name.trim().toLowerCase() === targetAgentName.trim().toLowerCase()
            );
            if (!found) {
                return {
                    errorResult: {
                        Success: false,
                        ResultCode: 'AGENT_NOT_FOUND',
                        Message: `Target agent "${ targetAgentName }" not found.`,
                        Params: params.Params,
                    },
                };
            }
            return { agent: found };
        }
        if (targetAgentId) {
            const found = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, targetAgentId));
            if (!found) {
                return {
                    errorResult: {
                        Success: false,
                        ResultCode: 'AGENT_NOT_FOUND',
                        Message: `Target agent "${ targetAgentId }" not found.`,
                        Params: params.Params,
                    },
                };
            }
            return { agent: found };
        }
        const defaultCos = AIEngine.Instance.Agents.find(
            (a) => a.Name.trim().toLowerCase() === 'chief of staff'
        );
        return { agent: defaultCos ?? senderAgent };
    }

    private clampPriority(raw: number): number {
        return Math.max(1, Math.min(100, Math.round(raw)));
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        return found?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > 0 ? str : null;
    }

    private getNumericParam(params: RunActionParams, name: string): number | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        const num = typeof val === 'number' ? val : Number(val);
        return Number.isFinite(num) ? num : null;
    }

    private parseObjectParam<T>(params: RunActionParams, name: string): T | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        if (typeof val === 'object') return val as T;
        if (typeof val === 'string') {
            return SafeJSONParse<T>(val) ?? null;
        }
        return null;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (existing) {
            existing.Value = value;
        } else {
            const outParam: ActionParam = {
                Name: name,
                Value: value,
                Type: 'Output',
            };
            params.Params.push(outParam);
        }
    }
}
