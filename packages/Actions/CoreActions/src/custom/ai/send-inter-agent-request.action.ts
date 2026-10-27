import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { APPROVAL_REQUEST_TYPE_NAME, ResolveAgentRequestTypeId } from './agent-request-type-resolver';


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
    targetUserID: string;
    workstreamKey?: string;
    taskID?: string;
    issueID?: string;
    subject: string;
    message: string;
    requestedFields?: string[];
    dueByISO?: string;
}

/**
 * Action that sends a structured inter-agent coordination request from the caller's Chief of Staff
 * to another user (or that user's Chief of Staff) via `MJ: AI Agent Requests`.
 *
 * Security & Policy Guardrails:
 * 1. Verifies the sender's `MJ: AI Agent User Policies` allows active follow-ups (`CoordinationMode`
 *    must be `'ActiveFollowUp'` or `'FullDelegate'`, and `AllowInterAgentCoordination` must not be `false`).
 * 2. Checks the target user's policy: if the target user has `AllowInterAgentCoordination === true`
 *    and an active Chief of Staff policy, marks `DeliveryMode = 'InterAgent'` so the target user's
 *    Chief of Staff can triage it on its next wake; otherwise delivers as `'DirectUserRequest'`.
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
            const subject = this.getStringParam(params, 'Subject');
            const message = this.getStringParam(params, 'Message');
            if (!targetUserId || !subject || !message) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'TargetUserID, Subject, and Message are required parameters.',
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const rawAgentId = this.getStringParam(params, 'AgentID');
            const rawAgentName = this.getStringParam(params, 'AgentName') ?? (rawAgentId ? null : 'Chief of Staff');
            const agent = rawAgentId
                ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, rawAgentId))
                : AIEngine.Instance.Agents.find(
                      (a) => a.Name.trim().toLowerCase() === (rawAgentName ?? '').trim().toLowerCase()
                  );

            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: `Agent "${ rawAgentId ?? rawAgentName }" not found.`,
                    Params: params.Params,
                };
            }

            const senderPolicy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
                agent.ID,
                contextUser.ID,
                contextUser
            );
            if (senderPolicy) {
                if (senderPolicy.AllowInterAgentCoordination === false) {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_DENIED',
                        Message: 'Your Chief of Staff policy has AllowInterAgentCoordination disabled.',
                        Params: params.Params,
                    };
                }
                if (senderPolicy.CoordinationMode === 'Observer') {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_APPROVAL_REQUIRED',
                        Message: `Your Chief of Staff CoordinationMode is "Observer" (tracks and reports only). Outbound follow-ups to other users require upgrading CoordinationMode to Coordinator/Autonomous or explicit approval.`,
                        Params: params.Params,
                    };
                }
            }

            const targetPolicy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
                agent.ID,
                targetUserId,
                contextUser
            );
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
                senderAgentID: agent.ID,
                targetUserID: targetUserId,
                ...(workstreamKey ? { workstreamKey } : {}),
                ...(taskId ? { taskID: taskId } : {}),
                ...(issueId ? { issueID: issueId } : {}),
                subject,
                message,
                ...(requestedFields ? { requestedFields } : {}),
                ...(dueByISO ? { dueByISO } : {}),
            };

            const approvalTypeId = await ResolveAgentRequestTypeId(APPROVAL_REQUEST_TYPE_NAME, contextUser);
            if (!approvalTypeId) {
                return {
                    Success: false,
                    ResultCode: 'REQUEST_TYPE_NOT_FOUND',
                    Message: `Agent request type "${APPROVAL_REQUEST_TYPE_NAME}" is not in metadata; cannot create the coordination request.`,
                    Params: params.Params,
                };
            }

            const md = params.Provider ?? new Metadata();
            const requestEntity = await md.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                contextUser
            );
            requestEntity.AgentID = agent.ID;
            requestEntity.RequestTypeID = approvalTypeId;
            requestEntity.RequestedAt = new Date();
            requestEntity.RequestForUserID = targetUserId;
            requestEntity.Status = 'Requested';
            requestEntity.Priority = priority;
            requestEntity.Request = `[Chief of Staff Follow-Up from ${ envelope.senderUserName }] ${ subject }\n\n${ message }`;
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
                    Message: `Failed to create Chief of Staff coordination request: ${ errMsg }`,
                    Params: params.Params,
                };
            }

            this.setOutputParam(params, 'AgentRequestID', requestEntity.ID);
            this.setOutputParam(params, 'TargetUserID', targetUserId);
            this.setOutputParam(params, 'DeliveryMode', deliveryMode);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Created Chief of Staff coordination request (${ requestEntity.ID }) for user ${ targetUserId } via ${ deliveryMode }.`,
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
