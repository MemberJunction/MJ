import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Locked outbound telephony brief enforced before any Chief of Staff voice session or outbound call.
 */
export interface OutboundCallBrief {
    briefVersion: '1.0';
    agentID: string;
    agentDisplayName: string;
    onBehalfOfUserID: string;
    onBehalfOfUserName: string;
    targetPhoneNumber: string;
    targetRecipientName: string;
    isExternalRecipient: boolean;
    objective: string;
    requireUpfrontAiDisclosure: true;
    mandatoryUpfrontDisclosure: string;
    authorizedBounds: string[];
    strictProhibitions: string[];
    fallbackOptions: string[];
    maxDurationSeconds: number;
}


const CORE_CALL_PROHIBITIONS: ReadonlyArray<string> = [
    'Always state upfront that you are an AI assistant calling on the user\'s behalf.',
    'Do not make financial commitments or authorize payments not explicitly listed in authorizedBounds.',
    'Do not agree to binding contracts, legal terms, or commitments nobody authorized.',
    'Stick strictly to the call objective and fallback options; end the call politely if asked to exceed your brief.',
];

/**
 * Action that validates `PhoneChannelMode` and approval guardrails on the caller's
 * `MJ: AI Agent User Policies` and constructs a locked `OutboundCallBrief`
 * with mandatory upfront AI disclosure before any outbound telephony call.
 */
@RegisterClass(BaseAction, 'Prepare Outbound Call Brief')
export class PrepareOutboundCallBriefAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Prepare Outbound Call Brief requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const targetPhoneNumber = this.getStringParam(params, 'TargetPhoneNumber');
            const targetRecipientName = this.getStringParam(params, 'TargetRecipientName');
            const objective = this.getStringParam(params, 'Objective');
            if (!targetPhoneNumber || !targetRecipientName || !objective) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'TargetPhoneNumber, TargetRecipientName, and Objective are required parameters.',
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

            const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
                agent.ID,
                contextUser.ID,
                contextUser
            );
            const phoneMode = policy?.PhoneChannelMode ?? 'OutboundWithApproval';
            if (phoneMode === 'Disabled' || phoneMode === 'InboundOnly') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: `Outbound calls are blocked by your Chief of Staff policy (PhoneChannelMode="${ phoneMode }").`,
                    Params: params.Params,
                };
            }

            const isExternalRecipient = this.getBooleanParam(params, 'IsExternalRecipient') ?? true;
            const approvalGranted = this.getBooleanParam(params, 'ApprovalGranted') === true;
            const authorizedBounds = this.parseStringArrayParam(params, 'AuthorizedBounds');
            const customProhibitions = this.parseStringArrayParam(params, 'AdditionalProhibitions');
            const fallbackOptions = this.parseStringArrayParam(params, 'FallbackOptions');
            const maxDurationSeconds = Math.max(
                30,
                Math.min(1800, Math.round(this.getNumericParam(params, 'MaxDurationSeconds') ?? 300))
            );

            const agentDisplayName = policy?.DisplayNameOverride?.trim() || agent.Name;
            const callerName = contextUser.Name || contextUser.Email || 'my principal';
            const mandatoryUpfrontDisclosure = `Hello ${ targetRecipientName }, I am ${ agentDisplayName }, an AI assistant calling on behalf of ${ callerName }.`;

            const brief: OutboundCallBrief = {
                briefVersion: '1.0',
                agentID: agent.ID,
                agentDisplayName,
                onBehalfOfUserID: contextUser.ID,
                onBehalfOfUserName: callerName,
                targetPhoneNumber,
                targetRecipientName,
                isExternalRecipient,
                objective,
                requireUpfrontAiDisclosure: true,
                mandatoryUpfrontDisclosure,
                authorizedBounds,
                strictProhibitions: [...CORE_CALL_PROHIBITIONS, ...customProhibitions],
                fallbackOptions,
                maxDurationSeconds,
            };

            const needsApproval =
                !approvalGranted &&
                (phoneMode === 'OutboundWithApproval' ||
                    (isExternalRecipient && (policy?.RequireApprovalForExternalComms ?? true)));

            this.setOutputParam(params, 'CallBrief', brief);
            this.setOutputParam(params, 'DisclosureStatement', mandatoryUpfrontDisclosure);

            if (needsApproval) {
                const approvalTypeId = await AIEngine.Instance.ResolveAgentRequestTypeID('Approval', contextUser);
                if (!approvalTypeId) {
                    return {
                        Success: false,
                        ResultCode: 'REQUEST_TYPE_NOT_FOUND',
                        Message: 'Agent request type "Approval" is not in metadata; the call brief was prepared but cannot be queued for approval.',
                        Params: params.Params,
                    };
                }
                const md = params.Provider ?? new Metadata();
                const approvalReq = await md.GetEntityObject<MJAIAgentRequestEntity>(
                    'MJ: AI Agent Requests',
                    contextUser
                );
                approvalReq.AgentID = agent.ID;
                approvalReq.RequestTypeID = approvalTypeId;
                approvalReq.RequestedAt = new Date();
                approvalReq.RequestForUserID = contextUser.ID;
                approvalReq.Status = 'Requested';
                approvalReq.Priority = 75;
                approvalReq.Request =
                    `[Outbound Phone Call Approval Required]\n` +
                    `Recipient: ${ targetRecipientName } (${ targetPhoneNumber })\n` +
                    `Objective: ${ objective }\n` +
                    `Upfront Disclosure: "${ mandatoryUpfrontDisclosure }"`;
                approvalReq.Comments = JSON.stringify(brief);
                const saved = await approvalReq.Save();

                this.setOutputParam(params, 'Status', 'PENDING_APPROVAL');
                this.setOutputParam(params, 'AgentRequestID', saved ? approvalReq.ID : null);

                return {
                    Success: true,
                    ResultCode: 'APPROVAL_REQUIRED',
                    Message: `Outbound call brief prepared and queued for explicit user approval${
                        saved ? ` (Request ID: ${ approvalReq.ID })` : ''
                    }.`,
                    Params: params.Params,
                };
            }

            this.setOutputParam(params, 'Status', 'READY_TO_DIAL');
            this.setOutputParam(params, 'AgentRequestID', null);

            return {
                Success: true,
                ResultCode: 'READY_TO_DIAL',
                Message: `Outbound call brief validated and ready to dial ${ targetRecipientName } (${ targetPhoneNumber }) with mandatory AI disclosure.`,
                Params: params.Params,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`PrepareOutboundCallBriefAction error: ${ message }`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error preparing outbound call brief: ${ message }`,
                Params: params.Params,
            };
        }
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

    private getBooleanParam(params: RunActionParams, name: string): boolean | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const lower = val.trim().toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') return true;
            if (lower === 'false' || lower === '0' || lower === 'no') return false;
        }
        return null;
    }

    private getNumericParam(params: RunActionParams, name: string): number | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        const num = typeof val === 'number' ? val : Number(val);
        return Number.isFinite(num) ? num : null;
    }

    private parseStringArrayParam(params: RunActionParams, name: string): string[] {
        const val = this.getParamValue(params, name);
        if (Array.isArray(val)) {
            return val.map((v) => String(v).trim()).filter(Boolean);
        }
        if (typeof val === 'string') {
            const parsed = SafeJSONParse<string[]>(val);
            if (Array.isArray(parsed)) {
                return parsed.map((v) => String(v).trim()).filter(Boolean);
            }
            return val
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
        }
        return [];
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
